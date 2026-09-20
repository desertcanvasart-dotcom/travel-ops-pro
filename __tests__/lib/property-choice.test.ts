import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import {
  ANY_TIER, applyStayChoice, chosenForStay, choicesForTier, pickChoice, sanitizePropertyChoice, stayIndexes,
} from '@/lib/pricing/property-choice'

// Which hotel or ship a stay uses (operator, 2026-09-16): the automatic pick
// unless chosen; ONE hotel per destination; a different property per tier;
// a chosen property that is gone is a hole, never a quiet swap.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

type Day = { city: string; overnight_city?: string; accommodation_type: string; property_by_tier?: Record<string, string> }
const days: Day[] = [
  { city: 'Cairo', accommodation_type: 'hotel' },
  { city: 'Alexandria', overnight_city: 'Cairo', accommodation_type: 'hotel' }, // day trip, sleeps in Cairo
  { city: 'Nile Cruise', accommodation_type: 'cruise' },
  { city: 'Nile Cruise', accommodation_type: 'cruise' },
  { city: 'Aswan', accommodation_type: 'hotel' },
  { city: 'cairo', accommodation_type: 'hotel' }, // back in Cairo
  { city: 'Cairo', accommodation_type: 'none' },
]

describe('one choice covers the whole stay', () => {
  it('every hotel night in the same city (by where it sleeps), or every night aboard', () => {
    expect(stayIndexes(days, 0)).toEqual([0, 1, 5])
    expect(stayIndexes(days, 3)).toEqual([2, 3])
    expect(stayIndexes(days, 4)).toEqual([4])
    expect(stayIndexes(days, 6)).toEqual([])
  })

  it('setting it on one night sets the stay, per tier, keeping other tiers', () => {
    let next = applyStayChoice(days, 1, 'standard', 'h-std')
    next = applyStayChoice(next, 0, 'deluxe', 'h-dlx')
    expect(next[0].property_by_tier).toEqual({ standard: 'h-std', deluxe: 'h-dlx' })
    expect(next[5].property_by_tier).toEqual({ standard: 'h-std', deluxe: 'h-dlx' })
    expect(next[4].property_by_tier).toBeUndefined()
    expect(chosenForStay(next, 5, 'standard')).toBe('h-std')
    expect(chosenForStay(next, 5, 'luxury')).toBeUndefined()
    // Back to automatic for one tier only.
    const cleared = applyStayChoice(next, 0, 'standard', undefined)
    expect(cleared[1].property_by_tier).toEqual({ deluxe: 'h-dlx' })
    expect(applyStayChoice(cleared, 0, 'deluxe', undefined)[0].property_by_tier).toBeUndefined()
  })

  it('the engine reads one hotel per city and one ship, at the priced tier', () => {
    const chosen = applyStayChoice(applyStayChoice(days, 0, 'standard', 'h-std'), 2, 'standard', 'ship-1')
    const { hotelByCity, cruiseId } = choicesForTier(chosen, 'standard')
    expect(hotelByCity.get('cairo')).toBe('h-std')
    expect(hotelByCity.has('aswan')).toBe(false)
    expect(cruiseId).toBe('ship-1')
    expect(choicesForTier(chosen, 'deluxe').hotelByCity.size).toBe(0)
  })

  it('keeps only well-formed tier keys and ids', () => {
    expect(sanitizePropertyChoice({ standard: ' abc-1 ', 'Not A Key': 'x', deluxe: 5 })).toEqual({ standard: 'abc-1' })
    expect(sanitizePropertyChoice(['x'])).toBeUndefined()
  })

  it('accepts the all-tiers key, which no vocabulary tier can collide with', () => {
    expect(sanitizePropertyChoice({ [ANY_TIER]: 'abc-1' })).toEqual({ [ANY_TIER]: 'abc-1' })
    // A tier key must start with a letter or digit, so '*' is unreachable.
    expect(sanitizePropertyChoice({ '*x': 'abc-1' })).toBeUndefined()
  })

  it('a tier takes its own choice first, then the all-tiers one', () => {
    expect(pickChoice({ [ANY_TIER]: 'any', standard: 'std' }, 'standard')).toBe('std')
    expect(pickChoice({ [ANY_TIER]: 'any', standard: 'std' }, 'luxury')).toBe('any')
    expect(pickChoice({ standard: 'std' }, 'luxury')).toBeUndefined()
    expect(pickChoice(undefined, 'standard')).toBeUndefined()
  })

  it('an all-tiers choice reaches the engine at every tier', () => {
    const chosen = applyStayChoice(applyStayChoice(days, 0, ANY_TIER, 'h-any'), 2, ANY_TIER, 'ship-any')
    for (const tier of ['standard', 'deluxe', 'luxury']) {
      const { hotelByCity, cruiseId } = choicesForTier(chosen, tier)
      expect(hotelByCity.get('cairo')).toBe('h-any')
      expect(cruiseId).toBe('ship-any')
    }
    expect(chosenForStay(chosen, 5, 'luxury')).toBe('h-any')
  })
})

describe('pricing follows the choice', () => {
  const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
  const withSecondHotel = (choice?: Record<string, string>, secondActive = true) => {
    const t = fullRateTables() as any
    // Newer, so the AUTOMATIC pick is this one.
    t.accommodation_rates.push({
      id: 'acc-cairo-new', tier: 'standard', is_active: secondActive, city: 'Cairo', property_name: 'Cairo Newer Hotel',
      pp_double_eur: 120, pp_double_non_eur: 130, single_supp_eur: 60, single_supp_non_eur: 70, created_at: '2026-01-01T00:00:00Z',
    })
    if (choice) t.tour_templates[0].itinerary[0].property_by_tier = choice
    return t
  }
  const hotelLine = (r: any) => (r.services ?? []).find((s: any) => s.id === 'day1-hotel')

  it('with no choice, the automatic pick — the newest hotel — and the line says so', async () => {
    setMockTables(withSecondHotel())
    const line = hotelLine(await calculateAutoPricing(BASE))
    expect(line.serviceName).toBe('Hotel - Cairo Newer Hotel (Cairo)')
    expect(line.unitCost).toBe(130)
    expect(line.notes).toMatch(/^Automatic pick · .* · non-EU passport · per person in a double, per night$/)
  })

  it('a chosen hotel wins over the automatic pick', async () => {
    setMockTables(withSecondHotel({ standard: 'acc-cairo-std' }))
    const line = hotelLine(await calculateAutoPricing(BASE))
    expect(line.serviceName).toBe('Hotel - Cairo Standard Hotel (Cairo)')
    expect(line.unitCost).toBe(95)
    expect(line.notes).toMatch(/^Chosen on the day/)
    // Carried onto the quote line, so the itinerary can name the overnight.
    expect(line.propertyName).toBe('Cairo Standard Hotel')
  })

  it('a choice made for ANOTHER tier does not apply', async () => {
    setMockTables(withSecondHotel({ deluxe: 'acc-cairo-std' }))
    expect(hotelLine(await calculateAutoPricing(BASE)).serviceName).toBe('Hotel - Cairo Newer Hotel (Cairo)')
  })

  it('a chosen hotel that is switched off is a hole naming it — never another hotel', async () => {
    setMockTables(withSecondHotel({ standard: 'acc-cairo-new' }, false))
    const r = await calculateAutoPricing(BASE)
    const line = hotelLine(r)
    expect(line.unpriced).toBe(true)
    expect(line.unitCost).toBe(0)
    expect(line.issue).toMatch(/The hotel chosen for Cairo is switched off/)
  })

  // Operator, 2026-09-20: "some destinations might not have a certain
  // category so we are obliged to use different categories depending on what
  // the destination offers." Until then, both of these were HOLES — a named
  // property at another tier priced nothing at all, which made a real
  // product (Mena House is the only luxury hotel on file; Abu Simbel has no
  // luxury hotel and every ship is standard) impossible to quote.
  it('a chosen hotel at ANOTHER tier is priced, at its own rate, and the line says so', async () => {
    const t = withSecondHotel({ standard: 'acc-cairo-std' })
    t.accommodation_rates.find((r: any) => r.id === 'acc-cairo-std').tier = 'deluxe'
    setMockTables(t)
    const line = hotelLine(await calculateAutoPricing(BASE))
    expect(line.unpriced).toBeFalsy()
    expect(line.serviceName).toBe('Hotel - Cairo Standard Hotel (Cairo)')
    expect(line.unitCost).toBe(95)
    // Named, so it cannot be a silent swap — the note carries both tiers.
    expect(line.notes).toMatch(/^Chosen on the day · deluxe property in a standard quote · /)
  })

  it('a chosen hotel filed under another city is priced too, and says that', async () => {
    const t = withSecondHotel({ standard: 'acc-luxor' })
    t.accommodation_rates.push({ id: 'acc-luxor', tier: 'standard', is_active: true, city: 'Luxor', property_name: 'Luxor Hotel', pp_double_eur: 50, pp_double_non_eur: 50, created_at: '2025-01-01T00:00:00Z' })
    setMockTables(t)
    const line = hotelLine(await calculateAutoPricing(BASE))
    expect(line.unpriced).toBeFalsy()
    expect(line.serviceName).toBe('Hotel - Luxor Hotel (Cairo)')
    expect(line.notes).toMatch(/filed under another city/)
  })

  it('but gone and switched-off are STILL holes — there is no number to be had', async () => {
    setMockTables(withSecondHotel({ standard: 'acc-cairo-new' }, false))
    expect(hotelLine(await calculateAutoPricing(BASE)).unpriced).toBe(true)
    setMockTables(withSecondHotel({ standard: 'deleted-id' }))
    expect(hotelLine(await calculateAutoPricing(BASE)).unpriced).toBe(true)
  })

  it('a property named for ALL tiers prices at every tier', async () => {
    // The whole point: one template, any tier, the product's real hotel.
    setMockTables(withSecondHotel({ [ANY_TIER]: 'acc-cairo-std' }))
    const line = hotelLine(await calculateAutoPricing(BASE))
    expect(line.serviceName).toBe('Hotel - Cairo Standard Hotel (Cairo)')
    expect(line.notes).toMatch(/^Chosen on the day/)
  })

  it('and a tier-specific choice still beats the all-tiers one', async () => {
    setMockTables(withSecondHotel({ [ANY_TIER]: 'acc-cairo-std', standard: 'acc-cairo-new' }))
    expect(hotelLine(await calculateAutoPricing(BASE)).serviceName).toBe('Hotel - Cairo Newer Hotel (Cairo)')
  })

  it('a chosen hotel that no longer exists is a hole too', async () => {
    setMockTables(withSecondHotel({ standard: 'deleted-id' }))
    expect(hotelLine(await calculateAutoPricing(BASE)).issue).toMatch(/no longer in Rates → Hotels/)
  })
})

describe('the editor and the engine read the same list', () => {
  it('the engine picks through lib/pricing/property-candidates, not its own query', () => {
    const src = readFileSync('lib/auto-pricing-service.ts', 'utf8')
    expect(src).toContain('hotelCandidates(supabaseAdmin, city, tier)')
    expect(src).toContain('cruiseCandidates(supabaseAdmin, tier, embarkCity, nights)')
    expect(src).not.toMatch(/from\('accommodation_rates'\)\s*\.select\('\*'\)\s*\.eq\('tier'/)
    const route = readFileSync('app/api/b2b/accommodation-options/route.ts', 'utf8')
    expect(route).toContain('hotelCandidates(db, city, tier)')
    expect(route).toContain('cruiseCandidates(db, tier')
  })
})

describe('the automatic ship prefers a sailing as long as the programme\'s cruise', () => {
  it('orders by nights first, keeping the starred-then-newest order within', async () => {
    const { cruiseCandidates } = await import('@/lib/pricing/property-candidates')
    const rows = [
      { id: 'farida-3n', tier: 'standard', is_active: true, is_preferred: true, duration_nights: 3, embark_city: 'Aswan', created_at: '2026-09-02' },
      { id: 'farida-4n', tier: 'standard', is_active: true, is_preferred: true, duration_nights: 4, embark_city: 'Luxor', created_at: '2026-09-01' },
    ]
    const t = fullRateTables() as any
    t.nile_cruises = rows
    setMockTables(t)
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient('http://localhost', 'k')
    expect((await cruiseCandidates(db, 'standard', 'Nile Cruise', 4)).map(r => r.id)[0]).toBe('farida-4n')
    expect((await cruiseCandidates(db, 'standard', 'Nile Cruise', 3)).map(r => r.id)[0]).toBe('farida-3n')
  })
})
