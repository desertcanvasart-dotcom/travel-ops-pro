import { describe, it, expect } from 'vitest'
import { buildFrozenFx, computeFxReprice, frozenToExchangeRates, parseFrozenFx, type FrozenFx } from '@/lib/itinerary-fx'
import type { ExchangeRates } from '@/lib/currency-service'

// The plan's worked example: USD file, 1 USD = 50 EGP at confirm.
const FROZEN: FrozenFx = {
  base: 'USD',
  rates: { USD: 1, EGP: 50, JPY: 150 },
  frozen_at: '2026-03-01T00:00:00Z',
  frozen_by: 'u1',
  source: 'confirm',
}

describe('parseFrozenFx', () => {
  it('accepts the stored shape and rejects everything else', () => {
    expect(parseFrozenFx(FROZEN)).toEqual(FROZEN)
    expect(parseFrozenFx(null)).toBeNull()
    expect(parseFrozenFx('{}')).toBeNull()
    expect(parseFrozenFx({ rates: {} })).toBeNull()
    expect(parseFrozenFx([])).toBeNull()
  })
})

describe('buildFrozenFx', () => {
  it('captures the live rates with attribution and source', async () => {
    const live = { base: 'USD', rates: { USD: 1, EGP: 51 } } as unknown as ExchangeRates
    const fx = await buildFrozenFx('USD', 'user-9', 'reprice', { getRates: async () => live })
    expect(fx.base).toBe('USD')
    expect(fx.rates.EGP).toBe(51)
    expect(fx.frozen_by).toBe('user-9')
    expect(fx.source).toBe('reprice')
    expect(new Date(fx.frozen_at).getTime()).toBeGreaterThan(0)
    // A copy, not the live object — later mutation of the source must not
    // rewrite a frozen file.
    ;(live.rates as Record<string, number>).EGP = 999
    expect(fx.rates.EGP).toBe(51)
  })
})

describe('computeFxReprice', () => {
  const lines = [
    // 5,000 EGP transfer, converted at 50 → $100 on the file today
    { id: 'a', supplier_currency: 'EGP', supplier_cost_original: 5000, exchange_rate_used: 0.02, total_cost: 100 },
    // Hand-entered USD line — no FX in it
    { id: 'b', supplier_currency: null, supplier_cost_original: null, exchange_rate_used: null, total_cost: 180 },
    // Same-currency line — also untouched
    { id: 'c', supplier_currency: 'USD', supplier_cost_original: 120, exchange_rate_used: 1, total_cost: 120 },
  ]

  it('restates converted lines from the PRESERVED original at the new rate', () => {
    // The pound moved: 1 USD = 55 EGP → the $100 transfer becomes $90.91
    const moved: FrozenFx = { ...FROZEN, rates: { USD: 1, EGP: 55 }, source: 'reprice' }
    const r = computeFxReprice(lines, 'USD', moved)
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0]).toMatchObject({ id: 'a', old_total: 100, new_total: 90.91 })
    expect(r.changes[0].new_rate).toBeCloseTo(1 / 55)
    // Untouched lines still count into the restated cost
    expect(r.newSupplierCost).toBeCloseTo(90.91 + 180 + 120)
    expect(r.unconvertible).toEqual([])
  })

  it('reports nothing to change when the rates did not move', () => {
    const r = computeFxReprice(lines, 'USD', FROZEN)
    expect(r.changes).toHaveLength(0)
    expect(r.newSupplierCost).toBeCloseTo(400)
  })

  it('leaves a line untouched when the snapshot cannot convert its currency', () => {
    const partial: FrozenFx = { ...FROZEN, rates: { USD: 1 } }
    const r = computeFxReprice(lines, 'USD', partial)
    expect(r.unconvertible).toEqual([{ id: 'a', currency: 'EGP' }])
    // The old converted value stays in the sum — yesterday's rate beats a
    // wrong one.
    expect(r.newSupplierCost).toBeCloseTo(400)
  })

  it('rounds to the itinerary currency — JPY lines carry no decimals', () => {
    const jpyFrozen: FrozenFx = { ...FROZEN, base: 'JPY', rates: { JPY: 1, EGP: 1 / 3.1 } }
    const r = computeFxReprice(
      [{ id: 'x', supplier_currency: 'EGP', supplier_cost_original: 1000, exchange_rate_used: 3, total_cost: 3000 }],
      'JPY',
      jpyFrozen
    )
    expect(r.changes[0].new_total).toBe(3100)
    expect(Number.isInteger(r.changes[0].new_total)).toBe(true)
  })

  it('round-trips through the engine rate helper shape', () => {
    const er = frozenToExchangeRates(FROZEN)
    expect(er.base).toBe('USD')
    expect(er.rates.EGP).toBe(50)
  })
})
