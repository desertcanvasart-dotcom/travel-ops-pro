import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, multiTierRateTables } from '../fixtures/sample-templates'

// Phase 5 drift guard: lock the engine's computed per-person prices across a
// canonical basket (every tier × both passports). Any code change that shifts a
// number — intended or not — fails CI here, surfacing the drift for review.
// See PRICING-HARNESS-PLAN.md.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, type ServiceTier } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

describe('golden basket — cross-tier price drift guard', () => {
  it('locks per-person prices for every tier × passport', async () => {
    const basket: Record<string, unknown> = {}

    for (const tier of TIERS) {
      for (const isEurPassport of [true, false]) {
        setMockTables(multiTierRateTables())
        const r = await calculateDayBasedPricing({
          templateId: TEMPLATE_ID,
          tier,
          isEurPassport,
          language: 'English',
          marginPercent: 25,
        })
        const pp = (n: number) =>
          r.paxPricing.find((p) => p.numPax === n)!.withoutLeader.pricePerPerson

        basket[`${tier}/${isEurPassport ? 'eur' : 'non-eur'}`] = {
          complete: r.complete,
          holes: r.holes.length,
          pp2: pp(2),
          pp10: pp(10),
        }
      }
    }

    // Captured from the current engine — regenerate intentionally with -u.
    expect(basket).toMatchInlineSnapshot(`
      {
        "budget/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 178.75,
          "pp2": 362.5,
        },
        "budget/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 203.75,
          "pp2": 387.5,
        },
        "deluxe/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 297.5,
          "pp2": 481.25,
        },
        "deluxe/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 328.75,
          "pp2": 512.5,
        },
        "luxury/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 396.25,
          "pp2": 580,
        },
        "luxury/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 433.75,
          "pp2": 617.5,
        },
        "standard/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 230,
          "pp2": 413.75,
        },
        "standard/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 255,
          "pp2": 438.75,
        },
      }
    `)
  })
})
