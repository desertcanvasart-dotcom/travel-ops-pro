import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import {
  applyStayChoice, chosenForStay, choicesForTier, sanitizePropertyChoice, stayIndexes,
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

  it('a chosen hotel that no longer exists is a hole too', async () => {
    setMockTables(withSecondHotel({ standard: 'deleted-id' }))
    expect(hotelLine(await calculateAutoPricing(BASE)).issue).toMatch(/no longer in Rates → Hotels/)
  })
})

describe('the editor and the engine read the same list', () => {
  it('the engine picks through lib/pricing/property-candidates, not its own query', () => {
    const src = readFileSync('lib/auto-pricing-service.ts', 'utf8')
    expect(src).toContain('hotelCandidates(supabaseAdmin, city, tier)')
    expect(src).toContain('cruiseCandidates(supabaseAdmin, tier, embarkCity)')
    expect(src).not.toMatch(/from\('accommodation_rates'\)\s*\.select\('\*'\)\s*\.eq\('tier'/)
    const route = readFileSync('app/api/b2b/accommodation-options/route.ts', 'utf8')
    expect(route).toContain('hotelCandidates(db, city, tier)')
    expect(route).toContain('cruiseCandidates(db, tier')
  })
})
