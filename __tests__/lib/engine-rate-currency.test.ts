// The engine adds numbers; the currency is a label. Until 2026-08-22 that label
// was the literal 'EUR' in every result. It now follows the org's rate
// currency (organizations.rate_currency) and defaults to EUR so no existing
// org changes — the same numbers, a different label.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import {
  calculateAutoPricing,
  calculatePricingWithPassengerBreakdown,
  calculateAgeBasedPricing,
  composeAgeBasedPricing,
} from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 25, numPax: 2 }

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables(fullRateTables()))

describe('engine result currency follows the org rate currency', () => {
  it('defaults to EUR when no rate currency is given — nothing existing changes', async () => {
    const r = await calculateAutoPricing(BASE)
    expect(r.success).toBe(true)
    expect(r.currency).toBe('EUR')
  })

  it('labels the whole result USD for a USD org, with identical numbers', async () => {
    const eur = await calculateAutoPricing(BASE)
    const usd = await calculateAutoPricing({ ...BASE, rateCurrency: 'USD' })
    expect(usd.currency).toBe('USD')
    expect(usd.totalCost).toBe(eur.totalCost)
    expect(usd.sellingPrice).toBe(eur.sellingPrice)
  })

  it('carries the label through the age-based path too', async () => {
    const r = await calculatePricingWithPassengerBreakdown({
      ...BASE, rateCurrency: 'USD', passengers: { numAdults: 2, numChildren: 1, numInfants: 0 },
    })
    expect(r.success).toBe(true)
    expect(r.currency).toBe('USD')
    expect(r.ageBasedPricing?.currency).toBe('USD')
  })

  it('pure helpers: label only, numbers untouched', () => {
    const passengers = { numAdults: 2, numChildren: 1, numInfants: 0 }
    const eur = calculateAgeBasedPricing(500, passengers, 25, 0)
    const usd = calculateAgeBasedPricing(500, passengers, 25, 0, 'USD')
    expect(eur.currency).toBe('EUR'); expect(usd.currency).toBe('USD')
    expect({ ...usd, currency: undefined }).toEqual({ ...eur, currency: undefined })
    const paxRow = { numPax: 2, withoutLeader: { totalCost: 1000, marginAmount: 250, sellingPrice: 1250, pricePerPerson: 625 }, withLeader: { totalCost: 1100, marginAmount: 275, sellingPrice: 1375, pricePerPerson: 687.5 } } as Parameters<typeof composeAgeBasedPricing>[0]
    expect(composeAgeBasedPricing(paxRow, passengers, 25, false, 0, 'USD').ageBasedPricing.currency).toBe('USD')
  })
})
