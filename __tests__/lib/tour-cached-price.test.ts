import { vi, describe, it, expect, beforeAll } from 'vitest'

// The catalogue's "from" price (operator, 2026-10-01): the cheapest tier the
// engine priced COMPLETELY, at the office's guide language — a tier with a
// missing rate is not a price.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { cheapestCompleteTier, closestTierReason, pickGuideLanguage } from '@/lib/tours/cached-price'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const r = (pricePerPerson: number, complete = true, success = true) => ({ success, complete, pricePerPerson })

describe('cheapestCompleteTier', () => {
  it('takes the cheapest complete tier, rounded', () => {
    expect(cheapestCompleteTier(new Map([['standard', r(812.4)], ['deluxe', r(1190)]]))).toEqual({ price: 812, tier: 'standard' })
  })

  it('skips a cheaper tier that has holes', () => {
    // Deluxe "costs" less only because its hotels have no rates.
    expect(cheapestCompleteTier(new Map([['standard', r(900)], ['deluxe', r(400, false)]]))).toEqual({ price: 900, tier: 'standard' })
  })

  it('is no price at all when no tier is complete', () => {
    expect(cheapestCompleteTier(new Map([['standard', r(500, false)], ['deluxe', r(0)], ['luxury', r(700, true, false)]])))
      .toEqual({ price: null, tier: null })
  })
})

describe('pickGuideLanguage', () => {
  it('takes the first vocabulary language that has a guide rate', () => {
    expect(pickGuideLanguage(['english', 'japanese', 'french'], ['Japanese', 'French'])).toBe('japanese')
  })

  it('falls back to a rated language the vocabulary does not list', () => {
    expect(pickGuideLanguage([], ['Japanese'])).toBe('japanese')
  })

  it('is undefined with no guide rates — the engine default stands', () => {
    expect(pickGuideLanguage(['english'], [])).toBeUndefined()
  })
})

describe('closestTierReason', () => {
  const hole = (lookup: string, dayNumber = 1) => ({ kind: 'guide', reason: 'missing' as const, dayNumber, tier: 'x', lookupAttempted: lookup })
  const res = (holes: ReturnType<typeof hole>[], success = true, warnings: string[] = []) =>
    ({ success, complete: holes.length === 0, pricePerPerson: 100, holes, warnings }) as any

  it('names the tier with the fewest holes, standard first on a tie, one line per lookup', () => {
    const r = closestTierReason(new Map([
      ['standard', res([hole('Japanese guide, Luxor', 2), hole('Japanese guide, Luxor', 3)])],
      ['deluxe', res([hole('Deluxe hotel, Cairo'), hole('Deluxe hotel, Luxor')])],
    ]))
    expect(r.tier).toBe('standard')
    expect(r.missing).toEqual([{ kind: 'guide', reason: 'missing', day: 2, city: undefined, lookup: 'Japanese guide, Luxor' }])
  })

  it('reports the engine warnings when no tier could be priced', () => {
    const r = closestTierReason(new Map([['standard', res([], false, ['Template not found'])]]))
    expect(r).toEqual({ tier: null, missing: [], failed: ['standard: Template not found'] })
  })
})
