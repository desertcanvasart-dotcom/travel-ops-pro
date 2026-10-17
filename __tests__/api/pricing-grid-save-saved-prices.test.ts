// A re-saved itinerary's line with no current rate keeps the price it was
// saved with (Sell › Pricing Grid). Since every pick was re-priced from the
// rates list, a line saved before rate ids were stored, typed in, or whose
// rate was since removed was re-saved at 0 — the trip's real price lost.
// The save reads the stored price from the line's own itinerary_services row
// of THE itinerary being re-saved — never the browser's figure — and a line
// with neither a current rate nor such a row stays unpriced.
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
// Rates › Fixed Costs are charged by the grid on every sightseeing day since
// 2026-10-14 (pricing-grid-save-fixed-costs.test.ts owns that). Not under test
// here: with none, a day's first line is still the pick this file is about.
vi.mock('@/lib/fixed-costs', () => ({
  getFixedDailyCosts: async () => ({ waterPerPersonPerDay: 0, items: [], extraItems: [], warnings: [] }),
}))
// EUR 1 = USD 1.08 = JPY 162. No network.
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, JPY: 162 } }),
}))

import { POST } from '@/app/api/pricing-grid/save/route'

const HOTEL = '11111111-1111-4111-8111-111111111111'
const ITN = 'aaaaaaaa-0000-4000-8000-000000000001'
const ITN_SAME_ORG = 'aaaaaaaa-0000-4000-8000-000000000002'
const ITN_OTHER_ORG = 'aaaaaaaa-0000-4000-8000-000000000003'
// Lines of ITN: one typed in (no rate id), one whose rate is gone, one in EUR.
const SVC_TYPED = 'bbbbbbbb-0000-4000-8000-000000000001'
const SVC_GONE = 'bbbbbbbb-0000-4000-8000-000000000002'
const SVC_EUR = 'bbbbbbbb-0000-4000-8000-000000000003'
const SVC_SAME_ORG = 'bbbbbbbb-0000-4000-8000-000000000004'
const SVC_OTHER_ORG = 'bbbbbbbb-0000-4000-8000-000000000005'
const GONE_RATE = '99999999-9999-4999-8999-999999999999'

const svc = (id: string, itineraryId: string, over: Record<string, unknown> = {}) => ({
  id, service_type: 'accommodation', service_name: 'Old Nile Hotel', rate_eur: 120, rate_non_eur: 130,
  supplier_id: null, supplier_currency: null, exchange_rate_used: null,
  itinerary_days: { itinerary_id: itineraryId }, ...over,
})

function tables() {
  setMockTables({
    organizations: [{ id: 'org-1', rate_currency: 'USD', default_margin_percent: 25 }],
    accommodation_rates: [{ id: HOTEL, is_active: true, tier: 'standard', property_name: 'Mena House', city: 'Cairo', pp_double_eur: 100, pp_double_non_eur: 100 }],
    itineraries: [
      { id: ITN, org_id: 'org-1', currency: 'USD', itinerary_code: 'ITN-1' },
      { id: ITN_SAME_ORG, org_id: 'org-1', currency: 'USD', itinerary_code: 'ITN-2' },
      { id: ITN_OTHER_ORG, org_id: 'org-2', currency: 'USD', itinerary_code: 'ITN-3' },
    ],
    itinerary_services: [
      svc(SVC_TYPED, ITN, { supplier_id: 'sup-1' }),
      svc(SVC_GONE, ITN, { service_name: 'Closed Lodge', rate_eur: 80, rate_non_eur: 90 }),
      // Stored in EUR (its supplier currency) at 1.10 into the trip's USD.
      svc(SVC_EUR, ITN, { service_name: 'Euro Camp', rate_eur: 100, rate_non_eur: 100, supplier_currency: 'EUR', exchange_rate_used: 1.1 }),
      svc(SVC_SAME_ORG, ITN_SAME_ORG, { rate_eur: 500, rate_non_eur: 500 }),
      svc(SVC_OTHER_ORG, ITN_OTHER_ORG, { rate_eur: 700, rate_non_eur: 700 }),
    ],
    transportation_rates: [], guide_rates: [], b2b_partners: [], clients: [],
    itinerary_versions: [], pricing_season_dates: [], b2b_transport_packages: [], org_vocabularies: [],
    activity_rates: [], airport_staff_rates: [], hotel_staff_rates: [], tipping_rates: [], entrance_fees: [], meal_rates: [], nile_cruises: [], flight_rates: [],
    gmail_tokens: [], team_members: [], organization_members: [],
  })
}

const config = (over: Record<string, unknown> = {}) => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot',
  currency: 'USD', marginPercent: 0, startDate: '2026-11-03', clientName: 'T', itineraryId: ITN, ...over,
})
const hotelDay = (items: any[]) => [{ dayNumber: 1, slots: [{ slotId: 'accommodation', selectedItems: items, customAmount: 0 }] }]

async function save(days: any[], cfg: Record<string, unknown> = config()) {
  rpc.days = []
  const res = await POST(new Request('http://x/api/pricing-grid/save', { method: 'POST', body: JSON.stringify({ config: cfg, days }) }) as never)
  return { status: res.status, json: await res.json() }
}
const lines = () => rpc.days.flatMap((d: any) => d.services)

beforeEach(() => tables())

describe('a re-saved line with no current rate keeps its stored price', () => {
  it('a typed-in line (no rate id) keeps 130 per person — the browser’s 9999 is ignored', async () => {
    // A reload with no rate id in the notes carries the row id as its rateId.
    const { json } = await save(hotelDay([{ rateId: SVC_TYPED, serviceId: SVC_TYPED, name: 'Old Nile Hotel', rateEur: 9999, rateNonEur: 9999, savedPrice: true }]))
    expect(json.success).toBe(true)
    expect(lines()[0]).toMatchObject({ rate_eur: 120, rate_non_eur: 130, total_cost: 260, supplier_id: 'sup-1' })
    expect(json.unpriced).toEqual([])
    expect(json.totalCost).toBe(260)
  })

  it('a line whose rate was removed keeps its stored price, even when the browser does not mark it', async () => {
    const { json } = await save(hotelDay([{ rateId: GONE_RATE, serviceId: SVC_GONE, name: 'Closed Lodge', rateEur: 0, rateNonEur: 0 }]))
    expect(lines()[0]).toMatchObject({ service_name: 'Closed Lodge', rate_non_eur: 90, total_cost: 180 })
    expect(json.unpriced).toEqual([])
  })

  it('a stored price in another currency is put in the rate currency by the line’s own exchange rate', async () => {
    await save(hotelDay([{ rateId: SVC_EUR, serviceId: SVC_EUR, name: 'Euro Camp', rateEur: 1, rateNonEur: 1 }]))
    // EUR 100 × 1.10 = USD 110 per person.
    expect(lines()[0]).toMatchObject({ rate_non_eur: 110, total_cost: 220 })
  })

  it('a line with a current rate is still priced from it, not its stored row', async () => {
    await save(hotelDay([{ rateId: HOTEL, serviceId: SVC_TYPED, name: 'Mena House', rateEur: 1, rateNonEur: 1, savedPrice: true }]))
    expect(lines()[0]).toMatchObject({ rate_non_eur: 100, total_cost: 200 })
  })
})

describe('only a row of the itinerary being re-saved counts', () => {
  it('a service id of another trip of the same company is not used', async () => {
    const { json } = await save(hotelDay([{ rateId: GONE_RATE, serviceId: SVC_SAME_ORG, name: 'Borrowed', rateEur: 500, rateNonEur: 500, savedPrice: true }]))
    expect(lines()[0]).toMatchObject({ total_cost: 0 })
    expect(json.unpriced).toHaveLength(1)
    expect(json.warnings.join(' ')).toMatch(/No current rate for Borrowed/)
  })

  it('a service id of another company’s trip is not used', async () => {
    const { json } = await save(hotelDay([{ rateId: GONE_RATE, serviceId: SVC_OTHER_ORG, name: 'Foreign', rateEur: 700, rateNonEur: 700, savedPrice: true }]))
    expect(lines()[0]).toMatchObject({ total_cost: 0 })
    expect(json.unpriced).toHaveLength(1)
  })

  it('a new trip takes no stored price, whatever service id it names', async () => {
    const { json } = await save(hotelDay([{ rateId: GONE_RATE, serviceId: SVC_TYPED, name: 'Copied', rateEur: 130, rateNonEur: 130, savedPrice: true }]), config({ itineraryId: null }))
    expect(lines()[0]).toMatchObject({ total_cost: 0 })
    expect(json.unpriced).toHaveLength(1)
  })

  it('a brand-new line with no rate and no stored row stays unpriced, whatever price it claims', async () => {
    const { json } = await save(hotelDay([{ rateId: GONE_RATE, name: 'Made Up', rateEur: 300, rateNonEur: 300, savedPrice: true }]))
    expect(lines()[0]).toMatchObject({ total_cost: 0 })
    expect(json.unpriced).toEqual([{ dayNumber: 1, slotId: 'accommodation', rateId: GONE_RATE, name: 'Made Up' }])
  })

  it('another company’s itinerary cannot be re-saved at all', async () => {
    const { status } = await save(hotelDay([{ rateId: GONE_RATE, serviceId: SVC_OTHER_ORG, name: 'Foreign', rateEur: 700, rateNonEur: 700 }]), config({ itineraryId: ITN_OTHER_ORG }))
    expect(status).toBe(404)
  })
})
