import { describe, it, expect } from 'vitest'
import { zonedTimeToUtc, nextAt, zonedToday, formatInZone } from '@/lib/time/zoned'

describe('zonedTimeToUtc', () => {
  it('9:00 in Tokyo is 00:00 UTC (no summer time)', () => {
    expect(zonedTimeToUtc('2026-10-16T09:00', 'Asia/Tokyo')?.toISOString()).toBe('2026-10-16T00:00:00.000Z')
  })
  it('9:00 in Cairo, winter (UTC+2) and summer (UTC+3)', () => {
    expect(zonedTimeToUtc('2026-12-01T09:00', 'Africa/Cairo')?.toISOString()).toBe('2026-12-01T07:00:00.000Z')
    expect(zonedTimeToUtc('2026-07-01T09:00', 'Africa/Cairo')?.toISOString()).toBe('2026-07-01T06:00:00.000Z')
  })
  it('refuses what is not a date-time', () => {
    expect(zonedTimeToUtc('tomorrow', 'Asia/Tokyo')).toBeNull()
  })
})

describe('nextAt', () => {
  // 2026-10-15 23:30 UTC is already Friday the 16th in Tokyo.
  const now = new Date('2026-10-15T23:30:00Z')
  it("tomorrow is the zone's tomorrow, not the computer's", () => {
    expect(zonedToday('Asia/Tokyo', now)).toBe('2026-10-16')
    expect(nextAt('Asia/Tokyo', '09:00', undefined, now)?.toISOString()).toBe('2026-10-17T00:00:00.000Z')
  })
  it('next Monday 9:00 Japan time', () => {
    expect(nextAt('Asia/Tokyo', '09:00', 1, now)?.toISOString()).toBe('2026-10-19T00:00:00.000Z')
  })
  it('shows the instant back in the zone', () => {
    expect(formatInZone(new Date('2026-10-17T00:00:00Z'), 'Asia/Tokyo')).toMatch(/Sat.*17 Oct.*09:00/)
  })
})
