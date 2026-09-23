// The departures grid generates a season of dates from a rule (weekly pattern
// or fixed interval) instead of adding them one at a time. These pin the rules.
import { describe, it, expect } from 'vitest'
import {
  datesByWeekday,
  datesByInterval,
  normaliseDates,
  addMonthsISO,
  MAX_GENERATED_DATES,
} from '@/lib/departures/generate-dates'

describe('datesByWeekday', () => {
  it('returns every chosen weekday in the range (2027-01-04 is a Monday)', () => {
    // Mondays (1) and Saturdays (6) in the first two weeks of Jan 2027.
    const out = datesByWeekday('2027-01-04', '2027-01-17', [1, 6])
    expect(out).toEqual(['2027-01-04', '2027-01-09', '2027-01-11', '2027-01-16'])
  })

  it('is empty with no weekdays or a reversed range', () => {
    expect(datesByWeekday('2027-01-04', '2027-01-17', [])).toEqual([])
    expect(datesByWeekday('2027-01-17', '2027-01-04', [1])).toEqual([])
  })

  it('includes both endpoints when they match', () => {
    // 2027-01-04 (Mon) .. 2027-01-11 (Mon), Mondays only → both ends.
    expect(datesByWeekday('2027-01-04', '2027-01-11', [1])).toEqual(['2027-01-04', '2027-01-11'])
  })
})

describe('datesByInterval', () => {
  it('steps every N days inclusive of a matching end', () => {
    expect(datesByInterval('2027-01-04', '2027-01-25', 7)).toEqual([
      '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25',
    ])
  })

  it('a step of the tour length gives back-to-back departures', () => {
    expect(datesByInterval('2027-03-01', '2027-03-25', 8)).toEqual([
      '2027-03-01', '2027-03-09', '2027-03-17', '2027-03-25',
    ])
  })

  it('rejects a step below 1 or a reversed range', () => {
    expect(datesByInterval('2027-01-04', '2027-01-25', 0)).toEqual([])
    expect(datesByInterval('2027-01-25', '2027-01-04', 7)).toEqual([])
  })

  it('caps runaway ranges', () => {
    const out = datesByInterval('2000-01-01', '2100-01-01', 1)
    expect(out.length).toBe(MAX_GENERATED_DATES)
  })
})

describe('normaliseDates', () => {
  it('de-duplicates, sorts, and trims timestamps to yyyy-MM-dd', () => {
    expect(normaliseDates(['2027-01-11T22:00:00.000Z', '2027-01-04', '2027-01-11'])).toEqual([
      '2027-01-04', '2027-01-11',
    ])
  })

  it('drops blanks and invalid entries', () => {
    expect(normaliseDates(['', 'not-a-date', '2027-02-01'])).toEqual(['2027-02-01'])
  })
})

describe('addMonthsISO (default range end)', () => {
  it('adds months without a day shift in Japan', () => {
    // The old modal parsed local midnight and printed toISOString() (UTC), so
    // in Asia/Tokyo the default end date came out one day early.
    const saved = process.env.TZ
    process.env.TZ = 'Asia/Tokyo'
    try {
      expect(addMonthsISO('2026-09-23', 3)).toBe('2026-12-23')
      expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15')
    } finally {
      process.env.TZ = saved
    }
  })

  it('is the same in UTC and rolls day overflow forward like Date', () => {
    expect(addMonthsISO('2026-09-23', 3)).toBe('2026-12-23')
    expect(addMonthsISO('2027-01-31', 1)).toBe('2027-03-03')
  })
})
