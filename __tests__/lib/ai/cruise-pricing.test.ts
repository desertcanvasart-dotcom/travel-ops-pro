import { describe, it, expect } from 'vitest'
import {
  detectCruiseSeason,
  getCruiseSeasonRates,
  resolveCruiseRates,
  calculateCabinAllocations,
} from '@/lib/ai/cruise-pricing'

// Season detection moved from a month-day comparison over three fixed windows
// to real dated periods read off nile_cruises.seasons (migration
// 20260826_rate_seasons). Two behaviours changed deliberately:
//   - the period's NAME comes back, not the 'low'|'high'|'peak' keyword, because
//     a ship may now have any number of named periods;
//   - a window belongs to its contract year and no longer repeats for ever.
// Rows that predate the migration still resolve through their legacy columns,
// which is what the first block covers.

describe('detectCruiseSeason — legacy rows (no seasons list)', () => {
  const mockShip = {
    peak_season_1_start: '2025-12-20',
    peak_season_1_end: '2026-01-10',
    peak_season_2_start: null,
    peak_season_2_end: null,
    high_season_start: '2025-10-01',
    // Ends BEFORE it starts: the old month-day resolver read that as a window
    // wrapping through the new year, and prod rows are entered that way.
    high_season_end: '2025-04-30',
  }

  it('should detect peak season', () => {
    expect(detectCruiseSeason(mockShip, '2025-12-25')).toBe('Peak Season')
    expect(detectCruiseSeason(mockShip, '2026-01-05')).toBe('Peak Season')
  })

  it('should detect high season', () => {
    expect(detectCruiseSeason(mockShip, '2025-10-15')).toBe('High Season')
    expect(detectCruiseSeason(mockShip, '2025-11-20')).toBe('High Season')
  })

  it('unwraps a backwards legacy window through the new year', () => {
    expect(detectCruiseSeason(mockShip, '2026-02-14')).toBe('High Season')
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

describe('resolveCruiseRates — dated periods', () => {
  // What the operator can now enter: six periods, each with its own rates.
  const ship = {
    seasons: [
      { name: 'Summer', from: '2026-05-01', to: '2026-09-30',
        rates: { single_eur: 120, double_eur: 95, triple_eur: 85, suite_eur: 180,
                 single_non_eur: 115, double_non_eur: 90, triple_non_eur: 80, suite_non_eur: 175 } },
      { name: 'Autumn', from: '2026-10-01', to: '2026-12-19',
        rates: { single_eur: 160, double_eur: 130, triple_eur: 115, suite_eur: 240,
                 single_non_eur: 155, double_non_eur: 125, triple_non_eur: 110, suite_non_eur: 235 } },
      { name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
        rates: { single_eur: 220, double_eur: 185, triple_eur: 165, suite_eur: 320,
                 single_non_eur: 215, double_non_eur: 180, triple_non_eur: 160, suite_non_eur: 315 } },
      { name: 'January', from: '2027-01-06', to: '2027-02-28',
        rates: { single_eur: 140, double_eur: 110, triple_eur: 100, suite_eur: 210,
                 single_non_eur: 135, double_non_eur: 105, triple_non_eur: 95, suite_non_eur: 205 } },
    ],
    // Legacy columns still present on the row — the periods must win.
    rate_low_double_eur: 1,
    low_season_start: '2026-01-01',
    low_season_end: '2026-12-31',
  }

  it('prices a date at its own period, not the row base', () => {
    expect(resolveCruiseRates(ship, '2026-07-15', true))
      .toEqual({ season: 'Summer', rates: { single: 120, double: 95, triple: 85, suite: 180 } })
    expect(resolveCruiseRates(ship, '2026-12-25', true).rates.double).toBe(185)
    expect(resolveCruiseRates(ship, '2027-01-20', true).rates.double).toBe(110)
  })

  it('reads the non-EUR set for a non-EUR passport', () => {
    expect(resolveCruiseRates(ship, '2026-07-15', false))
      .toEqual({ season: 'Summer', rates: { single: 115, double: 90, triple: 80, suite: 175 } })
  })

  it('falls back to the legacy low columns for a date no period covers', () => {
    const out = resolveCruiseRates(ship, '2027-08-01', true)
    expect(out.season).toBe('low')
    expect(out.rates.double).toBe(1)
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
