// ============================================
// A variation's own service lines, priced from the Guides & Services tables
// ============================================
// Rates audit, Guides & Services #2. The REAL calculate-price route, against
// an in-memory database, for a USD company whose suppliers quote in EGP:
//   * an entrance fee entered as 600 EGP was priced as $600 (≈50× too much);
//     so was a tiered felucca's band;
//   * a meal line read lunch_rate_eur, which meal_rates does not have: every
//     meal priced 0 and the stored cost was never used;
//   * a guide line read the legacy guides view, never guide_rates.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  getCurrentUserRole: async () => 'agent',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/org-rate-currency', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-rate-currency')>()),
  getOrgRateCurrency: async () => 'USD',
}))
// 1 USD = 50 EGP.
vi.mock('@/lib/rates/fx-source', async (orig) => ({
  ...(await orig<typeof import('@/lib/rates/fx-source')>()),
  fetchRunExchangeRates: async () => ({ base: 'USD', date: '2027-01-01', rates: { USD: 1, EGP: 50, EUR: 0.9 } }),
}))

import { POST as calculatePrice } from '@/app/api/b2b/calculate-price/route'

const post = (body: unknown) => new NextRequest('http://localhost/api/b2b/calculate-price', { method: 'POST', body: JSON.stringify(body) })
const svc = (id: string, over: Record<string, unknown>) => ({
  id, variation_id: 'var-1', quantity_mode: 'per_pax', quantity_value: 1, sequence_order: 0, is_optional: false, ...over,
})

function install(services: Record<string, unknown>[], extra: Record<string, unknown[]> = {}) {
  setMockTables({
    organizations: [{ id: 'org-1', default_margin_percent: 0 }],
    tour_templates: [{ id: 'tpl-1', template_name: 'Luxor Day', duration_days: 1 }],
    tour_variations: [{ id: 'var-1', variation_name: 'Luxor Day - Standard', tier: 'standard', min_pax: 1, tour_templates: { id: 'tpl-1', template_name: 'Luxor Day', duration_days: 1 } }],
    tour_variation_services: services,
    entrance_fees: [{ id: 'fee-karnak', attraction_name: 'Karnak Temple', eur_rate: 600, non_eur_rate: 600, rate_currency: 'EGP', is_active: true }],
    meal_rates: [],
    guide_rates: [],
    guides: [],
    activity_rates: [],
    b2b_partners: [], b2b_partner_pricing: [], extras_catalogue: [], seasonal_premiums: [],
    ...extra,
  } as any)
}

async function lines(body: Record<string, unknown> = {}) {
  const res = await calculatePrice(post({ variation_id: 'var-1', num_pax: 2, travel_date: '2027-05-01', is_eur_passport: true, margin_percent: 0, ...body }))
  const json = await res.json()
  return json.data.services as any[]
}

describe('calculate-price: Guides & Services lines', () => {
  beforeEach(() => install([]))

  it('an entrance fee entered in EGP is converted into the USD quote', async () => {
    install([svc('s-karnak', { service_name: 'Karnak', service_category: 'entrance', rate_type: 'entrance' })])
    const [karnak] = await lines()
    expect(karnak).toMatchObject({ rate_source: 'entrance_fees', unit_cost: 12, line_total: 24 })
  })

  it('a tiered activity entered in EGP has its band converted', async () => {
    install([svc('s-felucca', { service_name: 'Felucca Ride', service_category: 'activity', rate_type: 'activity' })], {
      activity_rates: [{ id: 'act-1', activity_name: 'Felucca Ride', pricing_type: 'tiered', is_active: true, rate_currency: 'EGP',
        tiers: [{ min_pax: 1, max_pax: 4, rate_eur: 500 }, { min_pax: 5, max_pax: 10, rate_eur: 400 }] }],
    })
    const [felucca] = await lines()
    expect(felucca).toMatchObject({ rate_source: 'activity_tiers', unit_cost: 10, line_total: 20 })
  })

  it('a meal line prices from meal_rates (meal_type, base_rate_eur), converted', async () => {
    install([svc('s-lunch', { service_name: 'Lunch at local restaurant', service_category: 'meal', rate_type: 'meal' })], {
      meal_rates: [{ id: 'm-1', restaurant_name: 'Sofra', meal_type: 'lunch', tier: 'standard', base_rate_eur: 1000, rate_currency: 'EGP', is_active: true }],
    })
    const [lunch] = await lines()
    expect(lunch).toMatchObject({ rate_source: 'meal_rates', unit_cost: 20, line_total: 40 })
  })

  it('with no meal rate, the line falls back to its stored cost — it priced 0', async () => {
    install([svc('s-lunch', { service_name: 'Lunch', service_category: 'meal', rate_type: 'meal', cost_per_unit: 15 })])
    const [lunch] = await lines()
    expect(lunch).toMatchObject({ rate_source: 'stored', unit_cost: 15, line_total: 30 })
  })

  it('a guide line prices from guide_rates like the engine (not the legacy guides view)', async () => {
    install([svc('s-guide', { service_name: 'Egyptologist guide', service_category: 'guide', rate_type: 'guide', quantity_mode: 'fixed' })], {
      guide_rates: [{ id: 'gr-1', guide_language: 'english', guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'spot', base_rate_eur: 2500, rate_currency: 'EGP', is_active: true }],
      guides: [{ id: 'legacy', name: 'Old Guide', daily_rate: 999, languages: ['English'], is_active: true }],
    })
    const [g] = await lines({ language: 'English' })
    expect(g).toMatchObject({ rate_source: 'guide_rates', unit_cost: 50, line_total: 50 })
  })
})
