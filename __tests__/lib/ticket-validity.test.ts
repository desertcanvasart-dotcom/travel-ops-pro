// flight_rates has carried `season`, `rate_valid_from` and `rate_valid_to`
// since the table existed, and Rates → Flights lets the operator fill them.
// Nothing read them. A route's fares were matched on from/to and cabin alone,
// so a seasonal pair did not price a summer departure at the summer fare — it
// made the leg AMBIGUOUS and left it unpriced:
//
//     2 flights serve CAI → NRT (EgyptAir, MS). Pick the exact flight on the day.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ticketValidOn,
  ticketsValidOn,
  ticketWindowLabel,
  outOfSeasonMessage,
  namedOutOfSeasonMessage,
} from '@/lib/pricing/ticket-validity'

const summer = { id: 's', airline: 'MS', rate_valid_from: '2026-06-01', rate_valid_to: '2026-09-30' }
const winter = { id: 'w', airline: 'MS', rate_valid_from: '2026-10-01', rate_valid_to: '2027-03-31' }

describe('ticketValidOn', () => {
  it('takes the fare whose window holds the date', () => {
    expect(ticketValidOn(summer, '2026-07-15')).toBe(true)
    expect(ticketValidOn(winter, '2026-07-15')).toBe(false)
    expect(ticketValidOn(winter, '2026-12-05')).toBe(true)
  })

  it('includes both ends of the window', () => {
    expect(ticketValidOn(summer, '2026-06-01')).toBe(true)
    expect(ticketValidOn(summer, '2026-09-30')).toBe(true)
    expect(ticketValidOn(summer, '2026-05-31')).toBe(false)
    expect(ticketValidOn(summer, '2026-10-01')).toBe(false)
  })

  it('keeps a fare with no window', () => {
    // Most of the table is open-ended — the form defaults rate_valid_to to
    // 2099-12-31, and older rows predate anyone filling these in. A fare that
    // has always been used must not stop pricing because nobody typed a
    // window, which is also what makes this filter a no-op on today's data.
    expect(ticketValidOn({}, '2026-07-15')).toBe(true)
    expect(ticketValidOn({ rate_valid_from: null, rate_valid_to: null }, '2026-07-15')).toBe(true)
  })

  it('honours a half-open window', () => {
    expect(ticketValidOn({ rate_valid_from: '2026-06-01' }, '2030-01-01')).toBe(true)
    expect(ticketValidOn({ rate_valid_from: '2026-06-01' }, '2026-01-01')).toBe(false)
    expect(ticketValidOn({ rate_valid_to: '2026-09-30' }, '2026-01-01')).toBe(true)
    expect(ticketValidOn({ rate_valid_to: '2026-09-30' }, '2026-10-01')).toBe(false)
  })

  it('does not exclude on an edge it cannot read', () => {
    // A typo in one date must not silently un-price a fare.
    expect(ticketValidOn({ rate_valid_from: 'not a date' }, '2026-07-15')).toBe(true)
    expect(ticketValidOn({ rate_valid_to: '2026-13-45' }, '2026-07-15')).toBe(true)
  })

  it('keeps every fare when there is no date', () => {
    // A template priced without a departure — the same answer periodRatesFor
    // gives a date-less caller.
    expect(ticketValidOn(summer, null)).toBe(true)
    expect(ticketValidOn(winter, undefined)).toBe(true)
    expect(ticketValidOn(winter, '')).toBe(true)
  })

  it('reads a timestamp as its date', () => {
    expect(ticketValidOn(summer, '2026-07-15T09:30:00Z')).toBe(true)
  })
})

describe('ticketsValidOn', () => {
  it('resolves the seasonal pair that used to be ambiguous', () => {
    // THE bug: both fares reached the resolver, which takes the only candidate
    // or nothing, so the leg went unpriced on every date of the year.
    const july = ticketsValidOn([summer, winter], '2026-07-15')
    expect(july.valid).toEqual([summer])
    expect(july.expired).toEqual([winter])

    const december = ticketsValidOn([summer, winter], '2026-12-05')
    expect(december.valid).toEqual([winter])
    expect(december.expired).toEqual([summer])
  })

  it('hands back what the date ruled out, rather than dropping it', () => {
    // "No fare for this route" and "no fare for this DATE" send the operator
    // to opposite places — the contract, or the calendar.
    const { valid, expired } = ticketsValidOn([summer, winter], '2026-05-01')
    expect(valid).toEqual([])
    expect(expired).toHaveLength(2)
  })

  it('still reports a genuine ambiguity inside one season', () => {
    const other = { ...summer, id: 'x', airline: 'EgyptAir' }
    const { valid } = ticketsValidOn([summer, other, winter], '2026-07-15')
    expect(valid).toHaveLength(2)
  })

  it('leaves an open-ended catalogue exactly as it found it', () => {
    const open = [{ id: 'a' }, { id: 'b', rate_valid_to: '2099-12-31' }]
    const { valid, expired } = ticketsValidOn(open, '2026-07-15')
    expect(valid).toEqual(open)
    expect(expired).toEqual([])
  })
})

describe('ticketWindowLabel', () => {
  it('names a window the way the operator entered it', () => {
    expect(ticketWindowLabel(summer)).toBe('2026-06-01 – 2026-09-30')
    expect(ticketWindowLabel({ rate_valid_from: '2026-06-01' })).toBe('from 2026-06-01')
    expect(ticketWindowLabel({ rate_valid_to: '2026-09-30' })).toBe('until 2026-09-30')
    expect(ticketWindowLabel({})).toBeNull()
  })
})

describe('what the operator is told', () => {
  // Three legs reach the same two dead ends. The sentences stay identical in
  // shape, or the same situation reads as two different problems depending on
  // which kind of ticket it happened to.
  it('names the windows it DID find, so "add a fare" becomes "your fare stops on 30 September"', () => {
    expect(outOfSeasonMessage({ rows: [summer], routeLabel: 'Cairo → Luxor', legDate: '2026-05-01', addWhere: 'Rates → Flights' }))
      .toBe('The fare for Cairo → Luxor covers other dates, not 2026-05-01 (2026-06-01 – 2026-09-30). Add the season\u2019s fare in Rates → Flights.'.replace('\u2019', "'"))
  })

  it('counts and agrees its verb', () => {
    const many = outOfSeasonMessage({ rows: [summer, winter], routeLabel: 'Cairo → Luxor', legDate: '2026-05-01', addWhere: 'Rates → Trains' })
    expect(many).toContain('All 2 fares for Cairo → Luxor cover other dates')
    expect(many).toContain('2026-06-01 – 2026-09-30, 2026-10-01 – 2027-03-31')
    expect(many).toContain('Rates → Trains')
  })

  it('says nothing about windows when the rows carry none', () => {
    const m = outOfSeasonMessage({ rows: [{}], routeLabel: 'A → B', legDate: '2026-05-01', addWhere: 'Rates → Flights' })
    expect(m).toContain('covers other dates, not 2026-05-01.')
  })

  it('a stale pick is told which season it belongs to, not that it was deleted', () => {
    const m = namedOutOfSeasonMessage({ row: summer, noun: 'sleeping train', dayNumber: 3, routeLabel: 'Giza → Luxor', legDate: '2026-12-04' })
    expect(m).toContain('The sleeping train picked for day 3 (Giza → Luxor) is not sold on 2026-12-04')
    expect(m).toContain('its fare covers 2026-06-01 – 2026-09-30')
    expect(m).not.toMatch(/no longer in Rates/)
  })
})

describe('the engine reads the window', () => {
  const src = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')

  it('filters every ticket leg by the date it travels', () => {
    // Flights, day trains and sleepers all carry rate_valid_from/to, and all
    // three were unread. One date, one filter, at the top of the leg loop.
    expect(src.match(/ticketsValidOn\(/g) ?? []).toHaveLength(3)
    expect(src).toMatch(/const legDate = dateForDay\(leg\.day\)/)
  })

  it('filters a sleeper\u2019s cabin rows BEFORE grouping them into trains', () => {
    // A season's pair is two rows. Grouping first would leave a summer Half
    // Twin and a winter Single looking like one train with an odd supplement.
    const sleeper = src.slice(src.indexOf('Sleeping train. One TRAIN'))
    expect(sleeper.indexOf('ticketsValidOn(onRoute, legDate)')).toBeLessThan(sleeper.indexOf('const trainKey ='))
  })

  it('tells an out-of-season route apart from a route with no fare, on all three', () => {
    // One sentence per dead end, shared — so the same situation does not read
    // as two different problems depending on the kind of ticket.
    expect(src.match(/outOfSeasonMessage\(\{/g) ?? []).toHaveLength(3)
    expect(src.match(/namedOutOfSeasonMessage\(\{/g) ?? []).toHaveLength(3)
    for (const where of ['Rates → Flights', 'Rates → Trains', 'Rates → Sleeping Trains']) {
      expect(src).toContain(`addWhere: '${where}'`)
    }
  })
})
