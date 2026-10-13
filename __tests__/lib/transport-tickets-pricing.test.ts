import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Rates › Transport & Tickets — how pricing reads these four catalogues
// (audit 2026-10, suppliers-audit-transport):
//   F1  a flight's blank guide fare = the guide pays the customer fare (it was 0)
//   F3  a period with no fare is a hole (it priced the tax alone, or nothing)
//   R1  a train's 0/blank fare is a hole; a blank guide fare is the customer fare
//   T1  two transportation rows for one service: a FIXED pick, validity honoured
//   T3  a group bigger than every vehicle rides in several, priced as several
//   A1  airport assistance by service type and tier, not the first row fetched

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, transportCacheFromRows, orderTransportRows, findTransportRate } from '@/lib/auto-pricing-service'
import { flightGuideFare, enteredFare, keepBlankGuideFares } from '@/lib/rates/ticket-guide-fare'
import { sanitizeSeasons } from '@/lib/rates/rate-seasons'
import { vehicleFleetForPax, vehicleForPax } from '@/lib/vocabulary'
import { vehicleRateForPax } from '@/lib/rates/vehicle-bands'
import { pickAirportServiceRow } from '@/lib/pricing/airport-service-pick'

const BASE = { orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2 }

const day = (n: number, city: string, over: Record<string, unknown> = {}) => ({
  day: n, title: `Day ${n}`, city, overnight_city: city,
  accommodation_type: 'none',
  meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
  attractions: [],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
  ...over,
})

const airports = () => [
  { key: 'cai', label: 'Cairo', meta: { iata: 'CAI', city: 'Cairo', country_code: 'EG' }, is_active: true, org_id: 'org-1', kind: 'airport', rank: 1 },
  { key: 'lxr', label: 'Luxor', meta: { iata: 'LXR', city: 'Luxor', country_code: 'EG' }, is_active: true, org_id: 'org-1', kind: 'airport', rank: 2 },
]

const flightRow = (over: Record<string, unknown> = {}) => ({
  id: 'fl-1', route_from: 'cai', route_to: 'lxr', cabin_class: 'economy', airline: 'EgyptAir',
  base_rate_eur: 100, base_rate_non_eur: 100, tax_eur: 20, tax_non_eur: 20, guide_rate: null, is_active: true, ...over,
})

const tripWith = (days: unknown[], over: Record<string, unknown> = {}) => {
  const t = fullRateTables() as any
  t.org_vocabularies = airports()
  t.flight_rates = [flightRow()]
  t.train_rates = [{ id: 'tr-1', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'Watania', rate_eur: 75, guide_rate: null, is_active: true }]
  Object.assign(t, over)
  t.tour_templates[0].itinerary = days
  return t
}
const flightDays = () => [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })]
const trainDays = () => [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })]

const line = (r: any, id: string) => (r.services ?? []).find((s: any) => s.id === id)
const holesFor = (r: any, table: string) => (r.holes ?? []).filter((h: any) => (h.lookupAttempted ?? '').startsWith(table))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

// ============================================
// F1 — the throughout guide's flight seat
// ============================================
describe('F1: a blank guide fare is the customer fare, 0 only when entered as 0', () => {
  const period = (rates: Record<string, unknown>) => ({ name: 'All', from: '2026-01-01', to: '2026-12-31', rates: { base_rate_eur: 100, tax_eur: 20, base_rate_non_eur: 100, tax_non_eur: 20, ...rates } })

  it('a row with no periods and guide_rate null: the guide pays fare + tax (120), not 0', async () => {
    setMockTables(tripWith(flightDays()))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 120, notes: 'Customer fare (no guide fare entered)' })
  })

  // Both shapes the period reader may hand back for a blank — null kept (the
  // Accommodation fix to rate-seasons) or 0 (today) — must price the same.
  for (const [shape, rates] of [
    ['stored null', { guide_rate: null }],
    ['absent (built by 20261025 with nulls stripped)', {}],
    ['blank string', { guide_rate: '' }],
  ] as const) {
    it(`a period whose guide fare is ${shape}: the customer fare`, async () => {
      setMockTables(tripWith(flightDays(), { flight_rates: [flightRow({ guide_rate: 0, seasons: [period(rates)] })] }))
      const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-05-01', guideMode: 'throughout' })
      expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 120 })
    })
  }

  it('a guide fare entered as 0 is a free seat; a number is that number', async () => {
    setMockTables(tripWith(flightDays(), { flight_rates: [flightRow({ seasons: [period({ guide_rate: 0 })] })] }))
    let r = await calculateAutoPricing({ ...BASE, travelDate: '2026-05-01', guideMode: 'throughout' })
    expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 0, notes: 'Guide fare' })
    setMockTables(tripWith(flightDays(), { flight_rates: [flightRow({ seasons: [period({ guide_rate: 45 })] })] }))
    r = await calculateAutoPricing({ ...BASE, travelDate: '2026-05-01', guideMode: 'throughout' })
    expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 45 })
  })

  it('the reader takes the RAW period, whatever the sanitizer turns a blank into', () => {
    const row = { guide_rate: 0, seasons: [{ from: '2026-07-01', to: '2026-12-31', rates: { guide_rate: 30 } }, { from: '2026-01-01', to: '2026-06-30', rates: { guide_rate: null } }] }
    // The sanitizer sorts, and today writes 0 for the blank.
    const [first, second] = sanitizeSeasons(row.seasons, 'flight')!
    expect(flightGuideFare(row, first)).toBeNull()
    expect(flightGuideFare(row, second)).toBe(30)
    // Date-less (the grid): the first period by date.
    expect(flightGuideFare(row)).toBeNull()
    // No periods: the column. Seasons as a JSON string are read too.
    expect(flightGuideFare({ guide_rate: null })).toBeNull()
    expect(flightGuideFare({ guide_rate: '25' })).toBe(25)
    expect(flightGuideFare({ seasons: JSON.stringify(row.seasons) }, first)).toBeNull()
    expect([enteredFare(''), enteredFare(undefined), enteredFare(0), enteredFare('-3')]).toEqual([null, null, 0, null])
  })

  it('a save keeps a blank guide fare blank (null) instead of the sanitizer’s 0', () => {
    const raw = [{ from: '2026-01-01', to: '2026-06-30', rates: { base_rate_eur: 100 } }, { from: '2026-07-01', to: '2026-12-31', rates: { base_rate_eur: 120, guide_rate: 0 } }]
    const kept = keepBlankGuideFares(raw, sanitizeSeasons(raw, 'flight'))!
    expect(kept.map(p => p.rates.guide_rate)).toEqual([null, 0])
  })
})

// ============================================
// F3 — a period with no fare
// ============================================
describe('F3: a flight period with a blank fare is a hole, not a ticket at 0', () => {
  it('the leg is unpriced, says why, and adds nothing', async () => {
    const seasons = [
      { name: 'Low', from: '2026-01-01', to: '2026-06-30', rates: { base_rate_eur: 100, tax_eur: 20 } },
      // Saved blank: the sanitizer stores 0.
      { name: 'High', from: '2026-07-01', to: '2026-12-31', rates: { base_rate_eur: 0, tax_eur: 25 } },
    ]
    setMockTables(tripWith(flightDays(), { flight_rates: [flightRow({ seasons })] }))
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-08-01' })
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unpriced: true, unitCost: 0, lineTotal: 0 })
    const hole = holesFor(r, 'flight_rates')[0]
    expect(hole).toMatchObject({ reason: 'unpriced' })
    expect(hole.message).toMatch(/no price in the period covering 2026-08-02/)

    setMockTables(tripWith(flightDays(), { flight_rates: [flightRow({ seasons })] }))
    const low = await calculateAutoPricing({ ...BASE, travelDate: '2026-03-01' })
    expect(line(low, 'day2-ticket-flight')).toMatchObject({ unitCost: 120 })
  })
})

// ============================================
// R1 — day trains
// ============================================
describe('R1: a train fare of 0 or blank is a hole; a blank guide fare is the customer fare', () => {
  for (const fare of [0, null]) {
    it(`rate_eur ${fare}: unpriced, named`, async () => {
      setMockTables(tripWith(trainDays(), { train_rates: [{ id: 'tr-1', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', rate_eur: fare, is_active: true }] }))
      const r = await calculateAutoPricing(BASE)
      expect(line(r, 'day2-ticket-train')).toMatchObject({ unpriced: true, unitCost: 0 })
      expect(holesFor(r, 'train_rates')[0]).toMatchObject({ reason: 'unpriced' })
    })
  }

  it('guide fare blank (‘’ or null) → the customer fare; entered → that fare', async () => {
    for (const [guide, expected] of [['', 75], [null, 75], [30, 30], [0, 0]] as const) {
      setMockTables(tripWith(trainDays(), { train_rates: [{ id: 'tr-1', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', rate_eur: 75, guide_rate: guide, is_active: true }] }))
      const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
      expect(line(r, 'day2-guide-ticket'), `guide_rate ${JSON.stringify(guide)}`).toMatchObject({ unitCost: expected })
    }
  })
})

// ============================================
// T1 — duplicates and validity
// ============================================
describe('T1: two rows for one service are picked in a FIXED order, validity honoured', () => {
  const v = (rate: number) => [{ key: 'sedan', rate_eur: rate, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }]
  const row = (id: string, rate: number, over: Record<string, unknown> = {}) => ({
    id, service_code: `CAI-APT-${id}`, service_type: 'airport_transfer', city: 'Cairo', duration: null, area: null,
    vehicles: v(rate), is_active: true, rate_valid_from: '2026-01-01', rate_valid_to: '2099-12-31', ...over,
  }) as any
  const find = (rows: any[], on?: string) => findTransportRate(transportCacheFromRows(rows, on), {
    serviceType: 'airport_transfer', city: 'Cairo', duration: 'one_way', area: null as any, pax: 2,
  })

  it('the same answer whatever order the rows arrive in', () => {
    const a = row('a', 30)
    const b = row('b', 45)
    expect(find([a, b])?.base_rate_eur).toBe(find([b, a])?.base_rate_eur)
    expect(find([a, b])?.id).toBe('a') // same start date → service code order
  })

  it('a rate whose window has ended does not price; next year’s takes over on its first day', () => {
    const thisYear = row('this', 30, { rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' })
    const nextYear = row('next', 36, { rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' })
    expect(find([nextYear, thisYear], '2026-11-10')?.base_rate_eur).toBe(30)
    expect(find([thisYear, nextYear], '2027-01-01')?.base_rate_eur).toBe(36)
    expect(find([thisYear], '2027-03-01')).toBeNull()
  })

  it('an open-ended row and a newer contract over it: the newer one wins where both are valid', () => {
    const open = row('open', 30, { rate_valid_from: '2026-01-01', rate_valid_to: '2099-12-31' })
    const newer = row('newer', 40, { rate_valid_from: '2027-01-01', rate_valid_to: '2099-12-31' })
    expect(find([open, newer], '2027-02-01')?.base_rate_eur).toBe(40)
    expect(find([open, newer], '2026-02-01')?.base_rate_eur).toBe(30)
    expect(orderTransportRows([open, newer], '2026-02-01').map(r => r.id)).toEqual(['open'])
  })

  it('the engine prices each day among the rows valid THAT day', async () => {
    const t = tripWith([day(1, 'Cairo', { services: { airport_arrival: true } }), day(2, 'Cairo')])
    t.transportation_rates = (t.transportation_rates ?? []).filter((r: any) => !(r.service_type === 'airport_transfer' && /cairo/i.test(r.city ?? '')))
    t.transportation_rates.push(
      row('this', 30, { rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31', org_id: 'org-1' }),
      row('next', 36, { rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31', org_id: 'org-1' }),
    )
    setMockTables(t)
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-31' })
    const transfer = (r.services ?? []).find((s: any) => s.dayNumber === 1 && s.rateSource === 'transportation_rates')
    expect(transfer?.unitCost).toBe(30)
  })
})

// ============================================
// T3 — a group bigger than every vehicle
// ============================================
describe('T3: a group bigger than the largest vehicle rides in several, priced as several', () => {
  const sedanMinivan = { vehicles: [
    { key: 'sedan', rate_eur: 30, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
    { key: 'minivan', rate_eur: 50, rate_non_eur: 55, capacity_min: 3, capacity_max: 7 },
  ] }

  it('12 people on a sedan + minivan row: two minivans, at two minivans’ price', () => {
    const band = vehicleRateForPax(sedanMinivan, 12)
    expect(band).toMatchObject({ key: 'minivan', count: 2, rate_eur: 100, rate_non_eur: 110, unit_rate_eur: 50 })
    expect(vehicleRateForPax(sedanMinivan, 7)).toMatchObject({ key: 'minivan', count: 1, rate_eur: 50 })
    expect(vehicleRateForPax(sedanMinivan, 15)).toMatchObject({ count: 3, rate_eur: 150 })
  })

  it('the chooser says how many; the key alone stays the vehicle kind', () => {
    const bands = [{ key: 'sedan', min_pax: 1, max_pax: 2 }, { key: 'minivan', min_pax: 3, max_pax: 7 }]
    expect(vehicleFleetForPax(bands, 2)).toEqual({ key: 'sedan', count: 1 })
    expect(vehicleFleetForPax(bands, 8)).toEqual({ key: 'minivan', count: 2 })
    expect(vehicleForPax(bands, 8)).toBe('minivan')
  })

  it('the engine’s transport lookup prices the fleet and names it', () => {
    const cache = transportCacheFromRows([{ id: 'r', service_code: 'LXR-APT', service_type: 'airport_transfer', city: 'Luxor', is_active: true, ...sedanMinivan } as any])
    const hit = findTransportRate(cache, { serviceType: 'airport_transfer', city: 'Luxor', duration: 'one_way', area: null as any, pax: 12 })
    expect(hit).toMatchObject({ base_rate_eur: 100, vehicle_type: '2 × Minivan' })
  })
})

// ============================================
// A1 — airport assistance
// ============================================
describe('A1: airport assistance by service type and tier, in a fixed order', () => {
  const rows = [
    { id: 'vip', airport_code: 'CAI', service_type: 'vip_service', direction: 'arrival', rate_eur: 90 },
    { id: 'mg-both', airport_code: 'CAI', service_type: 'meet_greet', direction: 'both', rate_eur: 30 },
    { id: 'mg-arr', airport_code: 'CAI', service_type: 'meet_greet', direction: 'arrival', rate_eur: 25 },
    { id: 'mg-dep-unpriced', airport_code: 'CAI', service_type: 'meet_greet', direction: 'departure', rate_eur: null },
  ]

  it('a standard trip gets Meet & Greet, never the VIP row, in any fetch order', () => {
    expect(pickAirportServiceRow(rows, 'CAI', 'arrival', 'standard')?.id).toBe('mg-arr')
    expect(pickAirportServiceRow([...rows].reverse(), 'cai', 'arrival', 'standard')?.id).toBe('mg-arr')
  })

  it('a luxury trip gets VIP Service when there is one', () => {
    expect(pickAirportServiceRow(rows, 'CAI', 'arrival', 'luxury')?.id).toBe('vip')
    expect(pickAirportServiceRow(rows, 'CAI', 'departure', 'luxury')?.id).toBe('mg-both')
  })

  it('a priced row wins over an unpriced one; an exact direction over Both', () => {
    expect(pickAirportServiceRow(rows, 'CAI', 'departure', 'standard')?.id).toBe('mg-both')
    expect(pickAirportServiceRow([rows[3]], 'CAI', 'departure', 'standard')?.id).toBe('mg-dep-unpriced')
  })

  it('a VIP-only airport is not offered to a standard trip', () => {
    expect(pickAirportServiceRow([rows[0]], 'CAI', 'arrival', 'standard')).toBeNull()
  })

  it('the engine charges the Meet & Greet on a standard arrival with a VIP row listed first', async () => {
    const t = tripWith([day(1, 'Cairo', { services: { airport_arrival: true } }), day(2, 'Cairo')])
    t.airport_staff_rates = rows.map(r => ({ ...r, is_active: true, org_id: 'org-1' }))
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-airport-arrival')).toMatchObject({ unitCost: 25 })
  })
})
