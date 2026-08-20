// ============================================
// The demand premium, and the dates it applies to
// ============================================
// The cases that matter are the edges of a window, the overlap between two
// seasons, and what the premium is NOT charged on — each of which is a real
// amount on a real customer's invoice.

import { describe, it, expect } from 'vitest'
import {
  seasonForDate,
  computeUplift,
  passThroughSelling,
  PASS_THROUGH_SERVICE_TYPES,
  type SeasonWindow,
} from '@/lib/pricing/season-uplift'

const GOLDEN_WEEK: SeasonWindow = {
  seasonId: 'gw', name: 'ゴールデンウィーク', upliftPercent: 15,
  startDate: '2027-04-29', endDate: '2027-05-06',
}
const OBON: SeasonWindow = {
  seasonId: 'obon', name: 'お盆', upliftPercent: 12,
  startDate: '2026-08-08', endDate: '2026-08-17',
}
const NEW_YEAR: SeasonWindow = {
  seasonId: 'ny', name: '年末年始', upliftPercent: 20,
  startDate: '2026-12-27', endDate: '2027-01-04',
}
const WINTER: SeasonWindow = {
  seasonId: 'winter', name: '冬季', upliftPercent: 8,
  startDate: '2026-12-01', endDate: '2027-02-28',
}
const ALL = [GOLDEN_WEEK, OBON, NEW_YEAR, WINTER]

describe('seasonForDate', () => {
  it('includes both ends of a window', () => {
    expect(seasonForDate(ALL, '2027-04-29')?.name).toBe('ゴールデンウィーク')
    expect(seasonForDate(ALL, '2027-05-06')?.name).toBe('ゴールデンウィーク')
  })

  it('leaves the day either side alone', () => {
    expect(seasonForDate(ALL, '2027-04-28')?.name).toBeUndefined()
    expect(seasonForDate(ALL, '2027-05-07')?.name).toBeUndefined()
  })

  it('crosses a year end', () => {
    expect(seasonForDate(ALL, '2026-12-31')?.name).toBe('年末年始')
    expect(seasonForDate(ALL, '2027-01-02')?.name).toBe('年末年始')
  })

  it('gives the HIGHEST premium when windows overlap', () => {
    // New Year (20%) sits inside 冬季 (8%). Charging the lower one because it
    // was created first would be invisible to whoever reads the calendar.
    const m = seasonForDate(ALL, '2026-12-30')
    expect(m?.name).toBe('年末年始')
    expect(m?.upliftPercent).toBe(20)
    // ...and a winter date outside New Year still gets winter.
    expect(seasonForDate(ALL, '2027-02-01')?.name).toBe('冬季')
  })

  it('is the same date in every timezone', () => {
    // Parsed as local time west of Greenwich, this lands on the 28th and misses.
    expect(seasonForDate(ALL, '2027-04-29T00:00:00.000Z')?.name).toBe('ゴールデンウィーク')
  })

  it('returns nothing for an ordinary date, no dates, or no date', () => {
    expect(seasonForDate(ALL, '2026-06-15')).toBeNull()
    expect(seasonForDate([], '2027-04-30')).toBeNull()
    expect(seasonForDate(ALL, null)).toBeNull()
    expect(seasonForDate(ALL, 'not-a-date')).toBeNull()
  })

  it('reads a year 12 months out, which is how far the operator plans', () => {
    expect(seasonForDate(ALL, '2027-05-01')?.upliftPercent).toBe(15)
  })
})

describe('computeUplift', () => {
  const season = { seasonId: 'gw', name: 'ゴールデンウィーク', upliftPercent: 15 }

  it('charges the premium on the whole selling price when nothing is passed through', () => {
    const u = computeUplift({ sellingPrice: 1_000_000, season })
    expect(u.base).toBe(1_000_000)
    expect(u.amount).toBe(150_000)
  })

  it('never charges it on fixed pass-throughs', () => {
    // ¥60,000 of tips and entrance fees are somebody else's fixed price.
    const u = computeUplift({ sellingPrice: 1_000_000, passThroughTotal: 60_000, season })
    expect(u.base).toBe(940_000)
    expect(u.amount).toBe(141_000)
  })

  it('is zero on an ordinary date', () => {
    const u = computeUplift({ sellingPrice: 1_000_000, season: null })
    expect(u.amount).toBe(0)
    expect(u.percent).toBe(0)
    expect(u.seasonName).toBeNull()
  })

  it('is zero for a named season the operator has not priced yet', () => {
    const u = computeUplift({
      sellingPrice: 1_000_000,
      season: { seasonId: 'x', name: '観察中', upliftPercent: 0 },
    })
    expect(u.amount).toBe(0)
    expect(u.seasonName).toBe('観察中')
  })

  it('cannot go negative when pass-throughs exceed the price', () => {
    const u = computeUplift({ sellingPrice: 10_000, passThroughTotal: 25_000, season })
    expect(u.base).toBe(0)
    expect(u.amount).toBe(0)
  })

  it('names the pass-through services explicitly', () => {
    expect(PASS_THROUGH_SERVICE_TYPES.has('tips')).toBe(true)
    expect(PASS_THROUGH_SERVICE_TYPES.has('entrance')).toBe(true)
    expect(PASS_THROUGH_SERVICE_TYPES.has('accommodation')).toBe(false)
  })
})

describe('passThroughSelling', () => {
  // A priced service row states a PER-PERSON amount when it scales with the
  // group (one entrance ticket) and a whole-group amount when it does not (the
  // day's tips are one envelope). These are real rows from the engine.
  const SERVICES = [
    { serviceType: 'entrance', lineTotal: 25, isPerPax: true },
    { serviceType: 'tips', lineTotal: 40, isPerPax: false },
    { serviceType: 'accommodation', lineTotal: 300, isPerPax: true },
    { serviceType: 'guide', lineTotal: 120, isPerPax: false },
  ]

  it('counts one entrance ticket per person, not one for the group', () => {
    // The bug this exists to prevent: ten travellers passed on ten tickets and
    // the premium was charged on nine of them.
    expect(passThroughSelling({ services: SERVICES, personEquivalents: 10, marginPercent: 0 }))
      .toBe(40 + 25 * 10)
  })

  it('carries the margin, because the base it leaves is a selling price', () => {
    expect(passThroughSelling({ services: SERVICES, personEquivalents: 2, marginPercent: 25 }))
      .toBe((40 + 25 * 2) * 1.25)
  })

  it('ignores everything that is not passed through', () => {
    // Accommodation and the guide are priced services and carry the premium.
    expect(passThroughSelling({ services: SERVICES, personEquivalents: 1, marginPercent: 0 }))
      .toBe(65)
  })

  it('counts a half-price child as half a person', () => {
    // Their entrance fee is discounted with everything else, so only half of it
    // is inside the selling price to be excluded from the premium.
    expect(passThroughSelling({ services: SERVICES, personEquivalents: 2.5, marginPercent: 0 }))
      .toBe(40 + 25 * 2.5)
  })

  it('takes only the share of the group-fixed rows the price actually contains', () => {
    expect(passThroughSelling({
      services: SERVICES, personEquivalents: 2, groupShare: 0.75, marginPercent: 0,
    })).toBe(40 * 0.75 + 25 * 2)
  })

  it('is zero when nothing is passed through', () => {
    expect(passThroughSelling({
      services: [{ serviceType: 'guide', lineTotal: 120, isPerPax: false }],
      personEquivalents: 4,
      marginPercent: 25,
    })).toBe(0)
  })

  it('treats a missing line total as nothing rather than as NaN', () => {
    expect(passThroughSelling({
      services: [{ serviceType: 'entrance', lineTotal: null, isPerPax: true }],
      personEquivalents: 4,
      marginPercent: 0,
    })).toBe(0)
  })
})
