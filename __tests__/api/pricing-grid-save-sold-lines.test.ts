// The grid's save writes what the grid SELLS — and stores their sum as the
// trip's total, so every difference was a stored total that was not the quote:
//   - guide off: the guide's rows and the guide's TIPS were still written
//     (and the on-screen price kept the guide's tips: a tip's id is a UUID,
//     never "guide");
//   - the single supplement was written for every party size, × pax;
//   - a typed accommodation amount: the save preferred it, the screen ignored it;
//   - each line at its rate's BASE price, not the period covering its day;
//   - the throughout guide's bed / seats / meals were never written;
//   - the season premium was dropped from the stored total.
// Every price comes from the company's stored rates now (rate-options.ts,
// mocked here as RATES), not from the request: the items below post the same
// prices the rates hold, except where a test says otherwise.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// totalUpdate: the trip's total as finally stored — inserted, then reconciled.
const state: { rpcDays: any[]; totalUpdate: number | null; inserted: any; seasons: any[] } = { rpcDays: [], totalUpdate: null, inserted: null, seasons: [] }
const tipRoles: Record<string, string> = {}
const MENA = '55555555-5555-4555-8555-555555555555'
const HOTEL_CITY: Record<string, string> = { [MENA]: 'Cairo' }

// The office's addresses, as the own-address loader reads them.
const OFFICE: Record<string, any[]> = {
  gmail_tokens: [{ email: 'bookings@desertcanvas.com' }],
  organizations: [{ office_email_addresses: [] }],
  team_members: [{ email: 'rabab.saber85@gmail.com' }],
  organization_members: [],
}
function readChain(rows: any[]) {
  const p: any = new Proxy({}, { get: (_t, k: string) => k === 'then' ? (r: any) => r({ data: rows, error: null }) : () => p })
  return p
}

function fakeDb() {
  return {
    from(table: string) {
      if (table in OFFICE) return { select: () => readChain(OFFICE[table]) }
      return {
        insert(input: any) {
          // A row or a list of rows (the trip goes through insertItineraryWithCode).
          const rows = Array.isArray(input) ? input : [input]
          if (table === 'itineraries') { state.inserted = rows[0]; state.totalUpdate = rows[0].total_cost }
          return { select: () => ({ single: async () => ({ data: { id: 'itn-1', itinerary_code: 'ITN-S-1' }, error: null }) }), then: (r: any) => r({ error: null }) }
        },
        update(patch: any) {
          if (table === 'itineraries' && 'total_cost' in patch && Object.keys(patch).length === 1) state.totalUpdate = patch.total_cost
          const chain: any = { eq: () => chain, select: () => ({ single: async () => ({ data: { id: 'itn-1', itinerary_code: 'ITN-S-1' }, error: null }) }), then: (r: any) => r({ error: null }) }
          return chain
        },
        select() {
          // Every rate here is the caller's (org-1): the foreign-rate check
          // (.neq('org_id', …)) finds none; the org-filtered reads find them.
          const rowsFor = (ids: string[]) => table === 'tipping_rates'
            ? ids.filter(id => tipRoles[id]).map(id => ({ id, role_type: tipRoles[id] }))
            : table === 'accommodation_rates'
              ? ids.filter(id => HOTEL_CITY[id]).map(id => ({ id, city: HOTEL_CITY[id] }))
              : table === 'pricing_season_dates' ? state.seasons
                : []
          const q: any = {
            ids: [] as string[],
            foreign: false,
            eq: () => q,
            lte: () => q,
            gte: () => q,
            in: (_col: string, ids: string[]) => { q.ids = ids; return q },
            neq: () => { q.foreign = true; return q },
            limit: () => q,
            maybeSingle: async () => ({ data: null, error: null }),
            then: (r: any) => r({ data: q.foreign ? [] : rowsFor(q.ids), error: null }),
          }
          return q
        },
      }
    },
    rpc: async (_fn: string, args: any) => { state.rpcDays = args.p_days; return { data: [{ days_inserted: args.p_days.length, services_inserted: 0 }], error: null } },
  }
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => fakeDb() }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1' }))
vi.mock('@/lib/org-default-margin', () => ({ getOrgDefaultMargin: async () => 0, resolveMarginPercent: ({ requested }: any) => Number(requested) || 0 }))
// The company's rate options, as the grid lists them.
const RATES = vi.hoisted(() => ({ current: {} as Record<string, any[]> }))
vi.mock('@/app/api/pricing-grid/rate-options', () => ({
  loadGridRateOptions: async () => ({ rates: RATES.current, rateCurrency: 'EUR' }),
}))

import { POST } from '@/app/api/pricing-grid/save/route'

const GUIDE_TIP = '11111111-1111-4111-8111-111111111111'
const DRIVER_TIP = '22222222-2222-4222-8222-222222222222'

const slot = (slotId: string, items: any[] = [], customAmount = 0) => ({ slotId, selectedItems: items, customAmount })
const config = (over: Record<string, unknown> = {}) => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot',
  currency: 'EUR', marginPercent: 0, startDate: '2026-12-20', clientName: 'T', ...over,
})
const hotel = { rateId: 'h1', name: 'Mena House', rateEur: 100, rateNonEur: 100, guideRate: 40 }
const supp = { rateId: 'h1_supp', name: 'Single Supplement', rateEur: 50, rateNonEur: 50 }
const DEC_PERIODS = [
  { from: '2026-06-01', to: '2026-09-30', rateEur: 100, rateNonEur: 100, name: 'Summer' },
  { from: '2026-12-01', to: '2027-01-31', rateEur: 160, rateNonEur: 170, name: 'Winter' },
]
const ratesNow = () => ({
  guide: [{ id: 'g1', name: 'Guide', rateEur: 75, rateNonEur: 75 }],
  tipping: [
    { id: GUIDE_TIP, name: 'Guide tip', rateEur: 10, rateNonEur: 10 },
    { id: DRIVER_TIP, name: 'Driver tip', rateEur: 5, rateNonEur: 5 },
  ],
  accommodation: [
    { id: 'h1', name: 'Mena House', rateEur: 100, rateNonEur: 100, guide_rate: 40, single_supp_eur: 50, single_supp_non_eur: 50 },
    { id: 'h-dec', name: 'Winter Palace', rateEur: 100, rateNonEur: 100, periods: DEC_PERIODS },
    { id: MENA, name: 'Mena House', rateEur: 100, rateNonEur: 100 },
  ],
})

async function save(days: any[], cfg = config(), totals?: any) {
  state.rpcDays = []; state.totalUpdate = null
  const res = await POST(new Request('http://x/api/pricing-grid/save', { method: 'POST', body: JSON.stringify({ config: cfg, days, totals }) }) as never)
  const json = await res.json()
  expect(json.success).toBe(true)
  return state.rpcDays.flatMap((d: any) => d.services)
}
const names = (services: any[]) => services.map((s: any) => s.service_name)

beforeEach(() => { tipRoles[GUIDE_TIP] = 'guide'; tipRoles[DRIVER_TIP] = 'driver'; RATES.current = ratesNow(); state.seasons = [] })

describe('guide off', () => {
  const days = [{ dayNumber: 1, slots: [
    slot('guide', [{ rateId: 'g1', name: 'Guide', rateEur: 75, rateNonEur: 75 }]),
    slot('tipping', [
      { rateId: GUIDE_TIP, name: 'Guide tip', rateEur: 10, rateNonEur: 10, tipRole: 'guide' },
      { rateId: DRIVER_TIP, name: 'Driver tip', rateEur: 5, rateNonEur: 5, tipRole: 'driver' },
    ]),
  ] }]

  it('writes neither the guide nor the guide’s tips; the driver’s tip stays', async () => {
    const services = await save(days, config({ withGuide: false }))
    expect(names(services)).toEqual(['Driver tip'])
    expect(state.totalUpdate).toBe(5)
  })

  it('a tip saved by an older tab, with no role, is given it from its rate row', async () => {
    const old = [{ dayNumber: 1, slots: [slot('tipping', [
      { rateId: GUIDE_TIP, name: 'Guide tip', rateEur: 10, rateNonEur: 10 },
      { rateId: DRIVER_TIP, name: 'Driver tip', rateEur: 5, rateNonEur: 5 },
    ])] }]
    expect(names(await save(old, config({ withGuide: false })))).toEqual(['Driver tip'])
  })

  it('guide on: everything', async () => {
    expect(names(await save(days))).toEqual(['Guide', 'Guide tip', 'Driver tip'])
  })
})

describe('the single supplement', () => {
  const days = [{ dayNumber: 1, slots: [slot('accommodation', [hotel, supp])] }]
  it('is written for a party of one only', async () => {
    expect(names(await save(days, config({ pax: 2 })))).toEqual(['Mena House'])
    expect(state.totalUpdate).toBe(200)
    expect(names(await save(days, config({ pax: 1 })))).toEqual(['Mena House', 'Single Supplement'])
    expect(state.totalUpdate).toBe(150)
  })
})

describe('each line at the rate of its own day', () => {
  it('a December day takes the December period, not the base (first-period) price', async () => {
    // Posted with no periods at all (a reloaded trip): the rate has them.
    const dated = { rateId: 'h-dec', name: 'Winter Palace', rateEur: 100, rateNonEur: 100 }
    const [line] = await save([{ dayNumber: 1, slots: [slot('accommodation', [dated])] }])
    expect(line).toMatchObject({ rate_eur: 160, rate_non_eur: 170, total_cost: 340 })
  })
})

describe('the throughout guide', () => {
  it('writes his bed as a group line, and it is in the stored total', async () => {
    const services = await save([{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }], config({ guideMode: 'throughout' }))
    expect(services.find((s: any) => /Throughout Guide — bed/.test(s.service_name))).toMatchObject({ total_cost: 40, quantity: 1, notes: '__grid:slot:throughout_guide|bed' })
    expect(state.totalUpdate).toBe(240)
  })
  it('none when the guide is off', async () => {
    const services = await save([{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }], config({ guideMode: 'throughout', withGuide: false }))
    expect(names(services)).toEqual(['Mena House'])
  })
})

describe('the season premium', () => {
  it("stays in the stored total — from the company's calendar, not the request", async () => {
    state.seasons = [{ season_id: 's1', start_date: '2026-12-15', end_date: '2027-01-05', pricing_seasons: { name: 'Christmas', uplift_percent: 15, is_active: true } }]
    // The request claims a 30 premium; the calendar says 15% of 200.
    await save([{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }], config(), { sellingPriceTotal: 230, seasonUplift: 30 })
    expect(state.totalUpdate).toBe(230)
    await save([{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }], config(), { sellingPriceTotal: 999, seasonUplift: 799 })
    expect(state.totalUpdate).toBe(230)
  })
  it('is the departure season\'s, not whatever the request claims (AUDIT H30)', async () => {
    state.seasons = [{ season_id: 's1', start_date: '2026-12-15', end_date: '2027-01-05', pricing_seasons: { name: 'Christmas', uplift_percent: 15, is_active: true } }]
    await save([{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }], config(), { sellingPriceTotal: 230, seasonUplift: 5000 })
    expect(state.totalUpdate).toBe(230)
  })
})

describe('the client’s email', () => {
  const days = [{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }]
  it('the office’s own address is not saved as the client’s, and the save says so', async () => {
    for (const email of ['bookings@desertcanvas.com', 'Rabab.Saber85@gmail.com']) {
      const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ config: config({ clientEmail: email }), days }) }) as never)
      const json = await res.json()
      expect(state.inserted.client_email).toBeNull()
      expect(json.warnings[0]).toMatch(/one of your own addresses/)
    }
  })
  it('a client’s own address is saved', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ config: config({ clientEmail: 'tersa@gmail.com' }), days }) }) as never)
    expect((await res.json()).warnings).toEqual([])
    expect(state.inserted.client_email).toBe('tersa@gmail.com')
  })
})

describe('where each night is', () => {
  it('a day trip to Alexandria from the Cairo hotel saves its night in Cairo, not "Alexandria"', async () => {
    const mena = { rateId: MENA, name: 'Mena House', rateEur: 100, rateNonEur: 100 }
    await save([
      { dayNumber: 1, city: 'Cairo', dayType: 'arrival', slots: [slot('accommodation', [mena])] },
      { dayNumber: 2, city: 'Alexandria', dayType: 'tour', slots: [slot('accommodation', [mena])] },
      { dayNumber: 3, city: 'Cairo', dayType: 'departure', slots: [] },
    ])
    expect(state.rpcDays.map((d: any) => [d.city, d.overnight_city])).toEqual([
      ['Cairo', 'Cairo'], ['Alexandria', 'Cairo'], ['Cairo', ''],
    ])
  })
})
