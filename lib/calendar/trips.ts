// ============================================
// What the Booking Calendar shows, and what it counts
// ============================================
// The calendar read fields the itineraries list never returns —
// num_travelers, destinations, guide_name, vehicle_name — so every bar said
// "undefined pax", Total Travelers was always 0, conflicts named "Unknown
// Guide" and the CSV wrote "Unassigned" for an assigned guide. It coloured and
// filtered by itineraries.payment_status, a column nothing ever updates (every
// bar grey "Not Paid"). It asked for the list without partner (B2B) trips, and
// counted drafts and cancelled trips in Total Revenue and in the clash check.
//
// Now each trip is built here from what IS loaded: travellers = adults +
// children; guide and vehicle names from the guide and vehicle lists the page
// loads; the payment state from the trip's BOOKING (bookings.payment_status,
// kept by record_booking_payment) — or "quote" for a trip nobody has bought
// and "no booking" for a confirmed trip without one. Cancelled trips are not
// shown. Revenue, travellers, upcoming and clashes count SOLD trips only
// (confirmed or completed, or with a live booking).

import { addToTotals, emptyTotals, type CurrencyTotals } from '@/lib/currency-totals'
import { isSoldStatus } from '@/lib/itineraries/statuses'

export type CalendarPaymentState = 'quote' | 'no_booking' | 'pending' | 'deposit_received' | 'partial' | 'paid' | 'refunded'

export const CALENDAR_PAYMENT_STATES: CalendarPaymentState[] = ['quote', 'no_booking', 'pending', 'deposit_received', 'partial', 'paid', 'refunded']

export interface CalendarSourceRow {
  id: string
  itinerary_code: string
  client_name: string | null
  trip_name?: string | null
  start_date: string | null
  end_date: string | null
  num_adults?: number | null
  num_children?: number | null
  total_cost?: number | null
  currency?: string | null
  status?: string | null
  source?: string | null
  assigned_guide_id?: string | null
  assigned_vehicle_id?: string | null
}

export interface CalendarBookingRow {
  id?: string
  itinerary_id: string
  status?: string | null
  payment_status?: string | null
}

export interface CalendarTrip {
  id: string
  itinerary_code: string
  client_name: string
  trip_name: string
  start_date: string
  end_date: string
  num_travelers: number
  status: string
  /** A B2B partner's trip. */
  partner: boolean
  /** Confirmed or completed, or carrying a live booking. */
  sold: boolean
  payment_status: CalendarPaymentState
  currency: string | null
  total_cost: number
  assigned_guide_id: string | null
  assigned_vehicle_id: string | null
  guide_name: string | null
  vehicle_name: string | null
}

const PAYMENT_STATES = new Set<string>(['pending', 'deposit_received', 'partial', 'paid', 'refunded'])

export function toCalendarTrips(
  rows: CalendarSourceRow[],
  refs: {
    guides?: Array<{ id: string; name: string }>
    vehicles?: Array<{ id: string; name: string }>
    bookings?: CalendarBookingRow[]
  } = {}
): CalendarTrip[] {
  const guides = new Map((refs.guides ?? []).map(g => [g.id, g.name]))
  const vehicles = new Map((refs.vehicles ?? []).map(v => [v.id, v.name]))
  const bookings = new Map<string, CalendarBookingRow>()
  for (const b of refs.bookings ?? []) {
    if (b.status === 'cancelled') continue
    bookings.set(b.itinerary_id, b)
  }

  const out: CalendarTrip[] = []
  for (const r of rows) {
    if (!r.start_date || !r.end_date) continue
    const status = r.status ?? 'draft'
    if (status === 'cancelled') continue
    const booking = bookings.get(r.id)
    const sold = isSoldStatus(status) || !!booking
    const paid = booking?.payment_status && PAYMENT_STATES.has(booking.payment_status) ? booking.payment_status : 'pending'
    out.push({
      id: r.id,
      itinerary_code: r.itinerary_code,
      client_name: r.client_name ?? '',
      trip_name: r.trip_name ?? '',
      start_date: r.start_date,
      end_date: r.end_date,
      num_travelers: (Number(r.num_adults) || 0) + (Number(r.num_children) || 0),
      status,
      partner: r.source === 'b2b_custom',
      sold,
      payment_status: (booking ? paid : sold ? 'no_booking' : 'quote') as CalendarPaymentState,
      currency: r.currency ?? null,
      total_cost: Number(r.total_cost) || 0,
      assigned_guide_id: r.assigned_guide_id ?? null,
      assigned_vehicle_id: r.assigned_vehicle_id ?? null,
      guide_name: r.assigned_guide_id ? guides.get(r.assigned_guide_id) ?? null : null,
      vehicle_name: r.assigned_vehicle_id ? vehicles.get(r.assigned_vehicle_id) ?? null : null,
    })
  }
  return out
}

/** The guides API answers with a bare array; the vehicles API with { success, data }. */
export function listFrom<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[]
  const data = (json as { data?: unknown } | null)?.data
  return Array.isArray(data) ? (data as T[]) : []
}

export interface CalendarStats {
  totalBookings: number
  totalRevenue: CurrencyTotals
  totalTravelers: number
  upcomingBookings: number
  statusBreakdown: Record<string, number>
}

/** The stat cards, over the trips on screen: money, people and "upcoming" over
 *  sold trips only; the breakdown over every trip shown. */
export function calendarStats(trips: CalendarTrip[], today: string): CalendarStats {
  const sold = trips.filter(t => t.sold)
  const totalRevenue = emptyTotals()
  for (const t of sold) addToTotals(totalRevenue, t.total_cost, t.currency || 'EUR')
  const statusBreakdown: Record<string, number> = {}
  for (const t of trips) statusBreakdown[t.payment_status] = (statusBreakdown[t.payment_status] || 0) + 1
  return {
    totalBookings: sold.length,
    totalRevenue,
    totalTravelers: sold.reduce((sum, t) => sum + t.num_travelers, 0),
    upcomingBookings: sold.filter(t => t.start_date >= today).length,
    statusBreakdown,
  }
}

export interface TripConflict {
  a: CalendarTrip
  b: CalendarTrip
  resourceType: 'guide' | 'vehicle' | 'date_overlap'
  resourceName: string
  overlapStart: string
  overlapEnd: string
}

/** Overlapping SOLD trips: a guide or vehicle clash when they share one,
 *  else a plain date overlap. Quotes and drafts never clash with anything. */
export function findConflicts(trips: CalendarTrip[]): TripConflict[] {
  const sorted = trips.filter(t => t.sold).slice().sort((x, y) => x.start_date.localeCompare(y.start_date))
  const out: TripConflict[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start_date <= sorted[i].end_date; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if (!(a.start_date <= b.end_date && a.end_date >= b.start_date)) continue
      const overlapStart = a.start_date > b.start_date ? a.start_date : b.start_date
      const overlapEnd = a.end_date < b.end_date ? a.end_date : b.end_date
      const sameGuide = !!a.assigned_guide_id && a.assigned_guide_id === b.assigned_guide_id
      const sameVehicle = !!a.assigned_vehicle_id && a.assigned_vehicle_id === b.assigned_vehicle_id
      if (sameGuide) out.push({ a, b, resourceType: 'guide', resourceName: a.guide_name ?? '', overlapStart, overlapEnd })
      if (sameVehicle) out.push({ a, b, resourceType: 'vehicle', resourceName: a.vehicle_name ?? '', overlapStart, overlapEnd })
      if (!sameGuide && !sameVehicle) out.push({ a, b, resourceType: 'date_overlap', resourceName: '', overlapStart, overlapEnd })
    }
  }
  return out
}
