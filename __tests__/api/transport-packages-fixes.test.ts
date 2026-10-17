// ============================================
// Tours › Transport Packages — the routes after the audit (2026-10)
// ============================================
// #3  the AI itinerary paths fetched packages without the rate normalizer:
//     an EGP package became that many dollars of cost.
// #4  the B2B calculator's own-service-list path read Luxor→Aswan only, any
//     length, in no order, unconverted, with the vehicle sized on num_pax
//     (default 2) instead of everyone travelling.
// #8  the package API took a duration of 0 or less and a second active
//     package for the same type, length and route.
// #10 a partner's per-variation margin override applied outside its dates.
// #1/#6 the dead /api/b2b/pricing-rules routes are gone.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-1',
    getCurrentUserId: async () => 'user-1',
    getCurrentUserRole: async () => 'manager',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
// The company prices in USD. EUR 1 = USD 1.08 = EGP 54. No network.
vi.mock('@/lib/org-rate-currency', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-rate-currency')>()),
  getOrgRateCurrency: async () => 'USD',
}))
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, EGP: 54 } }),
}))
// The vocabulary is not under test: the vehicles arrive as sent.
vi.mock('@/lib/rates/vehicle-bands-server', () => ({
  resolveVehicleWrite: async (body: { vehicles?: unknown[] }) => ({ ok: true, patch: body.vehicles ? { vehicles: body.vehicles } : null }),
}))

import { fetchCruiseTransportPricingRules } from '@/lib/auto-pricing-service'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import { POST as calculatePrice } from '@/app/api/b2b/calculate-price/route'
import { POST as createPackage } from '@/app/api/b2b/transport-packages/route'
import { PUT as updatePackage } from '@/app/api/b2b/transport-packages/[id]/route'

const req = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

// Per-vehicle prices in the package's own currency (EGP).
const pkg = (id: string, over: Record<string, unknown> = {}) => ({
  id, org_id: 'org-1', package_code: id, package_name: id, package_type: 'cruise_sightseeing',
  duration_days: 5, origin_city: 'Luxor', destination_city: 'Aswan', created_at: '2026-01-01T00:00:00Z',
  rate_currency: 'EGP', is_active: true, includes: null, notes: null,
  sedan_rate: 2700, sedan_capacity: 3, minivan_rate: 4050, minivan_capacity: 7, van_rate: 5400, van_capacity: 12,
  minibus_rate: null, minibus_capacity: null, bus_rate: null, bus_capacity: null,
  ...over,
})

// A 6-day template that boards in Luxor and sails four nights to Aswan.
const itinerary = [
  { day: 1, city: 'Luxor' },
  { day: 2, city: 'Luxor', is_cruise_day: true }, { day: 3, city: 'Edfu', is_cruise_day: true },
  { day: 4, city: 'Kom Ombo', is_cruise_day: true }, { day: 5, city: 'Aswan', is_cruise_day: true },
  { day: 6, city: 'Aswan' },
]
const TEMPLATE = { id: 'tpl-1', org_id: 'org-1', template_name: 'Nile Classic', duration_days: 6, uses_day_builder: false, itinerary }

function seed(packages: Record<string, unknown>[], extra: Record<string, Record<string, unknown>[]> = {}) {
  setMockTables({
    organizations: [{ id: 'org-1', default_margin_percent: 0 }],
    tour_templates: [TEMPLATE],
    tour_variations: [{ id: 'var-1', org_id: 'org-1', variation_name: 'Nile Classic - Standard', tier: 'standard',
      tour_templates: { id: 'tpl-1', template_name: 'Nile Classic', duration_days: 6, uses_day_builder: false } }],
    tour_variation_services: [{ id: 'svc-1', variation_id: 'var-1', service_name: 'Cruise sightseeing transport', service_category: 'transportation', rate_type: 'transportation', quantity_mode: 'fixed', sequence_order: 1, day_number: 2 }],
    b2b_transport_packages: packages,
    b2b_partners: [], b2b_partner_pricing: [], extras_catalogue: [], exchange_rates: [],
    ...extra,
  })
}
const sightseeingLine = async (body: Record<string, unknown>) => {
  const res = await calculatePrice(req('/api/b2b/calculate-price', 'POST', { variation_id: 'var-1', travel_date: '2027-03-01', margin_percent: 0, ...body }))
  const json = await res.json()
  return json.data.services.find((s: any) => s.service_id === 'svc-1')
}

describe('#3 — the AI paths convert a package into the run currency', () => {
  beforeEach(() => seed([pkg('p5')]))
  it('the fetch converts EGP to USD when handed the normalizer the call sites now pass', async () => {
    const [raw] = await fetchCruiseTransportPricingRules('org-1')
    expect(raw.van_rate).toBe(5400)
    const [converted] = await fetchCruiseTransportPricingRules('org-1', createRateNormalizer('USD'))
    expect(converted.van_rate).toBe(108)
  })
})

describe('#4 — the calculator on a variation with its own service list', () => {
  it("prices the sailing's length (nights + 1), converted, for everyone travelling", async () => {
    seed([pkg('p4', { duration_days: 4, van_rate: 99999, sedan_rate: 99999 }), pkg('p5')])
    // 6 adults + 2 children + 1 infant = 9 → the van (up to 12), EGP 5400 = USD 108.
    const line = await sightseeingLine({ num_adults: 6, num_children: 2, num_infants: 1 })
    expect(line).toMatchObject({ rate_source: 'b2b_package', unit_cost: 108, line_total: 108 })
    expect(line.pricing_note).toContain('(9 pax)')
  })

  it('a package for the other direction, or of the wrong length, is not used', async () => {
    seed([pkg('up', { origin_city: 'Aswan', destination_city: 'Luxor' }), pkg('p4', { duration_days: 4 })])
    const line = await sightseeingLine({ num_pax: 2 })
    expect(line.rate_source).not.toBe('b2b_package')
  })

  it('the pick is fixed: the first package created, whatever order the rows come in', async () => {
    const older = pkg('older', { created_at: '2026-01-01T00:00:00Z', sedan_rate: 2700 })
    const newer = pkg('newer', { created_at: '2026-04-01T00:00:00Z', sedan_rate: 5400 })
    seed([newer, older])
    expect((await sightseeingLine({ num_pax: 2 })).unit_cost).toBe(54)
    seed([older, newer])
    expect((await sightseeingLine({ num_pax: 2 })).unit_cost).toBe(54)
  })
})

describe('#8 — the package API refuses rows that contradict each other', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    package_name: 'Cruise Sightseeing 5D', package_type: 'cruise_sightseeing', origin_city: 'Luxor', destination_city: 'Aswan',
    duration_days: 5, is_active: true, vehicles: [{ key: 'van', rate_eur: 100, capacity_min: 1, capacity_max: 12 }], ...over,
  })

  it('a duration of 0, a negative one or a fraction is a 400', async () => {
    seed([pkg('p5')])
    for (const d of [0, -3, 2.5]) {
      expect((await createPackage(req('/api/b2b/transport-packages', 'POST', body({ duration_days: d })))).status).toBe(400)
    }
    expect((await updatePackage(req('/api/b2b/transport-packages/p5', 'PUT', { duration_days: -1 }), params('p5'))).status).toBe(400)
  })

  it('a second active package of the same type, length and route is a 409; inactive or another length is fine', async () => {
    seed([pkg('p5')])
    const dup = await createPackage(req('/api/b2b/transport-packages', 'POST', body({ origin_city: 'luxor' })))
    expect(dup.status).toBe(409)
    expect((await dup.json()).error).toContain('"p5"')
    expect((await createPackage(req('/api/b2b/transport-packages', 'POST', body({ is_active: false })))).status).toBe(200)
    expect((await createPackage(req('/api/b2b/transport-packages', 'POST', body({ duration_days: 4 })))).status).toBe(200)
  })

  it('an edit that would duplicate another active package is a 409; saving a package over itself is not', async () => {
    seed([pkg('p5'), pkg('p4', { duration_days: 4 })])
    expect((await updatePackage(req('/api/b2b/transport-packages/p4', 'PUT', { duration_days: 5 }), params('p4'))).status).toBe(409)
    expect((await updatePackage(req('/api/b2b/transport-packages/p5', 'PUT', { package_name: 'Renamed', duration_days: 5 }), params('p5'))).status).toBe(200)
  })
})

describe("#10 — a partner's override applies only on its dates", () => {
  const partner = { b2b_partners: [{ id: 'p-1', org_id: 'org-1', default_margin_percent: 12 }] }
  const priced = async (travel_date: string) => {
    const res = await calculatePrice(req('/api/b2b/calculate-price', 'POST', { variation_id: 'var-1', num_pax: 2, travel_date, partner_id: 'p-1', margin_percent: null }))
    return (await res.json()).data.margin_percent
  }
  beforeEach(() => seed([pkg('p5')], {
    ...partner,
    b2b_partner_pricing: [{ id: 'pp-1', partner_id: 'p-1', variation_id: 'var-1', margin_percent_override: 8, is_active: true, valid_from: '2027-01-01', valid_to: '2027-03-31' }],
  }))
  it('inside its dates the override wins; outside, the partner default', async () => {
    expect(await priced('2027-02-15')).toBe(8)
    expect(await priced('2027-04-01')).toBe(12)
    expect(await priced('2026-12-31')).toBe(12)
  })
})

describe('#1/#6 — the dead pricing-rules API is gone', () => {
  it('no route serves /api/b2b/pricing-rules', () => {
    expect(existsSync('app/api/b2b/pricing-rules/route.ts')).toBe(false)
    expect(existsSync('app/api/b2b/pricing-rules/[id]/route.ts')).toBe(false)
  })
})

describe('#7/#8 — the form says what is used where, and warns before a length is left empty', () => {
  const page = readFileSync('app/b2b/pricing-rules/page.tsx', 'utf8')
  const en = JSON.parse(readFileSync('messages/en.json', 'utf8')).b2bPricingRules
  const ja = JSON.parse(readFileSync('messages/ja.json', 'utf8')).b2bPricingRules

  it('helper text under Package Type, the cities and Duration, in both languages', () => {
    for (const k of ['typeHelp', 'routeHelp', 'durationHelp']) {
      expect(page).toContain(`t('${k}')`)
      expect(en[k]).toBeTruthy()
      expect(ja[k]).toBeTruthy()
    }
    expect(en.typeHelp).toContain('Only Cruise Sightseeing packages price a cruise automatically')
  })

  it('duration cannot be typed below 1; deleting or changing the last package of a length asks first', () => {
    expect(page).toContain('min={1}')
    expect(page).toContain("validDuration(packageForm.duration_days) === null")
    expect(page).toMatch(/lengthLeftWithout\(pkg, null, transportPackages\)/)
    expect(page).toMatch(/lengthLeftWithout\(editingPackage, packageForm, transportPackages\)/)
  })

  it('the orphaned activity-rule strings are gone', () => {
    for (const k of ['addRule', 'ruleCreated', 'pricingModel', 'tier1Default']) {
      expect(en[k]).toBeUndefined()
      expect(ja[k]).toBeUndefined()
    }
  })
})
