// The Pricing Grid charges Rates › Fixed Costs by itself (owner decision
// 2026-10-14, "option 3"): every active cost, its own named line, per person
// on every sightseeing day — no per-day pick, the same amounts as automatic
// pricing (lib/fixed-costs getFixedDailyCosts). Before, Water was a hardcoded
// EUR 0.50 single-select slot priced by whichever days the agent picked it on.
//
// The real rate shaping and the real getFixedDailyCosts run against an
// in-memory database; the server is the authority, so the browser's amounts
// are ignored.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const rpc = vi.hoisted(() => ({ days: [] as any[], store: [] as any[] }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    ...createMockClient(),
    rpc: async (_fn: string, args: any) => {
      rpc.days = args.p_days
      // The migration's matching (20261126): a day by its number, a service
      // within the day by service_type + service_name, in order; what the
      // payload no longer has is deleted.
      const next: any[] = []
      for (const d of args.p_days) {
        const old = rpc.store.find(o => o.day_number === d.day_number)
        const pool = [...(old?.services ?? [])]
        const kept: any[] = []
        for (const svc of d.services) {
          const i = pool.findIndex(o => o.service_type === svc.service_type && o.service_name === svc.service_name)
          if (i >= 0) pool.splice(i, 1)
          kept.push(svc)
        }
        next.push({ day_number: d.day_number, services: kept })
      }
      rpc.store = next
      return { data: [{ days_inserted: args.p_days.length, services_inserted: 0 }], error: null }
    },
  }),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-1', getCurrentUserId: async () => 'user-1', noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }) }
})
vi.mock('@/lib/vocabulary-server', () => ({ vocabularyItemsForCurrentOrg: vi.fn(async () => []) }))
// EUR 1 = USD 1.08. No EGP, no BTC. No network.
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, JPY: 162 } }),
}))

import { POST } from '@/app/api/pricing-grid/save/route'
import { GET } from '@/app/api/pricing-grid/rates/route'
import { clearFixedCostsCache } from '@/lib/fixed-costs'
import { calculateGrandTotals } from '@/app/pricing-grid/lib/calculator'

const HOTEL = '11111111-1111-4111-8111-111111111111'
const SITE = '44444444-4444-4444-8444-444444444444'

const COSTS = [
  { cost_type: 'Water Bottle', cost_per_person_per_day: 1.5, is_active: true },
  { cost_type: 'Wifi', cost_per_person_per_day: 3, is_active: true },
  { cost_type: 'Snacks', cost_per_person_per_day: 1, rate_currency: 'EUR', is_active: true },   // → 1.08 USD
  { cost_type: 'Gold', cost_per_person_per_day: 1, rate_currency: 'BTC', is_active: true },     // no rate: not charged
  { cost_type: 'Daily Tips', cost_per_person_per_day: 5, is_active: true },                      // never here
  { cost_type: 'Retired', cost_per_person_per_day: 9, is_active: false },
]
// Water 1.50 + Snacks 1.08 + Wifi 3.00, per person per sightseeing day.
const PER_PERSON_PER_DAY = 5.58

function tables(costs: Record<string, unknown>[] = COSTS) {
  setMockTables({
    organizations: [{ id: 'org-1', rate_currency: 'USD', default_margin_percent: 25 }],
    accommodation_rates: [{ id: HOTEL, is_active: true, tier: 'standard', property_name: 'Mena House', city: 'Cairo', pp_double_eur: 100, pp_double_non_eur: 100 }],
    entrance_fees: [{ id: SITE, is_active: true, attraction_name: 'Pyramids', city: 'Cairo', eur_rate: 10, non_eur_rate: 10 }],
    fixed_daily_costs: costs.map((c, i) => ({ id: `fc-${i}`, ...c })),
    transportation_rates: [], guide_rates: [], activity_rates: [], airport_staff_rates: [], hotel_staff_rates: [], tipping_rates: [],
    meal_rates: [], nile_cruises: [], flight_rates: [], b2b_transport_packages: [], org_vocabularies: [],
    b2b_partners: [], clients: [], itineraries: [], itinerary_versions: [], pricing_season_dates: [],
    gmail_tokens: [], team_members: [], organization_members: [],
  })
  clearFixedCostsCache()
}

const slot = (slotId: string, items: any[] = [], customAmount = 0) => ({ slotId, selectedItems: items, customAmount })
const site = { rateId: SITE, name: 'Pyramids', rateEur: 10, rateNonEur: 10 }
const hotel = { rateId: HOTEL, name: 'Mena House', rateEur: 100, rateNonEur: 100 }
const config = (over: Record<string, unknown> = {}) => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot',
  currency: 'USD', marginPercent: 0, startDate: '2026-11-03', clientName: 'T', ...over,
})
// Days 1–3 sightseeing (an entrance each); day 4 is a hotel night only.
const trip = () => [
  { dayNumber: 1, slots: [slot('entrance_fees', [site])] },
  { dayNumber: 2, slots: [slot('entrance_fees', [site])] },
  { dayNumber: 3, slots: [slot('entrance_fees', [site])] },
  { dayNumber: 4, slots: [slot('accommodation', [hotel])] },
]

async function save(days: any[], cfg: Record<string, unknown> = config()) {
  rpc.days = []
  const res = await POST(new Request('http://x/api/pricing-grid/save', { method: 'POST', body: JSON.stringify({ config: cfg, days }) }) as never)
  return { status: res.status, json: await res.json() }
}
const fixedLines = () => rpc.days.flatMap((d: any) => d.services).filter((s: any) => s.service_type === 'supplies')
const stored = async () => (await createMockClient().from('itineraries').select('*')).data as any[]

beforeEach(() => { rpc.days = []; rpc.store = []; tables() })

describe('GET /api/pricing-grid/rates', () => {
  it('returns the active fixed costs and warnings — one list, in the rate currency', async () => {
    const res = await GET(new NextRequest('http://x/api/pricing-grid/rates?tier=standard'))
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.rateCurrency).toBe('USD')
    expect(json.fixedCosts.items).toEqual([
      { name: 'Water Bottle', perPersonPerDay: 1.5 },
      { name: 'Snacks', perPersonPerDay: 1.08 },
      { name: 'Wifi', perPersonPerDay: 3 },
    ])
    expect(json.fixedCosts.warnings).toEqual(['"Gold" not charged: the row is in BTC and no exchange rate was available'])
    // The old hardcoded Water option is gone from the rate lists.
    expect(json.data.water).toBeUndefined()
  })
})

describe('the save writes the fixed costs itself', () => {
  it('a trip with 3 sightseeing days gets one line per cost per day — from the table, per person', async () => {
    const { json } = await save(trip())
    expect(json.success).toBe(true)
    const lines = fixedLines()
    expect(lines).toHaveLength(3 * 3)
    // Only the three sightseeing days: never the hotel-only day 4.
    const byDay = rpc.days.map((d: any) => d.services.filter((s: any) => s.service_type === 'supplies').map((s: any) => s.service_name))
    expect(byDay).toEqual([['Water Bottle', 'Snacks', 'Wifi'], ['Water Bottle', 'Snacks', 'Wifi'], ['Water Bottle', 'Snacks', 'Wifi'], []])
    expect(lines.find((l: any) => l.service_name === 'Snacks')).toMatchObject({ quantity: 2, rate_non_eur: 1.08, total_cost: 2.16, supplier_id: null })
    // Not charged: Daily Tips, the inactive row, the unconvertible one.
    expect(lines.map((l: any) => l.service_name)).not.toContain('Daily Tips')
    expect(lines.map((l: any) => l.service_name)).not.toContain('Retired')
    expect(lines.map((l: any) => l.service_name)).not.toContain('Gold')
    // ...and the save says why Gold is missing.
    expect(json.warnings).toContain('"Gold" not charged: the row is in BTC and no exchange rate was available')
  })

  it("ignores amounts sent by the browser — config, day and the old Water pick alike", async () => {
    const days: any[] = trip()
    days[0].fixedCosts = [{ name: 'Water Bottle', perPersonPerDay: 999 }]
    days[0].slots.push(slot('water', [{ rateId: 'water-standard', name: 'Water Bottles', rateEur: 50, rateNonEur: 50 }]))
    await save(days, config({ fixedCosts: [{ name: 'Wifi', perPersonPerDay: 999 }, { name: 'Free lunch', perPersonPerDay: 7 }] }))
    const lines = fixedLines()
    expect(lines).toHaveLength(9)
    expect(lines.filter((l: any) => l.service_name === 'Wifi').every((l: any) => l.rate_non_eur === 3)).toBe(true)
    expect(lines.map((l: any) => l.service_name)).not.toContain('Free lunch')
    // The legacy Water pick is not written (nor its hardcoded name).
    expect(rpc.days.flatMap((d: any) => d.services).map((s: any) => s.service_name)).not.toContain('Water Bottles')
  })

  it('the stored total includes them, and it is the screen total', async () => {
    const days = trip()
    const cfg = config({ marginPercent: 25 })
    await save(days, cfg)
    // 3 entrances 10 × 2 = 60; hotel 100 × 2 = 200; fixed 5.58 × 3 days × 2 = 33.48.
    const cost = 60 + 200 + PER_PERSON_PER_DAY * 3 * 2
    const [itn] = await stored()
    expect(itn.total_cost).toBe(Math.round(cost * 1.25 * 100) / 100)

    // The screen: the items the rates route handed it, the same picks.
    const { json } = await (async () => ({ json: await (await GET(new NextRequest('http://x/api/pricing-grid/rates?tier=standard'))).json() }))()
    const screen = calculateGrandTotals(days as never, { ...cfg, rateCurrency: 'USD', fixedCosts: json.fixedCosts.items } as never)
    expect(screen.sellingPriceTotal).toBe(itn.total_cost)
    // Per person, the same rule: total / pax.
    expect(screen.sellingPricePerPerson).toBe(Math.round(itn.total_cost / 2 * 100) / 100)
    // Without the costs the screen would have been short of the stored price.
    expect(calculateGrandTotals(days as never, { ...cfg, rateCurrency: 'USD' } as never).sellingPriceTotal).toBeLessThan(itn.total_cost)
  })

  it('a second save does not duplicate them (the RPC replaces a line by day + type + name)', async () => {
    await save(trip())
    const first = JSON.stringify(rpc.days)
    await save(trip())
    expect(JSON.stringify(rpc.days)).toBe(first)
    expect(fixedLines()).toHaveLength(9)
    // Within a day each line is unique by type + name, which is what the RPC matches on.
    for (const d of rpc.days) {
      const keys = d.services.map((s: any) => `${s.service_type}|${s.service_name}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
    expect(rpc.store.flatMap(d => d.services).filter((s: any) => s.service_type === 'supplies')).toHaveLength(9)
    const migration = readFileSync(join(process.cwd(), 'migrations/20261126_pricing_grid_save_in_place.sql'), 'utf8')
    expect(migration).toMatch(/service_type = v_svc->>'service_type'\s+and service_name is not distinct from v_svc->>'service_name'/)
  })

  it('a trip reloaded with earlier fixed-cost lines is not charged twice: they are no picks, the save writes the lines once', async () => {
    // What a reload hands back for earlier lines: the grid's own, the AI builders' water and the engine's.
    const { mapServicesToSlots } = await import('@/app/pricing-grid/lib/slot-mapping')
    const slots = mapServicesToSlots([
      { id: 's1', service_type: 'supplies', service_name: 'Water Bottles', quantity: 2, rate_eur: 0.5, rate_non_eur: 0.5, total_cost: 1, notes: '__grid:slot:water|rate_id:water-standard' },
      { id: 's2', service_type: 'supplies', service_name: 'Wifi', quantity: 2, rate_eur: 3, rate_non_eur: 3, total_cost: 6, notes: '__grid:slot:fixed_cost' },
      { id: 's3', service_type: 'supplies', service_name: 'Water Bottles', quantity: 2, rate_eur: 2, rate_non_eur: 2, total_cost: 4, notes: 'Bottled water' },
      { id: 's4', service_type: 'water', service_name: 'Bottled Water', quantity: 1, rate_eur: 2, rate_non_eur: 2, total_cost: 2, notes: 'Bottled water for sightseeing' },
      { id: 's5', service_type: 'entrance', service_name: 'Pyramids', quantity: 2, rate_eur: 10, rate_non_eur: 10, total_cost: 20, notes: `__grid:slot:entrance_fees|rate_id:${SITE}` },
    ], 2)
    expect(slots.some(s => s.slotId === 'water' || s.slotId === 'fixed_cost')).toBe(false)
    expect(slots.flatMap(s => s.selectedItems).map(i => i.name)).toEqual(['Pyramids'])
    expect(slots.find(s => s.slotId === 'other_group')?.selectedItems).toEqual([])
    const day = { dayNumber: 1, slots }
    await save([day])
    expect(fixedLines().map((l: any) => l.service_name)).toEqual(['Water Bottle', 'Snacks', 'Wifi'])
  })
})

describe('no usable fixed costs', () => {
  it('no rows: Water is charged at the built-in 2.00 with its warning, and nothing else', async () => {
    tables([])
    const { json } = await save(trip())
    expect(fixedLines().map((l: any) => [l.service_name, l.rate_non_eur])).toEqual([['Water Bottle', 2], ['Water Bottle', 2], ['Water Bottle', 2]])
    expect(json.warnings.join(' ')).toMatch(/Water priced at the built-in 2\.00 per person per day: no active "Water Bottle" row/)
  })

  it('a cost whose currency cannot be converted is warned and not charged', async () => {
    tables([
      { cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true },
      { cost_type: 'Gold', cost_per_person_per_day: 1, rate_currency: 'BTC', is_active: true },
    ])
    const { json } = await save(trip())
    expect(fixedLines().map((l: any) => l.service_name)).toEqual(['Water Bottle', 'Water Bottle', 'Water Bottle'])
    expect(json.warnings.join(' ')).toMatch(/"Gold" not charged/)
  })

  it('the Water Bottle row in an unconvertible currency falls back to 2.00, with its warning', async () => {
    tables([{ cost_type: 'Water Bottle', cost_per_person_per_day: 20, rate_currency: 'BTC', is_active: true }])
    const { json } = await save(trip())
    expect(fixedLines().every((l: any) => l.rate_non_eur === 2)).toBe(true)
    expect(json.warnings.join(' ')).toMatch(/no exchange rate was available/)
  })
})

describe('what makes a day a sightseeing day', () => {
  it('a guide pick or an attraction does; a hotel night alone does not; guide off drops the guide’s day', async () => {
    const days = [
      { dayNumber: 1, slots: [slot('guide', [], 80)] },                // a typed guide amount
      { dayNumber: 2, slots: [slot('accommodation', [hotel])] },       // nothing to see
      { dayNumber: 3, slots: [slot('experiences', [], 25)] },          // an activity
    ]
    await save(days)
    expect(rpc.days.map((d: any) => d.services.filter((s: any) => s.service_type === 'supplies').length)).toEqual([3, 0, 3])
    // Guide switched off: the guide sells nothing, so day 1 is not a sightseeing day.
    await save(days, config({ withGuide: false }))
    expect(rpc.days.map((d: any) => d.services.filter((s: any) => s.service_type === 'supplies').length)).toEqual([0, 0, 3])
  })
})
