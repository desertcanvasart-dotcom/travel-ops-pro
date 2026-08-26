import { describe, it, expect } from 'vitest'
import {
  parseSupportHours,
  isOfficeOpen,
  describeHoursJa,
  acknowledgementJa,
} from '@/lib/portal/support-hours'

// The office is in Egypt, the travellers are in Japan, six or seven hours
// ahead. A message sent in the Japanese evening lands in Cairo overnight —
// fine, as long as the traveller is told, because otherwise a chat box just
// looks ignored. These pin what they are told.

const CAIRO = { timezone: 'Africa/Cairo', days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00' }

// 2026-08-26 is a Wednesday. Cairo is UTC+3 in August, Tokyo UTC+9.
const at = (utc: string) => new Date(utc)

describe('parseSupportHours', () => {
  it('reads a configured week', () => {
    expect(parseSupportHours(CAIRO)).toEqual(CAIRO)
  })

  it('refuses anything unusable rather than inventing a default', () => {
    // An office that has not stated its hours must not have hours guessed for
    // it — the whole point is not promising wrongly.
    expect(parseSupportHours(null)).toBeNull()
    expect(parseSupportHours({})).toBeNull()
    expect(parseSupportHours({ ...CAIRO, days: [] })).toBeNull()
    expect(parseSupportHours({ ...CAIRO, from: '9am' })).toBeNull()
    expect(parseSupportHours({ ...CAIRO, to: '25:00' })).toBeNull()
    expect(parseSupportHours({ ...CAIRO, timezone: '' })).toBeNull()
  })

  it('drops day numbers outside 1-7', () => {
    expect(parseSupportHours({ ...CAIRO, days: [0, 1, 8, 5] })?.days).toEqual([1, 5])
  })
})

describe('isOfficeOpen — judged in Cairo, not on the server', () => {
  it('is open on a Wednesday midday in Cairo', () => {
    // 10:00 UTC = 13:00 Cairo, Wednesday.
    expect(isOfficeOpen(CAIRO, at('2026-08-26T10:00:00Z'))).toBe(true)
  })

  it('is closed in the Japanese evening, which is the case that matters', () => {
    // 21:00 Tokyo Wednesday = 12:00 UTC... no: 21:00 JST = 12:00 UTC, which is
    // 15:00 Cairo and still open. The traveller writing at 23:30 Tokyo is the
    // real case: 14:30 UTC = 17:30 Cairo, just closed.
    expect(isOfficeOpen(CAIRO, at('2026-08-26T14:30:00Z'))).toBe(false)
  })

  it('is closed before opening and after closing', () => {
    expect(isOfficeOpen(CAIRO, at('2026-08-26T05:00:00Z'))).toBe(false)  // 08:00 Cairo
    expect(isOfficeOpen(CAIRO, at('2026-08-26T06:00:00Z'))).toBe(true)   // 09:00 Cairo
    expect(isOfficeOpen(CAIRO, at('2026-08-26T13:59:00Z'))).toBe(true)   // 16:59 Cairo
    expect(isOfficeOpen(CAIRO, at('2026-08-26T14:00:00Z'))).toBe(false)  // 17:00 Cairo — to is exclusive
  })

  it('is closed at the weekend', () => {
    expect(isOfficeOpen(CAIRO, at('2026-08-29T10:00:00Z'))).toBe(false)  // Saturday
    expect(isOfficeOpen(CAIRO, at('2026-08-30T10:00:00Z'))).toBe(false)  // Sunday
  })

  it('is never open when no hours are configured', () => {
    expect(isOfficeOpen(null, at('2026-08-26T10:00:00Z'))).toBe(false)
  })
})

describe('describeHoursJa', () => {
  it('collapses a contiguous run', () => {
    expect(describeHoursJa(CAIRO)).toBe('月〜金 09:00〜17:00')
  })

  it('lists days that are not contiguous', () => {
    expect(describeHoursJa({ ...CAIRO, days: [1, 3, 5] })).toBe('月・水・金 09:00〜17:00')
  })

  it('handles a single day', () => {
    expect(describeHoursJa({ ...CAIRO, days: [7] })).toBe('日 09:00〜17:00')
  })

  it('says nothing when nothing is configured', () => {
    expect(describeHoursJa(null)).toBeNull()
  })
})

describe('acknowledgementJa', () => {
  it('confirms receipt and says a reply is coming, during hours', () => {
    const msg = acknowledgementJa(CAIRO, at('2026-08-26T10:00:00Z'))
    expect(msg).toContain('受け付けました')
    expect(msg).toContain('営業時間内')
    expect(msg).toContain('月〜金 09:00〜17:00')
  })

  it('says plainly that it is out of hours, rather than going quiet', () => {
    const msg = acknowledgementJa(CAIRO, at('2026-08-26T20:00:00Z'))
    expect(msg).toContain('営業時間外')
    expect(msg).toContain('次の営業時間内')
  })

  it('still confirms receipt when no hours are set, but promises no time', () => {
    // The button worked — that is the part worth saying. Putting a time in the
    // office's mouth when it has not stated one is how promises get broken.
    const msg = acknowledgementJa(null, at('2026-08-26T20:00:00Z'))
    expect(msg).toContain('受け付けました')
    expect(msg).not.toContain('営業時間')
    expect(msg).not.toContain('〜')
  })
})
