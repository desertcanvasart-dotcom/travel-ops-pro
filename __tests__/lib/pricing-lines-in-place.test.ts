// A service the rates cannot price is LISTED on its day at 0 — never dropped.
//
// NMS803-CR-ABS priced short (operator, 2026-09-16): hotel nights, transfers
// and every lunch and dinner were missing from the total, and the breakdown
// gave no sign of it on the days concerned. These pin the engine side of the
// fix: gaps stay in place, meals ticked in the calculator actually price, the
// cruise is one line per night, and no road rate is borrowed from another city.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import {
  calculateDayBasedPricing,
  findTransportRate,
  mealsFromTicks,
  inferAccommodationType,
  parseItinerary,
} from '@/lib/auto-pricing-service'

const services = (flags: Partial<Record<string, boolean>> = {}) => ({
  airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false, ...flags,
})

/** Cruise, then a night in a city with no hotel rate, then Cairo. Meals in the
 *  list format — the only one the calculator writes. */
function cruiseThenHotelTables() {
  const tables = fullRateTables()
  tables.tour_templates = [{
    ...tables.tour_templates[0],
    duration_days: 5,
    itinerary: [
      { day: 1, title: 'Luxor embarkation', city: 'Luxor', overnight_city: 'Luxor', accommodation_type: 'cruise', is_cruise_day: true, meals: ['lunch', 'dinner'], attractions: [], services: services() },
      { day: 2, title: 'Sailing to Aswan', city: 'Aswan', overnight_city: 'Aswan', accommodation_type: 'cruise', is_cruise_day: true, meals: ['breakfast', 'lunch', 'dinner'], attractions: [], services: services() },
      { day: 3, title: 'Abu Simbel', city: 'Abu Simbel', overnight_city: 'Abu Simbel', accommodation_type: 'hotel', meals: ['breakfast', 'lunch', 'dinner'], attractions: [], services: services() },
      { day: 4, title: 'Cairo', city: 'Cairo', overnight_city: 'Cairo', accommodation_type: 'hotel', meals: ['breakfast', 'lunch'], attractions: [], services: services() },
      { day: 5, title: 'Departure', city: 'Cairo', accommodation_type: 'none', meals: ['breakfast'], attractions: [], services: services() },
    ],
  }]
  return tables
}

const price = () => calculateDayBasedPricing({ templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: true })
const lineOn = (r: Awaited<ReturnType<typeof price>>, id: string) => r.services.find(s => s.id === id)

describe('a service with no rate stays on its day', () => {
  beforeEach(() => setMockTables(cruiseThenHotelTables()))

  it('lists the hotel night with no rate at 0, in place, and marks the price incomplete', async () => {
    const r = await price()
    const night = lineOn(r, 'day3-hotel')
    expect(night, 'the Abu Simbel night must be listed, not dropped').toBeDefined()
    expect(night!.unpriced).toBe(true)
    expect(night!.lineTotal).toBe(0)
    expect(night!.issue).toMatch(/Abu Simbel/)
    expect(r.complete).toBe(false)
    expect(r.holes.some(h => h.kind === 'hotel' && h.dayNumber === 3)).toBe(true)
  })

  it('still prices the night that HAS a rate', async () => {
    const r = await price()
    const cairo = lineOn(r, 'day4-hotel')
    expect(cairo?.unpriced).toBeFalsy()
    expect(cairo?.lineTotal).toBe(85)
  })

  it('lists every night aboard on its own day when there is no ship for the tier', async () => {
    const r = await price()
    for (const day of [1, 2]) {
      const night = lineOn(r, `day${day}-cruise`)
      expect(night, `cruise night on day ${day}`).toBeDefined()
      expect(night!.unpriced).toBe(true)
    }
    // One hole for the missing ship, not one per night.
    expect(r.holes.filter(h => h.kind === 'cruise')).toHaveLength(1)
  })

  it('a listed gap adds nothing to the money', async () => {
    const r = await price()
    const zeroLines = r.services.filter(s => s.unpriced || s.included)
    expect(zeroLines.length).toBeGreaterThan(0)
    expect(zeroLines.every(s => s.lineTotal === 0 && s.unitCost === 0)).toBe(true)
  })
})

describe('meals ticked in the calculator', () => {
  beforeEach(() => setMockTables(cruiseThenHotelTables()))

  it('a ticked lunch and dinner on a hotel day price from the meal rates', async () => {
    const r = await price()
    expect(lineOn(r, 'day3-lunch')?.lineTotal).toBe(30)
    expect(lineOn(r, 'day3-dinner')?.lineTotal).toBe(40)
  })

  it('meals aboard are included in the cabin, and listed as such', async () => {
    const r = await price()
    for (const id of ['day1-lunch', 'day1-dinner', 'day2-breakfast', 'day2-lunch']) {
      const meal = lineOn(r, id)
      expect(meal, id).toBeDefined()
      expect(meal!.included).toBe(true)
      expect(meal!.lineTotal).toBe(0)
    }
  })

  it('breakfast is in the hotel rate, not bought', async () => {
    const r = await price()
    expect(lineOn(r, 'day4-breakfast')?.included).toBe(true)
  })

  it('a tier with lunch but no dinner rate lists each dinner in red, with ONE hole', async () => {
    const tables = cruiseThenHotelTables()
    tables.meal_rates = tables.meal_rates.map((m: any) => ({ ...m, dinner_rate_eur: 0 }))
    setMockTables(tables)
    const r = await price()
    const dinner = lineOn(r, 'day3-dinner')
    expect(dinner?.unpriced).toBe(true)
    expect(dinner?.lineTotal).toBe(0)
    expect(r.holes.filter(h => h.kind === 'meal')).toHaveLength(1)
    // Lunch still prices.
    expect(lineOn(r, 'day3-lunch')?.lineTotal).toBe(30)
  })
})

describe('a blank rate is not a price', () => {
  it('a hotel row with no per-person double lists the night as unpriced, not 0.00 priced', async () => {
    const tables = cruiseThenHotelTables()
    tables.accommodation_rates = tables.accommodation_rates.map((row: any) => ({ ...row, pp_double_eur: null, pp_double_non_eur: null }))
    setMockTables(tables)
    const r = await price()
    const night = lineOn(r, 'day4-hotel')
    expect(night?.unpriced).toBe(true)
    expect(r.holes.some(h => h.kind === 'hotel' && h.reason === 'unpriced' && h.dayNumber === 4)).toBe(true)
  })
})

describe('mealsFromTicks', () => {
  const ticks = (...m: string[]) => new Set(m)

  it('lunch and dinner ashore are bought; breakfast is in the room', () => {
    expect(mealsFromTicks(ticks('breakfast', 'lunch', 'dinner'), { aboard: false, supplements: [] }))
      .toEqual({ breakfast: 'included', lunch: 'external', dinner: 'external' })
  })

  it('everything aboard is in the cabin', () => {
    expect(mealsFromTicks(ticks('breakfast', 'lunch', 'dinner'), { aboard: true, supplements: [] }))
      .toEqual({ breakfast: 'included', lunch: 'included', dinner: 'included' })
  })

  it('half board covers dinner, full board covers lunch and dinner', () => {
    expect(mealsFromTicks(ticks('lunch', 'dinner'), { aboard: false, supplements: ['half_board'] }))
      .toEqual({ breakfast: 'none', lunch: 'external', dinner: 'included' })
    expect(mealsFromTicks(ticks('lunch', 'dinner'), { aboard: false, supplements: ['full_board'] }))
      .toEqual({ breakfast: 'none', lunch: 'included', dinner: 'included' })
  })

  it('an unticked meal is none', () => {
    expect(mealsFromTicks(ticks(), { aboard: false, supplements: [] }))
      .toEqual({ breakfast: 'none', lunch: 'none', dinner: 'none' })
  })

  it('parseItinerary applies it to the list format the calculator writes', () => {
    const [day] = parseItinerary([{ day: 1, title: 'Cairo', city: 'Cairo', accommodation_type: 'hotel', meals: ['breakfast', 'lunch'], services: services() }, { day: 2, title: 'Departure', city: 'Cairo' }])
    expect(day.meals).toEqual({ breakfast: 'included', lunch: 'external', dinner: 'none' })
  })
})

describe('inferAccommodationType only trusts the day\'s own words', () => {
  it('an unmarked night on a programme that mentions a cruise elsewhere is a hotel night', () => {
    expect(inferAccommodationType({ title: 'Cairo', description: 'Pyramids of Giza' }, [{ title: 'Nile cruise' }])).toBe('hotel')
  })

  it('disembarking sleeps ashore, even though "disembark" contains "embark"', () => {
    expect(inferAccommodationType({ title: 'Disembark in Aswan, fly to Cairo' })).toBe('hotel')
  })

  it('a day that says it is aboard is still a cruise night', () => {
    expect(inferAccommodationType({ title: 'Sailing to Edfu aboard the ship' })).toBe('cruise')
  })

  it('an explicit type always wins', () => {
    expect(inferAccommodationType({ title: 'Nile cruise', accommodation_type: 'hotel' })).toBe('hotel')
  })
})

describe('findTransportRate never borrows another city\'s rate', () => {
  const record = { id: 'luxor-intercity', service_type: 'intercity', city: 'luxor', base_rate_eur: 40 } as any
  const cache = new Map([['intercity|luxor|one_way|', record]])

  it('an Aswan → Cairo road leg with no rate of its own is not priced from Luxor', () => {
    const hit = findTransportRate(cache, {
      serviceType: 'intercity', city: 'Cairo', duration: 'one_way', area: null as any, pax: 2,
      originCity: 'Aswan', destinationCity: 'Cairo',
    })
    expect(hit).toBeNull()
  })

  it('a leg in the city that has the rate still finds it', () => {
    const hit = findTransportRate(cache, { serviceType: 'intercity', city: 'Luxor', duration: 'one_way', area: null as any, pax: 2 })
    expect(hit?.id).toBe('luxor-intercity')
  })
})
