// AUT-W04: every date field in the app defaulted to yesterday.
//
// The idiom was `new Date().toISOString().split('T')[0]`. toISOString()
// converts to UTC first, so in Tokyo every moment before 09:00 local reports
// the previous day — most of the working morning, landing on expense,
// commission, payment and invoice dates.
import { describe, it, expect } from 'vitest'
import { todayLocal, toLocalDateString } from '@/lib/today'

describe('todayLocal', () => {
  it('is the LOCAL calendar day, not the UTC one', () => {
    // 29 Aug 2026, 08:00 in Tokyo (UTC+9) is still 28 Aug in UTC.
    const tokyoMorning = new Date('2026-08-28T23:00:00Z')
    const utcAnswer = tokyoMorning.toISOString().split('T')[0]
    const localAnswer = toLocalDateString(tokyoMorning)

    expect(utcAnswer).toBe('2026-08-28')
    // In any timezone at or east of UTC+2 this instant is already the 29th.
    if (tokyoMorning.getHours() < 23) {
      expect(localAnswer).toBe('2026-08-29')
      expect(localAnswer).not.toBe(utcAnswer)
    }
  })

  it('agrees with the local calendar fields, whatever the host zone is', () => {
    const d = new Date(2026, 7, 29, 0, 30) // 29 Aug 2026 00:30 local
    expect(toLocalDateString(d)).toBe('2026-08-29')
  })

  it('pads month and day to two digits', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('todayLocal() defaults to now and is a valid date string', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(todayLocal()).toBe(toLocalDateString(new Date()))
  })

  it('handles the last instant of a local day without rolling over', () => {
    expect(toLocalDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31')
  })
})
