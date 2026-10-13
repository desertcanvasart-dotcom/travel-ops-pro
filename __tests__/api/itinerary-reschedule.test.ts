// POST /api/itineraries/[id]/reschedule — the calendar's drag.
//
// The drag PUT only the trip's start and end dates: its days, its guide and
// vehicle assignments, and a booked trip's booking dates, balance due date and
// supplier confirmations all stayed on the old dates. Now the trip, its days
// and its assignments move together (shift_itinerary_dates, one database
// call), and a trip with a booking or supplier documents is refused.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { daysBetween, rescheduleCheck } from '@/lib/itineraries/reschedule'

const calls = vi.hoisted(() => ({ rpc: [] as Array<{ fn: string; args: unknown }> }))
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return {
    createClient: () => ({
      ...mock.createMockClient(),
      rpc: async (fn: string, args: unknown) => {
        calls.rpc.push({ fn, args })
        return { data: null, error: null }
      },
    }),
  }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))
vi.mock('@/lib/today', () => ({ businessToday: () => '2026-10-13', todayLocal: () => '2026-10-13' }))

import { POST } from '@/app/api/itineraries/[id]/reschedule/route'

const TRIP = { id: 'itin-1', org_id: 'org-1', status: 'confirmed', start_date: '2026-11-01', end_date: '2026-11-05' }
const move = async (start_date: string, id = 'itin-1') => {
  const res = await POST({ json: async () => ({ start_date }) } as any, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  calls.rpc = []
  setMockTables({ itineraries: [{ ...TRIP }], bookings: [], supplier_documents: [] })
})

describe('moving a trip', () => {
  it('shifts the trip, its days and its assignments by the same number of days, in one call', async () => {
    const { status, json } = await move('2026-11-08')
    expect(status).toBe(200)
    expect(json.shifted_days).toBe(7)
    expect(calls.rpc).toEqual([{ fn: 'shift_itinerary_dates', args: { p_itinerary_id: 'itin-1', p_org_id: 'org-1', p_days: 7 } }])
  })

  it('a trip with a booking is refused with the reason, nothing moves', async () => {
    setMockTables({ itineraries: [{ ...TRIP }], bookings: [{ id: 'b', itinerary_id: 'itin-1', org_id: 'org-1', booking_code: 'BKG-2026-0003', status: 'pending' }], supplier_documents: [] })
    const { status, json } = await move('2026-11-08')
    expect(status).toBe(409)
    expect(json.error).toContain('BKG-2026-0003')
    expect(calls.rpc).toEqual([])
  })

  it('a trip with supplier documents is refused', async () => {
    setMockTables({ itineraries: [{ ...TRIP }], bookings: [], supplier_documents: [{ id: 'sd', itinerary_id: 'itin-1', org_id: 'org-1', status: 'draft' }] })
    expect((await move('2026-11-08')).status).toBe(409)
    expect(calls.rpc).toEqual([])
  })

  it("another company's trip is not found", async () => {
    setMockTables({ itineraries: [{ ...TRIP, org_id: 'org-2' }], bookings: [], supplier_documents: [] })
    expect((await move('2026-11-08')).status).toBe(404)
  })
})

describe('the rule', () => {
  const base = { status: 'confirmed', startDate: '2026-11-01', newStartDate: '2026-11-08', today: '2026-10-13', booking: null, supplierDocuments: 0 }
  it('past dates, finished trips and bad dates are refused', () => {
    expect(rescheduleCheck({ ...base, newStartDate: '2026-10-01' })).toMatchObject({ status: 400 })
    expect(rescheduleCheck({ ...base, status: 'completed' })).toMatchObject({ status: 409 })
    expect(rescheduleCheck({ ...base, newStartDate: 'soon' })).toMatchObject({ status: 400 })
  })
  it('a cancelled booking does not hold the trip', () => {
    expect(rescheduleCheck({ ...base, booking: { booking_code: 'B', status: 'cancelled' } })).toEqual({ days: 7 })
  })
  it('days between dates, across a month end', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3)
  })
})
