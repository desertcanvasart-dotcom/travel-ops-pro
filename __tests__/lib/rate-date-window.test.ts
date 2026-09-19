// The pricing grid shows one number per rate option and says nothing about
// when that number applies. Two seasons of one fare therefore render as two
// identical lines — "EgyptAir Cairo→Luxor (economy)" twice — and picking the
// wrong one is silent. The grid also prices hotels and cruises off the base
// columns, which mirror the FIRST dated period, so a December quote can be
// showing the June rate with nothing on screen to say so.
//
// This does NOT choose a rate. The grid still shows everything and still
// prices what the operator picked. It only stops the date being invisible.
import { describe, it, expect } from 'vitest'
import {
  dateOnly,
  withinWindow,
  windowLabel,
  periodCovering,
  periodLabel,
  dayDate,
  rateOnDate,
} from '@/lib/rates/date-window'

describe('dateOnly', () => {
  it('takes a date, a timestamp, or nothing', () => {
    expect(dateOnly('2026-07-15')).toBe('2026-07-15')
    expect(dateOnly('2026-07-15T09:30:00Z')).toBe('2026-07-15')
    expect(dateOnly(null)).toBeNull()
    expect(dateOnly('')).toBeNull()
    expect(dateOnly('soon')).toBeNull()
    expect(dateOnly('2026-13-45')).toBeNull()
  })
})

describe('withinWindow', () => {
  it('includes both ends', () => {
    expect(withinWindow('2026-06-01', '2026-06-01', '2026-09-30')).toBe(true)
    expect(withinWindow('2026-09-30', '2026-06-01', '2026-09-30')).toBe(true)
    expect(withinWindow('2026-05-31', '2026-06-01', '2026-09-30')).toBe(false)
    expect(withinWindow('2026-10-01', '2026-06-01', '2026-09-30')).toBe(false)
  })

  it('an absent edge never excludes', () => {
    // Most of the catalogue carries no dates at all. A rate that has always
    // been used must not start warning because nobody typed a window.
    expect(withinWindow('2026-07-15', null, null)).toBe(true)
    expect(withinWindow('2026-01-01', null, '2026-09-30')).toBe(true)
    expect(withinWindow('2030-01-01', '2026-06-01', null)).toBe(true)
  })

  it('says nothing without a trip date', () => {
    expect(withinWindow(null, '2026-06-01', '2026-09-30')).toBe(true)
  })
})

describe('windowLabel', () => {
  it('reads the way the operator entered it', () => {
    expect(windowLabel('2026-06-01', '2026-09-30')).toBe('2026-06-01 – 2026-09-30')
    expect(windowLabel('2026-06-01', null)).toBe('from 2026-06-01')
    expect(windowLabel(null, '2026-09-30')).toBe('until 2026-09-30')
    expect(windowLabel(null, null)).toBeNull()
  })

  it('treats the form’s far-future default as no end at all', () => {
    // rate_valid_to defaults to 2099-12-31. "until 2099-12-31" is noise on a
    // dropdown line, and it is not what the operator meant to say.
    expect(windowLabel('2026-06-01', '2099-12-31')).toBe('from 2026-06-01')
    expect(windowLabel(null, '2099-12-31')).toBeNull()
  })
})

describe('periodCovering', () => {
  const p = (name: string, from: string, to: string, rateEur = 100) =>
    ({ name, from, to, rateEur, rateNonEur: rateEur + 10 })
  const winter = p('High 2026/27', '2026-10-01', '2027-04-30', 200)
  const christmas = p('Christmas', '2026-12-20', '2027-01-05', 300)
  const summer = p('Low', '2026-05-01', '2026-09-30', 100)

  it('finds the period a date falls in', () => {
    expect(periodCovering([summer, winter], '2026-07-15')?.name).toBe('Low')
    expect(periodCovering([summer, winter], '2026-11-02')?.name).toBe('High 2026/27')
  })

  it('the SHORTEST window wins, as the rate engine resolves it', () => {
    // The specific Christmas line overrides the general winter one, the same
    // precedence lib/rates/rate-seasons applies.
    expect(periodCovering([winter, christmas], '2026-12-25')?.name).toBe('Christmas')
  })

  it('answers null when nothing covers the date', () => {
    expect(periodCovering([summer], '2026-11-02')).toBeNull()
    expect(periodCovering([], '2026-11-02')).toBeNull()
    expect(periodCovering(undefined, '2026-11-02')).toBeNull()
    expect(periodCovering([summer], null)).toBeNull()
  })
})

describe('periodLabel', () => {
  it('names the period and its dates', () => {
    expect(periodLabel({ name: 'Low', from: '2026-05-01', to: '2026-09-30', rateEur: 0, rateNonEur: 0 }))
      .toBe('Low 2026-05-01 – 2026-09-30')
  })

  it('falls back to whichever half it has', () => {
    expect(periodLabel({ name: 'Low', from: '', to: '', rateEur: 0, rateNonEur: 0 })).toBe('Low')
    expect(periodLabel({ name: '', from: '2026-05-01', to: '2026-09-30', rateEur: 0, rateNonEur: 0 })).toBe('2026-05-01 – 2026-09-30')
  })
})

describe('dayDate', () => {
  it('day 1 is the start date', () => {
    expect(dayDate('2026-07-14', 1)).toBe('2026-07-14')
  })

  it('a later day is that many days on', () => {
    // A twelve-day trip can cross a season boundary, which is the whole reason
    // the grid cannot price every day at the trip's start.
    expect(dayDate('2026-09-28', 4)).toBe('2026-10-01')
  })

  it('is null without a start date', () => {
    expect(dayDate(null, 3)).toBeNull()
    expect(dayDate('not a date', 3)).toBeNull()
  })
})

describe('rateOnDate', () => {
  const periods = [
    { name: 'Low', from: '2026-05-01', to: '2026-09-30', rateEur: 100, rateNonEur: 110 },
    { name: 'High', from: '2026-10-01', to: '2027-03-31', rateEur: 200, rateNonEur: 220 },
  ]
  const item = { rateEur: 100, rateNonEur: 110, periods }

  it('prices the day at the period covering it', () => {
    expect(rateOnDate(item, 'eu', '2026-07-14')).toBe(100)
    expect(rateOnDate(item, 'eu', '2026-11-02')).toBe(200)
    expect(rateOnDate(item, 'non_eu', '2026-11-02')).toBe(220)
  })

  it('answers null when no period covers the date', () => {
    // There is no default period. A trip after the contract ends must not
    // quietly take the first one — which is exactly what the base columns,
    // mirroring period one, used to do.
    expect(rateOnDate(item, 'eu', '2027-06-01')).toBeNull()
  })

  it('leaves an undated rate on its own number', () => {
    expect(rateOnDate({ rateEur: 42, rateNonEur: 43 }, 'eu', '2026-07-14')).toBe(42)
    expect(rateOnDate({ rateEur: 42, rateNonEur: 43, periods: [] }, 'eu', '2026-07-14')).toBe(42)
  })

  it('uses the first period when the quote has no departure yet', () => {
    // That is the number already on screen — the base columns mirror it.
    expect(rateOnDate(item, 'eu', null)).toBe(100)
  })
})
