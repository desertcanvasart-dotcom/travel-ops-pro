// Two rate rows sat at €0 for months: HOTEL-PORTER-ALL and AIR-CAI-MEETGR-ARR.
// The forms defaulted rate_eur to 0, the engine read 0 as "no usable rate",
// and the pricing hole told the operator to ADD a rate that was already on
// their screen. These pin the distinction that fixes the advice.
import { describe, it, expect } from 'vitest'
import { usableRate } from '@/lib/pricing/usable-rate'
import type { PricingHole } from '@/lib/pricing-types'

/** Mirrors the in-memory resolvers in lib/auto-pricing-service.ts. */
function resolve(row: { rate_eur: number | null } | undefined) {
  if (!row) return { rate: null, rowExists: false }
  return { rate: usableRate(row.rate_eur), rowExists: true }
}

function holeFor(found: { rate: number | null; rowExists: boolean }): PricingHole['reason'] {
  return found.rowExists ? 'unpriced' : 'missing'
}

describe('staff rate resolution', () => {
  it('prices a row that has a real rate', () => {
    expect(resolve({ rate_eur: 30 })).toEqual({ rate: 30, rowExists: true })
  })

  it('calls a zero row UNPRICED, not missing — the row is on the rates screen', () => {
    const found = resolve({ rate_eur: 0 })   // HOTEL-PORTER-ALL
    expect(found.rate).toBeNull()
    expect(holeFor(found)).toBe('unpriced')
  })

  it('treats a null rate the same way once the column became nullable', () => {
    const found = resolve({ rate_eur: null })
    expect(found.rate).toBeNull()
    expect(holeFor(found)).toBe('unpriced')
  })

  it('still calls a genuinely absent row MISSING', () => {
    const found = resolve(undefined)
    expect(found.rate).toBeNull()
    expect(holeFor(found)).toBe('missing')
  })

  it('never invents a price from an unusable rate', () => {
    // The failure this whole rule exists to prevent: 0 becoming a €0 charge.
    for (const bad of [0, -5, null, undefined, '', 'free']) {
      expect(usableRate(bad)).toBeNull()
    }
  })
})

describe('average rate display', () => {
  // Mirrors the stats calculation on both rates pages.
  const avg = (rates: Array<{ rate_eur: number | null }>) => {
    const priced = rates.map((r) => r.rate_eur).filter((v): v is number => v != null && v > 0)
    return priced.length > 0 ? Math.round(priced.reduce((s, v) => s + v, 0) / priced.length) : 0
  }

  it('averages priced rows only', () => {
    // The real hotel_staff_rates shape: four priced tiers plus an unpriced porter.
    expect(avg([{ rate_eur: 15 }, { rate_eur: 20 }, { rate_eur: 30 }, { rate_eur: 25 }, { rate_eur: null }]))
      .toBe(23)
  })

  it('does not let unpriced rows drag the average down', () => {
    const withZero = avg([{ rate_eur: 20 }, { rate_eur: 0 }])
    expect(withZero).toBe(20)   // not 10
  })

  it('reports zero when nothing is priced at all', () => {
    expect(avg([{ rate_eur: null }, { rate_eur: 0 }])).toBe(0)
  })
})

describe('full-service fallback for hotel assistance', () => {
  // The rate table holds one full-service row per category; the day loop
  // asks for checkin_assist / porter. Nothing bridged them until 2026-08-21,
  // so hotel assistance had never priced on any trip. Mirrors the in-memory
  // resolver in lib/auto-pricing-service.ts.
  type Row = { service_type: string; hotel_category: string; rate_eur: number | null }
  const resolve = (rows: Row[], serviceType: string, category = 'standard') => {
    const matches = (t: string) =>
      rows.find((r) => r.service_type === t && (r.hotel_category === category || r.hotel_category === 'all'))
    const dedicated = matches(serviceType)
    if (dedicated) return { rate: usableRate(dedicated.rate_eur), via: 'dedicated' }
    if (serviceType !== 'full_service') {
      const full = matches('full_service')
      if (full) return { rate: usableRate(full.rate_eur), via: 'full_service' }
    }
    return { rate: null, via: 'dedicated' }
  }
  const ONLY_FULL: Row[] = [{ service_type: 'full_service', hotel_category: 'all', rate_eur: 20 }]

  it("prices check-in from the full-service row when there's no dedicated one — the operator's model", () => {
    expect(resolve(ONLY_FULL, 'checkin_assist')).toEqual({ rate: 20, via: 'full_service' })
  })

  it('prices check-out / porter the same way', () => {
    expect(resolve(ONLY_FULL, 'porter')).toEqual({ rate: 20, via: 'full_service' })
  })

  it('prefers a dedicated row when one exists', () => {
    const rows = [...ONLY_FULL, { service_type: 'porter', hotel_category: 'all', rate_eur: 5 }]
    expect(resolve(rows, 'porter')).toEqual({ rate: 5, via: 'dedicated' })
    expect(resolve(rows, 'checkin_assist')).toEqual({ rate: 20, via: 'full_service' })
  })

  it('honours the category on the fallback too', () => {
    const rows: Row[] = [{ service_type: 'full_service', hotel_category: 'luxury', rate_eur: 30 }]
    expect(resolve(rows, 'porter', 'standard').rate).toBeNull()
    expect(resolve(rows, 'porter', 'luxury').rate).toBe(30)
  })

  it('does not loop when asked for full_service directly', () => {
    expect(resolve([], 'full_service')).toEqual({ rate: null, via: 'dedicated' })
  })
})
