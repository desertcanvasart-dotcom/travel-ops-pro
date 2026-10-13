// The pricing grid's save prices the trip itself, from the company's stored
// rates, and stores it in the currency those rates are in (audit, Sell ›
// Pricing Grid):
//   - a price posted by the browser is not trusted: each pick is re-priced
//     from its rate row by id (a stale tab, a restored draft, an edited body);
//   - the vehicle is the one that seats the group, whatever size was picked;
//   - the trip's currency is the org's RATE currency — it was the currency
//     the grid happened to be showing, over amounts never converted to it;
//   - the partner and client must be this company's;
//   - a B2B trip stores the partner's commission, not the agency's margin;
//   - a pick whose rate is gone saves with no price, and the save says so;
//   - the stored total is the grid's own total (one rounding).
// The real rate shaping (rate-options.ts) runs against an in-memory database.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

const rpc = vi.hoisted(() => ({ days: [] as any[] }))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    ...createMockClient(),
    rpc: async (_fn: string, args: any) => { rpc.days = args.p_days; return { data: [{ days_inserted: args.p_days.length, services_inserted: 0 }], error: null } },
  }),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-1', noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }) }
})
vi.mock('@/lib/vocabulary-server', () => ({ vocabularyItemsForCurrentOrg: vi.fn(async () => []) }))
// USD 1 = JPY 150; EUR 1 = USD 1.08. No network.
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, JPY: 162 } }),
}))

// quote-from-itinerary's engine reads, not under test here.
vi.mock('@/lib/auto-pricing-service', () => ({ loadSeasonWindows: async () => [] }))
vi.mock('@/lib/rates/day-tour-vehicle', () => ({ makeDayTourVehicleFinder: () => async () => null }))

import { POST } from '@/app/api/pricing-grid/save/route'
import { POST as quoteFromItinerary } from '@/app/api/b2b/quote-from-itinerary/route'
import { calculateGrandTotals } from '@/app/pricing-grid/lib/calculator'

const HOTEL = '11111111-1111-4111-8111-111111111111'
const ROUTE = '22222222-2222-4222-8222-222222222222'
const GUIDE = '33333333-3333-4333-8333-333333333333'

function tables(over: Record<string, any[]> = {}) {
  setMockTables({
    organizations: [{ id: 'org-1', rate_currency: 'USD', default_margin_percent: 25 }],
    accommodation_rates: [{ id: HOTEL, is_active: true, tier: 'standard', property_name: 'Mena House', city: 'Cairo', pp_double_eur: 100, pp_double_non_eur: 100 }],
    transportation_rates: [{
      id: ROUTE, is_active: true, service_type: 'day_tour', route_name: 'Cairo Day Tour', city: 'Cairo',
      vehicles: [
        { key: 'sedan', rate_eur: 50, rate_non_eur: 50, capacity_min: 1, capacity_max: 3 },
        { key: 'minibus', rate_eur: 200, rate_non_eur: 200, capacity_min: 8, capacity_max: 14 },
      ],
    }],
    guide_rates: [{ id: GUIDE, is_active: true, guide_language: 'english', guide_type: 'Egyptologist', base_rate_eur: 80, base_rate_non_eur: 90 }],
    b2b_partners: [
      { id: 'partner-own', org_id: 'org-1', commission_percent: 7, default_margin_percent: 12 },
      { id: 'partner-other', org_id: 'org-2', commission_percent: 9 },
    ],
    clients: [
      { id: 'client-own', org_id: 'org-1' },
      { id: 'client-other', org_id: 'org-2' },
    ],
    itineraries: [], itinerary_versions: [], pricing_season_dates: [], b2b_transport_packages: [], org_vocabularies: [],
    activity_rates: [], airport_staff_rates: [], hotel_staff_rates: [], tipping_rates: [], entrance_fees: [], meal_rates: [], nile_cruises: [], flight_rates: [],
    gmail_tokens: [], team_members: [], organization_members: [],
    ...over,
  })
}

const slot = (slotId: string, items: any[] = [], customAmount = 0) => ({ slotId, selectedItems: items, customAmount })
const config = (over: Record<string, unknown> = {}) => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot',
  currency: 'USD', marginPercent: 0, startDate: '2026-11-03', clientName: 'T', ...over,
})

async function save(days: any[], cfg: Record<string, unknown> = config()) {
  rpc.days = []
  const res = await POST(new Request('http://x/api/pricing-grid/save', { method: 'POST', body: JSON.stringify({ config: cfg, days }) }) as never)
  return { status: res.status, json: await res.json() }
}
const lines = () => rpc.days.flatMap((d: any) => d.services)
const stored = async () => (await createMockClient().from('itineraries').select('*')).data as any[]

beforeEach(() => tables())

describe('prices come from the stored rates, not the browser', () => {
  it('a hotel posted at 1 saves at its stored 100', async () => {
    const { json } = await save([{ dayNumber: 1, slots: [slot('accommodation', [{ rateId: HOTEL, name: 'Mena House', rateEur: 1, rateNonEur: 1 }])] }])
    expect(json.success).toBe(true)
    expect(lines()[0]).toMatchObject({ rate_non_eur: 100, total_cost: 200 })
  })

  it('a guide posted at its EU price saves at the non-EU price for a non-EU party', async () => {
    await save([{ dayNumber: 1, slots: [slot('guide', [{ rateId: GUIDE, name: 'Guide', rateEur: 80, rateNonEur: 80 }])] }])
    expect(lines()[0]).toMatchObject({ total_cost: 90 })
  })

  it('a typed amount is the operator’s own and is kept', async () => {
    await save([{ dayNumber: 1, slots: [slot('other_group', [], 40)] }])
    expect(lines()[0]).toMatchObject({ total_cost: 40 })
  })

  it('a pick whose rate is gone saves with no price, and the save says so', async () => {
    const { json } = await save([{ dayNumber: 1, slots: [slot('accommodation', [{ rateId: '99999999-9999-4999-8999-999999999999', name: 'Old Hotel', rateEur: 120, rateNonEur: 120 }])] }])
    expect(lines()[0]).toMatchObject({ service_name: 'Old Hotel', total_cost: 0 })
    expect(json.unpriced).toHaveLength(1)
    expect(json.warnings.join(' ')).toMatch(/No current rate for Old Hotel/)
  })
})

describe('the vehicle seats the group', () => {
  it('a sedan picked for 2, saved for 10, is priced as the minibus', async () => {
    await save([{ dayNumber: 1, slots: [slot('route', [{ rateId: `${ROUTE}__sedan`, name: 'Sedan', rateEur: 50, rateNonEur: 50 }])] }], config({ pax: 10 }))
    expect(lines()[0]).toMatchObject({ total_cost: 200, notes: expect.stringContaining(`${ROUTE}__minibus`) })
  })
})

describe('the currency the trip is stored in', () => {
  it('is the rate currency, whatever the grid was showing — and the amounts are in it', async () => {
    const { json } = await save([{ dayNumber: 1, slots: [slot('accommodation', [{ rateId: HOTEL, name: 'Mena House', rateEur: 100, rateNonEur: 100 }])] }], config({ currency: 'JPY' }))
    const [itn] = await stored()
    expect(itn.currency).toBe('USD')
    expect(itn.total_cost).toBe(200)
    expect(json.currency).toBe('USD')
  })
})

describe('the partner and the client', () => {
  const days = [{ dayNumber: 1, slots: [slot('accommodation', [{ rateId: HOTEL, name: 'Mena House', rateEur: 100, rateNonEur: 100 }])] }]

  it("another company's partner is refused before anything is written", async () => {
    const { status } = await save(days, config({ clientType: 'b2b', partnerId: 'partner-other' }))
    expect(status).toBe(404)
    expect(await stored()).toEqual([])
  })

  it("another company's client is refused; the company's own is linked", async () => {
    expect((await save(days, config({ clientId: 'client-other' }))).status).toBe(404)
    expect(await stored()).toEqual([])
    await save(days, config({ clientId: 'client-own' }))
    expect((await stored())[0].client_id).toBe('client-own')
  })

  it("a B2B trip stores the partner's commission, not the agency's margin", async () => {
    await save(days, config({ clientType: 'b2b', partnerId: 'partner-own', marginPercent: 15 }))
    const [itn] = await stored()
    expect(itn.partner_id).toBe('partner-own')
    expect(itn.partner_commission_percent).toBe(7)
  })
})

describe('one rounding for the screen and the save', () => {
  it('a group cost of 100 for 3 at 25% is 125.00 on screen and stored', async () => {
    tables({ guide_rates: [{ id: GUIDE, is_active: true, guide_language: 'english', base_rate_eur: 100, base_rate_non_eur: 100 }] })
    const days = [{ dayNumber: 1, slots: [slot('guide', [{ rateId: GUIDE, name: 'Guide', rateEur: 100, rateNonEur: 100 }])] }]
    await save(days, config({ pax: 3, marginPercent: 25 }))
    expect((await stored())[0].total_cost).toBe(125)
    const screen = calculateGrandTotals(days as never, config({ pax: 3, marginPercent: 25, rateCurrency: 'USD' }) as never)
    expect(screen.sellingPriceTotal).toBe(125)
  })
})

describe('a B2B quote built from the saved trip', () => {
  it('reads the stored amounts in the currency they are in — no conversion when the grid showed JPY', async () => {
    // A typed group amount and a cruise line keep the itinerary's price in
    // the quote; they are the lines a wrong currency label used to divide by ~150.
    const days = [{ dayNumber: 1, city: 'Cairo', slots: [slot('other_group', [], 40)] }]
    const { json } = await save(days, config({ currency: 'JPY', clientType: 'b2b', partnerId: 'partner-own', marginPercent: 0 }))
    const [itn] = await stored()
    // The grid's RPC wrote the days; hand them to the quote route as the
    // embedded select returns them.
    setMockTables({
      organizations: [{ id: 'org-1', rate_currency: 'USD', default_margin_percent: 25 }],
      itineraries: [itn],
      itinerary_days: rpc.days.map((d: any, i: number) => ({ id: `day-${i}`, itinerary_id: json.itineraryId, ...d, itinerary_services: d.services })),
      b2b_partners: [{ id: 'partner-own', org_id: 'org-1', commission_percent: 7, default_margin_percent: 0 }],
      meal_rates: [], guides: [], tour_quotes: [], quote_versions: [], activity_rates: [], entrance_fees: [], accommodation_rates: [],
    })
    const res = await quoteFromItinerary(new Request('http://x', { method: 'POST', body: JSON.stringify({ itinerary_id: json.itineraryId, partner_id: 'partner-own', margin_percent: 0 }) }) as never)
    const quote = await res.json()
    expect(res.ok).toBe(true)
    // 40 USD — not 40 read as yen and divided down to ~0.27.
    expect(quote.data.total_cost).toBe(40)
  })
})
