import { describe, it, expect } from 'vitest'
import {
  detectCruiseSeason,
  getCruiseSeasonRates,
  calculateCabinAllocations,
} from '@/lib/ai/cruise-pricing'

describe('detectCruiseSeason', () => {
  const mockShip = {
    peak_season_1_start: '2025-12-20',
    peak_season_1_end: '2026-01-10',
    peak_season_2_start: null,
    peak_season_2_end: null,
    high_season_start: '2025-10-01',
    high_season_end: '2025-04-30',
  }

  it('should detect peak season', () => {
    expect(detectCruiseSeason(mockShip, '2025-12-25')).toBe('peak')
    expect(detectCruiseSeason(mockShip, '2026-01-05')).toBe('peak')
  })

  it('should detect high season', () => {
    expect(detectCruiseSeason(mockShip, '2025-10-15')).toBe('high')
    expect(detectCruiseSeason(mockShip, '2025-11-20')).toBe('high')
  })

  it('should default to low season', () => {
    expect(detectCruiseSeason(mockShip, '2025-07-15')).toBe('low')
    expect(detectCruiseSeason(mockShip, '2025-08-01')).toBe('low')
  })

  it('should handle ship with no season data', () => {
    const emptyShip = {}
    expect(detectCruiseSeason(emptyShip, '2025-03-15')).toBe('low')
  })
})

describe('getCruiseSeasonRates', () => {
  const mockShip = {
    rate_high_single_eur: 120,
    rate_high_double_eur: 100,
    rate_high_triple_eur: 85,
    rate_high_suite_eur: 200,
    rate_high_single_non_eur: 150,
    rate_high_double_non_eur: 130,
    rate_high_triple_non_eur: 110,
    rate_high_suite_non_eur: 250,
  }

  it('should return EUR rates', () => {
    const rates = getCruiseSeasonRates(mockShip, 'high', true)
    expect(rates.single).toBe(120)
    expect(rates.double).toBe(100)
    expect(rates.triple).toBe(85)
    expect(rates.suite).toBe(200)
  })

  it('should return non-EUR rates', () => {
    const rates = getCruiseSeasonRates(mockShip, 'high', false)
    expect(rates.single).toBe(150)
    expect(rates.double).toBe(130)
  })

  it('should return 0 for missing rates', () => {
    const rates = getCruiseSeasonRates({}, 'low', true)
    expect(rates.single).toBe(0)
    expect(rates.double).toBe(0)
  })
})

describe('calculateCabinAllocations', () => {
  const rates = { single: 100, double: 80, triple: 70, suite: 200 }

  it('should allocate 2 pax as 1 double', () => {
    const allocations = calculateCabinAllocations(2, rates)
    expect(allocations.length).toBeGreaterThan(0)
    // Cheapest should be 1 double
    const best = allocations[0]
    expect(best).toHaveLength(1)
    expect(best[0].type).toBe('double')
    expect(best[0].count).toBe(1)
    expect(best[0].pax).toBe(2)
  })

  it('should allocate 1 pax as 1 single', () => {
    const allocations = calculateCabinAllocations(1, rates)
    expect(allocations.length).toBe(1)
    expect(allocations[0][0].type).toBe('single')
    expect(allocations[0][0].pax).toBe(1)
  })

  it('should allocate 3 pax as 1 triple (cheapest)', () => {
    const allocations = calculateCabinAllocations(3, rates)
    expect(allocations.length).toBeGreaterThan(0)
    // Triple (3*70=210) should be cheaper than double+single (2*80+1*100=260)
    const best = allocations[0]
    const hasTriple = best.some(a => a.type === 'triple')
    expect(hasTriple).toBe(true)
  })

  it('should sort by cost (cheapest first)', () => {
    const allocations = calculateCabinAllocations(4, rates)
    if (allocations.length >= 2) {
      const cost0 = allocations[0].reduce((s, a) => s + a.costPerNight, 0)
      const cost1 = allocations[1].reduce((s, a) => s + a.costPerNight, 0)
      expect(cost0).toBeLessThanOrEqual(cost1)
    }
  })

  it('should handle 0 pax gracefully', () => {
    const allocations = calculateCabinAllocations(0, rates)
    expect(allocations).toHaveLength(0)
  })

  it('should handle zero rates', () => {
    const zeroRates = { single: 0, double: 0, triple: 0, suite: 0 }
    const allocations = calculateCabinAllocations(2, zeroRates)
    expect(allocations).toHaveLength(0)
  })
})
