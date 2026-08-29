// ============================================
// The org's own exchange rates win, the API fills the gaps
// ============================================
// The normalizer used to ask only the external API (ECB rates — no EGP).
// The operator's first real EGP entrance fees were all "no exchange rate
// available — treated as missing" while the app's own exchange_rates table
// held a fresh EUR↔EGP rate from the nightly job. These pin the merge.
import { describe, it, expect } from 'vitest'
import { dbRowsToEurRates, mergeEurRates } from '@/lib/rates/fx-source'
import { getExchangeRate } from '@/lib/currency-service'

const PROD_SHAPE_ROWS = [
  { base_currency: 'EUR', target_currency: 'USD', rate: 1.160971 },
  { base_currency: 'USD', target_currency: 'EUR', rate: 0.8613 },
  { base_currency: 'EUR', target_currency: 'EGP', rate: 58.510664 },
  { base_currency: 'EGP', target_currency: 'EUR', rate: 0.017090 },
]

describe('dbRowsToEurRates', () => {
  it('folds EUR-based rows and inverses into one EUR map', () => {
    const m = dbRowsToEurRates(PROD_SHAPE_ROWS)
    expect(m.EGP).toBeCloseTo(58.510664)
    expect(m.USD).toBeCloseTo(1.160971)
    expect(m.EUR).toBe(1)
  })

  it('uses the inverse only when the direct row is absent, and rejects junk', () => {
    const m = dbRowsToEurRates([
      { base_currency: 'JPY', target_currency: 'EUR', rate: 0.005555 },
      { base_currency: 'EUR', target_currency: 'GBP', rate: 0 },       // junk
      { base_currency: 'EUR', target_currency: 'CHF', rate: 'x' as any }, // junk
    ])
    expect(m.JPY).toBeCloseTo(1 / 0.005555)
    expect('GBP' in m).toBe(false)
    expect('CHF' in m).toBe(false)
  })
})

describe('mergeEurRates', () => {
  it('the audited failure: EGP entrance fee converts to the USD run currency', () => {
    // ECB API: no EGP. DB: has it. Cross-rate EGP→USD must resolve.
    const api = { base: 'EUR', date: '2026-08-30', rates: { EUR: 1, USD: 1.16, GBP: 0.85 } }
    const merged = mergeEurRates(dbRowsToEurRates(PROD_SHAPE_ROWS), api)
    const egpToUsd = getExchangeRate('EGP', 'USD', merged)
    expect(egpToUsd).not.toBeNull()
    // 600 EGP ≈ $11.9 — NOT $600, and NOT missing.
    expect(600 * egpToUsd!).toBeGreaterThan(10)
    expect(600 * egpToUsd!).toBeLessThan(14)
  })

  it('DB values override the API where both know a currency', () => {
    const api = { base: 'EUR', date: '2026-08-30', rates: { EUR: 1, USD: 99 } }
    const merged = mergeEurRates(dbRowsToEurRates(PROD_SHAPE_ROWS), api)
    expect(merged.rates.USD).toBeCloseTo(1.160971)
  })

  it('re-bases an API answer fetched with a non-EUR base', () => {
    const api = { base: 'USD', date: '2026-08-30', rates: { USD: 1, EUR: 0.86, GBP: 0.74 } }
    const merged = mergeEurRates({ EUR: 1 }, api)
    expect(merged.base).toBe('EUR')
    expect(merged.rates.GBP).toBeCloseTo(0.74 / 0.86)
  })

  it('survives a dead API: the DB alone still converts', () => {
    const merged = mergeEurRates(dbRowsToEurRates(PROD_SHAPE_ROWS), null)
    expect(getExchangeRate('EGP', 'USD', merged)).not.toBeNull()
  })
})
