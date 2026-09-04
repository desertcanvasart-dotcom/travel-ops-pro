import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// The website order form → the programme it names, priced, as one draft
// quote plus the client. The engine is canned here (its own tests price);
// this proves the intake's decisions: match, preview-writes-nothing,
// client found-or-created, variation ensured, quote row shaped and stamped.

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
  services: [
    { id: 'd1-hotel', serviceName: 'Hotel - Cairo', serviceType: 'accommodation', rateSource: 'accommodation_rates', quantityMode: 'per_pax', quantity: 1, unitCost: 100, lineTotal: 100, isOptional: false, dayNumber: 1, notes: 'PPD' },
    { id: 'd1-guide', serviceName: 'Japanese Speaking Guide', serviceType: 'guide', rateSource: 'guide_rates', quantityMode: 'fixed', quantity: 1, unitCost: 98, lineTotal: 98, isOptional: false, dayNumber: 1 },
  ],
  accommodationNights: [{ ppd: 100, singleSupp: 50, tripleRed: 10 }],
  totalCost: 298, marginPercent: 30, marginAmount: 89.4, sellingPrice: 387.4, pricePerPerson: 193.7, currency: 'USD', singleSupplement: 50,
}
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: vi.fn(async () => priced),
  calculatePricingWithPassengerBreakdown: vi.fn(async () => priced),
}))

import { POST } from '@/app/api/intake/order-form/route'
import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const ORDER = `問合せ種別：申込み
ツアーコード：NEK803-ABCR
ツアータイトル：ナイル川クルーズの旅 8日間
出発日(第1希望)：2026年9月18日
出発地：成田
参加人数：大人 2人 子供 0人 子供 0人
希望連絡方法：メール
メールアドレス：hanako@example.jp
電話番号：03-1111-2222
お名前(漢字)：姓 鈴木 名 花子
お名前(カナ)：セイ スズキ メイ ハナコ
性別：女
生年月日：1985年4月2日
お名前：姓 SUZUKI 名 HANAKO
ご住所：〒 150-0001 東京都 渋谷区1-2-3
`
const post = async (body: Record<string, unknown>) => { const r = await POST({ json: async () => body } as any); return { status: r.status, json: await r.json() } }
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]

beforeEach(() => {
  vi.clearAllMocks()
  setMockTables({
    tour_templates: [
      { id: 'tpl-803', template_code: 'NEK803-CR-ABS', template_name: 'NEK803 8 days', duration_days: 8, is_active: true, tour_type: 'cruise' },
      { id: 'tpl-804', template_code: 'NEK804-CR', template_name: 'NEK804', duration_days: 8, is_active: true, tour_type: 'cruise' },
    ],
    tour_variations: [],
    clients: [],
    tour_quotes: [],
  })
})

describe('POST /api/intake/order-form', () => {
  it('a dry run matches the programme by its stem, prices it, and writes nothing', async () => {
    const { status, json } = await post({ text: ORDER, dryRun: true })
    expect(status).toBe(200)
    expect(json.template.template_code).toBe('NEK803-CR-ABS')
    expect(json.order).toMatchObject({ tourCode: 'NEK803-ABCR', departureDate1: '2026-09-18', adults: 2, children: 0, email: 'hanako@example.jp' })
    expect(json.client).toBeNull()
    expect(json.pricing).toMatchObject({ selling_price: 387.4, currency: 'USD', complete: true })
    expect(calculateAutoPricing).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'tpl-803', tier: 'standard', numPax: 2, language: 'Japanese', isEurPassport: false, travelDate: '2026-09-18', marginPercent: 30 }))
    expect(await rows('clients')).toEqual([])
    expect(await rows('tour_quotes')).toEqual([])
    expect(await rows('tour_variations')).toEqual([])
  })

  it('confirming creates the client, a standard variation and the draft quote, stamped with the org', async () => {
    const { status, json } = await post({ text: ORDER })
    expect(status).toBe(200)
    expect(json.clientCreated).toBe(true)
    const clients = await rows('clients')
    expect(clients).toHaveLength(1)
    expect(clients[0]).toMatchObject({ org_id: 'org-1', first_name: '花子', last_name: '鈴木', email: 'hanako@example.jp', nationality: 'Japanese', preferred_language: 'Japanese', date_of_birth: '1985-04-02', postal_code: '150-0001', client_source: 'web_form', status: 'prospect' })
    const vars = await rows('tour_variations')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ template_id: 'tpl-803', tier: 'standard' })
    const quotes = await rows('tour_quotes')
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({
      org_id: 'org-1', variation_id: vars[0].id, source: 'web_form', status: 'draft',
      client_name: '鈴木 花子', client_email: 'hanako@example.jp', travel_date: '2026-09-18', num_adults: 2, num_children: 0,
      total_cost: 298, selling_price: 387.4, price_per_person: 193.7, currency: 'USD', is_eur_passport: false, created_by: 'user-1',
    })
    expect(quotes[0].services_snapshot.map((l: any) => l.service_id)).toEqual(['d1-hotel', 'd1-guide'])
    expect(quotes[0].notes).toContain('SUZUKI HANAKO')
    expect(quotes[0].notes).toContain('生年月日 1985-04-02')
    expect(quotes[0].notes).toContain('〒150-0001 東京都渋谷区1-2-3')
    expect(json.quote.id).toBe(quotes[0].id)
  })

  it('an existing client (by email) is linked, not duplicated; an existing variation is reused', async () => {
    setMockTables({
      tour_templates: [{ id: 'tpl-803', template_code: 'NEK803-CR-ABS', template_name: 'NEK803', duration_days: 8, is_active: true }],
      tour_variations: [{ id: 'var-std', template_id: 'tpl-803', tier: 'standard' }],
      clients: [{ id: 'c-1', org_id: 'org-1', email: 'hanako@example.jp', first_name: '花子', last_name: '鈴木' }],
      tour_quotes: [],
    })
    const { json } = await post({ text: ORDER })
    expect(json.clientCreated).toBe(false)
    expect(json.client.id).toBe('c-1')
    expect(await rows('clients')).toHaveLength(1)
    expect(await rows('tour_variations')).toHaveLength(1)
    expect((await rows('tour_quotes'))[0].variation_id).toBe('var-std')
  })

  it('a solo traveller carries the single-supplement line so the lines add up', async () => {
    const { json } = await post({ text: ORDER.replace('大人 2人', '大人 1人') })
    const ids = (await rows('tour_quotes'))[0].services_snapshot.map((l: any) => l.service_id)
    expect(ids).toContain('rooming-adjustment')
    expect(json.order.adults).toBe(1)
  })

  it('an unknown tour code previews without a programme and refuses to save', async () => {
    const text = ORDER.replace('NEK803-ABCR', 'ZZZ999-XX')
    const dry = await post({ text, dryRun: true })
    expect(dry.status).toBe(200)
    expect(dry.json.template).toBeNull()
    expect(dry.json.pricing).toBeNull()
    const real = await post({ text })
    expect(real.status).toBe(422)
    expect(await rows('tour_quotes')).toEqual([])
    expect(await rows('clients')).toEqual([])
  })

  it('text that is not the form is refused', async () => {
    const { status } = await post({ text: 'Hello, can you quote Cairo for two?' })
    expect(status).toBe(422)
  })
})
