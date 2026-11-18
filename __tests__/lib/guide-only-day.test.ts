import { vi, describe, it, expect, beforeAll } from 'vitest'

// A car & guide day (autoura-saas #835): car, guide, water and the driver's
// tip for up to 8 hours, no fixed route, so no entrance tickets. Here it could
// only be built by hand (guide ticked AND transport lines set), because the
// day's vehicle came from how many sights it named. `sightseeing: 'guide_only'`
// says it once (lib/itineraries/guide-only-day).

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { parseItinerary, determineTransportNeeds } from '@/lib/auto-pricing-service'
import { dropGuideOnlyWhenSightsPicked, isGuideOnlyDay, setGuideOnly } from '@/lib/itineraries/guide-only-day'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

type Day = { sightseeing?: unknown; services?: Record<string, boolean | undefined>; [key: string]: unknown }

const none = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }

/** Arrive, the day under test, depart — so the middle day is no first/last day. */
function trip(middle: Record<string, unknown>) {
  return [
    { day: 1, title: 'Arrive Luxor', city: 'Luxor', meals: [], attractions: [], services: { ...none } },
    { day: 2, city: 'Luxor', meals: [], services: { ...none }, ...middle },
    { day: 3, title: 'Depart Luxor', city: 'Luxor', meals: [], attractions: [], services: { ...none } },
  ]
}

describe('the rule', () => {
  it('holds only while the day names no sight', () => {
    expect(isGuideOnlyDay({ sightseeing: 'guide_only' })).toBe(true)
    expect(isGuideOnlyDay({ sightseeing: 'guide_only', attractions: [] , attraction_ids: [] })).toBe(true)
    expect(isGuideOnlyDay({ sightseeing: 'guide_only', attractions: ['Karnak Temple'] })).toBe(false)
    expect(isGuideOnlyDay({ sightseeing: 'guide_only', attraction_ids: ['fee-1'] })).toBe(false)
    expect(isGuideOnlyDay({})).toBe(false)
  })
})

describe('the editor', () => {
  it('switching on ticks the guide (as by hand) and makes the empty sight list final', () => {
    const day = setGuideOnly({ attractions: [], services: { ...none }, services_set_by_hand: ['airport_arrival'] }, true)
    expect(day).toMatchObject({ sightseeing: 'guide_only', attractions_set_by_hand: true, services: { guide_required: true } })
    expect(day.services_set_by_hand).toEqual(['airport_arrival', 'guide_required'])
  })
  it('switching off removes only the mark', () => {
    const on = setGuideOnly<Day>({ services: { ...none } }, true)
    const off = setGuideOnly(on, false)
    expect(off.sightseeing).toBeUndefined()
    expect(off.services?.guide_required).toBe(true)
  })
  it('picking a sight ends a car & guide day', () => {
    const on = setGuideOnly<Day>({ services: { ...none } }, true)
    expect(dropGuideOnlyWhenSightsPicked({ ...on, attraction_ids: ['fee-1'] }).sightseeing).toBeUndefined()
    expect(dropGuideOnlyWhenSightsPicked(on).sightseeing).toBe('guide_only')
  })
})

describe('the engine', () => {
  it('a car & guide day: guide on, one full-day vehicle, no sights from the title', () => {
    const days = parseItinerary(trip({ title: 'Luxor with your guide: Karnak or the Valley of the Kings, as you like', sightseeing: 'guide_only', attractions: [] }))
    const d = days[1]
    expect(d.sightseeing).toBe('guide_only')
    expect(d.attractions).toEqual([])
    expect(d.services.guide_required).toBe(true)
    const needs = determineTransportNeeds(d, days[0], days[2])
    expect(needs).toEqual([expect.objectContaining({ serviceType: 'day_tour', duration: 'full_day' })])
  })

  it('without the mark, a day naming no sight still gets no vehicle and no guide, as before', () => {
    const days = parseItinerary(trip({ title: 'Free day in Luxor', attractions: [], attractions_set_by_hand: true }))
    expect(days[1].sightseeing).toBeUndefined()
    expect(days[1].services.guide_required).toBe(false)
    expect(determineTransportNeeds(days[1], days[0], days[2])).toEqual([])
  })

  it('a marked day that lists sights is priced from its sights, as before', () => {
    const days = parseItinerary(trip({ title: 'Karnak', sightseeing: 'guide_only', attractions: ['Karnak Temple'] }))
    expect(days[1].sightseeing).toBeUndefined()
    const needs = determineTransportNeeds(days[1], days[0], days[2])
    expect(needs).toEqual([expect.objectContaining({ serviceType: 'half_day', duration: 'half_day' })])
  })

  it('a guide unticked by hand stays unticked', () => {
    const days = parseItinerary(trip({ title: 'Luxor', sightseeing: 'guide_only', attractions: [], services_set_by_hand: ['guide_required'] }))
    expect(days[1].services.guide_required).toBe(false)
  })

  it('on the first day of a trip the guide survives the arrival-day rule', () => {
    const days = parseItinerary([
      { day: 1, title: 'Arrive Cairo', city: 'Cairo', meals: [], attractions: [], services: { ...none }, sightseeing: 'guide_only' },
      { day: 2, title: 'Depart Cairo', city: 'Cairo', meals: [], attractions: [], services: { ...none } },
    ])
    expect(days[0].services.guide_required).toBe(true)
  })
})
