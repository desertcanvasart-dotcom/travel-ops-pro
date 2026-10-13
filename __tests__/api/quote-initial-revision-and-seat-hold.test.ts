// ============================================
// Quotes from Order Intake and from a trip start their revision history;
// an order's seat hold is the database's one locked step
// ============================================
// Sell follow-up (2026-10-13):
//  - A quote saved from the calculator gets a "Quote created" revision
//    (create_quote_revision); one made by Order Intake (lib/intake/
//    process-order) or from a trip (/api/b2b/quote-from-itinerary) had none.
//  - The seat hold was counted in the app and inserted after, so two orders
//    for the last seats at the same moment were both held. It is now one
//    call, hold_departure_seats (migration 20261213, proven on Postgres in
//    __tests__/migrations/departure-seat-holds-atomic.test.ts); a refusal
//    from it is handled exactly like a party that did not fit.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient, rpcCalls } from '../_mock-supabase'

// A refusal the database gives although the app's own count said "fits" —
// what the losing order of two simultaneous ones sees.
const race = vi.hoisted(() => ({ lost: false }))
vi.mock('@/lib/supabase-actor', async () => {
  const mock = await import('../_mock-supabase')
  const client = () => {
    const c = mock.createMockClient()
    const rpc = c.rpc
    return {
      ...c,
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        if (fn === 'hold_departure_seats' && race.lost) {
          mock.rpcCalls.push({ fn, args })
          return { data: { held: false, free: 0, id: null }, error: null }
        }
        return rpc(fn, args)
      },
    }
  }
  return { createActorAdminClient: client }
})
vi.mock('@/lib/supabase-server', async () => {
  const mock = await import('../_mock-supabase')
  return { createServerClient: () => mock.createMockClient(), supabaseServer: mock.createMockClient() }
})
vi.mock('@supabase/supabase-js', async (orig) => {
  const mock = await import('../_mock-supabase')
  return { ...(await orig<typeof import('@supabase/supabase-js')>()), createClient: () => mock.createMockClient() }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/org-rate-currency', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-rate-currency')>()),
  getOrgRateCurrency: async () => 'USD',
}))
vi.mock('@/lib/org-default-margin', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-default-margin')>()),
  getOrgDefaultMargin: async () => 30,
}))
const priced = {
  success: true, complete: true, holes: [], warnings: [],
  services: [{ id: 'd1-guide', serviceName: 'Guide', serviceType: 'guide', rateSource: 'guide_rates', quantityMode: 'fixed', quantity: 1, unitCost: 98, lineTotal: 98, isOptional: false, dayNumber: 1 }],
  accommodationNights: [], totalCost: 98, marginPercent: 30, marginAmount: 29.4, sellingPrice: 127.4, pricePerPerson: 63.7, currency: 'USD', singleSupplement: 0,
}
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: vi.fn(async () => priced),
  calculatePricingWithPassengerBreakdown: vi.fn(async () => priced),
  loadSeasonWindows: vi.fn(async () => []),
}))

import { POST as orderForm } from '@/app/api/intake/order-form/route'
import { POST as quoteFromItinerary } from '@/app/api/b2b/quote-from-itinerary/route'
import { processTourUpOrder } from '@/lib/intake/process-order'
import { parseTourUpOrder } from '@/lib/intake/tour-up-order'

const ORDER = `問合せ種別：申込み
ツアーコード：NEK803-ABCR
ツアータイトル：ナイル川クルーズの旅 8日間
出発日(第1希望)：2026年9月18日
参加人数：大人 2人 子供 0人 子供 0人
メールアドレス：hanako@example.jp
お名前(漢字)：姓 鈴木 名 花子
お名前：姓 SUZUKI 名 HANAKO
`
const post = async (body: Record<string, unknown>) => { const r = await orderForm({ json: async () => body } as any); return { status: r.status, json: await r.json() } }
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const revisions = () => rpcCalls.filter((c) => c.fn === 'create_quote_revision').map((c) => c.args)

beforeEach(() => {
  race.lost = false
  setMockTables({
    tour_templates: [{ id: 'tpl-803', org_id: 'org-1', template_code: 'NEK803-CR-ABS', template_name: 'NEK803', duration_days: 8, is_active: true }],
    tour_variations: [], clients: [], tour_quotes: [], departure_bookings: [], web_order_intakes: [],
    tour_departures: [{ id: 'dep-1', org_id: 'org-1', template_id: 'tpl-803', start_date: '2026-09-18', status: 'open', max_pax: 10, booked_pax: 6, created_at: '2026-01-01' }],
    itineraries: [{ id: 'it-1', org_id: 'org-1', itinerary_code: 'ITN-1', trip_name: 'Cairo', num_adults: 2, num_children: 0, start_date: '2027-03-01', tier: 'standard', currency: 'USD' }],
    itinerary_days: [], quote_versions: [], meal_rates: [],
  })
})

describe('first revision', () => {
  it('Order Intake (operator door): the new quote gets "Quote created", by the operator', async () => {
    const { status, json } = await post({ text: ORDER })
    expect(status).toBe(200)
    expect(revisions()).toEqual([{ p_quote_id: json.quote.id, p_changed_by: 'user-1', p_change_reason: 'Quote created' }])
  })

  it('Order Intake (website doors, no operator): the revision has no author', async () => {
    const r = await processTourUpOrder(createMockClient() as any, { orgId: 'org-1', userId: null, order: parseTourUpOrder(ORDER)!, dryRun: false })
    expect(r.status).toBe(200)
    expect(revisions()).toEqual([{ p_quote_id: r.body.quote!.id, p_changed_by: null, p_change_reason: 'Quote created' }])
  })

  it('a dry run writes no revision', async () => {
    await post({ text: ORDER, dryRun: true })
    expect(revisions()).toEqual([])
  })

  it('a quote from a trip gets "Quote created", by the signed-in user', async () => {
    const res = await quoteFromItinerary(new NextRequest('http://localhost/api/b2b/quote-from-itinerary', {
      method: 'POST', body: JSON.stringify({ itinerary_id: 'it-1' }),
    }))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(revisions()).toEqual([{ p_quote_id: json.data.id, p_changed_by: 'user-1', p_change_reason: 'Quote created' }])
    expect((await rows('tour_quotes'))[0]).toMatchObject({ id: json.data.id, itinerary_id: 'it-1' })
  })
})

describe('a quote from a trip: whose margin', () => {
  const fromTrip = async (body: Record<string, unknown>) => {
    const res = await quoteFromItinerary(new NextRequest('http://localhost/api/b2b/quote-from-itinerary', {
      method: 'POST', body: JSON.stringify({ itinerary_id: 'it-1', ...body }),
    }))
    expect(res.status).toBe(201)
    return (await rows('tour_quotes'))[0]
  }
  beforeEach(async () => {
    const t = createMockClient() as any
    await t.from('b2b_partners').insert({ id: 'p-1', org_id: 'org-1', company_name: 'Agency', default_margin_percent: 12 })
  })

  it('the margin the operator set wins over the partner’s', async () => {
    expect((await fromTrip({ partner_id: 'p-1', margin_percent: 20 })).margin_percent).toBe(20)
  })
  it('without one, the partner’s default margin', async () => {
    expect((await fromTrip({ partner_id: 'p-1' })).margin_percent).toBe(12)
  })
  it('without a partner, the company’s default', async () => {
    expect((await fromTrip({})).margin_percent).toBe(30)
  })
})

describe('the seat hold is one database call', () => {
  it('the route asks hold_departure_seats for the party, the client and the quote reference', async () => {
    const { json } = await post({ text: ORDER })
    const call = rpcCalls.find((c) => c.fn === 'hold_departure_seats')
    expect(call?.args).toMatchObject({ p_org_id: 'org-1', p_departure_id: 'dep-1', p_pax: 2, p_client_id: json.client.id, p_client_name: '鈴木 花子' })
    expect(String(call?.args?.p_notes)).toContain(json.quote.quote_number ?? '')
    expect(json.departureBooking).toMatchObject({ departure_id: 'dep-1' })
    expect(await rows('departure_bookings')).toHaveLength(1)
  })

  it('no direct insert into departure_bookings is left in the order intake', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('lib/intake/process-order.ts', 'utf8')
    expect(src).not.toMatch(/from\('departure_bookings'\)\.insert/)
  })

  it('a hold the database refuses (another order took the seats first) is handled like a full departure', async () => {
    race.lost = true
    const { status, json } = await post({ text: ORDER })
    expect(status).toBe(200)
    expect(json.quote).toBeTruthy()
    // The preview, counted before, still said 4 were free.
    expect(json.departure).toMatchObject({ seats_free: 4 })
    expect(json.departureBooking).toBeNull()
    expect(json.departureFull).toEqual({ free: 0, requested: 2 })
    expect(await rows('departure_bookings')).toEqual([])
  })

  it('two orders for the last two seats: the first is held, the second is not', async () => {
    setMockTables({
      tour_templates: [{ id: 'tpl-803', org_id: 'org-1', template_code: 'NEK803-CR-ABS', template_name: 'NEK803', duration_days: 8, is_active: true }],
      tour_variations: [], clients: [], tour_quotes: [], departure_bookings: [], web_order_intakes: [],
      tour_departures: [{ id: 'dep-1', org_id: 'org-1', template_id: 'tpl-803', start_date: '2026-09-18', status: 'open', max_pax: 8, booked_pax: 6, created_at: '2026-01-01' }],
    })
    const [a, b] = await Promise.all([post({ text: ORDER }), post({ text: ORDER })])
    const held = [a, b].filter((r) => r.json.departureBooking)
    const full = [a, b].filter((r) => r.json.departureFull)
    expect(held).toHaveLength(1)
    expect(full).toHaveLength(1)
    expect(full[0].json.departureFull).toEqual({ free: 0, requested: 2 })
    expect((await rows('departure_bookings')).reduce((n, h) => n + h.pax, 0)).toBe(2)
  })
})
