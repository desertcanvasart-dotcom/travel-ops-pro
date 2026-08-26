import { describe, it, expect } from 'vitest'
import {
  parseSupportOffices,
  isOfficeOpen,
  isAnyOfficeOpen,
  nextOpening,
  describeOfficesJa,
  formatInTravellerTimeJa,
  acknowledgementJa,
  type SupportOffice,
} from '@/lib/portal/support-hours'

// The operator runs two offices on different working weeks:
//   Tokyo/Osaka  Mon-Fri 09:00-17:00  Asia/Tokyo
//   Cairo        Sun-Thu 09:00-17:00  Africa/Cairo
// Together they cover most of a Japanese waking day, but Friday is Japan only,
// Sunday is Cairo only and Saturday is nobody. Those seams are where a
// traveller gets told the wrong thing, so they are what these test.

const JAPAN: SupportOffice = {
  label: 'Tokyo / Osaka', labelJa: '東京・大阪',
  timezone: 'Asia/Tokyo', days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00',
}
const CAIRO: SupportOffice = {
  label: 'Cairo', labelJa: 'カイロ',
  timezone: 'Africa/Cairo', days: [7, 1, 2, 3, 4], from: '09:00', to: '17:00',
}
const BOTH = [JAPAN, CAIRO]

// August 2026: Tokyo is UTC+9 all year, Cairo UTC+3 in summer.
// 2026-08-24 is a Monday.
const at = (utc: string) => new Date(utc)

describe('parseSupportOffices', () => {
  it('reads a list of offices', () => {
    expect(parseSupportOffices([JAPAN, CAIRO])).toHaveLength(2)
  })

  it('accepts a single office written as a bare object', () => {
    // A configuration saved before there were two must not silently stop working.
    expect(parseSupportOffices(JAPAN)).toHaveLength(1)
  })

  it('drops an office that is not usable rather than guessing', () => {
    expect(parseSupportOffices([JAPAN, { ...CAIRO, from: '9am' }])).toHaveLength(1)
    expect(parseSupportOffices([{ ...JAPAN, days: [] }])).toEqual([])
    expect(parseSupportOffices([{ ...JAPAN, timezone: '' }])).toEqual([])
    // Closing before opening is not a working day.
    expect(parseSupportOffices([{ ...JAPAN, from: '17:00', to: '09:00' }])).toEqual([])
  })

  it('returns nothing for nothing', () => {
    expect(parseSupportOffices(null)).toEqual([])
    expect(parseSupportOffices([])).toEqual([])
  })
})

describe('each office keeps its own clock and working week', () => {
  it('Tokyo is open on a Monday morning in Japan', () => {
    // 01:00 UTC = 10:00 Tokyo Monday.
    expect(isOfficeOpen(JAPAN, at('2026-08-24T01:00:00Z'))).toBe(true)
    // Cairo is 04:00 — long before it opens.
    expect(isOfficeOpen(CAIRO, at('2026-08-24T01:00:00Z'))).toBe(false)
  })

  it('Cairo is open when Japan has gone home', () => {
    // 12:00 UTC = 21:00 Tokyo (closed), 15:00 Cairo (open).
    expect(isOfficeOpen(JAPAN, at('2026-08-24T12:00:00Z'))).toBe(false)
    expect(isOfficeOpen(CAIRO, at('2026-08-24T12:00:00Z'))).toBe(true)
    expect(isAnyOfficeOpen(BOTH, at('2026-08-24T12:00:00Z'))).toBe(true)
  })

  it('covers the Japanese evening, which a Cairo-only office would not', () => {
    // 22:00 Tokyo Monday = 13:00 UTC = 16:00 Cairo. Somebody is still there.
    expect(isAnyOfficeOpen(BOTH, at('2026-08-24T13:00:00Z'))).toBe(true)
    expect(isAnyOfficeOpen([JAPAN], at('2026-08-24T13:00:00Z'))).toBe(false)
  })

  it('Friday is Japan only — Cairo does not work it', () => {
    // 2026-08-28 is a Friday. 01:00 UTC = 10:00 Tokyo.
    expect(isOfficeOpen(JAPAN, at('2026-08-28T01:00:00Z'))).toBe(true)
    expect(isOfficeOpen(CAIRO, at('2026-08-28T11:00:00Z'))).toBe(false)
  })

  it('Sunday is Cairo only — Japan does not work it', () => {
    // 2026-08-30 is a Sunday. 11:00 UTC = 14:00 Cairo.
    expect(isOfficeOpen(CAIRO, at('2026-08-30T11:00:00Z'))).toBe(true)
    expect(isOfficeOpen(JAPAN, at('2026-08-30T02:00:00Z'))).toBe(false)
  })

  it('Saturday nobody is in', () => {
    // 2026-08-29 is a Saturday.
    expect(isAnyOfficeOpen(BOTH, at('2026-08-29T01:00:00Z'))).toBe(false)
    expect(isAnyOfficeOpen(BOTH, at('2026-08-29T11:00:00Z'))).toBe(false)
    expect(isAnyOfficeOpen(BOTH, at('2026-08-29T23:00:00Z'))).toBe(false)
  })
})

describe('nextOpening — what the traveller is actually told', () => {
  it('finds Monday morning in Tokyo after a Saturday night message', () => {
    // Saturday 23:00 Tokyo = 14:00 UTC Saturday. Sunday brings Cairo at
    // 09:00 Cairo = 06:00 UTC, which is 15:00 Tokyo Sunday — sooner than
    // Tokyo's own Monday. The traveller should be told the SOONER one.
    const next = nextOpening(BOTH, at('2026-08-29T14:00:00Z'))
    expect(next).not.toBeNull()
    expect(next!.toISOString()).toBe('2026-08-30T06:00:00.000Z')
    expect(formatInTravellerTimeJa(next!)).toBe('8月30日(日) 15:00')
  })

  it('finds Cairo the same evening when Japan has just closed', () => {
    // Monday 17:30 Tokyo = 08:30 UTC. Cairo opens 09:00 Cairo = 06:00 UTC —
    // already past, so Cairo is ALREADY open and there is nothing to wait for.
    expect(isAnyOfficeOpen(BOTH, at('2026-08-24T08:30:00Z'))).toBe(true)
  })

  it('returns null when no office is configured', () => {
    expect(nextOpening([], at('2026-08-29T14:00:00Z'))).toBeNull()
  })
})

describe('describeOfficesJa', () => {
  it('lists each office with its own week and clock', () => {
    expect(describeOfficesJa(BOTH)).toEqual([
      '東京・大阪 月〜金 09:00〜17:00',
      'カイロ 日〜木 09:00〜17:00',
    ])
  })

  it('collapses a contiguous run but not a scattered one', () => {
    expect(describeOfficesJa([{ ...JAPAN, days: [1, 3, 5] }])[0]).toContain('月・水・金')
  })
})

describe('acknowledgementJa', () => {
  it('just says a reply is coming while somebody is in', () => {
    const msg = acknowledgementJa(BOTH, at('2026-08-24T01:00:00Z'))
    expect(msg).toContain('受け付けました')
    expect(msg).not.toContain('受付時間外')
  })

  it('names the next opening in JAPAN time when nobody is in', () => {
    // Saturday night in Japan — the case this whole feature worries about.
    const msg = acknowledgementJa(BOTH, at('2026-08-29T14:00:00Z'))
    expect(msg).toContain('受付時間外')
    expect(msg).toContain('8月30日(日) 15:00')
    expect(msg).toContain('日本時間')
  })

  it('promises no time when no hours are configured', () => {
    const msg = acknowledgementJa([], at('2026-08-29T14:00:00Z'))
    expect(msg).toContain('受け付けました')
    expect(msg).not.toContain('受付時間外')
  })
})
