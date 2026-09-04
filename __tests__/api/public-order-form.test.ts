import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// The customer's door into the order intake (/order → this route). The
// pipeline itself is proven in intake-order-form.test.ts; this proves the
// door's own rules: the customer never sees the operator's numbers, a valid
// order is never bounced (fallback = manager notification with a pre-filled
// paste link), the honeypot swallows bots, and the per-IP limit holds.

vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/default-org', () => ({ getDefaultOrgId: async () => 'org-1' }))
vi.mock('@/lib/org-rate-currency', () => ({ getOrgRateCurrency: async () => 'USD' }))
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
  setMockTables({
    tour_templates: [{ id: 'tpl-803', template_code: 'NEK803-CR-ABS', template_name: 'NEK803 8 days', duration_days: 8, is_active: true, tour_type: 'cruise' }],
    tour_variations: [],
    clients: [],
    tour_quotes: [],
  })
})

describe('POST /api/public/order-form', () => {
  it('a valid order becomes client + quote; the customer sees only received + reference', async () => {
    const { status, json } = await post(PAYLOAD)
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    const quotes = await rows('tour_quotes')
    expect(quotes).toHaveLength(1)
    expect(json.reference).toBe(quotes[0].quote_number)
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

  it('an unknown tour code is NOT bounced: received + manager notification with the paste link', async () => {
    const { status, json } = await post({ ...PAYLOAD, tourCode: 'ZZZ999-XX' })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.reference).toBeNull()
    expect(await rows('tour_quotes')).toEqual([])
    expect(notifyOrgManagers).toHaveBeenCalledTimes(1)
    const notice = (notifyOrgManagers.mock.calls[0] as any[])[2]
    expect(notice.link).toMatch(/^\/intake\/order\?text=/)
    // The link carries the whole order in the canonical document shape.
    const text = Buffer.from(decodeURIComponent(notice.link.split('text=')[1]), 'base64').toString('utf8')
    expect(text).toContain('ツアーコード：ZZZ999-XX')
    expect(text).toContain('お名前：姓 YAMADA 名 TARO')
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
})
