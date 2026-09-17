import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import { durationFor, sanitizeTransportLines } from '@/lib/pricing/transport-lines'

// A day's transport, listed and changeable like its attractions (operator,
// 2026-09-16). Absent `transport_lines` = the rules; present = exactly those
// lines, nothing derived added behind the operator's back.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, determineTransportNeeds, parseItinerary, type ItineraryDay } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const day = (over: Partial<ItineraryDay> = {}): ItineraryDay => ({
  day: 2, title: 'Luxor', city: 'Luxor', accommodation_type: 'hotel',
  meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
  attractions: ['Karnak Temple', 'Luxor Temple'],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true },
  ...over,
})
const cairo = day({ day: 1, city: 'Cairo', attractions: [] })

describe('sanitizeTransportLines', () => {
  it('absent stays absent (rules decide); an empty list stays empty (no transport)', () => {
    expect(sanitizeTransportLines(undefined)).toBeUndefined()
    expect(sanitizeTransportLines({})).toBeUndefined()
    expect(sanitizeTransportLines([])).toEqual([])
  })

  it('keeps known service types, trims places, and a route only on a road transfer', () => {
    expect(sanitizeTransportLines([
      { service_type: 'half_day', city: '  Luxor ', from: 'Cairo' },
      { service_type: 'intercity', from: 'Aswan', to: 'Abu Simbel', city: '' },
      { service_type: 'helicopter' },
      'junk',
    ])).toEqual([
      { service_type: 'half_day', city: 'Luxor' },
      { service_type: 'intercity', from: 'Aswan', to: 'Abu Simbel' },
    ])
  })

  it('durations match the rate table keys the rules use', () => {
    expect(durationFor('half_day')).toBe('half_day')
    expect(durationFor('day_tour')).toBe('full_day')
    expect(durationFor('airport_transfer')).toBe('one_way')
    expect(durationFor('intercity_with_sightseeing')).toBe('one_way')
  })
})

describe('determineTransportNeeds with the operator\'s list', () => {
  it('without a list the rules decide — a city change is a road transfer with sightseeing', () => {
    const needs = determineTransportNeeds(day(), cairo, null)
    expect(needs.map(n => n.serviceType)).toEqual(['intercity_with_sightseeing'])
  })

  it('with a list, exactly those lines — even where the rules would add another', () => {
    const needs = determineTransportNeeds(day({
      transport_lines: [{ service_type: 'half_day' }, { service_type: 'dinner_transfer', city: 'Karnak' }],
      extras: ['sound_light'],
      transport: { service_type: 'day_tour' },
    }), cairo, null)
    expect(needs.map(n => [n.serviceType, n.duration, n.city ?? null])).toEqual([
      ['half_day', 'half_day', null],
      ['dinner_transfer', 'one_way', 'Karnak'],
    ])
    // Sightseeing is priced by the attractions' area, like the rules do.
    expect(needs[0].area).not.toBeNull()
    expect(needs[1].area).toBeNull()
  })

  it('an empty list is no transport that day', () => {
    expect(determineTransportNeeds(day({ transport_lines: [] }), cairo, null)).toEqual([])
  })

  it('a road transfer runs yesterday → today unless the line names its own route', () => {
    const [plain] = determineTransportNeeds(day({ transport_lines: [{ service_type: 'intercity' }] }), cairo, null)
    expect([plain.originCity, plain.destinationCity]).toEqual(['Cairo', 'Luxor'])
    const [named] = determineTransportNeeds(day({ transport_lines: [{ service_type: 'intercity', from: 'Aswan', to: 'Abu Simbel' }] }), cairo, null)
    expect([named.originCity, named.destinationCity]).toEqual(['Aswan', 'Abu Simbel'])
  })

  it('parseItinerary carries the list, cleaned', () => {
    const [parsed] = parseItinerary([{ day: 1, title: 'Cairo', city: 'Cairo', transport_lines: [{ service_type: 'city_transfer' }, { service_type: 'nope' }] }])
    expect(parsed.transport_lines).toEqual([{ service_type: 'city_transfer' }])
    const [plain] = parseItinerary([{ day: 1, title: 'Cairo', city: 'Cairo' }])
    expect(plain.transport_lines).toBeUndefined()
  })
})

describe('pricing follows the list', () => {
  const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
  const transport = (r: any, dayNumber: number) =>
    (r.services ?? []).filter((s: any) => s.dayNumber === dayNumber && s.serviceType === 'transportation')

  it('the rules: arrival day gets the airport transfer and a half-day vehicle (one attraction)', async () => {
    setMockTables(fullRateTables())
    const lines = transport(await calculateAutoPricing(BASE), 1)
    expect(lines.map((s: any) => s.serviceName)).toEqual(['Cairo Airport Transfer', 'Cairo Half Day Pyramids'])
  })

  it('removing the vehicle on the day prices only what is left', async () => {
    const t = fullRateTables() as any
    t.tour_templates[0].itinerary[0].transport_lines = [{ service_type: 'airport_transfer' }]
    setMockTables(t)
    const lines = transport(await calculateAutoPricing(BASE), 1)
    expect(lines.map((s: any) => s.serviceName)).toEqual(['Cairo Airport Transfer'])
  })

  it('an added line with no rate is listed as No rate, never dropped', async () => {
    const t = fullRateTables() as any
    t.tour_templates[0].itinerary[0].transport_lines = [{ service_type: 'airport_transfer' }, { service_type: 'dinner_transfer' }]
    setMockTables(t)
    const lines = transport(await calculateAutoPricing(BASE), 1)
    expect(lines[1]).toMatchObject({ unpriced: true, serviceName: 'Dinner transfer — Cairo' })
  })
})

describe('the editor shows what pricing charges', () => {
  it('the preview route runs the engine\'s own steps, not a copy of the rules', () => {
    const src = readFileSync('app/api/b2b/transport-preview/route.ts', 'utf8')
    for (const fn of ['parseItinerary(', 'determineTransportNeeds(', 'findTransportRate(', 'buildTransportCache(']) {
      expect(src).toContain(fn)
    }
  })
})

describe('review fixes (Greptile on #454)', () => {
  it('the preview sizes the vehicle with the throughout guide and the tour leader aboard, like the quote', () => {
    const src = readFileSync('app/api/b2b/transport-preview/route.ts', 'utf8')
    expect(src).toMatch(/guide_mode === 'throughout' \? 1 : 0/)
    expect(src).toMatch(/tour_leader_included === true \? 1 : 0/)
    expect(src).toContain('pax: seats')
    const page = readFileSync('app/b2b/calculator/[id]/page.tsx', 'utf8')
    expect(page).toContain('guide_mode: guideMode, tour_leader_included: tourLeaderIncluded')
  })

  it('a cost is shown against a line only while the preview still describes that line', async () => {
    const { lineMatches } = await import('@/components/DayTransportEditor')
    const priced = { service_type: 'intercity', label: '', city: 'Luxor', from: 'Cairo', to: 'Luxor', rate_name: null, cost: 90, message: null, shape: 'one_way' as const, included_from_day: null }
    expect(lineMatches({ service_type: 'intercity' }, priced)).toBe(true)
    expect(lineMatches({ service_type: 'half_day' }, priced)).toBe(false)
    expect(lineMatches({ service_type: 'intercity', from: 'Aswan' }, priced)).toBe(false)
    expect(lineMatches({ service_type: 'intercity', to: 'Luxor' }, priced)).toBe(true)
  })
})
