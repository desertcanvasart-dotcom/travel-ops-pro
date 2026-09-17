import { vi, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The engine builds its client at import; the pure picker needs no database.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key'
})
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { pickStartingPrice, STARTING_PRICE_BASIS } from '@/lib/tours/starting-price'

// Operator, 2026-09-17: every Tours card read "Starting from N/A" — the cache
// had no writer. Basis: per person, 2 travellers, non-EU (Japanese) passports;
// the cheapest COMPLETE tier, else the cheapest price marked incomplete.

describe('pickStartingPrice', () => {
  it('takes the cheapest complete tier, even when an incomplete tier is cheaper', () => {
    expect(pickStartingPrice([
      { tier: 'standard', pricePerPerson: 1800.4, complete: false, gaps: 8 },
      { tier: 'deluxe', pricePerPerson: 2400, complete: true, gaps: 0 },
      { tier: 'luxury', pricePerPerson: 3100, complete: true, gaps: 0 },
    ])).toEqual({ price: 2400, tier: 'deluxe', complete: true, gaps: 0 })
  })

  it('with no complete tier, the tier missing the fewest services, marked incomplete — never the one cheap because it is missing more', () => {
    // NMS803 on prod, 2026-09-17.
    expect(pickStartingPrice([
      { tier: 'standard', pricePerPerson: 2071.7, complete: false, gaps: 4 },
      { tier: 'deluxe', pricePerPerson: 1052.09, complete: false, gaps: 8 },
      { tier: 'luxury', pricePerPerson: 1021.15, complete: false, gaps: 9 },
    ])).toEqual({ price: 2072, tier: 'standard', complete: false, gaps: 4 })
  })

  it('equal gaps: the cheaper one', () => {
    expect(pickStartingPrice([
      { tier: 'deluxe', pricePerPerson: 900, complete: false, gaps: 2 },
      { tier: 'standard', pricePerPerson: 800, complete: false, gaps: 2 },
    ])?.tier).toBe('standard')
  })

  it('a tier that priced nothing is ignored; nothing priced is null', () => {
    expect(pickStartingPrice([{ tier: 'luxury', pricePerPerson: 0, complete: false, gaps: 20 }])).toBeNull()
    expect(pickStartingPrice([])).toBeNull()
  })

  it('the basis is 2 travellers with non-EU passports', () => {
    expect(STARTING_PRICE_BASIS).toEqual({ numPax: 2, isEurPassport: false })
  })
})

describe('the price is kept fresh and shown as defined', () => {
  it('refreshes on save, nightly and from the button — all through the one function', () => {
    expect(readFileSync('app/api/b2b/update-template-itinerary/route.ts', 'utf8')).toContain('refreshStartingPrices(supabaseAdmin, orgId, [template_id])')
    expect(readFileSync('app/api/tours/recalculate-prices/route.ts', 'utf8')).toContain('refreshStartingPrices(supabaseAdmin, orgId')
    expect(readFileSync('app/api/cron/tour-starting-prices/route.ts', 'utf8')).toContain('refreshStartingPrices(db')
    expect(readFileSync('lib/cron/scheduler.ts', 'utf8')).toContain("name: 'tour-starting-prices'")
  })

  it('the Tours page shows incomplete prices marked, in the org currency, and has the refresh button', () => {
    const page = readFileSync('app/tours/tours-browser-page.tsx', 'utf8')
    expect(page).toContain('data-testid="price-incomplete"')
    expect(page).toContain('data-testid="refresh-prices"')
    expect(page).not.toContain("'N/A'")
    expect(page).not.toMatch(/formatWithConversion\([^)]*'EUR'\)/)
    const api = readFileSync('app/api/tours/browse/route.ts', 'utf8')
    expect(api).toContain('starting_from_complete: template.cached_price_complete')
    expect(api).not.toContain("currency: 'EUR'")
  })
})
