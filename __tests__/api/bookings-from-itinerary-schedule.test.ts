import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// POST /api/bookings (from an itinerary) must write the operator's payment
// SCHEDULE onto the booking: deposit % from the org rule (20% when unset),
// the deposit due date, and the balance due date. BKG-2026-0001 (prod,
// 2026-09-02) came out with a 30% deposit, no percent and no dates — the
// figures the itinerary carried from the convert route's hardcoded split.
// This pins what the route produces from a clean itinerary.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))

import { POST } from '@/app/api/bookings/route'

const ITINERARY = {
  id: 'itin-1', org_id: 'org-1', itinerary_code: 'ITN-26-009', client_name: '鈴木 花子', client_email: 'x@example.com',
  trip_name: 'NMS803-CR-ABS', start_date: '2026-12-05', end_date: '2026-12-12', total_days: 8,
  num_adults: 2, num_children: 0, total_cost: 343.43, currency: 'USD', tier: 'deluxe', status: 'confirmed',
  // what the convert route used to stamp — the booking must NOT inherit it
  deposit_amount: 103.03, balance_due: 240.4, b2b_partners: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  setMockTables({
    itineraries: [structuredClone(ITINERARY)],
    organizations: [{ id: 'org-1', deposit_percent: null, deposit_due_days: null, balance_due_days_before_departure: null }],
    bookings: [],
    itinerary_days: [],
    itinerary_services: [],
    booking_suppliers: [],
  })
})

async function post(body: Record<string, unknown>) {
  const res = await POST({ json: async () => body } as any)
  return { status: res.status, json: await res.json() }
}

describe('POST /api/bookings from an itinerary', () => {
  it('writes the org payment schedule, not the itinerary’s stale deposit', async () => {
    const { status, json } = await post({ itinerary_id: 'itin-1' })
    expect(status).toBe(201)
    const { data: rows } = await (createMockClient().from('bookings') as any).select('*')
    expect(rows).toHaveLength(1)
    const b = rows[0]
    expect(b.deposit_percent).toBe(20)
    expect(b.deposit_amount).toBe(68.69)
    expect(b.balance_due).toBe(343.43)
    expect(b.payment_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(b.balance_due_date).toBe('2026-10-06')
    expect(b.currency).toBe('USD')
    expect(json.data.deposit_percent).toBe(20)
    // The response names the builder that ran — how a deploy is proven.
    expect(json.builder).toBe('schedule-2026-09-02')
  })

  it('takes the operator’s own percentage when one is set', async () => {
    setMockTables({
      itineraries: [structuredClone(ITINERARY)],
      organizations: [{ id: 'org-1', deposit_percent: 25, deposit_due_days: 5, balance_due_days_before_departure: 45 }],
      bookings: [], itinerary_days: [], itinerary_services: [], booking_suppliers: [],
    })
    await post({ itinerary_id: 'itin-1' })
    const { data: rows } = await (createMockClient().from('bookings') as any).select('*')
    expect(rows[0].deposit_percent).toBe(25)
    expect(rows[0].deposit_amount).toBe(85.86)
    expect(rows[0].balance_due_date).toBe('2026-10-21')
  })
})

describe('no route hand-rolls a booking deposit', () => {
  it('the itinerary status route has no 30% literal and uses the shared builder', () => {
    // THE actual source of BKG-2026-0001..0004: confirming an itinerary
    // auto-creates its booking in app/api/itineraries/[id]/route.ts, and that
    // block computed deposit = total × 0.3 with no schedule at all.
    const { readFileSync } = require('fs') as typeof import('fs')
    const { join } = require('path') as typeof import('path')
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'itineraries', '[id]', 'route.ts'), 'utf8')
    expect(src).not.toMatch(/\*\s*0\.3\b/)
    expect(src).toContain('buildBookingRow({')
    expect(src).toContain('paymentRuleFrom(orgTerms)')
    expect(src).toContain('populateSuppliersFromItinerary(')
  })
})
