import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables, missingHotelTables } from '../fixtures/sample-templates'

// Mock supabase-js BEFORE importing the engine (vitest hoists vi.mock).
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

// Imported after the mock is registered.
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const BASE_PARAMS = {
  templateId: TEMPLATE_ID,
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('calculateDayBasedPricing — golden master (full rates, standard, EUR)', () => {
  beforeEach(() => setMockTables(fullRateTables()))

  it('produces a locked pricing summary', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const pax2 = r.paxPricing.find((p: any) => p.numPax === 2)

    const summary = {
      success: r.success,
      hotelNights: r.hotelNights,
      cruiseNights: r.cruiseNights,
      singleSupplement: r.singleSupplement,
      serviceCount: r.services.length,
      warnings: r.warnings,
      pax2,
    }

    // Captured from the CURRENT engine output (locked thereafter). Regenerate
    // intentionally with `npx vitest run -u` when behavior is meant to change.
    expect(summary).toMatchInlineSnapshot(`
      {
        "cruiseNights": 0,
        "hotelNights": 1,
        "pax2": {
          "numPax": 2,
          "withLeader": {
            "marginAmount": 200.75,
            "pricePerPerson": 501.88,
            "sellingPrice": 1003.75,
            "totalCost": 803,
            "tourLeaderCost": 181,
          },
          "withoutLeader": {
            "marginAmount": 148,
            "pricePerPerson": 370,
            "sellingPrice": 740,
            "totalCost": 592,
          },
        },
        "serviceCount": 14,
        "singleSupplement": 45,
        "success": true,
        "warnings": [],
      }
    `)
  })
})

describe('calculateDayBasedPricing — invariants (full rates)', () => {
  beforeEach(() => setMockTables(fullRateTables()))

  it('per-person × pax ≈ total for every pax count, no NaN/negative', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.paxPricing.length).toBeGreaterThan(0)

    for (const p of r.paxPricing) {
      for (const variant of [p.withoutLeader, p.withLeader]) {
        expect(Number.isFinite(variant.totalCost)).toBe(true)
        expect(Number.isFinite(variant.sellingPrice)).toBe(true)
        expect(variant.totalCost).toBeGreaterThanOrEqual(0)
        expect(variant.sellingPrice).toBeGreaterThanOrEqual(0)
        // pricePerPerson × numPax reconstructs sellingPrice (within rounding)
        expect(Math.abs(variant.pricePerPerson * p.numPax - variant.sellingPrice))
          .toBeLessThanOrEqual(p.numPax) // ≤ €1/pax rounding slack
      }
    }
  })

  it('is deterministic — identical inputs produce identical output', async () => {
    const a = await calculateDayBasedPricing(BASE_PARAMS)
    setMockTables(fullRateTables())
    const b = await calculateDayBasedPricing(BASE_PARAMS)
    expect(JSON.stringify(b.paxPricing)).toBe(JSON.stringify(a.paxPricing))
  })
})

describe('calculateDayBasedPricing — flag the hole (Phase 1)', () => {
  beforeEach(() => setMockTables(missingHotelTables()))

  // Phase 1 flipped the old fabrication: with no Cairo hotel rate the engine
  // now records a hole and marks the result incomplete instead of substituting
  // DEFAULT_RATES. The single supplement no longer includes a guessed hotel.
  it('marks the result incomplete and records a hotel hole — no fabricated amount', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)

    expect(r.complete).toBe(false)
    expect(r.holes.length).toBeGreaterThan(0)
    expect(r.holes.some((h) => h.kind === 'hotel')).toBe(true)
    // No hotel rate → nothing fabricated into the single supplement.
    expect(r.singleSupplement).toBe(0)

    const hole = r.holes.find((h) => h.kind === 'hotel')!
    expect(hole.reason).toBe('missing')
    expect(hole.city).toBe('Cairo')
    expect(hole.message).toMatch(/hotel rate/i)
  })

  it('full rates → complete with zero holes', async () => {
    setMockTables(fullRateTables())
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(true)
    expect(r.holes).toEqual([])
  })
})
