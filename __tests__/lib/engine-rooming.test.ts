import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import { roomingAdjustment } from '@/lib/pricing/rooming'

// Operator decision 2026-09-02: the engine prices accommodation through the
// rooming rule — a solo traveller pays the single supplement, three sharing
// take the triple reduction (per person in the triple) — instead of
// pax × per-person-in-double, hotels and cruises alike.
//
// Two copies of the same fixture: one with no supplement and no reduction
// (where the rooming rule reduces to the historical flat arithmetic) and one
// with both. The difference between them is the rooming effect and nothing
// else — transport, fixed costs and per-person lines are identical.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const SUPP = 50
const RED = 10
const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0 }

function tables(withRooming: boolean) {
  const t = fullRateTables()
  for (const row of t.accommodation_rates as Record<string, unknown>[]) {
    row.single_supp_eur = withRooming ? SUPP : 0
    row.single_supp_non_eur = withRooming ? SUPP : 0
    row.triple_red_eur = withRooming ? RED : 0
    row.triple_red_non_eur = withRooming ? RED : 0
  }
  return t
}

async function totalsFor(withRooming: boolean) {
  setMockTables(tables(withRooming))
  const out: Record<number, { total: number; nights: number }> = {}
  for (const numPax of [1, 2, 3, 4, 5]) {
    const r = await calculateAutoPricing({ ...BASE, numPax })
    expect(r.success).toBe(true)
    out[numPax] = { total: r.totalCost, nights: (r.accommodationNights ?? []).length }
  }
  return out
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('engine rooming', () => {
  it('reports one set of contract figures per accommodation night, and the fixture has at least one', async () => {
    setMockTables(tables(true))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(r.success).toBe(true)
    const nights = r.accommodationNights ?? []
    expect(nights.length).toBeGreaterThan(0)
    for (const n of nights) expect(n).toEqual({ ppd: 95, singleSupp: SUPP, tripleRed: RED })
    expect(roomingAdjustment(2, nights)).toBe(0)
  })

  it('a solo traveller pays the supplement, three sharing take the reduction, even parties are unchanged', async () => {
    const flat = await totalsFor(false)
    const roomed = await totalsFor(true)
    const nights = roomed[2].nights
    expect(nights).toBeGreaterThan(0)
    expect(roomed[2].total).toBe(flat[2].total)
    expect(roomed[4].total).toBe(flat[4].total)
    expect(roomed[1].total).toBeCloseTo(flat[1].total + SUPP * nights, 2)
    expect(roomed[3].total).toBeCloseTo(flat[3].total - 3 * RED * nights, 2)
    // Five: one double at the double rate, three in the triple at the reduction.
    expect(roomed[5].total).toBeCloseTo(flat[5].total - 3 * RED * nights, 2)
  })

  it('with no supplement and no reduction the rooming rule IS the old flat arithmetic', async () => {
    const flat = await totalsFor(false)
    setMockTables(tables(false))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(roomingAdjustment(1, r.accommodationNights ?? [])).toBe(0)
    expect(roomingAdjustment(3, r.accommodationNights ?? [])).toBe(0)
    expect(flat[1].total).toBeGreaterThan(0)
  })
})
