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

  it('charges the premium on the whole selling price', () => {
    const u = computeUplift({ sellingPrice: 1_000_000, season })
    expect(u.base).toBe(1_000_000)
    expect(u.amount).toBe(150_000)
  })

  it('charges tips and entrance fees like everything else', () => {
    // They were exempt once. The engine applies the operator's MARGIN to both,
    // so exempting them from the premium alone was half a rule — and a premium
    // on the final total is what an operator can check on paper.
    const u = computeUplift({ sellingPrice: 408.75, season })
    expect(u.base).toBe(408.75)
    expect(Math.round(u.amount * 100) / 100).toBe(61.31)
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

  it('cannot go negative on a price that somehow arrives below zero', () => {
    const u = computeUplift({ sellingPrice: -10_000, season })
    expect(u.base).toBe(0)
    expect(u.amount).toBe(0)
  })

  it('is the same money whichever side of margin it is applied', () => {
    // cost × (1+m) × (1+p) === cost × (1+p) × (1+m). The ordering is a
    // REPORTING choice — after margin keeps marginAmount meaning margin.
    const cost = 327
    const afterMargin = computeUplift({ sellingPrice: cost * 1.25, season }).amount + cost * 1.25
    const beforeMargin = (computeUplift({ sellingPrice: cost, season }).amount + cost) * 1.25
    expect(Math.round(afterMargin * 100)).toBe(Math.round(beforeMargin * 100))
  })
})
