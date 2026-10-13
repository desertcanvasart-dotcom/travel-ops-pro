// Operate audit — Departures #2–#9, through the routes, on the in-memory
// Supabase (__tests__/_mock-supabase.ts answers set_departure_seats and
// hold_departure_seats as migration 20261215 does; the SQL itself is pinned
// on Postgres in __tests__/migrations/departure-holds-lifecycle.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient, rpcCalls } from '../_mock-supabase'

let client: any = createMockClient()
vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => ({ error: null, status: 200, supabase: client, org_id: 'org-1', user: { id: 'user-1' } }),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => client }))
vi.mock('@/lib/org-default-margin', () => ({
  getOrgDefaultMargin: async () => 25,
  resolveMarginPercent: ({ orgDefault }: { orgDefault: number | null }) => orgDefault ?? 25,
}))
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: vi.fn(async () => ({ pricePerPerson: 1000, complete: true, holes: [] })),
}))
const rates = vi.fn(async () => ({ base: 'EUR', date: '2026-10-13', rates: { EUR: 1, USD: 1.08, JPY: 162 } }))
vi.mock('@/lib/rates/fx-source', () => ({ fetchRunExchangeRates: () => rates() }))

import { GET as getOne, PUT, DELETE } from '@/app/api/departures/[id]/route'
import { PATCH as patchHold } from '@/app/api/departures/[id]/holds/[holdId]/route'
import { GET as list, POST as create } from '@/app/api/departures/route'
import { POST as bulk } from '@/app/api/departures/bulk/route'
import { POST as check } from '@/app/api/departures/check/route'
import { GET as grid } from '@/app/api/departures/grid/route'
import { MAX_GENERATED_DATES } from '@/lib/departures/generate-dates'

const ctx = (id: string, holdId = '') => ({ params: Promise.resolve({ id, holdId }) })
const req = (body?: unknown, url = 'http://x/api') =>
  new Request(url, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) as never
const json = async (r: Response) => ({ status: r.status, body: await r.json() })
const rows = (t: string) => ((createMockClient().from(t) as any).select('*') as Promise<{ data: any[] }>).then(r => r.data)

const DEP = { id: 'dep-1', org_id: 'org-1', template_id: 'tpl-1', tour_name: 'Nile 8 days', start_date: '2026-11-01', end_date: '2026-11-08', duration_days: 8, max_pax: 10, min_pax: 2, booked_pax: 0, status: 'open', externally_managed: false }

function seed(over: Record<string, any[]> = {}) {
  setMockTables({
    organizations: [{ id: 'org-1', default_currency: 'JPY', rate_currency: 'USD' }],
    tour_templates: [{ id: 'tpl-1', org_id: 'org-1', template_name: 'Nile 8 days', template_code: 'NL8', duration_days: 8 }],
    tour_departures: [{ ...DEP }],
    departure_bookings: [
      { id: 'h-1', org_id: 'org-1', departure_id: 'dep-1', client_name: 'Suzuki', pax: 4, status: 'pending', created_at: '2026-10-01' },
      { id: 'h-2', org_id: 'org-1', departure_id: 'dep-1', client_name: 'Tanaka', pax: 2, status: 'pending', created_at: '2026-10-02' },
      { id: 'h-x', org_id: 'org-2', departure_id: 'dep-x', client_name: 'Other', pax: 1, status: 'pending', created_at: '2026-10-02' },
    ],
    suppliers: [{ id: 'sup-mine', org_id: 'org-1' }, { id: 'sup-theirs', org_id: 'org-2' }],
    vehicles: [{ id: 'veh-theirs', org_id: 'org-2' }],
    itineraries: [],
    ...over,
  })
  client = createMockClient()
}

beforeEach(() => seed())

describe('#2 the seats shown count the holds', () => {
  it('the list and a departure carry booked + confirmed + pending', async () => {
    const l = await json(await list(req(undefined, 'http://x/api/departures')))
    expect(l.body.data[0]).toMatchObject({ booked_pax: 0, held_pending: 6, seats_taken: 6, seats_free: 4 })
    expect(l.body.default_currency).toBe('JPY')
    const one = await json(await getOne(req(), ctx('dep-1')))
    expect(one.body.data).toMatchObject({ seats_taken: 6, seats_free: 4 })
    expect(one.body.data.bookings.map((b: any) => b.id)).toEqual(['h-2', 'h-1'])
  })

  it('confirm, then release: releasing frees the seats', async () => {
    let r = await json(await patchHold(req({ action: 'confirm' }), ctx('dep-1', 'h-1')))
    expect(r.status).toBe(200)
    expect(r.body.data.hold.status).toBe('confirmed')
    expect(r.body.data.seats).toMatchObject({ held_confirmed: 4, held_pending: 2, seats_free: 4 })
    expect((await json(await patchHold(req({ action: 'confirm' }), ctx('dep-1', 'h-1')))).status).toBe(409)

    r = await json(await patchHold(req({ action: 'release' }), ctx('dep-1', 'h-1')))
    expect(r.body.data.hold.status).toBe('cancelled')
    expect(r.body.data.seats).toMatchObject({ seats_taken: 2, seats_free: 8 })
  })

  it("another company's hold, or a hold of another departure, is not found", async () => {
    expect((await patchHold(req({ action: 'release' }), ctx('dep-1', 'h-x'))).status).toBe(404)
    expect((await patchHold(req({ action: 'release' }), ctx('dep-x', 'h-x'))).status).toBe(404)
  })

  it('a departure with live holds is not deleted, and the answer names them; once released, it is', async () => {
    const refused = await json(await DELETE(req(), ctx('dep-1')))
    expect(refused.status).toBe(400)
    expect(refused.body.error).toMatch(/2 live seat hold\(s\).*Suzuki \(4, pending\).*Tanaka \(2, pending\)/)
    await patchHold(req({ action: 'release' }), ctx('dep-1', 'h-1'))
    await patchHold(req({ action: 'release' }), ctx('dep-1', 'h-2'))
    expect((await json(await DELETE(req(), ctx('dep-1')))).status).toBe(200)
    expect(await rows('tour_departures')).toEqual([])
  })
})

describe('#3 cancelling a departure', () => {
  it('reports the pending holds the database releases and the confirmed ones left', async () => {
    await patchHold(req({ action: 'confirm' }), ctx('dep-1', 'h-2'))
    const r = await json(await PUT(req({ status: 'cancelled' }), ctx('dep-1')))
    expect(r.status).toBe(200)
    expect(r.body.cancellation).toEqual({ holds_released: 1, confirmed_holds: 1 })
  })
})

describe('#4 lowering the seats counts the holds, in the database', () => {
  it('six held seats: max_pax 4 is refused, 6 is accepted', async () => {
    const r = await json(await PUT(req({ max_pax: 4 }), ctx('dep-1')))
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/6 seat\(s\) taken \(6 held\)/)
    expect(rpcCalls.find(c => c.fn === 'set_departure_seats')?.args).toMatchObject({ p_org_id: 'org-1', p_departure_id: 'dep-1', p_max_pax: 4 })
    expect((await rows('tour_departures'))[0].max_pax).toBe(10)
    expect((await json(await PUT(req({ max_pax: 6 }), ctx('dep-1')))).status).toBe(200)
    expect((await rows('tour_departures'))[0].max_pax).toBe(6)
  })

  it('booked outside the app is editable and counts on top of the holds', async () => {
    expect((await json(await PUT(req({ booked_pax: 5 }), ctx('dep-1')))).status).toBe(400)
    const ok = await json(await PUT(req({ booked_pax: 3 }), ctx('dep-1')))
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ booked_pax: 3, seats_taken: 9, seats_free: 1 })
  })
})

describe('#5 the grid prices in the company currency', () => {
  it('rates in EUR, company in EUR: EUR at 1', async () => {
    seed({ organizations: [{ id: 'org-1', default_currency: 'EUR', rate_currency: 'EUR' }] })
    const r = await json(await grid(new Request('http://x/api/departures/grid?template_id=tpl-1') as never))
    expect(r.body.data).toMatchObject({ rate_currency: 'EUR', target_currency: 'EUR', fx: 1 })
    expect(r.body.data.bands[0]).toMatchObject({ landPp: 1000, currency: 'EUR', seatsTaken: 6, heldPending: 6 })
  })

  it('rates in USD, company in JPY: converted at the app rate (150), not 160', async () => {
    const r = await json(await grid(new Request('http://x/api/departures/grid?template_id=tpl-1') as never))
    expect(r.body.data).toMatchObject({ rate_currency: 'USD', target_currency: 'JPY', fx: 150, fx_source: 'rates' })
    expect(r.body.data.bands[0].landPp).toBe(150000)
  })

  it('no rate for the pair: 422 asking for one', async () => {
    rates.mockResolvedValueOnce({ base: 'EUR', date: '2026-10-13', rates: { EUR: 1 } } as any)
    const r = await json(await grid(new Request('http://x/api/departures/grid?template_id=tpl-1') as never))
    expect(r.status).toBe(422)
    expect(r.body.error).toMatch(/No exchange rate from USD to JPY/)
  })
})

describe('#6 new departures use the company currency', () => {
  it('POST without a currency stores JPY for a JPY company', async () => {
    const r = await json(await create(req({ template_id: 'tpl-1', start_date: '2026-12-01' })))
    expect(r.status).toBe(200)
    expect(r.body.data.currency).toBe('JPY')
  })

  it('bulk dates are JPY too', async () => {
    const r = await json(await bulk(req({ template_id: 'tpl-1', dates: ['2026-12-08'] })))
    expect(r.body.data.created).toBe(1)
    expect((await rows('tour_departures')).find((d: any) => d.start_date === '2026-12-08').currency).toBe('JPY')
  })
})

describe('#7 the availability check counts the holds', () => {
  it('a departure held to its maximum has no spots', async () => {
    seed({ tour_departures: [{ ...DEP, start_date: '2099-01-10', end_date: '2099-01-17', max_pax: 6, cutoff_days: 3 }] })
    const r = await json(await check(req({ start_date: '2099-01-10' })))
    expect(r.body.data.has_departures).toBe(false)
    seed({ tour_departures: [{ ...DEP, start_date: '2099-01-10', end_date: '2099-01-17', max_pax: 8, cutoff_days: 3 }] })
    const r2 = await json(await check(req({ start_date: '2099-01-10' })))
    expect(r2.body.data.departures[0]).toMatchObject({ available_spots: 2 })
  })
})

describe('#8 guide and vehicle must be the company\'s', () => {
  it("another company's guide or vehicle is not found; its own guide is stored", async () => {
    expect((await PUT(req({ assigned_guide_id: 'sup-theirs' }), ctx('dep-1'))).status).toBe(404)
    expect((await PUT(req({ assigned_vehicle_id: 'veh-theirs' }), ctx('dep-1'))).status).toBe(404)
    expect((await PUT(req({ assigned_guide_id: 'sup-mine' }), ctx('dep-1'))).status).toBe(200)
    expect((await rows('tour_departures'))[0].assigned_guide_id).toBe('sup-mine')
  })
})

describe('#9 validation and integration-mirrored departures', () => {
  it('duration must be whole, min pax no more than max', async () => {
    expect((await PUT(req({ duration_days: 2.5 }), ctx('dep-1'))).status).toBe(400)
    expect((await PUT(req({ min_pax: 12 }), ctx('dep-1'))).status).toBe(400)
    expect((await create(req({ template_id: 'tpl-1', start_date: '2026-12-01', max_pax: 4, min_pax: 6 }))).status).toBe(400)
    expect((await bulk(req({ template_id: 'tpl-1', dates: ['2026-12-08'], max_pax: 4, min_pax: 6 }))).status).toBe(400)
  })

  it('bulk says when there are too many dates instead of dropping them', async () => {
    const dates = Array.from({ length: MAX_GENERATED_DATES + 1 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10))
    const r = await json(await bulk(req({ template_id: 'tpl-1', dates })))
    expect(r.status).toBe(400)
    expect(r.body.error).toBe(`Too many dates: ${MAX_GENERATED_DATES + 1} (max ${MAX_GENERATED_DATES} at a time)`)
  })

  it('moving a date onto an existing one is a 409, not a raw 500', async () => {
    const real = client
    const dup = { ...real }
    dup.from = (t: string) => {
      const q = real.from(t)
      if (t !== 'tour_departures') return q
      const update = q.update
      q.update = (patch: any) => {
        update(patch)
        return { eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }) }) }
      }
      return q
    }
    client = dup
    const r = await json(await PUT(req({ start_date: '2026-11-08' }), ctx('dep-1')))
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('A departure for this tour on this date already exists')
  })

  it("a mirrored departure's partner-owned fields are refused, its office columns are not; it is not deleted here", async () => {
    seed({ tour_departures: [{ ...DEP, externally_managed: true }], departure_bookings: [] })
    const r = await json(await PUT(req({ max_pax: 20, status: 'full' }), ctx('dep-1')))
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/kept in sync by an integration.*\(max_pax, status\)/)
    expect((await PUT(req({ fuel_surcharge_pp: 12000 }), ctx('dep-1'))).status).toBe(200)
    expect((await DELETE(req(), ctx('dep-1'))).status).toBe(409)
  })
})
