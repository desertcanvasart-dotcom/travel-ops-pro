import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// The customer's door into the order intake (/order → this route). The
// pipeline itself is proven in intake-order-form.test.ts; this proves the
// door's own rules: the customer never sees the operator's numbers, a valid
// order is never bounced (fallback = manager notification with a pre-filled
// paste link), the honeypot swallows bots, and the per-IP limit holds.

vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/default-org', () => ({ getDefaultOrgId: async () => 'org-1' }))
vi.mock('@/lib/org-rate-currency', async (orig) => ({ ...(await orig<typeof import('@/lib/org-rate-currency')>()), getOrgRateCurrency: async () => 'USD' }))
// Pinned rates: no network in tests (EUR base → USD→JPY = 150).
const fxRates = { base: 'EUR', date: '2026-10-23', rates: { EUR: 1, USD: 1.1, JPY: 165 } as Record<string, number> }
vi.mock('@/lib/rates/fx-source', () => ({ fetchRunExchangeRates: async () => fxRates }))
vi.mock('@/lib/org-default-margin', () => ({
  getOrgDefaultMargin: async () => 30,
  resolveMarginPercent: ({ orgDefault }: { orgDefault: number | null }) => orgDefault ?? 25,
}))
const priced = {
  success: true, complete: true, holes: [], warnings: [],
  services: [
    { id: 'd1-hotel', serviceName: 'Hotel - Cairo', serviceType: 'accommodation', rateSource: 'accommodation_rates', quantityMode: 'per_pax', quantity: 1, unitCost: 100, lineTotal: 100, isOptional: false, dayNumber: 1, notes: 'PPD' },
  ],
  accommodationNights: [{ ppd: 100, singleSupp: 50, tripleRed: 10 }],
  totalCost: 200, marginPercent: 30, marginAmount: 60, sellingPrice: 260, pricePerPerson: 130, currency: 'USD', singleSupplement: 50,
}
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: vi.fn(async () => priced),
  calculatePricingWithPassengerBreakdown: vi.fn(async () => priced),
}))
const notifyOrgManagers = vi.fn(async () => ({ created: 2, failed: 0 }))
vi.mock('@/lib/notify-managers', () => ({ notifyOrgManagers: (...a: unknown[]) => notifyOrgManagers(...(a as [])) }))

import { POST } from '@/app/api/public/order-form/route'
import { clearWebsitePageCache } from '@/lib/intake/website-page'
import { OPTIONAL_PAGE, TOUR_PAGE } from '../fixtures/website-pages'

// The website the buttons come from, and what it serves.
const ORIGIN = 'https://tour.example.jp'
const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith(`${ORIGIN}/detail.php?id=2297504`)) return new Response(TOUR_PAGE, { status: 200 })
  if (url.startsWith(`${ORIGIN}/opt_detail.php?id=104`)) return new Response(OPTIONAL_PAGE, { status: 200 })
  return new Response('not found', { status: 404 })
})

const PAYLOAD = {
  inquiryType: '申込み',
  tourCode: 'nek803-abcr',
  tourTitle: 'ナイル川クルーズの旅 8日間',
  departureDate1: '2026-11-03',
  departureAirport: '成田空港',
  adults: 2,
  children: 0,
  contactMethod: 'email',
  email: 'Taro@Example.jp',
  phone: '090-1234-5678',
  lastNameKanji: '山田', firstNameKanji: '太郎',
  lastNameKana: 'ヤマダ', firstNameKana: 'タロウ',
  gender: 'male', birthDate: '1960-01-02',
  lastNameRomaji: 'YAMADA', firstNameRomaji: 'TARO',
  postalCode: '150-0001', prefecture: '東京都', address: '渋谷区1-2-3',
  requests: '窓側の部屋を希望します。',
  companions: [{ lastNameRomaji: 'YAMADA', firstNameRomaji: 'HANAKO', gender: 'female', birthDate: '1962-03-04' }],
  website: '',
}

// Each test gets its own IP: the rate-limit store is module-global.
let ipSeq = 0
const post = async (body: unknown, ip?: string) => {
  const r = await POST({
    json: async () => body,
    headers: new Headers({ 'x-forwarded-for': ip ?? `10.0.0.${++ipSeq}` }),
  } as any)
  return { status: r.status, json: await r.json() }
}
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]

beforeEach(() => {
  vi.clearAllMocks()
  clearWebsitePageCache()
  process.env.ORDER_WEBSITE_ORIGIN = ORIGIN
  vi.stubGlobal('fetch', fetchMock)
  setMockTables({
    organizations: [{ id: 'org-1' }],
    tour_templates: [
      { id: 'tpl-803', org_id: 'org-1', template_code: 'NEK803-CR-ABS', template_name: 'NEK803 8 days', duration_days: 8, is_active: true, tour_type: 'cruise' },
      { id: 'tpl-502', org_id: 'org-1', template_code: 'NEK502-GL', template_name: 'Giza & Luxor 5 days', duration_days: 5, is_active: true, tour_type: 'package', website_url: `${ORIGIN}/detail.php?id=2297504` },
      { id: 'tpl-mus', org_id: 'org-1', template_code: 'CAI-MUS-01', template_name: 'Three museums day tour', duration_days: 1, is_active: true, tour_type: 'day_tour', website_url: `${ORIGIN}/opt_detail.php?id=104` },
    ],
    tour_variations: [],
    clients: [],
    tour_quotes: [],
    web_order_intakes: [],
    tour_departures: [], departure_bookings: [],
    itineraries: [], itinerary_days: [], itinerary_services: [],
  })
})

describe('POST /api/public/order-form', () => {
  it('a valid order becomes client + quote; the customer sees only received + reference', async () => {
    const { status, json } = await post(PAYLOAD)
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    const quotes = await rows('tour_quotes')
    expect(quotes).toHaveLength(1)
    expect(json.reference ?? undefined).toBe(quotes[0].quote_number ?? undefined)
    // Recorded like an emailed order: one intake row, linked to the quote.
    const [intake] = await rows('web_order_intakes')
    expect(intake).toMatchObject({ org_id: 'org-1', outcome: 'quote_created', quote_id: quotes[0].id, tour_code: 'NEK803-ABCR', email_message_id: null })
    // The operator's numbers must NOT leave through this door.
    const flat = JSON.stringify(json)
    expect(flat).not.toContain('margin')
    expect(flat).not.toContain('total_cost')
    expect(flat).not.toContain('selling_price')
    expect(flat).not.toContain('holes')
    // The row itself is the full pipeline's row.
    expect(quotes[0]).toMatchObject({ org_id: 'org-1', source: 'web_form', num_adults: 2, num_children: 0, created_by: null })
    expect((await rows('clients'))[0]).toMatchObject({ email: 'taro@example.jp', client_source: 'web_form' })
    expect(notifyOrgManagers).toHaveBeenCalledTimes(1)
    expect((notifyOrgManagers.mock.calls[0] as any[])[2].link).toBe(`/b2b/quotes/${quotes[0].id}`)
  })

  it('an unknown tour code is NOT bounced: received + manager notification with the intake to finish', async () => {
    const { status, json } = await post({ ...PAYLOAD, tourCode: 'ZZZ999-XX' })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.reference).toBeNull()
    expect(await rows('tour_quotes')).toEqual([])
    expect(notifyOrgManagers).toHaveBeenCalledTimes(1)
    const notice = (notifyOrgManagers.mock.calls[0] as any[])[2]
    const [intake] = await rows('web_order_intakes')
    expect(notice.link).toBe(`/intake/order?intake=${intake.id}`)
    expect(intake.outcome).toBe('needs_attention')
    // The stored text is the website's notification shape, read back whole.
    expect(intake.order_text).toContain('●ツアーコード：ZZZ999-XX')
    expect(intake.order_text).toContain('　お名前：YAMADA TARO')
  })

  it('the honeypot swallows a bot without writing anything', async () => {
    const { status, json } = await post({ ...PAYLOAD, website: 'https://spam.example' })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(await rows('tour_quotes')).toEqual([])
    expect(await rows('clients')).toEqual([])
    expect(notifyOrgManagers).not.toHaveBeenCalled()
  })

  it('a missing required field is a 400 the form can show', async () => {
    const { status, json } = await post({ ...PAYLOAD, email: 'not-an-email' })
    expect(status).toBe(400)
    expect(json.success).toBe(false)
    expect(await rows('clients')).toEqual([])
  })

  it('the sixth submit from one IP inside the window is a 429', async () => {
    const ip = '10.99.99.1'
    for (let i = 0; i < 5; i++) {
      const { status } = await post({ ...PAYLOAD, email: `t${i}@example.jp` }, ip)
      expect(status).toBe(200)
    }
    const { status } = await post(PAYLOAD, ip)
    expect(status).toBe(429)
  })

  it('a website button (page id + date): code, title and fare come from the page, the browser\'s price is ignored', async () => {
    const { tourCode: _c, tourTitle: _t, ...rest } = PAYLOAD
    const { status, json } = await post({ ...rest, pageId: '2297504', departureDate1: '2026-11-22', departureDate2: '2026-11-23', websiteSubtotalJpy: 1, websiteBaseFare1: { adultJpy: 1 } })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(`${ORIGIN}/detail.php?id=2297504&d=ALL&hf=1`, expect.anything())
    const [intake] = await rows('web_order_intakes')
    expect(intake.tour_code).toBe('NEK502')
    expect(intake.order_data).toMatchObject({
      tourCode: 'NEK502', tourTitle: '★国内線で楽々★エジプト5日間 ギザ＆ルクソール', productKind: 'tour',
      websiteUrl: `${ORIGIN}/detail.php?id=2297504`,
      websiteBaseFare1: { adultJpy: 364000, childJpy: 254800, infantJpy: 32000 },
      websiteBaseFare2: { adultJpy: 364000, childJpy: 254800, infantJpy: 32000 },
    })
    expect(intake.order_data.websiteSubtotalJpy).toBeUndefined()
    // Matched by its website page, priced at the website's fare (2 × 364,000).
    const [quote] = await rows('tour_quotes')
    expect(quote).toMatchObject({ currency: 'JPY', selling_price: 728000, travel_date: '2026-11-22' })
    expect(quote.trip_name).toBe('Giza & Luxor 5 days')
  })

  it('a family: a child (2–11) at 70% of the adult fare, an infant (under 2) at the flight-only fare', async () => {
    const { tourCode: _c, tourTitle: _t, ...rest } = PAYLOAD
    await post({ ...rest, pageId: '2297504', departureDate1: '2026-11-22', adults: 2, children: 1, infants: 1 })
    const [quote] = await rows('tour_quotes')
    expect(quote).toMatchObject({ currency: 'JPY', selling_price: 2 * 364000 + 254800 + 32000 })
    const [intake] = await rows('web_order_intakes')
    expect(intake.order_data).toMatchObject({ adults: 2, children: 1, infants: 1 })
    expect(intake.order_text).toContain('●第1希望日基本旅行代金：大人 364,000円、子供 254,800円、幼児 32,000円')
  })

  it('the same order submitted twice is one order', async () => {
    await post(PAYLOAD)
    const { json } = await post(PAYLOAD)
    expect(json.success).toBe(true)
    expect(await rows('tour_quotes')).toHaveLength(1)
    expect((await rows('web_order_intakes')).map(r => r.outcome)).toEqual(['quote_created', 'duplicate'])
  })

  it('an optional-tour cart: each line is its own order, priced at the page\'s fares', async () => {
    const { tourCode: _c, tourTitle: _t, departureDate1: _d, ...rest } = PAYLOAD
    const { status, json } = await post({
      ...rest, kind: 'optional',
      items: [
        { pageId: '104', date: '2027-02-24', adults: 2, children: 1, infants: 1 },
        { pageId: '104', date: '2027-02-26', adults: 1, children: 0 },
      ],
    })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    const intakes = await rows('web_order_intakes')
    expect(intakes).toHaveLength(2)
    expect(intakes[0].order_data).toMatchObject({ productKind: 'optional', tourCode: 'CAI-10046-MUS', infants: 1, websiteSubtotalJpy: 2 * 38500 + 29000, departureDate1: '2027-02-24' })
    expect(intakes[1].order_data).toMatchObject({ websiteSubtotalJpy: 38500, departureDate1: '2027-02-26' })
    expect(intakes[0].order_text).toContain('●オプショナルコード：CAI-10046-MUS')
    expect(await rows('tour_quotes')).toHaveLength(2)
  })

  it('an empty cart or a line with no date is a 400', async () => {
    expect((await post({ ...PAYLOAD, kind: 'optional', items: [] })).status).toBe(400)
    expect((await post({ ...PAYLOAD, kind: 'optional', items: [{ pageId: '104', adults: 1 }] })).status).toBe(400)
  })

  it('the website down: the order still goes in by the page it came from', async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error('timeout') })
    const { tourCode: _c, ...rest } = PAYLOAD
    const { json } = await post({ ...rest, pageId: '2297504', departureDate1: '2026-11-22' })
    expect(json.success).toBe(true)
    const [intake] = await rows('web_order_intakes')
    expect(intake.order_data).toMatchObject({ tourCode: 'WEB-2297504', websiteUrl: `${ORIGIN}/detail.php?id=2297504` })
    expect(intake.order_data.websiteBaseFare1).toBeUndefined()
    // Still the right programme — found by its page.
    expect((await rows('tour_quotes'))[0].trip_name).toBe('Giza & Luxor 5 days')
  })
})
