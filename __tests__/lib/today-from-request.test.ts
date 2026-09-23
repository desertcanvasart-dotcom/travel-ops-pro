// Server routes used the UTC date as "today": the ops board showed yesterday's
// trips until 03:00 in Cairo, tasks were a day behind until 09:00 in Japan.
import { describe, it, expect, afterEach } from 'vitest'
import { todayFromRequest, shiftDateISO } from '@/lib/today'

afterEach(() => { delete process.env.BUSINESS_TIMEZONE })
const at = new Date('2026-09-22T23:30:00Z') // 08:30 on the 23rd in Tokyo, 01:30/02:30 in Cairo

describe('todayFromRequest', () => {
  it("uses the caller's own date when sent", () => {
    expect(todayFromRequest('http://x/api/tasks?today=2026-09-23', at)).toBe('2026-09-23')
  })
  it('falls back to the business timezone, then UTC', () => {
    expect(todayFromRequest('http://x/api/tasks', at)).toBe('2026-09-22')
    process.env.BUSINESS_TIMEZONE = 'Asia/Tokyo'
    expect(todayFromRequest('http://x/api/tasks', at)).toBe('2026-09-23')
  })
  it('ignores a malformed or far-off date', () => {
    expect(todayFromRequest('http://x?today=2026-9-23', at)).toBe('2026-09-22')
    expect(todayFromRequest('http://x?today=2027-01-01', at)).toBe('2026-09-22')
  })
})

describe('shiftDateISO', () => {
  it('moves by calendar days across month and year ends', () => {
    expect(shiftDateISO('2026-09-23', 7)).toBe('2026-09-30')
    expect(shiftDateISO('2026-12-30', 3)).toBe('2027-01-02')
  })
})
