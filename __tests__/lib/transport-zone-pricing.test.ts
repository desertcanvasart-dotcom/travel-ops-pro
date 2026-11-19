// Transport priced by the hotel's area and by the sights a rate covers
// (transport zones step 4; ported from autoura-saas #833).
//
//   OLD: one rate per city for a lookup; a rate in another area of the city
//        was left out (step 3), and sights were not looked at.
//   NEW: the pickup area is the area of the guests' hotel in that city; a
//        rate answers only its own area (the default area = no area); a
//        missing area rate is a GAP naming the area, never the city price.
//        Among rates that list sights, the smallest covering the day wins;
//        none covers → a gap naming the sights.
import { vi, describe, it, expect } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, transportCacheFromRows, findTransportRateExplained } from '@/lib/auto-pricing-service'
import { pickupZoneFor, ratesForSights } from '@/lib/pricing/transport-zone'

describe('pickupZoneFor: which hotel decides the area', () => {
  const hotelZone = (city: string) => (city === 'Luxor' ? 'west_bank' : null)
  const days = [
    { city: 'Cairo', accommodation_type: 'hotel' },
    { city: 'Luxor', accommodation_type: 'hotel' },            // arriving at the Luxor hotel
    { city: 'Luxor', accommodation_type: 'hotel' },            // a day out from it
    { city: 'Aswan', accommodation_type: 'cruise' },
    { city: 'Aswan', accommodation_type: 'cruise', pickup_zone: 'south' },
  ]
  it("tonight's or last night's hotel in the city", () => {
    expect(pickupZoneFor(days, 1, 'Luxor', hotelZone)).toBe('west_bank')
    expect(pickupZoneFor(days, 2, 'Luxor', hotelZone)).toBe('west_bank')
  })
  it('no hotel night in the city: the default (null)', () => {
    expect(pickupZoneFor(days, 3, 'Aswan', hotelZone)).toBeNull()
  })
  it('a day states its own area (a cruise day)', () => {
    expect(pickupZoneFor(days, 4, 'Aswan', hotelZone)).toBe('south')
  })
  it('a day trip: the hotel is where they sleep', () => {
    const trip = [{ city: 'Luxor', overnight_city: 'Luxor', accommodation_type: 'hotel' }, { city: 'Dendera', overnight_city: 'Luxor', accommodation_type: 'hotel' }]
    expect(pickupZoneFor(trip, 1, 'Luxor', hotelZone)).toBe('west_bank')
    expect(pickupZoneFor(trip, 1, 'Dendera', hotelZone)).toBeNull()
  })
})

describe('ratesForSights: the smallest covering rate', () => {
  const east = { id: 'east', covers_sights: ['Karnak Temple', 'Luxor Temple'] }
  const both = { id: 'both', covers_sights: ['Karnak Temple', 'Luxor Temple', 'Valley of the Kings'] }
  const plain = { id: 'plain', covers_sights: [] as string[] }
  it('Karnak alone → East Bank; Karnak + Valley → both banks', () => {
    expect(ratesForSights([east, both], ['karnak temple'])).toEqual({ kind: 'pool', rates: [east] })
    expect(ratesForSights([east, both], ['Karnak Temple', 'Valley of the Kings'])).toEqual({ kind: 'pool', rates: [both] })
  })
  it('none covers: the rates that list no sights; none of those either: uncovered', () => {
    expect(ratesForSights([east, plain], ['Dendera Temple'])).toEqual({ kind: 'pool', rates: [plain] })
    expect(ratesForSights([east, both], ['Dendera Temple'])).toEqual({ kind: 'uncovered', rates: [east, both] })
  })
  it('a day with no sights is a transfer: the plain rates', () => {
    expect(ratesForSights([east, plain], [])).toEqual({ kind: 'pool', rates: [plain] })
  })
})

// ---------------------------------------------------------------------------
// The lookup alone.
// ---------------------------------------------------------------------------
const v = (rate: number) => [{ key: 'sedan', rate_eur: rate, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }]
const row = (id: string, rate: number, over: Record<string, unknown> = {}) => ({
  id, service_code: `LXR-${id}`, service_type: 'day_tour', city: 'Luxor', duration: 'full_day', area: null,
  vehicles: v(rate), is_active: true, rate_valid_from: '2026-01-01', rate_valid_to: '2099-12-31',
  supplier_id: 'sup-nile', supplier_name: 'Nile Cars', route_name: id, zone: null, covers_sights: [], org_id: 'org-1', ...over,
}) as any
const lookup = (rows: any[], extra: Record<string, unknown> = {}) => findTransportRateExplained(transportCacheFromRows(rows, '2026-12-01'), {
  serviceType: 'day_tour', city: 'Luxor', duration: 'full_day', area: null as any, pax: 2, ...extra,
})

describe('the lookup', () => {
  const city = row('city', 50)
  const west = row('west', 65, { zone: 'west_bank' })
  it('no area asked: the city rate, as before; the West Bank rate never competes', () => {
    expect(lookup([city, west]).rate?.id).toBe('city')
    expect(lookup([city, west]).cheapestOf).toBeUndefined()
  })
  it('a West Bank hotel: the West Bank rate', () => {
    expect(lookup([city, west], { zone: 'west_bank' }).rate?.id).toBe('west')
  })
  it('a West Bank hotel and no West Bank rate: no rate (a gap), never the city price', () => {
    expect(lookup([city], { zone: 'west_bank' }).rate).toBeNull()
  })
  it('rates listing sights: the smallest covering one; none covers → uncovered, naming them', () => {
    const east = row('East Bank', 40, { covers_sights: ['Karnak Temple'] })
    const both = row('Both banks', 70, { covers_sights: ['Karnak Temple', 'Valley of the Kings'] })
    expect(lookup([east, both], { sights: ['Karnak Temple'] }).rate?.id).toBe('East Bank')
    expect(lookup([east, both], { sights: ['Karnak Temple', 'Valley of the Kings'] }).rate?.id).toBe('Both banks')
    const none = lookup([east, both], { sights: ['Dendera Temple'] })
    expect(none.rate).toBeNull()
    expect(none.uncovered?.sights).toEqual(['Dendera Temple'])
    expect([...(none.uncovered?.rates ?? [])].sort()).toEqual(['Both banks', 'East Bank'])
  })
})

// ---------------------------------------------------------------------------
// Through the engine.
// ---------------------------------------------------------------------------
const BASE = { orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2 }
const day = (n: number, over: Record<string, unknown> = {}) => ({
  day: n, title: `Day ${n}`, city: 'Luxor', overnight_city: 'Luxor', accommodation_type: 'hotel',
  meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, attractions: [],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
  ...over,
})
function trip(opts: { hotelZone: string | null; rates: any[]; attractions?: string[] }) {
  const t = fullRateTables() as any
  // Two days: the night of day 1 is at the Luxor hotel (a trip's last day sleeps nowhere).
  t.tour_templates[0].itinerary = [
    day(1, { transport_lines: [{ service_type: 'day_tour' }], attractions: opts.attractions ?? [] }),
    day(2, { accommodation_type: 'none', transport_lines: [] }),
  ]
  t.accommodation_rates = [{
    id: 'acc-luxor', org_id: 'org-1', tier: 'standard', is_active: true, city: 'Luxor', property_name: 'Nile Hotel',
    pp_double_eur: 80, pp_double_non_eur: 80, single_supp_eur: 40, single_supp_non_eur: 40, zone: opts.hotelZone, created_at: '2024-01-01T00:00:00Z',
  }]
  t.city_zones = [
    { id: 'z1', org_id: 'org-1', city: 'Luxor', key: 'east_bank', label: 'East Bank', is_default: true, rank: 1 },
    { id: 'z2', org_id: 'org-1', city: 'Luxor', key: 'west_bank', label: 'West Bank', is_default: false, rank: 2 },
  ]
  t.entrance_fees = [
    { id: 'ent-karnak', org_id: 'org-1', attraction_name: 'Karnak Temple', city: 'Luxor', is_active: true, eur_rate: 10, non_eur_rate: 10 },
    { id: 'ent-valley', org_id: 'org-1', attraction_name: 'Valley of the Kings', city: 'Luxor', is_active: true, eur_rate: 15, non_eur_rate: 15 },
  ]
  t.transportation_rates = opts.rates
  return t
}
const dayTransport = (r: any) => (r.services ?? []).find((s: any) => s.dayNumber === 1 && s.serviceType === 'transportation')
const dayHole = (r: any) => (r.holes ?? []).find((h: any) => h.kind === 'transport' && h.dayNumber === 1)

describe('the quote', () => {
  const city = row('City day', 50)
  const east = row('East Bank card', 55, { zone: 'east_bank' }) // set to the default area: the same as no area
  const west = row('West Bank day', 65, { zone: 'west_bank' })

  it('a hotel in the default area prices exactly as before', async () => {
    setMockTables(trip({ hotelZone: null, rates: [city, west] }))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    expect(dayTransport(r)).toMatchObject({ unitCost: 50, serviceName: 'City day' })
  })

  it('a hotel in the default area, with only a city rate, finds the city rate', async () => {
    setMockTables(trip({ hotelZone: 'east_bank', rates: [city] }))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    expect(dayTransport(r)).toMatchObject({ unitCost: 50 })
  })

  it('a rate set to the default area is the city rate', async () => {
    setMockTables(trip({ hotelZone: 'east_bank', rates: [east, west] }))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    expect(dayTransport(r)).toMatchObject({ unitCost: 55 })
  })

  it('a West Bank hotel: the West Bank rate, in the line and the money', async () => {
    setMockTables(trip({ hotelZone: 'west_bank', rates: [city, west] }))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    expect(dayTransport(r)).toMatchObject({ unitCost: 65, serviceName: 'West Bank day' })
  })

  it('a West Bank hotel and no West Bank rate: a gap naming the area, never the city price', async () => {
    setMockTables(trip({ hotelZone: 'west_bank', rates: [city] }))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    expect(dayTransport(r)).toMatchObject({ unpriced: true, lineTotal: 0 })
    expect(dayHole(r)?.message).toContain('Luxor for West Bank hotels')
    expect(dayHole(r)?.message).toContain('with that pickup area')
  })

  it("the day's sights pick the smallest covering rate; none covers → a gap naming them", async () => {
    const eastSights = row('East Bank tour', 40, { covers_sights: ['Karnak Temple'] })
    const bothSights = row('Both banks tour', 70, { covers_sights: ['Karnak Temple', 'Valley of the Kings'] })
    setMockTables(trip({ hotelZone: null, rates: [eastSights, bothSights], attractions: ['Karnak Temple'] }))
    expect(dayTransport(await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' }) as any)).toMatchObject({ unitCost: 40 })
    setMockTables(trip({ hotelZone: null, rates: [eastSights, bothSights], attractions: ['Karnak Temple', 'Valley of the Kings'] }))
    expect(dayTransport(await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' }) as any)).toMatchObject({ unitCost: 70 })
    setMockTables(trip({ hotelZone: null, rates: [eastSights], attractions: ['Valley of the Kings'] }))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    expect(dayHole(r)?.message).toContain('rate covers Valley of the Kings (rates: East Bank tour)')
  })
})
