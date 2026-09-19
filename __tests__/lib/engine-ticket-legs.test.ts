import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Ticket legs — flights, day trains, sleeping trains (2026-09-04). A marked
// day rides a per-person ticket instead of a road vehicle. Operator rules:
// flights always economy; several rows on a route need the day to NAME the
// train (exactly one auto-resolves, more is a hole, never a guess); the
// sleeping-train ticket is the night's bed (solo pays the Single gap); the
// throughout guide rides at guide_rate ?? customer fare and sleeps in a
// Single. Cairo and Giza are one station city. No station transfers.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, collectTicketLegs, resolveTicketRow } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2 }

const day = (n: number, city: string, over: Record<string, unknown> = {}) => ({
  day: n, title: `Day ${n}`, city, overnight_city: city,
  accommodation_type: 'none',
  meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
  attractions: [],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
  ...over,
})

/** The agency's airports. A flight fare is priced between AIRPORTS, and this
 *  is what joins them to a leg's cities — Cairo and Giza share CAI, the way
 *  the station city alias works for sleepers. */
const airports = () => [
  { key: 'cai', label: 'Cairo', meta: { iata: 'CAI', city: 'Cairo', country_code: 'EG' }, is_active: true, kind: 'airport', rank: 1 },
  { key: 'lxr', label: 'Luxor', meta: { iata: 'LXR', city: 'Luxor', country_code: 'EG' }, is_active: true, kind: 'airport', rank: 2 },
  { key: 'asw', label: 'Aswan', meta: { iata: 'ASW', city: 'Aswan', country_code: 'EG' }, is_active: true, kind: 'airport', rank: 3 },
]

/** Rows carry no rate_currency → they are already in the run currency. */
const tables = (over: Record<string, unknown> = {}) => {
  const t = fullRateTables() as any
  t.org_vocabularies = airports()
  t.flight_rates = [
    { id: 'fl-1', route_from: 'cai', route_to: 'lxr', cabin_class: 'economy', airline: 'EgyptAir', base_rate_eur: 100, base_rate_non_eur: 100, tax_eur: 20, tax_non_eur: 20, guide_rate: null, is_active: true },
  ]
  t.train_rates = [
    { id: 'tr-1', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'Watania', rate_eur: 75, guide_rate: 30, is_active: true },
  ]
  t.sleeping_train_rates = [
    { id: 'sl-ht', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Half Twin', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 120, guide_rate: null, is_active: true },
    { id: 'sl-sg', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Single', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 170, guide_rate: 90, is_active: true },
  ]
  return { ...t, ...over }
}

const withDays = (days: unknown[], over: Record<string, unknown> = {}) => {
  const t = tables(over)
  t.tour_templates[0].itinerary = days
  return t
}

const line = (r: any, id: string) => (r.services ?? []).find((s: any) => s.id === id)
const legHoles = (r: any) => (r.holes ?? []).filter((h: any) => /flight_rates|train_rates|sleeping_train_rates/.test(h.lookupAttempted ?? ''))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('collectTicketLegs', () => {
  it('flight/train legs run previous→this city; a sleeper boards tonight and wakes in the next city', () => {
    const legs = collectTicketLegs([
      { day: 1, city: 'Cairo' },
      { day: 2, city: 'Luxor', transport_type: 'flight' },
      { day: 3, city: 'Luxor', transport_type: 'sleeping_train', transport_rate_id: 'sl-ht' },
      { day: 4, city: 'Cairo' },
    ] as any)
    expect(legs).toEqual([
      { day: 2, mode: 'flight', from: 'Cairo', to: 'Luxor', rateId: undefined },
      { day: 3, mode: 'sleeping_train', from: 'Luxor', to: 'Cairo', rateId: 'sl-ht' },
    ])
  })

  it('an unmarked city change is NOT a ticket leg (road, as always)', () => {
    expect(collectTicketLegs([{ day: 1, city: 'Cairo' }, { day: 2, city: 'Luxor' }] as any)).toEqual([])
  })
})

describe('resolveTicketRow — named, else exactly one, never a guess', () => {
  const rows = [{ id: 'a' }, { id: 'b' }] as any[]
  it('names win', () => expect(resolveTicketRow(rows, 'b').row?.id).toBe('b'))
  it('a missing name is reported, not replaced', () => expect(resolveTicketRow(rows, 'ghost')).toMatchObject({ row: null, namedMissing: true }))
  it('exactly one auto-resolves', () => expect(resolveTicketRow([rows[0]], undefined).row?.id).toBe('a'))
  it('several without a name is ambiguous', () => expect(resolveTicketRow(rows, undefined).ambiguous).toHaveLength(2))
})

describe('flight legs', () => {
  it('prices fare + tax per person and suppresses the road intercity line', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 120, isPerPax: true, serviceType: 'flight' })
    expect((r.services ?? []).find((s: any) => s.id === 'day2-transport' && /intercity/i.test(s.notes ?? ''))).toBeUndefined()
    expect(legHoles(r)).toEqual([])
  })

  it('a route with no economy row is a hole naming Rates → Flights', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Aswan', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unpriced: true, unitCost: 0, lineTotal: 0 })
    expect(legHoles(r).some((h: any) => /No economy flight rate for Cairo → Aswan/.test(h.message))).toBe(true)
  })

  // ============================================
  // AIRPORTS, NOT CITIES — and not Egypt's
  // ============================================
  // A fare is priced between AIRPORTS. The engine used to match a leg to a
  // flight row by CITY NAME, and lib/pricing/flight-leg knew nine Egyptian
  // cities and answered 'CAI' for everything else — so an origin abroad could
  // not be priced and, on an install elsewhere, every airport was Cairo.
  const withTokyo = () => [
    ...airports(),
    { key: 'nrt', label: 'Tokyo Narita', meta: { iata: 'NRT', city: 'Tokyo', country_code: 'JP' }, is_active: true, kind: 'airport', rank: 4 },
    { key: 'hnd', label: 'Tokyo Haneda', meta: { iata: 'HND', city: 'Tokyo', country_code: 'JP' }, is_active: true, kind: 'airport', rank: 5 },
  ]

  it('prices the flight the customers actually arrive on, and calls it international', async () => {
    const t = withDays([
      day(1, 'Cairo', { transport_type: 'flight', leg_from: 'Tokyo', leg_to: 'Cairo' }),
      day(2, 'Cairo'),
    ])
    t.org_vocabularies = withTokyo().filter((a: any) => a.key !== 'hnd')
    t.flight_rates = [
      { id: 'fl-intl', route_from: 'nrt', route_to: 'cai', cabin_class: 'economy', airline: 'EgyptAir', base_rate_eur: 900, base_rate_non_eur: 900, tax_eur: 100, tax_non_eur: 100, is_active: true },
    ]
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-ticket-flight')).toMatchObject({ unitCost: 1000, isPerPax: true })
    // "Domestic" was hardcoded — an international leg printed as a domestic
    // one on the customer's own quote.
    expect(line(r, 'day1-ticket-flight').serviceName).toContain('International Flight')
    expect(legHoles(r)).toEqual([])
  })

  it('still calls a flight between two Egyptian airports domestic', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day2-ticket-flight').serviceName).toContain('Domestic Flight')
  })

  it('a city with two airports is the ambiguity the operator already answers', async () => {
    // Narita and Haneda are two fares of one city. That is the same question
    // as two airlines on one route, and it gets the same answer: name the one.
    const t = withDays([
      day(1, 'Cairo', { transport_type: 'flight', leg_from: 'Tokyo', leg_to: 'Cairo' }),
      day(2, 'Cairo'),
    ])
    t.org_vocabularies = withTokyo()
    t.flight_rates = [
      { id: 'fl-nrt', route_from: 'nrt', route_to: 'cai', cabin_class: 'economy', airline: 'EgyptAir', base_rate_eur: 900, base_rate_non_eur: 900, tax_eur: 100, tax_non_eur: 100, is_active: true },
      { id: 'fl-hnd', route_from: 'hnd', route_to: 'cai', cabin_class: 'economy', airline: 'JAL', base_rate_eur: 1100, base_rate_non_eur: 1100, tax_eur: 100, tax_non_eur: 100, is_active: true },
    ]
    setMockTables(t)
    const ambiguous = await calculateAutoPricing(BASE)
    expect(line(ambiguous, 'day1-ticket-flight')).toMatchObject({ unpriced: true })
    expect(legHoles(ambiguous)[0]?.message ?? '').toMatch(/2 flights serve Tokyo → Cairo/)

    t.tour_templates[0].itinerary[0].transport_rate_id = 'fl-hnd'
    setMockTables(t)
    const named = await calculateAutoPricing(BASE)
    expect(line(named, 'day1-ticket-flight')).toMatchObject({ unitCost: 1200 })
  })

  it('a city with no airport says so, and points at the list that owns it', async () => {
    // Not "no fare for this route" — the operator fixes this in Vocabulary,
    // not in Rates, so it cannot be the same sentence.
    const t = withDays([
      day(1, 'Cairo', { transport_type: 'flight', leg_from: 'Osaka', leg_to: 'Cairo' }),
      day(2, 'Cairo'),
    ])
    t.flight_rates = []
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-ticket-flight')).toMatchObject({ unpriced: true })
    const message = legHoles(r)[0]?.message ?? ''
    expect(message).toMatch(/Osaka has no airport in your list/)
    expect(message).toMatch(/Vocabulary → Airports/)
    expect(message).not.toMatch(/No economy flight rate/)
  })

  // ============================================
  // SEVERAL PERIODS ON ONE FARE — the hotels' shape
  // ============================================
  // Operator, 2026-09-19: "it's only one period, which does not serve the
  // purpose… we need to be able to add more than one period, maybe up to five
  // or maybe six, like the hotels." A route sold across four seasons used to
  // mean four near-identical rows — same airline, same flight number, retyped.
  const periodFare = (from: string, to: string, fare: number, tax: number, season: string) =>
    ({ name: season, season, from, to, rates: { base_rate_eur: fare, tax_eur: tax, base_rate_non_eur: fare, tax_non_eur: tax } })

  const withPeriods = () => {
    const t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })])
    t.flight_rates = [{
      id: 'fl-1', route_from: 'cai', route_to: 'lxr', cabin_class: 'economy', airline: 'EgyptAir',
      base_rate_eur: 100, base_rate_non_eur: 100, tax_eur: 20, tax_non_eur: 20, is_active: true,
      seasons: [
        periodFare('2026-04-01', '2026-06-30', 100, 20, 'low'),
        periodFare('2026-07-01', '2026-09-30', 150, 25, 'high'),
        periodFare('2026-12-26', '2027-01-05', 300, 40, 'golden_week'),
        periodFare('2026-10-01', '2027-03-31', 200, 30, 'winter'),
      ],
    }]
    return t
  }

  it('prices each period from ONE row, where it used to need four', async () => {
    for (const [date, expected] of [['2026-05-10', 120], ['2026-08-10', 175], ['2026-11-02', 230]] as const) {
      setMockTables(withPeriods())
      const r = await calculateAutoPricing({ ...BASE, travelDate: date })
      expect(line(r, 'day2-ticket-flight'), `on ${date}`).toMatchObject({ unitCost: expected })
      expect(legHoles(r)).toEqual([])
    }
  })

  it('the SHORTEST window wins where periods overlap', async () => {
    // Golden Week sits inside the broad winter window. The specific one is
    // the contract's intent — the same precedence a hotel's Christmas period
    // has over its winter season.
    setMockTables(withPeriods())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-30' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 340 })
  })

  it('a date no period covers is a hole, never the first period\u2019s price', async () => {
    // There is no default period. A trip after the contract ends used to
    // price silently at the wrong season.
    setMockTables(withPeriods())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-02-01' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unpriced: true, unitCost: 0 })
    const message = legHoles(r)[0]?.message ?? ''
    expect(message).toMatch(/covers? other dates, not 2026-02-02/)
    // It names every period the fare DOES cover, not just the mirrored first
    // window — a fare with four periods that shows one reads as a different fare.
    expect(message).toContain('2026-04-01 – 2026-06-30')
    expect(message).toContain('2026-12-26 – 2027-01-05')
  })

  it('the guide\u2019s seat comes from the same period as the fare', async () => {
    const t = withPeriods()
    t.flight_rates[0].seasons[1].rates.guide_rate = 90
    setMockTables(t)
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-08-10', guideMode: 'throughout' })
    expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 90 })
  })

  it('a row with no periods still prices off its own columns', async () => {
    // Rows from before periods existed, and the CSV importer's wide sheet.
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-08-10' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 120 })
  })

  // ============================================
  // A SEASONAL PAIR — the fare valid on the day it flies
  // ============================================
  // flight_rates has always had rate_valid_from/to, and nothing read them: two
  // seasonal rows on one route were simply two candidates, so the leg was
  // AMBIGUOUS and went unpriced on every date of the year. An airline's winter
  // schedule is its own row — own flight number, own times — so the window is
  // what picks between them.
  const seasonalPair = () => [
    { id: 'fl-sum', route_from: 'cai', route_to: 'lxr', cabin_class: 'economy', airline: 'EgyptAir', base_rate_eur: 100, base_rate_non_eur: 100, tax_eur: 20, tax_non_eur: 20, rate_valid_from: '2026-06-01', rate_valid_to: '2026-09-30', is_active: true },
    { id: 'fl-win', route_from: 'cai', route_to: 'lxr', cabin_class: 'economy', airline: 'EgyptAir', base_rate_eur: 200, base_rate_non_eur: 200, tax_eur: 30, tax_non_eur: 30, rate_valid_from: '2026-10-01', rate_valid_to: '2027-03-31', is_active: true },
  ]

  const seasonalDays = () => {
    const t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })])
    t.flight_rates = seasonalPair()
    return t
  }

  it('prices a summer departure at the summer fare', async () => {
    setMockTables(seasonalDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-07-14' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 120 })
    expect(legHoles(r)).toEqual([])
  })

  it('prices a winter departure at the winter fare', async () => {
    setMockTables(seasonalDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 230 })
    expect(legHoles(r)).toEqual([])
  })

  it('uses the date the LEG flies, not the departure date', async () => {
    // Day 2 of a 30 September departure is 1 October — the winter fare. A trip
    // priced off its departure alone would charge the summer fare for a flight
    // that takes off in the winter season.
    setMockTables(seasonalDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-09-30' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 230 })
  })

  it('a route whose fares all cover other dates says SO, not "no fare"', async () => {
    // The two send the operator to opposite places: the contract, or the
    // calendar. One message for both sends them to the wrong page.
    setMockTables(seasonalDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-05-01' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unpriced: true, unitCost: 0 })
    const message = legHoles(r)[0]?.message ?? ''
    expect(message).toMatch(/cover other dates, not 2026-05-02/)
    expect(message).toMatch(/2026-06-01 – 2026-09-30/)
    expect(message).not.toMatch(/No economy flight rate/)
  })

  it('a pick left behind by a moved departure is a hole, never last season\u2019s fare', async () => {
    // The stored pick is the dangerous case: move a sold trip six months and a
    // resolver that honoured the pick would quietly charge the old fare.
    const t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight', transport_rate_id: 'fl-sum' })])
    t.flight_rates = seasonalPair()
    setMockTables(t)
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unpriced: true, unitCost: 0 })
    expect(legHoles(r)[0]?.message ?? '').toMatch(/is not sold on 2026-12-05/)
  })

  it('leaves an open-ended catalogue priced exactly as before', async () => {
    // Today's rows are open-ended (the form defaults rate_valid_to to
    // 2099-12-31), so the filter must be a no-op until real windows exist.
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 120 })
    expect(legHoles(r)).toEqual([])
  })
})

describe('day-train legs', () => {
  it('exactly one row auto-resolves; the guide rides at his guide_rate in throughout mode', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })]))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day2-ticket-train')).toMatchObject({ unitCost: 75, isPerPax: true })
    expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 30, isPerPax: false })
  })

  it('two trains on one route without a pick is a hole that lists them; naming one resolves it', async () => {
    const second = { id: 'tr-2', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'OldLine', rate_eur: 90, is_active: true }
    let t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })])
    t.train_rates.push(second)
    setMockTables(t)
    const ambiguous = await calculateAutoPricing(BASE)
    expect(line(ambiguous, 'day2-ticket-train')).toMatchObject({ unpriced: true, unitCost: 0, lineTotal: 0 })
    expect(legHoles(ambiguous).some((h: any) => /2 trains serve/.test(h.message) && /Watania/.test(h.message) && /OldLine/.test(h.message))).toBe(true)

    t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train', transport_rate_id: 'tr-2' })])
    t.train_rates.push(second)
    setMockTables(t)
    const named = await calculateAutoPricing(BASE)
    expect(line(named, 'day2-ticket-train')).toMatchObject({ unitCost: 90 })
  })

  // ============================================
  // A SEASONAL PAIR — the fare valid on the day it travels
  // ============================================
  // train_rates carries rate_valid_from/to just as flights do, and it was just
  // as unread: two seasonal rows on one route were two candidates, so the leg
  // was ambiguous and went unpriced on every date of the year.
  const seasonalTrains = () => [
    { id: 'tr-sum', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'Watania', rate_eur: 75, guide_rate: 30, rate_valid_from: '2026-06-01', rate_valid_to: '2026-09-30', is_active: true },
    { id: 'tr-win', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'Watania', rate_eur: 95, guide_rate: 40, rate_valid_from: '2026-10-01', rate_valid_to: '2027-03-31', is_active: true },
  ]

  const seasonalTrainDays = (over: Record<string, unknown> = {}) => {
    const t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train', ...over })])
    t.train_rates = seasonalTrains()
    return t
  }

  it('prices each departure at its own season, where it used to be ambiguous', async () => {
    setMockTables(seasonalTrainDays())
    const summer = await calculateAutoPricing({ ...BASE, travelDate: '2026-07-14' })
    expect(line(summer, 'day2-ticket-train')).toMatchObject({ unitCost: 75 })
    expect(legHoles(summer)).toEqual([])

    setMockTables(seasonalTrainDays())
    const winter = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(winter, 'day2-ticket-train')).toMatchObject({ unitCost: 95 })
    expect(legHoles(winter)).toEqual([])
  })

  it('a route whose fares all cover other dates says SO, not "no train rate"', async () => {
    setMockTables(seasonalTrainDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-05-01' })
    const message = legHoles(r)[0]?.message ?? ''
    expect(message).toMatch(/cover other dates, not 2026-05-02/)
    expect(message).toMatch(/Rates → Trains/)
    expect(message).not.toMatch(/No train rate for/)
  })

  it('a pick left behind by a moved departure is a hole, never last season\u2019s fare', async () => {
    setMockTables(seasonalTrainDays({ transport_rate_id: 'tr-sum' }))
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(r, 'day2-ticket-train')).toMatchObject({ unpriced: true, unitCost: 0 })
    expect(legHoles(r)[0]?.message ?? '').toMatch(/is not sold on 2026-12-05/)
  })
})
describe('sleeping-train legs', () => {
  const sleeperDays = [
    day(1, 'Cairo', { transport_type: 'sleeping_train', overnight_kind: 'train' }),
    day(2, 'Luxor'),
  ]

  it('the ticket is the bed: Half Twin per person, solo pays the Single gap, Cairo boards at Giza', async () => {
    setMockTables(withDays(sleeperDays))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-ticket-sleeper')).toMatchObject({ unitCost: 120, isPerPax: true })
    expect(line(r, 'day1-hotel')).toBeUndefined()
    // The night joined accommodationNights with singleSupp 50 (170 − 120).
    expect((r.accommodationNights ?? []).some((n: any) => n.ppd === 120 && n.singleSupp === 50)).toBe(true)
    expect(legHoles(r)).toEqual([])
  })

  it('the throughout guide sleeps in a Single at its guide_rate', async () => {
    setMockTables(withDays(sleeperDays))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day1-guide-ticket')).toMatchObject({ unitCost: 90, serviceName: expect.stringContaining('Single') })
  })

  it('a route with no rows is a hole naming Rates → Sleeping Trains', async () => {
    const t = withDays(sleeperDays)
    t.sleeping_train_rates = []
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(legHoles(r).some((h: any) => /Sleeping Trains/.test(h.message))).toBe(true)
  })

  // ============================================
  // TWO SEASONS OF ONE TRAIN — a pair of pairs
  // ============================================
  // A sleeping train is a PAIR of cabin rows, grouped by supplier|validity. A
  // seasonal contract therefore doubles that to four rows and two groups, so
  // the leg was ambiguous — "2 sleeping trains serve Cairo → Luxor" — on every
  // date of the year. The date is applied to the cabin ROWS before they are
  // grouped, so the season's pair is the only one left to group.
  const seasonalSleepers = () => [
    { id: 'sl-sum-ht', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Half Twin', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 120, guide_rate: null, rate_valid_from: '2026-06-01', rate_valid_to: '2026-09-30', is_active: true },
    { id: 'sl-sum-sg', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Single', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 170, guide_rate: 90, rate_valid_from: '2026-06-01', rate_valid_to: '2026-09-30', is_active: true },
    { id: 'sl-win-ht', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Half Twin', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 150, guide_rate: null, rate_valid_from: '2026-10-01', rate_valid_to: '2027-03-31', is_active: true },
    { id: 'sl-win-sg', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Single', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 210, guide_rate: 110, rate_valid_from: '2026-10-01', rate_valid_to: '2027-03-31', is_active: true },
  ]

  const seasonalSleeperDays = (over: Record<string, unknown> = {}) => {
    const t = withDays([
      day(1, 'Cairo', { transport_type: 'sleeping_train', overnight_kind: 'train', ...over }),
      day(2, 'Luxor'),
    ])
    t.sleeping_train_rates = seasonalSleepers()
    return t
  }

  it('groups the season\u2019s pair, not both seasons\u2019 cabins', async () => {
    setMockTables(seasonalSleeperDays())
    const summer = await calculateAutoPricing({ ...BASE, travelDate: '2026-07-14' })
    expect(line(summer, 'day1-ticket-sleeper')).toMatchObject({ unitCost: 120 })
    // The Single gap comes from the SAME season — 170 − 120, never 210 − 120.
    expect((summer.accommodationNights ?? []).some((n: any) => n.ppd === 120 && n.singleSupp === 50)).toBe(true)
    expect(legHoles(summer)).toEqual([])

    setMockTables(seasonalSleeperDays())
    const winter = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(winter, 'day1-ticket-sleeper')).toMatchObject({ unitCost: 150 })
    expect((winter.accommodationNights ?? []).some((n: any) => n.ppd === 150 && n.singleSupp === 60)).toBe(true)
    expect(legHoles(winter)).toEqual([])
  })

  it('the throughout guide takes the Single of the season he travels in', async () => {
    setMockTables(seasonalSleeperDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04', guideMode: 'throughout' })
    expect(line(r, 'day1-guide-ticket')).toMatchObject({ unitCost: 110 })
  })

  it('prices the night it BOARDS, not the night it arrives', async () => {
    // Boarding 30 September, arriving 1 October: the bed was bought on the
    // 30th, so it is the summer fare.
    setMockTables(seasonalSleeperDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-09-30' })
    expect(line(r, 'day1-ticket-sleeper')).toMatchObject({ unitCost: 120 })
  })

  it('a route whose cabins all cover other dates says SO', async () => {
    setMockTables(seasonalSleeperDays())
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-05-01' })
    const message = legHoles(r)[0]?.message ?? ''
    expect(message).toMatch(/cover other dates, not 2026-05-01/)
    expect(message).toMatch(/Rates → Sleeping Trains/)
    expect(message).not.toMatch(/No Half Twin sleeping-train rate/)
  })

  it('a pick left behind by a moved departure is a hole, never last season\u2019s bed', async () => {
    setMockTables(seasonalSleeperDays({ transport_rate_id: 'sl-sum-ht' }))
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(r, 'day1-ticket-sleeper')).toMatchObject({ unpriced: true, unitCost: 0 })
    expect(legHoles(r)[0]?.message ?? '').toMatch(/sleeping train picked for day 1 .* is not sold on 2026-12-04/)
  })

  it('leaves an open-ended catalogue priced exactly as before', async () => {
    setMockTables(withDays(sleeperDays))
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-04' })
    expect(line(r, 'day1-ticket-sleeper')).toMatchObject({ unitCost: 120 })
    expect(legHoles(r)).toEqual([])
  })
})
