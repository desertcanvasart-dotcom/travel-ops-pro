// A saved quote with services that have no rate must not leave the building
// by default — as a customer PDF, a converted itinerary, or a booking.
//
// Until 2026-09-16 a stored quote carried no completeness at all, and the
// delivery gate checked only that the total was a positive number. A quote
// missing every hotel night and transfer passed. The completeness is now read
// from the quote's own saved lines: every unpriced service is kept there at 0
// with `unpriced: true`, so the record cannot disagree with the lines.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { allowsIncomplete, describeGaps, quoteCompleteness } from '@/lib/pricing/quote-completeness'
import { checkAmountDeliverable } from '@/lib/pricing-guards'

const priced = { service_id: 'day2-guide', service_name: 'English Speaking Guide', day_number: 2, unit_cost: 38.42, line_total: 38.42 }
const noHotel = { service_id: 'day6-hotel', service_name: 'Hotel (Abu Simbel)', day_number: 6, unit_cost: 0, line_total: 0, unpriced: true, issue: 'No deluxe hotel rate for "Abu Simbel". Add it in Rates → Hotels.' }
const noTransfer = { service_id: 'day7-transport', service_name: 'Airport transfer — Cairo', day_number: 7, unit_cost: 0, line_total: 0, unpriced: true, issue: 'No airport transfer rate for Cairo.' }

describe('quoteCompleteness', () => {
  it('a quote whose lines are all priced is complete', () => {
    expect(quoteCompleteness([priced])).toEqual({ complete: true, gaps: [] })
  })

  it('names each service with no rate, its day and the fix', () => {
    const r = quoteCompleteness([priced, noHotel, noTransfer])
    expect(r.complete).toBe(false)
    expect(r.gaps).toEqual([
      { name: 'Hotel (Abu Simbel)', day: 6, issue: noHotel.issue },
      { name: 'Airport transfer — Cairo', day: 7, issue: noTransfer.issue },
    ])
  })

  it('a quote saved before lines carried the flag reads as complete, not blocked', () => {
    expect(quoteCompleteness([{ service_name: 'Hotel', line_total: 0 }]).complete).toBe(true)
    expect(quoteCompleteness(null).complete).toBe(true)
    expect(quoteCompleteness('garbage').complete).toBe(true)
  })

  it('reads the engine shape too (camelCase), for callers that save it', () => {
    expect(quoteCompleteness([{ serviceName: 'Hotel', dayNumber: 3, unpriced: true, issue: 'x' }]).gaps)
      .toEqual([{ name: 'Hotel', day: 3, issue: 'x' }])
  })
})

describe('allowsIncomplete only takes an unambiguous yes', () => {
  it('yes', () => {
    for (const v of [true, 'true', '1', 1]) expect(allowsIncomplete(v)).toBe(true)
  })
  it('anything else is no', () => {
    for (const v of [undefined, null, false, 'false', '0', '', 'yes', {}, [], 2]) expect(allowsIncomplete(v)).toBe(false)
  })
})

describe('describeGaps', () => {
  it('lists the first few and counts the rest', () => {
    const gaps = Array.from({ length: 7 }, (_, i) => ({ name: `S${i + 1}`, day: i + 1, issue: '' }))
    expect(describeGaps(gaps)).toBe('S1 (day 1), S2 (day 2), S3 (day 3), S4 (day 4), S5 (day 5) and 2 more')
  })
})

describe('checkAmountDeliverable with the saved lines', () => {
  it('refuses a quote with services that have no rate, as an overridable refusal', () => {
    const r = checkAmountDeliverable(2142.26, { currency: 'USD', servicesSnapshot: [priced, noHotel] })
    expect(r.ok).toBe(false)
    expect(r.incomplete).toBe(true)
    expect(r.gaps).toHaveLength(1)
    expect(r.violations.join(' ')).toMatch(/Hotel \(Abu Simbel\) \(day 6\)/)
  })

  it('lets it through when the operator knowingly goes ahead', () => {
    const r = checkAmountDeliverable(2142.26, { currency: 'USD', servicesSnapshot: [noHotel], allowIncomplete: true })
    expect(r.ok).toBe(true)
  })

  it('never lets an override excuse a structurally broken price', () => {
    const r = checkAmountDeliverable(0, { currency: 'USD', servicesSnapshot: [noHotel], allowIncomplete: true })
    expect(r.ok).toBe(false)
    const blocked = checkAmountDeliverable(0, { currency: 'USD', servicesSnapshot: [noHotel] })
    // Broken AND incomplete: not marked overridable, so the UI does not offer "continue anyway".
    expect(blocked.incomplete).toBe(false)
  })

  it('without saved lines it is the structural check it always was', () => {
    expect(checkAmountDeliverable(100, { currency: 'USD' }).ok).toBe(true)
    expect(checkAmountDeliverable(100, { currency: 'USD' }).incomplete).toBeUndefined()
  })
})

describe('every path a quote leaves by checks its lines', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  for (const [path, overrideFrom] of [
    ['app/api/b2b/quotes/[id]/pdf/route.ts', "request.nextUrl.searchParams.get('allow_incomplete')"],
    ['app/api/b2b/quotes/[id]/convert/route.ts', 'body?.allow_incomplete'],
    ['app/api/bookings/from-quote/route.ts', 'body?.allow_incomplete'],
  ] as const) {
    it(`${path} passes the saved lines and reads the override explicitly`, () => {
      const s = src(path)
      expect(s).toContain('servicesSnapshot:')
      expect(s).toContain(`allowsIncomplete(${overrideFrom})`)
    })
  }

  it('the booking route selects the saved lines it checks', () => {
    expect(src('app/api/bookings/from-quote/route.ts')).toMatch(/quote_number, services_snapshot'/)
  })

  it('the booking card never passes the click event as the override', () => {
    // onClick={convert} would hand the MouseEvent in as allowIncomplete —
    // truthy — and skip the question entirely.
    expect(src('app/components/ConvertToBookingCard.tsx')).not.toMatch(/onClick=\{convert\}/)
  })

  it('the web order intake keeps the unpriced flag on the saved lines', () => {
    expect(src('lib/intake/process-order.ts')).toContain('unpriced: true, issue: s.issue')
  })
})
