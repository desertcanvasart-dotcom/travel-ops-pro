import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import type { ExchangeRates } from '@/lib/currency-service'

// /api/rates?type=…&in_org_currency=true — rows converted for a PRICING screen.
//
// The tour-builder's selectors (meals, hotels, entrances, transport, service
// fees) read this route and then SUM the numbers client-side and post them to
// /api/tours/calculate, which adds them up in memory with no rate tables in
// sight. Until this flag existed the selectors fetched raw rows: a Cairo
// dinner stored as 5000 EGP was shown as "$5000.00", summed as 5000 dollars,
// and the sidebar total was wrong by 50x. The rates HUB reads the same route
// without the flag and must keep showing what the operator typed, unconverted.
//
// With the flag: every row comes back in the org's rate currency (through the
// engine's normaliser), `rate_currency` says so, and `converted_from` names
// the currency it was entered in. A row that cannot be converted comes back
// with its prices nulled — a hole, never a guess.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
}))
// 1 USD = 50 EGP, the worked example from docs/plans/per-rate-currency.md.
const RATES: ExchangeRates = {
  base: 'USD',
  rates: { USD: 1, EGP: 50, JPY: 150, EUR: 0.9, GBP: 0.8 },
  timestamp: 0,
} as unknown as ExchangeRates
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: vi.fn(async () => RATES),
}))

import { GET } from '@/app/api/rates/route'

function get(query: string) {
  return GET({ url: `http://localhost/api/rates?${query}` } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  setMockTables({
    organizations: [{ id: 'org-1', rate_currency: 'USD', default_currency: 'JPY' }],
    meal_rates: [
      { id: 'm-egp', restaurant_name: 'Abou El Sid', city: 'Cairo', meal_type: 'dinner', is_active: true,
        base_rate_eur: 5000, base_rate_non_eur: 4000, rate_currency: 'EGP' },
      { id: 'm-usd', restaurant_name: 'Nile View', city: 'Cairo', meal_type: 'dinner', is_active: true,
        base_rate_eur: 20, base_rate_non_eur: 18, rate_currency: null },
      { id: 'm-xxx', restaurant_name: 'Mystery', city: 'Cairo', meal_type: 'dinner', is_active: true,
        base_rate_eur: 300, base_rate_non_eur: 300, rate_currency: 'BTC' },
    ],
  })
})

describe('GET /api/rates without the flag (the rates hub)', () => {
  it('returns rows exactly as entered — a rates table never converts', async () => {
    const res = await get('type=meal&city=Cairo')
    const json = await res.json()
    const egp = json.data.find((r: any) => r.id === 'm-egp')
    expect(egp.base_rate_eur).toBe(5000)
    expect(egp.rate_currency).toBe('EGP')
    expect(egp.converted_from).toBeUndefined()
    expect(json.currency).toBeUndefined()
  })
})

describe('GET /api/rates?in_org_currency=true (the tour-builder)', () => {
  it('converts an EGP row into the org rate currency and says where it came from', async () => {
    const res = await get('type=meal&city=Cairo&in_org_currency=true')
    const json = await res.json()
    expect(json.currency).toBe('USD')
    const egp = json.data.find((r: any) => r.id === 'm-egp')
    expect(egp.base_rate_eur).toBe(100)       // 5000 EGP / 50
    expect(egp.base_rate_non_eur).toBe(80)
    expect(egp.rate_currency).toBe('USD')
    expect(egp.converted_from).toBe('EGP')
  })

  it('leaves a row already in the org currency untouched', async () => {
    const res = await get('type=meal&city=Cairo&in_org_currency=true')
    const json = await res.json()
    const usd = json.data.find((r: any) => r.id === 'm-usd')
    expect(usd.base_rate_eur).toBe(20)
    expect(usd.converted_from).toBeUndefined()
  })

  it('an unconvertible row comes back unpriced, never at its raw number', async () => {
    const res = await get('type=meal&city=Cairo&in_org_currency=true')
    const json = await res.json()
    const xxx = json.data.find((r: any) => r.id === 'm-xxx')
    expect(xxx.base_rate_eur).toBeNull()
    expect(xxx.base_rate_non_eur).toBeNull()
    expect(xxx.conversion_missing).toBe(true)
  })
})
