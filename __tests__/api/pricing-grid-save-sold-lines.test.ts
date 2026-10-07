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
import { describe, it, expect, vi, beforeEach } from 'vitest'

// totalUpdate: the trip's total as finally stored — inserted, then reconciled.
const state: { rpcDays: any[]; totalUpdate: number | null; inserted: any } = { rpcDays: [], totalUpdate: null, inserted: null }
const tipRoles: Record<string, string> = {}

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
        insert(rows: any[]) {
          if (table === 'itineraries') { state.inserted = rows[0]; state.totalUpdate = rows[0].total_cost }
          return { select: () => ({ single: async () => ({ data: { id: 'itn-1', itinerary_code: 'ITN-S-1' }, error: null }) }), then: (r: any) => r({ error: null }) }
        },
        update(patch: any) {
          if (table === 'itineraries' && 'total_cost' in patch && Object.keys(patch).length === 1) state.totalUpdate = patch.total_cost
          const chain: any = { eq: () => chain, select: () => ({ single: async () => ({ data: { id: 'itn-1', itinerary_code: 'ITN-S-1' }, error: null }) }), then: (r: any) => r({ error: null }) }
          return chain
        },
        select() {
          return {
            in: async (_col: string, ids: string[]) => ({
              data: table === 'tipping_rates'
                ? ids.filter(id => tipRoles[id]).map(id => ({ id, role_type: tipRoles[id] }))
                : [],
              error: null,
            }),
          }
        },
      }
    },
    rpc: async (_fn: string, args: any) => { state.rpcDays = args.p_days; return { data: [{ days_inserted: args.p_days.length, services_inserted: 0 }], error: null } },
  }
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => fakeDb() }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1' }))
vi.mock('@/lib/org-default-margin', () => ({ getOrgDefaultMargin: async () => 0, resolveMarginPercent: ({ requested }: any) => Number(requested) || 0 }))

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

async function save(days: any[], cfg = config(), totals?: any) {
  state.rpcDays = []; state.totalUpdate = null
  const res = await POST(new Request('http://x/api/pricing-grid/save', { method: 'POST', body: JSON.stringify({ config: cfg, days, totals }) }) as never)
  const json = await res.json()
  expect(json.success).toBe(true)
  return state.rpcDays.flatMap((d: any) => d.services)
}
const names = (services: any[]) => services.map((s: any) => s.service_name)

beforeEach(() => { tipRoles[GUIDE_TIP] = 'guide'; tipRoles[DRIVER_TIP] = 'driver' })

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
    const dated = { ...hotel, periods: [
      { from: '2026-06-01', to: '2026-09-30', rateEur: 100, rateNonEur: 100, name: 'Summer' },
      { from: '2026-12-01', to: '2027-01-31', rateEur: 160, rateNonEur: 170, name: 'Winter' },
    ] }
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
  it('stays in the stored total', async () => {
    await save([{ dayNumber: 1, slots: [slot('accommodation', [hotel])] }], config(), { sellingPriceTotal: 230, seasonUplift: 30 })
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
