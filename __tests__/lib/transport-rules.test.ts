import { describe, it, expect, vi } from 'vitest'

// auto-pricing-service creates a Supabase client at module-load time, which
// needs env vars we don't want to require in unit tests. determineTransportNeeds
// itself is a pure function with no Supabase dependency, so we mock createClient
// to allow the import in test isolation.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({}) }) }),
}))

import {
  determineTransportNeeds,
  type ItineraryDay,
  type TransportNeed,
} from '@/lib/auto-pricing-service'

// B3: per-day transport derivation rules (locked-in 2026-06-23).
// Test scenarios are drawn from the worked example the user provided when
// signing off the rules — Days 1, 2, 4, 5 of an 8-day Cairo→Aswan→Luxor→Cairo
// itinerary. The serviceType values returned here are the canonical 11.

function makeDay(overrides: Partial<ItineraryDay> & { day: number; city: string }): ItineraryDay {
  return {
    title: '',
    accommodation_type: 'hotel',
    meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
    attractions: [],
    services: {
      airport_arrival: false,
      airport_departure: false,
      hotel_checkin: false,
      hotel_checkout: false,
      guide_required: false,
    },
    ...overrides,
  }
}

function types(needs: TransportNeed[]): string[] {
  return needs.map(n => n.serviceType)
}

describe('determineTransportNeeds — B3 worked example', () => {
  it('Day 1 (arrival in Cairo, hotel check-in, afternoon tour with 2 attractions): airport_transfer + day_tour', () => {
    const day1 = makeDay({
      day: 1,
      city: 'Cairo',
      attractions: ['Egyptian Museum', 'Khan El Khalili'],
      services: {
        airport_arrival: true,
        airport_departure: false,
        hotel_checkin: true,
        hotel_checkout: false,
        guide_required: true,
      },
    })
    const result = determineTransportNeeds(day1, null, null)
    expect(types(result)).toEqual(['airport_transfer', 'day_tour'])
  })

  it('Day 1 with skip_arrival_checkin: one bundled airport_with_sightseeing', () => {
    const day1 = makeDay({
      day: 1,
      city: 'Cairo',
      attractions: ['Egyptian Museum', 'Khan El Khalili'],
      services: {
        airport_arrival: true,
        airport_departure: false,
        hotel_checkin: false,
        hotel_checkout: false,
        guide_required: true,
      },
      skip_arrival_checkin: true,
    })
    const result = determineTransportNeeds(day1, null, null)
    expect(types(result)).toEqual(['airport_with_sightseeing'])
  })

  it('Day 1 (arrival, no attractions): just airport_transfer', () => {
    const day1 = makeDay({
      day: 1,
      city: 'Cairo',
      attractions: [],
      services: {
        airport_arrival: true,
        airport_departure: false,
        hotel_checkin: true,
        hotel_checkout: false,
        guide_required: false,
      },
    })
    const result = determineTransportNeeds(day1, null, null)
    expect(types(result)).toEqual(['airport_transfer'])
  })

  it('Day 2 (Cairo → Aswan by flight, 2 attractions on Aswan side): 2 airport transfers', () => {
    const day1 = makeDay({ day: 1, city: 'Cairo', accommodation_type: 'hotel' })
    const day2 = makeDay({
      day: 2,
      city: 'Aswan',
      accommodation_type: 'cruise', // they board the Nile cruise this evening
      attractions: ['High Dam', 'Philae Temple'],
      transport_type: 'flight',
    })
    const result = determineTransportNeeds(day2, day1, null)
    // Two legs: airport_transfer at Cairo (depart) + airport_with_sightseeing at Aswan (arrive)
    expect(types(result)).toEqual(['airport_transfer', 'airport_with_sightseeing'])
    // The departure leg's city is pinned to Cairo (previous day), not Aswan.
    expect(result[0].city).toBe('Cairo')
    expect(result[1].city).toBeUndefined() // arrival leg uses day.city by default
  })

  it('Day 3 (pure in-cruise day, no city change in terms of transport): nothing', () => {
    const day2 = makeDay({ day: 2, city: 'Aswan', accommodation_type: 'cruise' })
    const day3 = makeDay({
      day: 3,
      city: 'Edfu',
      accommodation_type: 'cruise',
      is_cruise_day: true,
      attractions: ['Kom Ombo Temple', 'Edfu Temple'],
    })
    const result = determineTransportNeeds(day3, day2, null)
    expect(result).toEqual([])
  })

  it('Day 4 (cruise day, attractions in Luxor, evening sound & light): ONLY sound_light', () => {
    const day3 = makeDay({ day: 3, city: 'Edfu', accommodation_type: 'cruise' })
    const day4 = makeDay({
      day: 4,
      city: 'Luxor',
      accommodation_type: 'cruise',
      is_cruise_day: true,
      attractions: ['Karnak Temple', 'Luxor Temple'],
      extras: ['sound_light'],
    })
    const result = determineTransportNeeds(day4, day3, null)
    // Primary (Karnak + Luxor visits) bundled in cruise package — no primary line.
    // Only the additive sound_light line emits.
    expect(types(result)).toEqual(['sound_light'])
  })

  it('Day 5 (cruise disembark + flight Luxor → Cairo): only ARRIVAL-side leg', () => {
    const day4 = makeDay({ day: 4, city: 'Luxor', accommodation_type: 'cruise' })
    const day5 = makeDay({
      day: 5,
      city: 'Cairo',
      accommodation_type: 'hotel',
      transport_type: 'flight',
      // Optionally has attractions before the flight, but the cruise package
      // covers the morning excursion. So the arrival side is what matters:
      attractions: [], // no Cairo-side attractions on arrival
    })
    const result = determineTransportNeeds(day5, day4, null)
    // Departure-side (cruise → Luxor airport) is bundled in cruise package.
    // Arrival-side (Cairo airport → hotel) is the only line.
    expect(types(result)).toEqual(['airport_transfer'])
  })

  it('Day 5 disembark + flight + arrival-city sightseeing: arrival is airport_with_sightseeing', () => {
    const day4 = makeDay({ day: 4, city: 'Luxor', accommodation_type: 'cruise' })
    const day5 = makeDay({
      day: 5,
      city: 'Cairo',
      accommodation_type: 'hotel',
      transport_type: 'flight',
      attractions: ['Pyramids', 'Sphinx'],
    })
    const result = determineTransportNeeds(day5, day4, null)
    expect(types(result)).toEqual(['airport_with_sightseeing'])
  })

  it('Ground intercity day with sightseeing: intercity_with_sightseeing (one line)', () => {
    const dayA = makeDay({ day: 1, city: 'Hurghada', accommodation_type: 'hotel' })
    const dayB = makeDay({
      day: 2,
      city: 'Cairo',
      accommodation_type: 'hotel',
      transport_type: 'ground',
      attractions: ['Mountain stop'],
    })
    const result = determineTransportNeeds(dayB, dayA, null)
    expect(types(result)).toEqual(['intercity_with_sightseeing'])
    expect(result[0].originCity).toBe('Hurghada')
    expect(result[0].destinationCity).toBe('Cairo')
  })

  it('Ground intercity day pure drop-off (no attractions): intercity', () => {
    const dayA = makeDay({ day: 1, city: 'Hurghada', accommodation_type: 'hotel' })
    const dayB = makeDay({
      day: 2,
      city: 'Cairo',
      accommodation_type: 'hotel',
      transport_type: 'ground',
    })
    const result = determineTransportNeeds(dayB, dayA, null)
    expect(types(result)).toEqual(['intercity'])
  })

  it('Same-city day, 1 attraction → half_day', () => {
    const dayA = makeDay({ day: 1, city: 'Cairo', accommodation_type: 'hotel' })
    const dayB = makeDay({
      day: 2,
      city: 'Cairo',
      accommodation_type: 'hotel',
      attractions: ['Egyptian Museum'],
    })
    expect(types(determineTransportNeeds(dayB, dayA, null))).toEqual(['half_day'])
  })

  it('Same-city day, 3 attractions → day_tour', () => {
    const dayA = makeDay({ day: 1, city: 'Cairo', accommodation_type: 'hotel' })
    const dayB = makeDay({
      day: 2,
      city: 'Cairo',
      accommodation_type: 'hotel',
      attractions: ['A', 'B', 'C'],
    })
    expect(types(determineTransportNeeds(dayB, dayA, null))).toEqual(['day_tour'])
  })

  it('Same-city day, 4+ attractions → extended_day_tour', () => {
    const dayA = makeDay({ day: 1, city: 'Cairo', accommodation_type: 'hotel' })
    const dayB = makeDay({
      day: 2,
      city: 'Cairo',
      accommodation_type: 'hotel',
      attractions: ['A', 'B', 'C', 'D'],
    })
    expect(types(determineTransportNeeds(dayB, dayA, null))).toEqual(['extended_day_tour'])
  })

  it('Last day (departure): single airport_transfer', () => {
    const dayPrev = makeDay({ day: 7, city: 'Cairo', accommodation_type: 'hotel' })
    const dayLast = makeDay({
      day: 8,
      city: 'Cairo',
      accommodation_type: 'hotel',
      services: {
        airport_arrival: false,
        airport_departure: true,
        hotel_checkin: false,
        hotel_checkout: true,
        guide_required: false,
      },
    })
    expect(types(determineTransportNeeds(dayLast, dayPrev, null))).toEqual(['airport_transfer'])
  })

  it('Extras always additive — fires on a same-city day too', () => {
    const dayA = makeDay({ day: 1, city: 'Aswan', accommodation_type: 'hotel' })
    const dayB = makeDay({
      day: 2,
      city: 'Aswan',
      accommodation_type: 'hotel',
      attractions: ['Philae'],
      extras: ['sound_light', 'dinner_transfer'],
    })
    expect(types(determineTransportNeeds(dayB, dayA, null))).toEqual(['half_day', 'sound_light', 'dinner_transfer'])
  })
})
