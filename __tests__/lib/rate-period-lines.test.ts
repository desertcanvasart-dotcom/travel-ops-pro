import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { periodFigures, blankGroups, pricedDoubles, displayPeriods } from '@/components/rates/RatePeriodLines'
import { sanitizeSeasons } from '@/lib/rates/rate-seasons'

// The hotels and cruises lists show every period, one line each. The cruises
// list once had "PP Double" and "Single supp." in each other's cells: it
// showed $70 as the double and $110 as the supplement for a ship entered as
// $110 per person + $70 single (operator, 2026-09-16). These pin each figure
// to the value the form stores.

// Al Farida as stored in production on 2026-09-16 (cabin rates per person).
const alFarida = {
  rate_currency: 'USD',
  seasons: sanitizeSeasons([
    { name: 'Summer 2026', from: '2026-05-01', to: '2026-10-31', rates: { double_eur: 110, single_eur: 180, triple_eur: 100, double_non_eur: 150, single_non_eur: 220, triple_non_eur: 130 } },
    { name: 'Winter 26/27', from: '2026-11-01', to: '2027-04-30', rates: { double_eur: 0, single_eur: 0, triple_eur: 0, double_non_eur: 200, single_non_eur: 360, triple_non_eur: 190 } },
  ], 'cruise'),
}

describe('periodFigures', () => {
  it('cruise: the double is the double, the supplement and reduction are the gaps — never swapped', () => {
    const [summer] = alFarida.seasons!
    expect(periodFigures('cruise', summer, 'eur')).toEqual({ double: 110, singleSupp: 70, tripleRed: 10 })
    expect(periodFigures('cruise', summer, 'non_eur')).toEqual({ double: 150, singleSupp: 70, tripleRed: 20 })
  })

  it('cruise with no triple cabin shows no reduction rather than the whole double', () => {
    const s = sanitizeSeasons([{ name: 'x', from: '2026-01-01', to: '2026-01-31', rates: { double_eur: 90, single_eur: 120 } }], 'cruise')![0]
    expect(periodFigures('cruise', s, 'eur').tripleRed).toBeNull()
  })

  it('hotel: reads the three stored figures directly', () => {
    const s = sanitizeSeasons([{ name: 'all year round', from: '2026-09-16', to: '2027-12-16', rates: { pp_double_eur: 130, single_supp_eur: 110, triple_red_eur: 10, pp_double_non_eur: 120, single_supp_non_eur: 100, triple_red_non_eur: 10 } }], 'accommodation')![0]
    expect(periodFigures('accommodation', s, 'eur')).toEqual({ double: 130, singleSupp: 110, tripleRed: 10 })
    expect(periodFigures('accommodation', s, 'non_eur')).toEqual({ double: 120, singleSupp: 100, tripleRed: 10 })
  })
})

describe('blank rates and the average', () => {
  it('flags the passport group whose double is blank — Winter EU on Al Farida', () => {
    const [summer, winter] = alFarida.seasons!
    expect(blankGroups('cruise', summer)).toEqual([])
    expect(blankGroups('cruise', winter)).toEqual(['eur'])
  })

  it('averages every priced double across periods and passport groups, skipping blanks', () => {
    expect(pricedDoubles([alFarida], 'cruise').map(d => d.amount)).toEqual([110, 150, 200])
  })
})

describe('the lists use it', () => {
  it('neither list computes its own price cells any more', () => {
    for (const file of ['app/rates/cruises/page.tsx', 'app/rates/hotels/hotels-content.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain('<RatePeriodLines')
      expect(src).not.toMatch(/rate_single_eur \|\| 0\) - \(cruise\.rate_double_eur/)
      expect(src).not.toContain('hotelPpDoubleRange')
    }
  })

  it('every route that saves periods checks the six-period limit first', () => {
    for (const file of [
      'app/api/rates/hotels/route.ts', 'app/api/rates/hotels/[id]/route.ts',
      'app/api/rates/cruises/route.ts', 'app/api/rates/cruises/[id]/route.ts',
    ]) {
      const src = readFileSync(file, 'utf8')
      const check = src.indexOf('tooManyPeriodsMessage(datedPeriodCount(body.seasons))')
      expect(check, file).toBeGreaterThan(-1)
      expect(check, file).toBeLessThan(src.indexOf('sanitizeSeasons(body.seasons'))
    }
  })
})

describe('a rate with no dated periods still shows what it prices at', () => {
  it('hotel base columns become one undated line and count toward the average', () => {
    const legacy = { rate_currency: 'USD', pp_double_eur: 90, single_supp_eur: 40, triple_red_eur: 5, pp_double_non_eur: 95 }
    const { periods, undated } = displayPeriods(legacy, 'accommodation')
    expect(undated).toBe(true)
    expect(periodFigures('accommodation', periods[0], 'eur')).toEqual({ double: 90, singleSupp: 40, tripleRed: 5 })
    expect(pricedDoubles([legacy], 'accommodation').map(d => d.amount)).toEqual([90, 95])
  })

  it('cruise base columns read the way the engine reads them', () => {
    const legacy = { rate_double_eur: 100, rate_single_eur: 160, rate_triple_eur: 90, rate_low_double_non_eur: 120, rate_low_single_non_eur: 170 }
    const { periods } = displayPeriods(legacy, 'cruise')
    expect(periodFigures('cruise', periods[0], 'eur')).toEqual({ double: 100, singleSupp: 60, tripleRed: 10 })
    expect(periodFigures('cruise', periods[0], 'non_eur')).toEqual({ double: 120, singleSupp: 50, tripleRed: null })
  })

  it('nothing priced anywhere is still "no periods"', () => {
    expect(displayPeriods({ pp_double_eur: 0 }, 'accommodation')).toEqual({ periods: [], undated: false })
  })
})
