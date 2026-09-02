import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// Confirming an itinerary (PUT status: 'confirmed') auto-creates its booking.
// That block used to hand-roll the row — deposit 30%, balance = total −
// deposit, no percent, no dates — which is where BKG-2026-0001..0004 came
// from while the Create Booking button, seconds later, answered "already
// exists". It now goes through the same builder as POST /api/bookings.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  getCurrentUserId: vi.fn(async () => 'user-1'),
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))

import { PUT } from '@/app/api/itineraries/[id]/route'

const ITINERARY = {
  id: 'itin-1', org_id: 'org-1', itinerary_code: 'ITN-26-009', client_name: '鈴木 花子', client_email: 'x@example.com',
  trip_name: 'NMS803-CR-ABS', start_date: '2026-12-05', end_date: '2026-12-12', total_days: 8,
  num_adults: 2, num_children: 0, total_cost: 343.43, currency: 'USD', tier: 'deluxe', status: 'quoted',
  deposit_amount: 103.03, balance_due: 240.4,
}

beforeEach(() => {
  vi.clearAllMocks()
  setMockTables({
    itineraries: [structuredClone(ITINERARY)],
    organizations: [{ id: 'org-1', deposit_percent: null, deposit_due_days: null, balance_due_days_before_departure: null }],
    bookings: [], itinerary_days: [], itinerary_services: [], booking_supplier_status: [],
  })
})

async function put(body: Record<string, unknown>) {
  const res = await PUT({ json: async () => body } as any, { params: Promise.resolve({ id: 'itin-1' }) })
  return { status: res.status, json: await res.json() }
}

describe('PUT /api/itineraries/[id] status → confirmed', () => {
  it('auto-creates the booking with the operator’s payment schedule', async () => {
    const { status } = await put({ status: 'confirmed' })
    expect(status).toBe(200)
    const { data: rows } = await (createMockClient().from('bookings') as any).select('*')
    expect(rows).toHaveLength(1)
    const b = rows[0]
    expect(b.itinerary_id).toBe('itin-1')
    expect(b.deposit_percent).toBe(20)
    expect(b.deposit_amount).toBe(68.69)
    expect(b.balance_due).toBe(343.43)
    expect(b.payment_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(b.balance_due_date).toBe('2026-10-06')
  })

  it('does not create a second booking when one exists', async () => {
    setMockTables({
      itineraries: [structuredClone(ITINERARY)],
      organizations: [{ id: 'org-1' }],
      bookings: [{ id: 'b-1', itinerary_id: 'itin-1' }], itinerary_days: [], itinerary_services: [], booking_supplier_status: [],
    })
    await put({ status: 'confirmed' })
    const { data: rows } = await (createMockClient().from('bookings') as any).select('*')
    expect(rows).toHaveLength(1)
  })
})
