import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import { planRoadTrips, rateTripShape, tripShapeFromName, morningPlace, rateDeparture, departureFromName } from '@/lib/pricing/road-trips'

// Operator, 2026-09-17: one road route costs differently one way, there and
// back the same day, and back the next day — and pricing found road transfers
// by one city, never by route or shape.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('the shape a rate name says (meanings confirmed by the operator)', () => {
  it.each([
    ['ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN', 'overnight_return'],
    ['MARSA-ALAM-TO-ASWAN-OVERNIGHT', 'overnight_return'],
    ['MARSA-ALAM-TO-ASWAN-OVER-DAY', 'same_day_return'],
    ['LUXOR-TO-HURGHADA-SAME-DAY', 'same_day_return'],
    ['LUXOR-TO-EDFU-RETURN', 'same_day_return'],
    ['ASWAN-TO-KOM-OMBO-ONEWAY', 'one_way'],
    ['ASWAN-TO-LUXOR-VISITS', 'one_way'],
  ])('%s → %s', (name, shape) => {
    expect(tripShapeFromName(name)).toBe(shape)
  })

  it('a stored shape wins over the name', () => {
    expect(rateTripShape({ trip_shape: 'one_way', service_code: 'X-OVERNIGHT' })).toBe('one_way')
    expect(rateTripShape({ trip_shape: null, service_code: 'X-OVERNIGHT' })).toBe('overnight_return')
  })
})

describe('a road rate whose origin column is empty is still found by its name', () => {
  it('parses the departure city from the route name', () => {
    expect(departureFromName('ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN')).toBe('Aswan')
    expect(departureFromName('MARSA-ALAM-TO-ASWAN-OVERNIGHT')).toBe('Marsa Alam')
    expect(departureFromName('SOUTH-MARSA-ALAM-ASWAN-ABU-SIMBEL')).toBe('') // no -TO-
  })

  it('rateDeparture falls back to the name only when both columns are null', () => {
    // Every transport row today has origin_city null (a form bug), so without
    // this the overnight Aswan → Abu Simbel rate is never indexed by route.
    expect(rateDeparture({ origin_city: null, city: null, route_name: 'ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN' })).toBe('Aswan')
    expect(rateDeparture({ origin_city: 'Luxor', route_name: 'ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN' })).toBe('Luxor')
    expect(rateDeparture({ city: 'Cairo' })).toBe('Cairo')
  })
})

describe('arriving at a hub by overnight train, then driving onward', () => {
  const d = (day: number, city: string, extra: Record<string, unknown> = {}) => ({ day, city, accommodation_type: 'hotel', ...extra })

  it('morningPlace uses a sleeping train\'s leg_to (Aswan), not its blank city', () => {
    const days = [
      d(2, 'Cairo'),
      { day: 3, city: '', transport_type: 'sleeping_train', leg_from: 'Cairo', leg_to: 'Aswan' },
      d(4, 'Abu Simbel', { overnight_city: 'Abu Simbel' }),
    ]
    expect(morningPlace(days, 2)).toBe('Aswan')
  })

  it('NMS801: sleeper Cairo→Aswan, then Aswan→Abu Simbel overnight-return, back to catch the Aswan→Luxor train', () => {
    const plan = planRoadTrips([
      d(2, 'Cairo'),
      { day: 3, city: '', transport_type: 'sleeping_train', leg_from: 'Cairo', leg_to: 'Aswan' },
      d(4, 'Abu Simbel', { overnight_city: 'Abu Simbel' }),
      { day: 5, city: 'Luxor', transport_type: 'train', leg_from: 'Aswan', leg_to: 'Luxor', overnight_city: 'Luxor' },
    ])
    // Day 4 (index 2): the overnight round trip out to Abu Simbel.
    expect(plan.get(2)).toEqual({ kind: 'leg', from: 'Aswan', to: 'Abu Simbel', shape: 'overnight_return' })
    // Day 5 (index 3): the drive back to Aswan is inside that return — not charged again.
    expect(plan.get(3)).toEqual({ kind: 'return_included', outDay: 4, from: 'Abu Simbel', to: 'Aswan' })
  })

  it('a sleeper with no onward drive (stays at its arrival city) still plans no road', () => {
    const plan = planRoadTrips([
      d(2, 'Cairo'),
      { day: 3, city: '', transport_type: 'sleeping_train', leg_from: 'Cairo', leg_to: 'Aswan' },
      d(4, 'Aswan', { overnight_city: 'Aswan' }),
    ])
    expect(plan.get(2)).toBeUndefined()
  })
})

describe('planRoadTrips reads the shape from the days', () => {
  const d = (day: number, city: string, extra: Record<string, unknown> = {}) => ({ day, city, accommodation_type: 'hotel', ...extra })

  it('NMS803: after the ship ends in Aswan, Aswan → Abu Simbel and back next day to fly from Aswan = overnight return', () => {
    const plan = planRoadTrips([
      d(4, 'Nile Cruise', { accommodation_type: 'cruise' }),
      d(5, 'Nile Cruise', { accommodation_type: 'cruise' }),
      d(6, 'Abu Simbel'),
      d(7, 'Cairo', { transport_type: 'flight', leg_from: 'Aswan' }),
    ], 'Aswan')
    expect(plan.get(2)).toEqual({ kind: 'leg', from: 'Aswan', to: 'Abu Simbel', shape: 'overnight_return' })
    expect(plan.get(3)).toEqual({ kind: 'return_included', outDay: 6, from: 'Abu Simbel', to: 'Aswan' })
  })

  it('without the ship\'s end port the day after a cruise starts from its label — no Aswan route is guessed', () => {
    const plan = planRoadTrips([d(5, 'Nile Cruise', { accommodation_type: 'cruise' }), d(6, 'Abu Simbel')])
    expect(plan.get(1)).toMatchObject({ from: 'Nile Cruise', to: 'Abu Simbel' })
  })

  it('a day that sleeps back where it started is a same-day return, and tomorrow starts there', () => {
    const plan = planRoadTrips([d(1, 'Cairo'), d(2, 'Alexandria', { overnight_city: 'Cairo' }), d(3, 'Cairo')])
    expect(plan.get(1)).toEqual({ kind: 'leg', from: 'Cairo', to: 'Alexandria', shape: 'same_day_return' })
    // Woke in Cairo, stays in Cairo: no transfer (it used to price Alexandria → Cairo).
    expect(plan.has(2)).toBe(false)
  })

  it('moving on is one way; a flight onward is not a drive back', () => {
    const plan = planRoadTrips([d(1, 'Luxor'), d(2, 'Aswan'), d(3, 'Cairo', { transport_type: 'flight' })])
    expect(plan.get(1)).toEqual({ kind: 'leg', from: 'Luxor', to: 'Aswan', shape: 'one_way' })
    expect(plan.has(2)).toBe(false)
  })
})

describe('pricing charges an overnight return once, by route and shape', () => {
  const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
  const trip = () => {
    const t = fullRateTables() as any
    const vehicles = t.transportation_rates[0].vehicles
    t.tour_templates[0].itinerary = [
      { day: 1, title: 'Aswan', city: 'Aswan', accommodation_type: 'hotel', attractions: [], meals: {}, services: {} },
      { day: 2, title: 'Abu Simbel', city: 'Abu Simbel', accommodation_type: 'hotel', attractions: ['Abu Simbel Temple'], meals: {}, services: {} },
      { day: 3, title: 'Aswan', city: 'Aswan', accommodation_type: 'hotel', attractions: [], meals: {}, services: {} },
      { day: 4, title: 'Departure', city: 'Aswan', accommodation_type: 'none', attractions: [], meals: {}, services: {} },
    ]
    t.tour_templates[0].duration_days = 4
    t.transportation_rates.push(
      { id: 'abs-oneway', service_code: 'ASWAN-TO-ABU-SIMBEL-ONEWAY', service_type: 'intercity_with_sightseeing', city: 'Aswan', destination_city: 'Abu Simbel', route_name: 'ASWAN-TO-ABU-SIMBEL-ONEWAY', is_active: true, base_rate_eur: 100, base_rate_non_eur: 100, vehicles: vehicles.map((v: any) => ({ ...v, rate_eur: 100, rate_non_eur: 100 })) },
      { id: 'abs-overnight', service_code: 'ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN', service_type: 'intercity_with_sightseeing', city: 'Aswan', destination_city: 'Abu Simbel', route_name: 'ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN', is_active: true, base_rate_eur: 180, base_rate_non_eur: 180, vehicles: vehicles.map((v: any) => ({ ...v, rate_eur: 180, rate_non_eur: 180 })) },
    )
    return t
  }
  const transport = (r: any, n: number) => (r.services ?? []).filter((s: any) => s.dayNumber === n && /-transport/.test(s.id))

  it('day out: the overnight-return rate (not the one-way); day back: included at 0', async () => {
    setMockTables(trip())
    const r = await calculateAutoPricing(BASE)
    expect(transport(r, 2).map((s: any) => [s.serviceName, s.unitCost])).toEqual([['ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN', 180]])
    const back = transport(r, 3)
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ unitCost: 0, included: true })
    expect(back[0].issue).toMatch(/Included in the overnight return priced on day 2/)
  })

  it('without an overnight-return rate the day out is No rate naming the shape — never the one-way price', async () => {
    const t = trip()
    t.transportation_rates = t.transportation_rates.filter((x: any) => x.id !== 'abs-overnight')
    setMockTables(t)
    const [line] = transport(await calculateAutoPricing(BASE), 2)
    expect(line).toMatchObject({ unpriced: true, unitCost: 0 })
    expect(line.issue).toMatch(/Aswan → Abu Simbel \(overnight return\)/)
  })
})

describe('every surface speaks trip shape', () => {
  it('the rate form, both rate APIs, the rate CSV and the preview carry it', () => {
    expect(readFileSync('app/rates/transportation/transportation-content.tsx', 'utf8')).toContain('data-testid="trip-shape"')
    for (const f of ['app/api/resources/transportation/route.ts', 'app/api/resources/transportation/[id]/route.ts', 'app/api/rates/transportation/route.ts']) {
      expect(readFileSync(f, 'utf8')).toContain('trip_shape: tripShapeWrite.value')
    }
    expect(readFileSync('lib/bulk-rate-service.ts', 'utf8')).toContain("colEnum('trip_shape', 'Trip Shape'")
    expect(readFileSync('app/api/b2b/transport-preview/route.ts', 'utf8')).toContain('planRoadTrips(itinerary')
  })
})

describe('review fixes (Greptile on #462)', () => {
  it('a write without a shape keeps the row\'s shape; a bad shape is refused; a new row reads its name', async () => {
    const { resolveTripShapeWrite } = await import('@/lib/pricing/road-trips')
    const road = { service_type: 'intercity_with_sightseeing' }
    expect(resolveTripShapeWrite(road, { trip_shape: 'overnight_return' })).toEqual({ ok: true, value: 'overnight_return' })
    expect(resolveTripShapeWrite(road, { trip_shape: null, service_code: 'X-SAME-DAY' })).toEqual({ ok: true, value: 'same_day_return' })
    expect(resolveTripShapeWrite({ ...road, trip_shape: 'return' }, { trip_shape: 'one_way' })).toMatchObject({ ok: false })
    expect(resolveTripShapeWrite({ ...road, service_code: 'ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN' })).toEqual({ ok: true, value: 'overnight_return' })
    expect(resolveTripShapeWrite({ service_type: 'city_tour', trip_shape: 'overnight_return' })).toEqual({ ok: true, value: null })
  })

  it('a day pinning a road transfer with the old override still rides the planned route and shape', async () => {
    const { determineTransportNeeds } = await import('@/lib/auto-pricing-service')
    const day = { day: 2, title: 'Abu Simbel', city: 'Abu Simbel', accommodation_type: 'hotel', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, attractions: [], services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }, transport: { service_type: 'intercity_with_sightseeing' } } as any
    const [need] = determineTransportNeeds(day, null, null, { road: { kind: 'leg', from: 'Aswan', to: 'Abu Simbel', shape: 'overnight_return' } })
    expect([need.originCity, need.destinationCity, need.tripShape]).toEqual(['Aswan', 'Abu Simbel', 'overnight_return'])
  })
})

