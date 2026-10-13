// Rates › Fixed Costs, the Water Bottle cost (every other active cost is charged
// too — see fixed-costs-all.test.ts). Three ways water used to go quietly wrong:
//   - the AI itinerary and cruise builders read it with no converter, so a
//     row entered as 20 EGP was used as 20 EUR/USD of water per person a day;
//   - the match was case-sensitive: "water bottle" priced the built-in 2.00;
//   - no row, a renamed row, or a row whose currency had no exchange rate all
//     fell back to 2.00 without a word.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: state.rows, error: null }) }) }) }),
  }),
}))

import { getFixedDailyCosts, clearFixedCostsCache, waterCostFromRows } from '@/lib/fixed-costs'
import { isWaterCostType } from '@/lib/fixed-cost-types'

beforeEach(() => { state.rows = []; clearFixedCostsCache() })

// A stand-in normaliser: EGP → run currency at 50 per unit; BTC has no rate.
const normalizer = {
  misses: [] as unknown[],
  normalize: async (_table: string, rows: Record<string, unknown>[]) =>
    rows.map(r => r.rate_currency === 'EGP'
      ? { ...r, cost_per_person_per_day: Number(r.cost_per_person_per_day) / 50 }
      : r.rate_currency === 'BTC' ? { ...r, cost_per_person_per_day: null } : r),
}

describe('the water cost', () => {
  it('is converted from its own currency when a converter is passed', async () => {
    state.rows = [{ cost_type: 'Water Bottle', cost_per_person_per_day: 20, rate_currency: 'EGP' }]
    const out = await getFixedDailyCosts('org-1', normalizer as never)
    expect(out.waterPerPersonPerDay).toBe(0.4)
    expect(out.warnings).toEqual([])
  })

  it('matches "water bottle" whatever its case or spacing', () => {
    expect(isWaterCostType('  water   BOTTLE ')).toBe(true)
    expect(waterCostFromRows([{ cost_type: 'water bottle', cost_per_person_per_day: 1.5 }])).toEqual({ waterPerPersonPerDay: 1.5, warnings: [] })
  })

  it('falls back to 2.00 only with a warning — no row, another cost type, no exchange rate', async () => {
    expect(waterCostFromRows([]).warnings[0]).toMatch(/no active "Water Bottle" row/)
    // A "Snacks" row is not the water cost: water still falls back, and says so.
    const snacks = waterCostFromRows([{ cost_type: 'Snacks', cost_per_person_per_day: 3 }])
    expect(snacks.waterPerPersonPerDay).toBe(2)
    expect(snacks.warnings).toHaveLength(1)
    state.rows = [{ cost_type: 'Water Bottle', cost_per_person_per_day: 1, rate_currency: 'BTC' }]
    const btc = await getFixedDailyCosts('org-1', normalizer as never)
    expect(btc.waterPerPersonPerDay).toBe(2)
    expect(btc.warnings[0]).toMatch(/BTC and no exchange rate/)
  })
})

describe('every engine converts it', () => {
  it('the AI itinerary and cruise builders pass their run converter', () => {
    const land = fs.readFileSync(path.join(process.cwd(), 'lib/ai/service-creation.ts'), 'utf8')
    const cruise = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cruise-service-creation.ts'), 'utf8')
    expect(land).toMatch(/getFixedDailyCosts\(orgId, rates\.rateNormalizer\)/)
    expect(cruise).toMatch(/getFixedDailyCosts\(orgId, cruiseNormalizer\)/)
    expect(land + cruise).not.toMatch(/getFixedDailyCosts\(orgId\)/)
  })

  it('auto-pricing shows the fallback warning on the quote', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(src).toContain('warnings.push(...(fixedDailyCosts.warnings ?? []))')
  })
})
