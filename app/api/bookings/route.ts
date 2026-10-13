// =====================================================
// BOOKINGS API - LIST & CREATE
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentRuleFrom } from '@/lib/payment-schedule'
import {
  BOOKING_ROW_BUILDER,
  buildBookingRow,
  populateSuppliersFromItinerary,
  DEFAULT_DEPOSIT_PERCENT,
} from '@/lib/booking-creation'
import { insertBookingWithCode } from '@/lib/bookings/booking-code'
import { checkAmountDeliverable } from '@/lib/pricing-guards'

/** Rows per page of the list: default 20, never more than 200. */
export function bookingsPageSize(raw: string | null): number {
  const n = parseInt(raw || '20')
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 200) : 20
}

/**
 * Why this trip may not become a booking yet, or null. A draft is a quote
 * nobody has agreed to and a cancelled trip is over; a trip with no usable
 * price would put a zero deposit in front of the client — the same price
 * gate /api/bookings/from-quote runs on a quote.
 */
export function tripNotBookable(itinerary: { status?: unknown; total_cost?: unknown; currency?: unknown }): { error: string; violations?: string[] } | null {
  if (itinerary.status === 'draft') return { error: 'This trip is still a draft. Send or confirm it before booking it.' }
  if (itinerary.status === 'cancelled') return { error: 'This trip is cancelled and cannot be booked.' }
  const amount = itinerary.total_cost == null || itinerary.total_cost === '' ? null : Number(itinerary.total_cost)
  const check = checkAmountDeliverable(amount, { currency: (itinerary.currency as string | null) ?? null })
  if (!check.ok) {
    return { error: 'This trip has no usable price yet, so it cannot be booked. Price it first.', violations: check.violations }
  }
  return null
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List bookings with filters
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)

    // Filters
    const status = searchParams.get('status')
    const startDateFrom = searchParams.get('startDateFrom')
    const startDateTo = searchParams.get('startDateTo')
    const search = sanitizeSearchTerm(searchParams.get('search'))
    const assignedGuideId = searchParams.get('assignedGuideId')
    // One itinerary's booking (the itinerary page). `search` matches names and
    // codes only, so looking a booking up by itinerary id through it never
    // found anything.
    const itineraryId = searchParams.get('itinerary_id')

    // Pagination
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const limit = bookingsPageSize(searchParams.get('limit'))
    const offset = (page - 1) * limit

    // Newest first: the list showed the 20 OLDEST bookings (start date
    // ascending), so once there were more than 20, the upcoming trips — the
    // ones anyone opens the list for — never appeared.
    let query = supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (startDateFrom) {
      query = query.gte('start_date', startDateFrom)
    }

    if (startDateTo) {
      query = query.lte('start_date', startDateTo)
    }

    if (assignedGuideId) {
      query = query.eq('assigned_guide_id', assignedGuideId)
    }

    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }

    if (search) {
      query = query.or(`client_name.ilike.%${search}%,trip_name.ilike.%${search}%,booking_code.ilike.%${search}%`)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: bookings, error, count } = await query

    if (error) {
      console.error('Error fetching bookings:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Get summary counts
    const { data: allBookings } = await supabaseAdmin
      .from('bookings')
      .select('status')
      .eq('org_id', orgId)

    const summary = {
      total: allBookings?.length || 0,
      pending: allBookings?.filter(b => b.status === 'pending').length || 0,
      supplier_confirmed: allBookings?.filter(b => b.status === 'supplier_confirmed').length || 0,
      payment_received: allBookings?.filter(b => b.status === 'payment_received').length || 0,
      ready: allBookings?.filter(b => b.status === 'ready').length || 0,
      in_progress: allBookings?.filter(b => b.status === 'in_progress').length || 0,
      completed: allBookings?.filter(b => b.status === 'completed').length || 0,
      cancelled: allBookings?.filter(b => b.status === 'cancelled').length || 0,
    }

    return NextResponse.json({
      success: true,
      data: bookings,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      },
      summary
    })
  } catch (error: unknown) {
    console.error('Bookings GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create booking from itinerary
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { itinerary_id } = body

    if (!itinerary_id) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }

    // Check if booking already exists for this itinerary
    const { data: existingBooking } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_code')
      .eq('itinerary_id', itinerary_id)
      .eq('org_id', orgId)
      .single()

    if (existingBooking) {
      return NextResponse.json({
        success: false,
        error: 'Booking already exists for this itinerary',
        existing_booking: existingBooking
      }, { status: 409 })
    }

    // Fetch itinerary data with partner info if linked
    const { data: itinerary, error: itineraryError } = await supabaseAdmin
      .from('itineraries')
      .select('*, b2b_partners(id, company_name, partner_code, org_id)')
      .eq('id', itinerary_id)
      .eq('org_id', orgId)
      .single()

    if (itineraryError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const notBookable = tripNotBookable(itinerary)
    if (notBookable) {
      return NextResponse.json({ success: false, code: 'not_bookable', ...notBookable }, { status: 422 })
    }

    // The operator's payment terms. A missing row or missing columns fall back
    // to the standing rule rather than failing the booking.
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('deposit_percent, deposit_due_days, balance_due_days_before_departure')
      .eq('id', orgId)
      .maybeSingle()

    // Extract partner info if linked — this company's partner only. The trip
    // routes refuse a foreign partner_id now; a trip saved before that could
    // still carry one, and its name must not reach this company's booking.
    const linkedPartner = itinerary.b2b_partners as { id: string; company_name: string; partner_code: string; org_id?: string } | null
    const partnerInfo = linkedPartner && linkedPartner.org_id === orgId ? linkedPartner : null

    // Row shape (and the deposit/balance arithmetic) is shared with
    // /api/bookings/from-quote so the two entry points cannot drift.
    //
    // NOTE: balance_due is now the FULL total, not total - deposit. It has to be:
    // record_booking_payment() recomputes it as greatest(0, total_cost -
    // total_paid), so the old value showed 70% owed on a booking where nothing
    // had been paid, then jumped up on the first payment.
    // The code is numbered per company; one that is taken draws another.
    const { data: booking, error: createError } = await insertBookingWithCode<{ id: string; [key: string]: unknown }>(
      supabaseAdmin,
      orgId,
      bookingCode => buildBookingRow({
        orgId,
        bookingCode,
        itinerary,
        // No caller percentage on this path, so the operator's own rule
        // decides — not a constant that happens to say something else.
        depositPercent: paymentRuleFrom(org).deposit_percent,
        partnerName: partnerInfo?.company_name ?? null,
        paymentRule: paymentRuleFrom(org),
      })
    )

    if (createError || !booking) {
      console.error('Error creating booking:', createError)
      return NextResponse.json({ success: false, error: clientMessage(createError, 'Internal server error') }, { status: 500 })
    }

    // Populate suppliers from itinerary services (shared with from-quote)
    const suppliers = await populateSuppliersFromItinerary(supabaseAdmin, booking.id, itinerary_id)
    if (suppliers.error) {
      console.error('Booking created but supplier manifest failed:', suppliers.error)
    }

    // `builder` names the row builder that produced this booking — see the
    // constant's comment in lib/booking-creation.ts.
    return NextResponse.json({ success: true, data: booking, builder: BOOKING_ROW_BUILDER }, { status: 201 })
  } catch (error: unknown) {
    console.error('Bookings POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
