import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// Sell audit (2026-10-13):
//  #20 finishing a website order by its id only works while it is open — a
//      second confirm made a second quote, client hold and seat hold, and
//      repointed the order at the new quote.
//  #21 the pending seat hold is placed only when the party fits the seats
//      left (no trigger enforces max_pax or maintains booked_pax).

vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/org-rate-currency', () => ({ getOrgRateCurrency: async () => 'USD' }))
vi.mock('@/lib/org-default-margin', () => ({
  getOrgDefaultMargin: async () => 30,
  resolveMarginPercent: ({ orgDefault }: { orgDefault: number | null }) => orgDefault ?? 25,
}))
const priced = {
  success: true, complete: true, holes: [], warnings: [],
  services: [{ id: 'd1-guide', serviceName: 'Guide', serviceType: 'guide', rateSource: 'guide_rates', quantityMode: 'fixed', quantity: 1, unitCost: 98, lineTotal: 98, isOptional: false, dayNumber: 1 }],
  accommodationNights: [], totalCost: 98, marginPercent: 30, marginAmount: 29.4, sellingPrice: 127.4, pricePerPerson: 63.7, currency: 'USD', singleSupplement: 0,
}
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: vi.fn(async () => priced),
  calculatePricingWithPassengerBreakdown: vi.fn(async () => priced),
}))

import { POST } from '@/app/api/intake/order-form/route'
import { seatsFree } from '@/lib/intake/process-order'

const ORDER = `問合せ種別：申込み
ツアーコード：NEK803-ABCR
ツアータイトル：ナイル川クルーズの旅 8日間
出発日(第1希望)：2026年9月18日
参加人数：大人 2人 子供 0人 子供 0人
メールアドレス：hanako@example.jp
お名前(漢字)：姓 鈴木 名 花子
お名前：姓 SUZUKI 名 HANAKO
`
const post = async (body: Record<string, unknown>) => { const r = await POST({ json: async () => body } as any); return { status: r.status, json: await r.json() } }
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]

const tables = (over: Record<string, any[]> = {}) => setMockTables({
  tour_templates: [{ id: 'tpl-803', template_code: 'NEK803-CR-ABS', template_name: 'NEK803', duration_days: 8, is_active: true }],
  tour_variations: [], clients: [], tour_quotes: [], departure_bookings: [],
  tour_departures: [{ id: 'dep-1', org_id: 'org-1', template_id: 'tpl-803', start_date: '2026-09-18', status: 'open', max_pax: 10, booked_pax: 6, created_at: '2026-01-01' }],
  web_order_intakes: [],
  ...over,
})

beforeEach(() => { vi.clearAllMocks(); tables() })

describe('#20 finishing a website order', () => {
  it('an order already finished is refused before anything is written', async () => {
    tables({ web_order_intakes: [{ id: 'wo-done', org_id: 'org-1', outcome: 'quote_created', quote_id: 'q-first', resolved_at: '2026-10-01T00:00:00Z' }] })
    const { status, json } = await post({ text: ORDER, intakeId: 'wo-done' })
    expect(status).toBe(409)
    expect(json.error).toMatch(/already finished/)
    expect(await rows('tour_quotes')).toEqual([])
    expect(await rows('departure_bookings')).toEqual([])
    expect((await rows('web_order_intakes'))[0].quote_id).toBe('q-first')
  })

  it('a dismissed order is refused too; an open one is finished', async () => {
    tables({ web_order_intakes: [
      { id: 'wo-dismissed', org_id: 'org-1', outcome: 'needs_attention', resolved_at: '2026-10-01T00:00:00Z' },
      { id: 'wo-open', org_id: 'org-1', outcome: 'needs_attention', resolved_at: null },
    ] })
    expect((await post({ text: ORDER, intakeId: 'wo-dismissed' })).status).toBe(409)
    const { status, json } = await post({ text: ORDER, intakeId: 'wo-open' })
    expect(status).toBe(200)
    expect((await rows('web_order_intakes')).find((w) => w.id === 'wo-open')).toMatchObject({ outcome: 'quote_created', quote_id: json.quote.id })
  })
})

describe('#21 the seat hold respects the seats left', () => {
  it('counts booked_pax or confirmed holds (the larger), plus pending holds', () => {
    expect(seatsFree({ max_pax: 10, booked_pax: 6 }, [])).toBe(4)
    expect(seatsFree({ max_pax: 10, booked_pax: 6 }, [{ pax: 2, status: 'pending' }])).toBe(2)
    expect(seatsFree({ max_pax: 10, booked_pax: 2 }, [{ pax: 5, status: 'confirmed' }, { pax: 1, status: 'pending' }])).toBe(4)
    expect(seatsFree({ max_pax: 4, booked_pax: 6 }, [])).toBe(0)
  })

  it('a party that fits is held; the preview says how many seats are free', async () => {
    const dry = await post({ text: ORDER, dryRun: true })
    expect(dry.json.departure).toMatchObject({ id: 'dep-1', seats_free: 4 })
    const { json } = await post({ text: ORDER })
    expect(json.departureBooking).toMatchObject({ departure_id: 'dep-1' })
    expect(json.departureFull).toBeNull()
  })

  it('a party larger than the seats left gets the quote but no hold, and is told why', async () => {
    tables({ departure_bookings: [{ id: 'h-1', org_id: 'org-1', departure_id: 'dep-1', pax: 3, status: 'pending' }] })
    const { status, json } = await post({ text: ORDER })
    expect(status).toBe(200)
    expect(json.quote).toBeTruthy()
    expect(json.departureBooking).toBeNull()
    expect(json.departureFull).toEqual({ free: 1, requested: 2 })
    expect(await rows('departure_bookings')).toHaveLength(1)
  })
})
