// ============================================
// A partner's own margin prices a B2B calculator quote — on screen and saved
// ============================================
// Sell follow-up (2026-10-13): the calculator never sent the partner to the
// engine, and POST /api/b2b/quotes re-priced without it, so a partner's
// default margin (b2b_partners) or per-variation override
// (b2b_partner_pricing) never reached a calculator quote. Now both calls carry
// the partner, the engine resolves the margin once (lib/b2b/partner-margin),
// and a margin the operator set still wins.
//
// The REAL calculate-price route prices the screen and the save; only the
// day-builder engine underneath is canned, as cost 1000 + the margin it is
// handed, so the margin that reached it is visible in the price.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { quoteMarginPercent } from '@/lib/b2b/partner-margin'

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
vi.mock('@/lib/org-rate-currency', () => ({ getOrgRateCurrency: async () => 'EUR' }))
vi.mock('@/lib/auto-pricing-service', async (orig) => {
  const real = await orig<typeof import('@/lib/auto-pricing-service')>()
  const price = async (p: { marginPercent: number; numPax: number }) => {
    const marginAmount = Math.round(1000 * p.marginPercent) / 100
    return {
      success: true, complete: true, holes: [], warnings: [],
      services: [{ id: 'd1-guide', serviceName: 'Guide', serviceType: 'guide', rateSource: 'guide_rates', quantityMode: 'fixed', quantity: 1, unitCost: 1000, lineTotal: 1000, isOptional: false, dayNumber: 1 }],
      optionalServices: [], accommodationNights: [],
      subtotalCost: 1000, optionalTotal: 0, totalCost: 1000, tourLeaderCost: 0,
      marginPercent: p.marginPercent, marginAmount, sellingPrice: 1000 + marginAmount,
      pricePerPerson: (1000 + marginAmount) / p.numPax, singleSupplement: 0, currency: 'EUR',
      baseSellingPrice: 1000 + marginAmount, seasonUplift: null, paxPricingTable: [],
    }
  }
  return { ...real, calculateAutoPricing: vi.fn(price), calculatePricingWithPassengerBreakdown: vi.fn(price) }
})

import { POST as calculatePrice } from '@/app/api/b2b/calculate-price/route'
import { POST as saveQuote } from '@/app/api/b2b/quotes/route'

const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]

beforeEach(() => {
  setMockTables({
    organizations: [{ id: 'org-1', default_margin_percent: 18 }],
    tour_templates: [{ id: 'tpl-1', template_name: 'Classic Egypt', duration_days: 1, uses_day_builder: true }],
    tour_variations: [{ id: 'var-1', variation_name: 'Classic Egypt - Standard', tier: 'standard', tour_templates: { id: 'tpl-1', template_name: 'Classic Egypt', duration_days: 1, uses_day_builder: true } }],
    tour_variation_services: [],
    b2b_partners: [
      { id: 'p-1', org_id: 'org-1', default_margin_percent: 12 },
      { id: 'p-zero', org_id: 'org-1', default_margin_percent: 0 },
      { id: 'p-2', org_id: 'org-1', default_margin_percent: 12 },
    ],
    b2b_partner_pricing: [{ id: 'pp-1', partner_id: 'p-2', variation_id: 'var-1', margin_percent_override: 8, is_active: true }],
    tour_quotes: [],
    quote_versions: [],
    extras_catalogue: [],
  })
})

// What the calculator page sends: the margin only once the operator set one,
// and the partner picked in the Save dialog — to the engine and to the save.
const asked = (partner: string | null, margin: number | null) => ({
  variation_id: 'var-1', num_pax: 2, travel_date: '2027-05-01', is_eur_passport: true,
  margin_percent: margin, partner_id: partner,
})

async function screenThenSave(partner: string | null, margin: number | null) {
  const screen = (await (await calculatePrice(post('/api/b2b/calculate-price', asked(partner, margin)))).json()).data
  const saved = await saveQuote(post('/api/b2b/quotes', {
    ...asked(partner, null), num_adults: 2, margin_percent: margin, selling_price: screen.selling_price,
  }))
  const json = await saved.json()
  return { screen, status: saved.status, stored: (await rows('tour_quotes')).find((q) => q.id === json.data?.id) }
}

describe('the partner margin rule', () => {
  it('operator’s margin → partner override → partner default → company default → 25', () => {
    expect(quoteMarginPercent({ requested: 30, partnerOverride: 8, partnerDefault: 12, orgDefault: 18 })).toBe(30)
    expect(quoteMarginPercent({ requested: 0, partnerDefault: 12 })).toBe(0)
    expect(quoteMarginPercent({ requested: null, partnerOverride: 8, partnerDefault: 12, orgDefault: 18 })).toBe(8)
    expect(quoteMarginPercent({ requested: null, partnerDefault: 12, orgDefault: 18 })).toBe(12)
    expect(quoteMarginPercent({ requested: null, partnerDefault: 0, orgDefault: 18 })).toBe(18)
    expect(quoteMarginPercent({})).toBe(25)
  })
})

describe('screen price == stored price', () => {
  it('a partner’s default margin prices the screen and the saved quote alike', async () => {
    const { screen, status, stored } = await screenThenSave('p-1', null)
    expect(screen).toMatchObject({ margin_percent: 12, selling_price: 1120 })
    expect(status).toBe(201)
    expect(stored).toMatchObject({ partner_id: 'p-1', margin_percent: 12, selling_price: screen.selling_price })
  })

  it('the partner’s margin for this variation beats its default', async () => {
    const { screen, stored } = await screenThenSave('p-2', null)
    expect(screen.selling_price).toBe(1080)
    expect(stored).toMatchObject({ margin_percent: 8, selling_price: 1080 })
  })

  it('a margin the operator set wins over the partner’s', async () => {
    const { screen, stored } = await screenThenSave('p-1', 30)
    expect(screen.selling_price).toBe(1300)
    expect(stored).toMatchObject({ partner_id: 'p-1', margin_percent: 30, selling_price: 1300 })
  })

  it('no partner, or one with no margin, takes the company’s default', async () => {
    expect((await screenThenSave(null, null)).stored).toMatchObject({ margin_percent: 18, selling_price: 1180 })
    expect((await screenThenSave('p-zero', null)).stored).toMatchObject({ margin_percent: 18, selling_price: 1180 })
  })

  it('a price shown without the partner is refused when saved with it', async () => {
    const screen = (await (await calculatePrice(post('/api/b2b/calculate-price', asked(null, null)))).json()).data
    const saved = await saveQuote(post('/api/b2b/quotes', { ...asked('p-1', null), num_adults: 2, selling_price: screen.selling_price }))
    expect(saved.status).toBe(409)
  })
})
