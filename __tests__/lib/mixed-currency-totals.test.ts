// ============================================
// Mixed-currency rates → ONE correct total
// ============================================
// The operator's question, verbatim: services will be entered in EGP, USD
// and JPY — is the final number definitely correct? These tests pin the
// answer at the engine level: every row is converted into the run currency
// at the fetch boundary (lib/rates/rate-currency.ts) using the org's own
// exchange_rates table (lib/rates/fx-source.ts), and the total moves by
// EXACTLY the converted difference — no raw number from another currency
// ever reaches a sum.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

// Deterministic FX, seeded exactly like the nightly job writes them.
// EUR→USD 1.10, EUR→EGP 55, EUR→JPY 165  ⇒  EGP→USD = 0.02, JPY→USD = 1/150.
const FX_ROWS = [
  { base_currency: 'EUR', target_currency: 'USD', rate: 1.10, is_active: true },
  { base_currency: 'EUR', target_currency: 'EGP', rate: 55, is_active: true },
  { base_currency: 'EUR', target_currency: 'JPY', rate: 165, is_active: true },
]

const PARAMS = {
  templateId: TEMPLATE_ID,
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 0, // margin off: the totals below are pure converted cost
  rateCurrency: 'USD',
}

function tables(overrides: {
  entranceCurrency?: string | null
  entranceRate?: number
  mealCurrency?: string | null
  mealRate?: number
} = {}) {
  const t = fullRateTables()
  t.exchange_rates = FX_ROWS
  if (overrides.entranceRate !== undefined || overrides.entranceCurrency !== undefined) {
    t.entrance_fees = t.entrance_fees.map((r: any) => ({
      ...r,
      eur_rate: overrides.entranceRate ?? r.eur_rate,
      non_eur_rate: overrides.entranceRate ?? r.non_eur_rate,
      rate_currency: overrides.entranceCurrency ?? null,
    }))
  }
  if (overrides.mealRate !== undefined || overrides.mealCurrency !== undefined) {
    t.meal_rates = t.meal_rates.map((r: any) => ({
      ...r,
      base_rate_eur: overrides.mealRate ?? r.base_rate_eur,
      base_rate_non_eur: overrides.mealRate ?? r.base_rate_non_eur,
      rate_currency: overrides.mealCurrency ?? null,
    }))
  }
  return t
}

const pax2Cost = (r: any) =>
  r.paxPricing.find((p: any) => p.numPax === 2).withoutLeader.totalCost

describe('mixed-currency totals', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  })

  it('an EGP entrance fee lands in the total as its USD conversion, exactly', async () => {
    // Baseline: entrance 20 in the run currency (USD).
    setMockTables(tables({ entranceRate: 20, entranceCurrency: null }))
    const baseline = await calculateDayBasedPricing(PARAMS)

    // Same fee entered as 1000 EGP ⇒ 1000 × 0.02 = 20 USD. IDENTICAL total.
    setMockTables(tables({ entranceRate: 1000, entranceCurrency: 'EGP' }))
    const egp = await calculateDayBasedPricing(PARAMS)

    expect(egp.success).toBe(true)
    expect(pax2Cost(egp)).toBeCloseTo(pax2Cost(baseline), 2)
  })

  it('EGP entrance + JPY meal + USD everything else, in ONE run', async () => {
    // 20 USD entrance and 15 USD lunch as the baseline...
    setMockTables(tables({ entranceRate: 20, entranceCurrency: null, mealRate: 15, mealCurrency: null }))
    const baseline = await calculateDayBasedPricing(PARAMS)

    // ...the same trip with the fee written as 1000 EGP and the lunch as
    // 2250 JPY (= 15 USD at 150 JPY/USD). The total must not move a cent.
    setMockTables(tables({ entranceRate: 1000, entranceCurrency: 'EGP', mealRate: 2250, mealCurrency: 'JPY' }))
    const mixed = await calculateDayBasedPricing(PARAMS)

    expect(mixed.success).toBe(true)
    expect(pax2Cost(mixed)).toBeCloseTo(pax2Cost(baseline), 2)
  })

  it('a raw foreign number is never mistaken for the run currency', async () => {
    // The failure mode this whole file guards: 1000 EGP summed as $1000.
    // Exact-delta proof: against a zero-fee baseline, adding a 1000 EGP fee
    // moves the 2-pax total by 2 × $20 — not by 2 × $1000.
    setMockTables(tables({ entranceRate: 0, entranceCurrency: null }))
    const zero = await calculateDayBasedPricing(PARAMS)
    setMockTables(tables({ entranceRate: 1000, entranceCurrency: 'EGP' }))
    const egp = await calculateDayBasedPricing(PARAMS)
    expect(pax2Cost(egp) - pax2Cost(zero)).toBeCloseTo(2 * 20, 2)
  })

  it('an unconvertible currency neutralises the row instead of guessing', async () => {
    setMockTables(tables({ entranceRate: 0, entranceCurrency: null }))
    const zero = await calculateDayBasedPricing(PARAMS)
    const t = tables({ entranceRate: 1000, entranceCurrency: 'XXX' })
    t.exchange_rates = FX_ROWS // XXX in no table and no API
    setMockTables(t)
    const r = await calculateDayBasedPricing(PARAMS)
    // The fee contributes NOTHING (neutralised, reported) — never 1000-raw.
    expect(pax2Cost(r) - pax2Cost(zero)).toBeLessThanOrEqual(0.01)
    expect(JSON.stringify(r.warnings)).toContain('XXX')
  })
})
