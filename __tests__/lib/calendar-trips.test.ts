// The Booking Calendar's trips and figures (lib/calendar/trips).
//
// The calendar read num_travelers, destinations, guide_name and vehicle_name,
// which the itineraries list never returns ("undefined pax", Total Travelers
// always 0, "Unknown Guide"); coloured every bar by itineraries.payment_status,
// which nothing updates; left out partner trips; and counted drafts and
// cancelled trips in Total Revenue and in the clash check.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calendarStats, findConflicts, listFrom, toCalendarTrips, type CalendarSourceRow } from '@/lib/calendar/trips'

const row = (over: Partial<CalendarSourceRow>): CalendarSourceRow => ({
  id: 'x', itinerary_code: 'ITN-1', client_name: 'Client', trip_name: 'Trip', start_date: '2026-11-01', end_date: '2026-11-05',
  num_adults: 2, num_children: 1, total_cost: 1000, currency: 'JPY', status: 'confirmed', ...over,
})

const guides = [{ id: 'g1', name: 'Ahmed' }]
const vehicles = [{ id: 'v1', name: 'Van 3' }]

describe('each trip carries what the page reads', () => {
  const [t] = toCalendarTrips([row({ id: 'a', assigned_guide_id: 'g1', assigned_vehicle_id: 'v1' })], {
    guides, vehicles, bookings: [{ itinerary_id: 'a', status: 'pending', payment_status: 'deposit_received' }],
  })
  it('travellers = adults + children; guide and vehicle named from the loaded lists', () => {
    expect(t.num_travelers).toBe(3)
    expect(t.guide_name).toBe('Ahmed')
    expect(t.vehicle_name).toBe('Van 3')
    expect(t.trip_name).toBe('Trip')
  })
  it("the payment state is the booking's", () => {
    expect(t.payment_status).toBe('deposit_received')
  })
})

describe('which trips, in which state', () => {
  const trips = toCalendarTrips([
    row({ id: 'draft', status: 'draft' }),
    row({ id: 'sent', status: 'sent' }),
    row({ id: 'conf', status: 'confirmed' }),
    row({ id: 'gone', status: 'cancelled' }),
    row({ id: 'b2b', status: 'confirmed', source: 'b2b_custom' }),
    row({ id: 'nodates', start_date: null }),
  ], { bookings: [{ itinerary_id: 'b2b', status: 'pending', payment_status: 'paid' }, { itinerary_id: 'gone', status: 'cancelled', payment_status: 'paid' }] })
  const byId = Object.fromEntries(trips.map(t => [t.id, t]))

  it('cancelled trips and trips without dates are not shown; partner trips are', () => {
    expect(Object.keys(byId).sort()).toEqual(['b2b', 'conf', 'draft', 'sent'])
    expect(byId.b2b.partner).toBe(true)
  })
  it('unsold trips read "quote"; a confirmed trip without a booking reads "no booking"', () => {
    expect(byId.draft.payment_status).toBe('quote')
    expect(byId.sent.payment_status).toBe('quote')
    expect(byId.conf.payment_status).toBe('no_booking')
    expect(byId.b2b.payment_status).toBe('paid')
  })

  it('revenue, travellers and upcoming count sold trips only, per currency', () => {
    const stats = calendarStats(trips, '2026-10-13')
    expect(stats.totalBookings).toBe(2)
    expect(stats.totalRevenue).toEqual({ JPY: 2000 })
    expect(stats.totalTravelers).toBe(6)
    expect(stats.upcomingBookings).toBe(2)
    expect(stats.statusBreakdown).toEqual({ quote: 2, no_booking: 1, paid: 1 })
  })
})

describe('clashes are between sold trips only', () => {
  it('a draft overlapping a booked trip is no clash; two sold trips sharing a guide are', () => {
    const trips = toCalendarTrips([
      row({ id: 'a', assigned_guide_id: 'g1' }),
      row({ id: 'b', assigned_guide_id: 'g1', start_date: '2026-11-04', end_date: '2026-11-08' }),
      row({ id: 'q', status: 'draft', assigned_guide_id: 'g1' }),
    ], { guides })
    const found = findConflicts(trips)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ resourceType: 'guide', resourceName: 'Ahmed', overlapStart: '2026-11-04', overlapEnd: '2026-11-05' })
    expect([found[0].a.id, found[0].b.id].sort()).toEqual(['a', 'b'])
  })
})

describe('the guides list arrives as a bare array', () => {
  it('both shapes are read', () => {
    expect(listFrom([{ id: 'g1' }])).toHaveLength(1)
    expect(listFrom({ success: true, data: [{ id: 'v1' }] })).toHaveLength(1)
    expect(listFrom({ success: false })).toEqual([])
  })
})

describe('the calendar page', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'calendar', 'page.tsx'), 'utf8')
  it('asks for partner trips and the bookings, and moves a trip through the reschedule route', () => {
    expect(src).toContain("'/api/itineraries?include_b2b=true'")
    expect(src).toContain("fetchAllPages<CalendarBookingRow & { id: string }>('/api/bookings'")
    expect(src).toContain('/reschedule`')
    expect(src).not.toMatch(/guidesData\.success/)
    expect(src).not.toMatch(/\.destinations/)
  })
})
