import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Airport / hotel assistance priced per group, per person or per unit
// (migration 20261104). The engine charged every assistance line ONCE for the
// group — a meet-and-assist cost the same for 2 travellers as for 20.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
const checkin = (extra: Record<string, unknown>) => ({ id: 'hs-in', service_type: 'checkin_assist', hotel_category: 'all', rate_eur: 10, is_active: true, ...extra })
const checkinLine = (r: any) => (r.services ?? []).find((s: any) => s.serviceType === 'hotel_service' && /check-in/i.test(s.serviceName) && !s.unpriced)

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

async function price(extra: Record<string, unknown>, numPax = 2) {
  const t = fullRateTables() as any
  t.hotel_staff_rates = [checkin(extra), { ...checkin({}), id: 'hs-out', service_type: 'checkout_assist' }]
  setMockTables(t)
  return calculateAutoPricing({ ...BASE, numPax }) as any
}
/** The trip's total cost for a group of `pax`, with the check-in rate `extra`. */
const costAt = async (extra: Record<string, unknown>, pax: number) => (await price(extra, pax)).totalCost as number

describe('the engine prices assistance by the rate’s basis', () => {
  it('per group (no basis stated): a fixed line, as before', async () => {
    const r = await price({})
    expect(checkinLine(r)).toMatchObject({ unitCost: 10, lineTotal: 10, isPerPax: false })
  })

  it('per person: a per-pax line — each extra traveller adds the rate', async () => {
    const pp = await price({ pricing_type: 'per_person' })
    expect(checkinLine(pp)).toMatchObject({ unitCost: 10, isPerPax: true, quantityMode: 'per_pax' })
    const flat = { pricing_type: 'flat' }, perPerson = { pricing_type: 'per_person' }
    expect(await costAt(perPerson, 2) - await costAt(flat, 2)).toBeCloseTo(10, 2)
    expect(await costAt(perPerson, 4) - await costAt(flat, 4)).toBeCloseTo(30, 2)
  })

  it('per unit: steps with the group size', async () => {
    const flat = { pricing_type: 'flat' }, unit = { pricing_type: 'per_unit', max_capacity: 2 }
    // 2 pax = 1 unit (same as per group); 4 pax = 2 units; 5 pax = 3 units.
    expect(await costAt(unit, 2) - await costAt(flat, 2)).toBeCloseTo(0, 2)
    expect(await costAt(unit, 4) - await costAt(flat, 4)).toBeCloseTo(10, 2)
    expect(await costAt(unit, 5) - await costAt(flat, 5)).toBeCloseTo(20, 2)
  })
})
