import { NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// ============================================
// NEEDS ATTENTION — the dashboard's exceptions list
// ============================================
// Scans upcoming departures (next 45 days, soonest first) for the things an
// operator must fix BEFORE the group flies:
//   * balance unpaid and its due date reached / within 7 days
//   * traveller forms (申込書) not yet submitted by every passenger
//   * no guide assigned on the linked itinerary
//   * pending portal change requests (e.g. add-traveller)
// Each item carries a deep link to the screen that fixes it. Severity:
// 'urgent' = overdue or departing within 7 days; 'soon' = everything else.

const HORIZON_DAYS = 45

interface AttentionItem {
  type: 'balance_due' | 'forms_incomplete' | 'no_guide' | 'change_request' | 'extra_request'
  severity: 'urgent' | 'soon'
  bookingId: string
  bookingCode: string | null
  tripName: string | null
  clientName: string | null
  startDate: string | null
  detail: Record<string, unknown>
  href: string
}

export async function GET() {
  try {
    // createServerClient() is SERVICE-ROLE and bypasses RLS. Scoping the two
    // bookings queries below is enough for the whole route: every later query
    // is keyed on the booking/itinerary ids these return, so nothing outside
    // the org can reach the response.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const today = new Date().toISOString().slice(0, 10)
    const horizon = new Date(Date.now() + HORIZON_DAYS * 864e5).toISOString().slice(0, 10)
    const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    // Balance warnings get a longer runway: chasing a customer payment takes
    // days, so surface at 14 days out ('soon') and escalate at 7/overdue.
    const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)

    const BOOKING_COLS = 'id, booking_code, trip_name, client_name, start_date, status, itinerary_id, balance_due, balance_due_date, payment_status'

    // Two windows: departures inside the horizon (forms/guide/change-request
    // checks), PLUS any future booking whose balance deadline is overdue or
    // within 7 days — A.T.S terms put the balance due ~60 days BEFORE
    // departure, so a deadline can bite long before the trip enters the
    // departure window.
    const [departing, balanceDue] = await Promise.all([
      supabase.from('bookings')
        .select(BOOKING_COLS)
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_date', today)
        .lte('start_date', horizon)
        .order('start_date', { ascending: true }),
      supabase.from('bookings')
        .select(BOOKING_COLS)
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_date', today)
        .gt('balance_due', 0)
        .neq('payment_status', 'paid_in_full')
        .lte('balance_due_date', in14)
        .order('balance_due_date', { ascending: true }),
    ])
    if (departing.error) throw departing.error
    if (balanceDue.error) throw balanceDue.error

    // Merge, de-duplicated (a booking can be in both windows)
    const byId = new Map<string, any>()
    for (const b of [...(departing.data || []), ...(balanceDue.data || [])]) byId.set(b.id, b)
    const rows = Array.from(byId.values())
    // Bookings only in the balance window skip the departure-scoped checks
    const inDepartureWindow = new Set((departing.data || []).map((b: any) => b.id))
    const bookingIds = rows.map(b => b.id)
    const itineraryIds = rows.map(b => b.itinerary_id).filter(Boolean)

    const [passengers, changeRequests, extraRequests, itineraries] = await Promise.all([
      bookingIds.length
        ? supabase.from('booking_passengers')
            .select('booking_id, details_submitted_at')
            .in('booking_id', bookingIds)
        : Promise.resolve({ data: [], error: null } as any),
      bookingIds.length
        ? supabase.from('booking_change_requests')
            .select('booking_id, kind, requested_count, created_at')
            .eq('status', 'pending')
            .in('booking_id', bookingIds)
        : Promise.resolve({ data: [], error: null } as any),
      // Options a traveller has asked for or accepted from the portal. Both
      // are waiting on the office: 'requested' needs a price, 'accepted' needs
      // the thing actually secured before it can be confirmed and billed.
      bookingIds.length
        ? supabase.from('booking_extras')
            .select('booking_id, title, status, created_at')
            .in('status', ['requested', 'accepted'])
            .eq('requested_via', 'portal')
            .in('booking_id', bookingIds)
        : Promise.resolve({ data: [], error: null } as any),
      itineraryIds.length
        ? supabase.from('itineraries')
            .select('id, assigned_guide_id')
            .eq('org_id', orgId)
            .in('id', itineraryIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    const paxByBooking = new Map<string, { total: number; submitted: number }>()
    for (const p of passengers.data || []) {
      const e = paxByBooking.get(p.booking_id) || { total: 0, submitted: 0 }
      e.total += 1
      if (p.details_submitted_at) e.submitted += 1
      paxByBooking.set(p.booking_id, e)
    }
    const crByBooking = new Map<string, any[]>()
    for (const cr of changeRequests.data || []) {
      const list = crByBooking.get(cr.booking_id) || []
      list.push(cr)
      crByBooking.set(cr.booking_id, list)
    }
    type PortalExtraRow = { booking_id: string; title: string; status: string; created_at: string }
    const extraByBooking = new Map<string, PortalExtraRow[]>()
    for (const ex of (extraRequests.data || []) as PortalExtraRow[]) {
      const list = extraByBooking.get(ex.booking_id) || []
      list.push(ex)
      extraByBooking.set(ex.booking_id, list)
    }
    const guideByItinerary = new Map<string, string | null>()
    for (const it of itineraries.data || []) guideByItinerary.set(it.id, it.assigned_guide_id)

    const items: AttentionItem[] = []
    for (const b of rows) {
      const departsSoon = !!b.start_date && b.start_date <= in7
      const base = {
        bookingId: b.id,
        bookingCode: b.booking_code,
        tripName: b.trip_name,
        clientName: b.client_name,
        startDate: b.start_date,
      }

      // 1. Balance unpaid: due date reached, within 7 days, or departure close
      if (Number(b.balance_due) > 0 && b.payment_status !== 'paid_in_full') {
        const dueReached = !!b.balance_due_date && b.balance_due_date <= today
        const dueUrgent = !!b.balance_due_date && b.balance_due_date <= in7
        const dueSoon = !!b.balance_due_date && b.balance_due_date <= in14
        if (dueReached || dueSoon || departsSoon) {
          items.push({
            ...base,
            type: 'balance_due',
            severity: dueReached || dueUrgent || departsSoon ? 'urgent' : 'soon',
            detail: { balanceDue: b.balance_due, dueDate: b.balance_due_date, overdue: dueReached },
            href: `/bookings/${b.id}`,
          })
        }
      }

      // 2. Traveller forms incomplete
      const pax = inDepartureWindow.has(b.id) ? paxByBooking.get(b.id) : undefined
      if (pax && pax.submitted < pax.total) {
        items.push({
          ...base,
          type: 'forms_incomplete',
          severity: departsSoon ? 'urgent' : 'soon',
          detail: { submitted: pax.submitted, total: pax.total },
          href: `/bookings/${b.id}`,
        })
      }

      // 3. No guide assigned on the linked itinerary
      if (inDepartureWindow.has(b.id) && b.itinerary_id && guideByItinerary.has(b.itinerary_id) && !guideByItinerary.get(b.itinerary_id)) {
        items.push({
          ...base,
          type: 'no_guide',
          severity: departsSoon ? 'urgent' : 'soon',
          detail: {},
          href: `/itineraries/${b.itinerary_id}/edit`,
        })
      }

      // 5. Options the traveller is waiting on an answer for
      for (const ex of extraByBooking.get(b.id) || []) {
        items.push({
          ...base,
          type: 'extra_request',
          severity: 'urgent', // a customer has asked and is waiting
          detail: { title: ex.title, status: ex.status, requestedAt: ex.created_at },
          href: `/bookings/${b.id}`,
        })
      }

      // 4. Pending portal change requests
      for (const cr of crByBooking.get(b.id) || []) {
        items.push({
          ...base,
          type: 'change_request',
          severity: 'urgent', // a customer is actively waiting on an answer
          detail: { kind: cr.kind, requestedCount: cr.requested_count, requestedAt: cr.created_at },
          href: `/bookings/${b.id}`,
        })
      }
    }

    // Urgent first, then by departure date (rows already date-ordered)
    items.sort((a, z) => (a.severity === z.severity ? 0 : a.severity === 'urgent' ? -1 : 1))

    return NextResponse.json({ success: true, data: { items, scannedBookings: rows.length } })
  } catch (error: any) {
    console.error('Error building attention list:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
