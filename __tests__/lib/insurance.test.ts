// ============================================
// The 掛金表 is a step function, and the steps matter
// ============================================
// Every figure here is from 4.2025年版海外保険.pdf. The cases that earn their
// keep are the ones between the printed rows: the table has no row for 5 days,
// 9 days or 30 days, and getting those wrong undercharges or overcharges a real
// customer on a real invoice.

import { describe, it, expect } from 'vitest'
import {
  findBand,
  quotePremium,
  quoteAllPlans,
  tripDays,
  ageOn,
  formatJpy,
  type PremiumBand,
} from '@/lib/insurance'

const GRID: Array<[string, number, number, number, number, number]> = [
  ['3日まで', 3, 5100, 4400, 3700, 2800],
  ['4日まで', 4, 5900, 5000, 4200, 3400],
  ['6日まで', 6, 8100, 6900, 5800, 4700],
  ['8日まで', 8, 9800, 8100, 6900, 5700],
  ['11日まで', 11, 12200, 9400, 8000, 6700],
  ['15日まで', 15, 14100, 11400, 9900, 8200],
  ['18日まで', 18, 15800, 12900, 10900, 9200],
  ['22日まで', 22, 18700, 15600, 13400, 11400],
  ['25日まで', 25, 22100, 18700, 16100, 13400],
  ['28日まで', 28, 23400, 20400, 17700, 15100],
  ['31日まで', 31, 25800, 22500, 19700, 16600],
  ['46日まで', 46, 35500, 31000, 27400, 23100],
  ['2ヵ月まで', 62, 49700, 43700, 38900, 33300],
  ['3ヵ月まで', 92, 70100, 62200, 55600, 48100],
]

const BANDS: PremiumBand[] = GRID.flatMap(([bandLabel, maxDays, ...prices]) =>
  ['HC', 'HD', 'HE', 'HF'].map((planCode, i) => ({
    planCode,
    maxDays,
    bandLabel,
    premiumJpy: prices[i],
    maxAge: maxDays >= 28 ? 69 : null,
  }))
)

describe('findBand — a trip takes the cheapest band that still covers it', () => {
  it('lands exactly on a printed row', () => {
    expect(findBand(BANDS, 3)?.bandLabel).toBe('3日まで')
    expect(findBand(BANDS, 11)?.bandLabel).toBe('11日まで')
  })

  it('rounds UP to the next band when there is no exact row', () => {
    // The table jumps 4 → 6; five days has no row of its own.
    expect(findBand(BANDS, 5)?.bandLabel).toBe('6日まで')
    expect(findBand(BANDS, 9)?.bandLabel).toBe('11日まで')
    expect(findBand(BANDS, 30)?.bandLabel).toBe('31日まで')
  })

  it('refuses a nonsense length rather than guessing', () => {
    expect(findBand(BANDS, 0)).toBeNull()
    expect(findBand(BANDS, -2)).toBeNull()
    expect(findBand(BANDS, NaN)).toBeNull()
  })
})

describe('quotePremium', () => {
  it('prices the 9-day demo trip on every plan', () => {
    const at = (planCode: string) => {
      const r = quotePremium({ bands: BANDS, planCode, days: 9, age: 40 })
      if (!r.ok) throw new Error(`unexpectedly ineligible: ${r.reason}`)
      return r.quote.premiumJpy
    }
    expect(at('HC')).toBe(12200)
    expect(at('HD')).toBe(9400)
    expect(at('HE')).toBe(8000)
    expect(at('HF')).toBe(6700)
  })

  it('refuses a trip longer than the table goes', () => {
    const r = quotePremium({ bands: BANDS, planCode: 'HC', days: 100, age: 40 })
    expect(r).toEqual({ ok: false, reason: 'trip_too_long' })
  })

  it('applies 満69歳 to every band from 「28日まで」 down', () => {
    // The ceiling belongs to the BAND, not to the trip length. 25 days is the
    // last unrestricted trip: at 26 days the band becomes 「28日まで」, which
    // carries the restriction, so an over-69 traveller is refused three days
    // earlier than the label 「28日まで」 suggests.
    expect(quotePremium({ bands: BANDS, planCode: 'HC', days: 25, age: 75 }).ok).toBe(true)
    expect(quotePremium({ bands: BANDS, planCode: 'HC', days: 26, age: 75 })).toEqual({
      ok: false,
      reason: 'age_above_band_limit',
    })
    expect(quotePremium({ bands: BANDS, planCode: 'HC', days: 28, age: 75 })).toEqual({
      ok: false,
      reason: 'age_above_band_limit',
    })
    // 満69歳まで — 69 is inside the limit, not outside it.
    expect(quotePremium({ bands: BANDS, planCode: 'HC', days: 28, age: 69 }).ok).toBe(true)
  })

  it('will not quote an age-restricted band with no age to check', () => {
    expect(quotePremium({ bands: BANDS, planCode: 'HC', days: 30, age: null })).toEqual({
      ok: false,
      reason: 'age_above_band_limit',
    })
    // ...but an unrestricted band needs no birth date at all.
    expect(quotePremium({ bands: BANDS, planCode: 'HC', days: 8, age: null }).ok).toBe(true)
  })
})

describe('quoteAllPlans', () => {
  it('returns every plan, keeping the ineligible ones visible', () => {
    const all = quoteAllPlans({ bands: BANDS, days: 30, age: 75 })
    expect(all.map(p => p.planCode)).toEqual(['HC', 'HD', 'HE', 'HF'])
    expect(all.every(p => !p.available)).toBe(true)
  })
})

describe('tripDays — inclusive of both ends, as the insurer counts', () => {
  it('counts the demo trip as 9 days', () => {
    expect(tripDays('2026-11-03', '2026-11-11')).toBe(9)
  })

  it('counts a same-day return as one day', () => {
    expect(tripDays('2026-11-03', '2026-11-03')).toBe(1)
  })

  it('is UTC, so it does not shift by timezone', () => {
    // Parsed as local time west of Greenwich this would come back 8.
    expect(tripDays('2026-03-28', '2026-04-05')).toBe(9)
  })

  it('rejects a return before departure', () => {
    expect(tripDays('2026-11-11', '2026-11-03')).toBeNull()
    expect(tripDays(null, '2026-11-11')).toBeNull()
  })
})

describe('ageOn', () => {
  it('has not counted a birthday that has not happened yet', () => {
    expect(ageOn('1957-11-04', '2026-11-03')).toBe(68)
    expect(ageOn('1957-11-03', '2026-11-03')).toBe(69)
  })

  it('is the difference that decides an age-restricted band', () => {
    const age = ageOn('1956-01-01', '2026-11-03')
    expect(age).toBe(70)
    expect(quotePremium({ bands: BANDS, planCode: 'HF', days: 30, age })).toEqual({
      ok: false,
      reason: 'age_above_band_limit',
    })
  })
})

describe('formatJpy', () => {
  it('has no minor unit', () => {
    expect(formatJpy(12200)).toBe('¥12,200')
    expect(formatJpy(6700)).toBe('¥6,700')
  })
})
