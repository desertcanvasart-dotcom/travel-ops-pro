// A day's travel is a ticket AND road, not a ticket OR road.
//
// The operator (2026-09-16): on a flying day "both flight and road should be
// selected and backed by the pricing engine". The engine already priced a
// flight day as the ticket plus both airport transfers; the picker drew Road as
// Flight's alternative. Road is now its own toggle, and these pin what each
// combination prices — plus the double charge found on the way (a road
// intercity the morning after a sleeping train) and cruise boarding/leaving
// assistance, which the calculator's engine never priced at all.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, determineTransportNeeds, parseItinerary } from '@/lib/auto-pricing-service'
import { defaultRoadTransfers, storedRoadTransfers } from '@/components/TravelLegPicker'

const svc = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }
const day = (n: number, city: string, extra: Record<string, unknown> = {}) =>
  ({ day: n, title: city, city, overnight_city: city, accommodation_type: 'hotel', meals: [], attractions: [], services: { ...svc }, ...extra })

/** The transport needs of every day, as service types. */
function needs(raw: Record<string, unknown>[]) {
  const days = parseItinerary([...raw, day(raw.length + 1, String(raw[raw.length - 1].city), { accommodation_type: 'none' })])
  return days.slice(0, raw.length).map((d, i) =>
    determineTransportNeeds(d, days[i - 1] ?? null, days[i + 1] ?? null).map(n => `${n.serviceType}${n.city ? `@${n.city}` : ''}`))
}

describe('the road default for each mode', () => {
  it('is on for road and flight days, off for trains', () => {
    expect(defaultRoadTransfers(undefined)).toBe(true)
    expect(defaultRoadTransfers('flight')).toBe(true)
    expect(defaultRoadTransfers('train')).toBe(false)
    expect(defaultRoadTransfers('sleeping_train')).toBe(false)
  })

  it('stores nothing when the choice is the default, so the default can evolve', () => {
    expect(storedRoadTransfers('flight', true)).toBeUndefined()
    expect(storedRoadTransfers('flight', false)).toBe(false)
    expect(storedRoadTransfers('train', true)).toBe(true)
    expect(storedRoadTransfers(undefined, false)).toBe(false)
  })
})

describe('flight days', () => {
  it('flight with road (the default) is the ticket and both airport transfers', () => {
    const [, d2] = needs([day(1, 'Aswan'), day(2, 'Cairo', { transport_type: 'flight' })])
    expect(d2).toEqual(['airport_transfer@Aswan', 'airport_transfer'])
  })

  it('flight WITHOUT road prices no transfers at all', () => {
    const [, d2] = needs([day(1, 'Aswan'), day(2, 'Cairo', { transport_type: 'flight', road_transfers: false })])
    expect(d2).toEqual([])
  })
})

describe('train days', () => {
  it('a day train alone (the default) has no station transfers — unchanged', () => {
    const [, d2] = needs([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })])
    expect(d2).toEqual([])
  })

  it('a day train with road adds a transfer to the station and one from it', () => {
    const [, d2] = needs([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train', road_transfers: true })])
    expect(d2).toEqual(['city_transfer@Cairo', 'city_transfer'])
  })

  it('a sleeping train with road: to the station tonight, from it on arrival', () => {
    // Day 1 is the arrival day (always an airport transfer), so the sleeper
    // boards on day 2.
    const [, d2, d3] = needs([
      day(1, 'Cairo'),
      day(2, 'Cairo', { transport_type: 'sleeping_train', road_transfers: true }),
      day(3, 'Aswan'),
    ])
    expect(d2).toEqual(['city_transfer'])
    expect(d3).toEqual(['city_transfer'])
  })
})

describe('the morning after a sleeping train', () => {
  it('is NOT a road intercity for the journey the sleeper already made', () => {
    const [, d2] = needs([day(1, 'Cairo', { transport_type: 'sleeping_train' }), day(2, 'Aswan')])
    expect(d2.some(t => t.startsWith('intercity'))).toBe(false)
  })
})

describe('road off on a day with no ticket', () => {
  it('means no road vehicle that day', () => {
    const [d1] = needs([day(1, 'Luxor', { attractions: ['Karnak Temple'], road_transfers: false })])
    expect(d1).toEqual([])
  })

  it('keeps an explicit extra', () => {
    // Built directly: parseItinerary does not read `extras` from template JSON
    // (no programme in production carries any), so this is the engine rule alone.
    const [parsed] = parseItinerary([day(1, 'Luxor', { road_transfers: false }), day(2, 'Luxor', { accommodation_type: 'none' })])
    const withExtra = { ...parsed, extras: ['sound_light' as const] }
    expect(determineTransportNeeds(withExtra, null, null).map(n => n.serviceType)).toEqual(['sound_light'])
  })
})

describe('cruise boarding and leaving', () => {
  const cruiseDays = [
    day(1, 'Cairo'),
    day(2, 'Luxor', { accommodation_type: 'cruise', is_cruise_day: true }),
    day(3, 'Aswan', { accommodation_type: 'cruise', is_cruise_day: true }),
    day(4, 'Abu Simbel'),
    day(5, 'Cairo', { accommodation_type: 'none' }),
  ]

  it('boarding is the first night aboard, leaving the first day ashore', () => {
    const d = parseItinerary(cruiseDays)
    expect(d.map(x => Boolean(x.services.cruise_embark))).toEqual([false, true, false, false, false])
    expect(d.map(x => Boolean(x.services.cruise_disembark))).toEqual([false, false, false, true, false])
  })

  it('a day that says otherwise wins', () => {
    const edited = cruiseDays.map((x, i) => i === 1 ? { ...x, services: { ...svc, cruise_embark: false } } : x)
    expect(parseItinerary(edited)[1].services.cruise_embark).toBe(false)
  })

  describe('in the price', () => {
    beforeEach(() => {
      const t = fullRateTables()
      t.tour_templates = [{ ...t.tour_templates[0], duration_days: 5, itinerary: cruiseDays }]
      setMockTables(t)
    })

    it('boarding and leaving are priced at the hotel check-in and check-out assistance rates', async () => {
      const r = await calculateDayBasedPricing({ templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: true })
      expect(r.services.find(s => s.id === 'day2-cruise-embark')).toMatchObject({ serviceName: 'Cruise Embarkation Assistance', unitCost: 20, isPerPax: false })
      expect(r.services.find(s => s.id === 'day4-cruise-disembark')).toMatchObject({ serviceName: 'Cruise Disembarkation Assistance', unitCost: 20 })
    })

    it('with no assistance rate at all, each is listed at 0 with a hole', async () => {
      const t = fullRateTables()
      t.tour_templates = [{ ...t.tour_templates[0], duration_days: 5, itinerary: cruiseDays }]
      t.hotel_staff_rates = []
      setMockTables(t)
      const r = await calculateDayBasedPricing({ templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: true })
      expect(r.services.find(s => s.id === 'day2-cruise-embark')).toMatchObject({ unpriced: true, lineTotal: 0 })
      expect(r.holes.some(h => h.kind === 'hotel_service' && /embarkation/.test(h.message))).toBe(true)
    })
  })
})

describe('one boarding or leaving event is charged once', () => {
  // Review of #447: the first and last days of a trip are FORCED to hotel
  // check-in and check-out. When the first night is aboard, or the last day is
  // spent leaving the ship, that forced hotel line and the cruise line are the
  // same event — and both priced at the same assistance rate.
  const priceDays = async (itinerary: Record<string, unknown>[]) => {
    const t = fullRateTables()
    t.tour_templates = [{ ...t.tour_templates[0], duration_days: itinerary.length, itinerary }]
    setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: true })
  }
  const ids = (r: Awaited<ReturnType<typeof priceDays>>, n: number) =>
    r.services.filter(s => s.dayNumber === n).map(s => s.id)

  it('a trip that starts aboard charges embarkation, not also a hotel check-in', async () => {
    const r = await priceDays([
      day(1, 'Luxor', { accommodation_type: 'cruise', is_cruise_day: true }),
      day(2, 'Aswan', { accommodation_type: 'cruise', is_cruise_day: true }),
      day(3, 'Cairo'),
      day(4, 'Cairo', { accommodation_type: 'none' }),
    ])
    expect(ids(r, 1)).toContain('day1-cruise-embark')
    expect(ids(r, 1)).not.toContain('day1-hotel-checkin')
  })

  it('a trip that ends leaving the ship charges disembarkation, not also a hotel check-out', async () => {
    const r = await priceDays([
      day(1, 'Cairo'),
      day(2, 'Luxor', { accommodation_type: 'cruise', is_cruise_day: true }),
      day(3, 'Aswan', { accommodation_type: 'none' }),
    ])
    expect(ids(r, 3)).toContain('day3-cruise-disembark')
    expect(ids(r, 3)).not.toContain('day3-hotel-checkout')
  })

  it('leaving the ship and checking into a hotel the same day are two events, both charged', async () => {
    const r = await priceDays([
      day(1, 'Cairo'),
      day(2, 'Luxor', { accommodation_type: 'cruise', is_cruise_day: true }),
      day(3, 'Abu Simbel', { services: { ...svc, hotel_checkin: true } }),
      day(4, 'Cairo', { accommodation_type: 'none' }),
    ])
    expect(ids(r, 3)).toContain('day3-cruise-disembark')
    expect(ids(r, 3)).toContain('day3-hotel-checkin')
  })
})
