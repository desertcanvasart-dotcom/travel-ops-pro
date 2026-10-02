import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { OPTIONAL_TOUR_MAIL, PACKAGE_TOUR_MAIL } from '../fixtures/tup-mails'

// Operator, 2026-10-02: the website's order emails must reach "the correct
// program", the customer linked, and start the existing pipeline — with the
// customer never leaving the website. After each Gmail sync, every new
// inbound message is looked at once; an order becomes a quote by itself.
// The engine is canned here (its own tests price); this proves the intake's
// decisions.

vi.mock('@/lib/org-rate-currency', () => ({ getOrgRateCurrency: async () => 'USD' }))
vi.mock('@/lib/org-default-margin', () => ({
  getOrgDefaultMargin: async () => 30,
  resolveMarginPercent: ({ orgDefault }: { orgDefault: number | null }) => orgDefault ?? 25,
}))
const priced = {
  success: true, complete: true, holes: [], warnings: [],
  services: [{ id: 'd1-guide', serviceName: 'Japanese Speaking Guide', serviceType: 'guide', rateSource: 'guide_rates', quantityMode: 'fixed', quantity: 1, unitCost: 98, lineTotal: 98, isOptional: false, dayNumber: 1 }],
  accommodationNights: [],
  totalCost: 98, marginPercent: 30, marginAmount: 29.4, sellingPrice: 127.4, pricePerPerson: 63.7, currency: 'USD', singleSupplement: 0,
}
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: vi.fn(async () => priced),
  calculatePricingWithPassengerBreakdown: vi.fn(async () => priced),
}))
const notices: Array<{ title: string; link?: string | null }> = []
vi.mock('@/lib/notify-managers', () => ({
  notifyOrgManagers: vi.fn(async (_db: unknown, _org: string, n: { title: string; link?: string | null }) => { notices.push(n); return { created: 1, failed: 0 } }),
}))

import { processNewWebOrders } from '@/lib/intake/web-order-intake'

const db = () => createMockClient()
const rows = async (t: string) => (await (db().from(t) as any).select('*')).data as any[]

function inbox(messages: Array<{ id: string; body: string; conv?: string; html?: boolean; sentAt?: string }>, extra: Record<string, any[]> = {}) {
  setMockTables({
    organizations: [{ id: 'org-1' }],
    organization_members: [{ user_id: 'u1', org_id: 'org-1', created_at: '2026-01-01' }],
    email_conversations: [{ id: 'conv-tup', user_id: 'u1', lead_checked_at: null, lead_check: null }],
    email_messages: messages.map((m, i) => ({
      id: m.id, message_id: `gmail-${m.id}`, conversation_id: m.conv ?? 'conv-tup', direction: 'inbound',
      subject: '【T-UP】オプショナルツアー申込み', body_text: m.html ? null : m.body, body_html: m.html ? m.body.replace(/\n/g, '<br>') : null,
      sent_at: m.sentAt ?? `2026-10-02T0${i}:00:00Z`, order_checked_at: null,
    })),
    tour_templates: [
      { id: 'tpl-luxor', template_code: 'LXR-DAY-01', template_name: 'Luxor day tour from Cairo', duration_days: 1, is_active: true, tour_type: 'day_tour', website_url: 'https://tour.ats-hj.com/opt_detail.php?id=67' },
      { id: 'tpl-803', template_code: 'NEK803-CR-ABS', template_name: 'Nile cruise 8 days', duration_days: 8, is_active: true, tour_type: 'cruise', website_url: null },
    ],
    tour_variations: [], clients: [], tour_quotes: [], tour_departures: [], departure_bookings: [], web_order_intakes: [],
    ...extra,
  })
}

beforeEach(() => { vi.clearAllMocks(); notices.length = 0 })

describe('website order emails become quotes after the sync', () => {
  it('an optional-tour email: programme by its website page, client created, one quote, intake recorded, managers told', async () => {
    inbox([{ id: 'm1', body: OPTIONAL_TOUR_MAIL }])
    const out = await processNewWebOrders(db())
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ messageId: 'm1', outcome: 'quote_created' })

    // Matched by the page (opt_detail.php?id=67) although the code EXR-B12-FD is unknown.
    const quotes = await rows('tour_quotes')
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ org_id: 'org-1', source: 'web_form', travel_date: '2027-02-24', num_adults: 2, client_email: 'yamada.test@example.jp', client_name: '山田 花子', created_by: null })
    expect(quotes[0].notes).toContain('[オプショナルツアー] EXR-B12-FD')
    expect(quotes[0].notes).toContain('ウェブページ: https://tour.ats-hj.com/opt_detail.php?id=67')
    expect(quotes[0].notes).toContain('ウェブ表示の小計: ¥175,000')
    expect(quotes[0].notes).toContain('同行者1: YAMADA TARO')
    expect((await rows('tour_variations'))[0]).toMatchObject({ template_id: 'tpl-luxor' })

    const clients = await rows('clients')
    expect(clients).toHaveLength(1)
    expect(clients[0]).toMatchObject({ email: 'yamada.test@example.jp', last_name: '山田', first_name: '花子', date_of_birth: '1993-07-11', postal_code: '164-0001', client_source: 'web_form' })

    const [intake] = await rows('web_order_intakes')
    expect(intake).toMatchObject({
      org_id: 'org-1', email_message_id: 'm1', conversation_id: 'conv-tup', outcome: 'quote_created', reason: null,
      tour_code: 'EXR-B12-FD', travel_date: '2027-02-24', customer_email: 'yamada.test@example.jp', customer_name: '山田 花子',
      client_id: clients[0].id, quote_id: quotes[0].id,
    })
    expect(intake.order_text).toContain('●オプショナルコード')
    expect(intake.resolved_at).toBeTruthy()

    expect(notices).toHaveLength(1)
    expect(notices[0].link).toBe(`/b2b/quotes/${quotes[0].id}`)

    // Looked at once; the conversation is not a lead for the AI.
    expect((await rows('email_messages'))[0].order_checked_at).toBeTruthy()
    expect((await rows('email_conversations'))[0]).toMatchObject({ lead_check: 'web_order' })
  })

  it('a package tour on a loaded departure: matched by code stem, seats held pending on that date', async () => {
    inbox([{ id: 'm1', body: PACKAGE_TOUR_MAIL }], {
      tour_departures: [
        { id: 'dep-cancelled', org_id: 'org-1', template_id: 'tpl-803', start_date: '2026-10-16', status: 'cancelled', created_at: '2026-01-01' },
        { id: 'dep-1016', org_id: 'org-1', template_id: 'tpl-803', start_date: '2026-10-16', status: 'open', max_pax: 20, booked_pax: 4, created_at: '2026-01-02' },
      ],
    })
    const [r] = await processNewWebOrders(db())
    expect(r.outcome).toBe('quote_created')
    const holds = await rows('departure_bookings')
    expect(holds).toHaveLength(1)
    expect(holds[0]).toMatchObject({ org_id: 'org-1', departure_id: 'dep-1016', pax: 3, status: 'pending', client_name: '佐藤 一郎' })
    expect(holds[0].notes).toContain((await rows('tour_quotes'))[0].quote_number ?? '')
    expect((await rows('web_order_intakes'))[0].departure_booking_id).toBe(holds[0].id)
  })

  it('an existing client is linked, not duplicated', async () => {
    inbox([{ id: 'm1', body: OPTIONAL_TOUR_MAIL }], {
      clients: [{ id: 'c-1', org_id: 'org-1', email: 'Yamada.Test@example.jp', first_name: '花子', last_name: '山田' }],
    })
    await processNewWebOrders(db())
    expect(await rows('clients')).toHaveLength(1)
    expect((await rows('web_order_intakes'))[0].client_id).toBe('c-1')
  })

  it('an unknown programme needs attention: no quote, the reason kept, managers sent to finish it by hand', async () => {
    inbox([{ id: 'm1', body: OPTIONAL_TOUR_MAIL.replace('opt_detail.php?id=67', 'opt_detail.php?id=999') }])
    const [r] = await processNewWebOrders(db())
    expect(r.outcome).toBe('needs_attention')
    expect(await rows('tour_quotes')).toEqual([])
    const [intake] = await rows('web_order_intakes')
    expect(intake.outcome).toBe('needs_attention')
    expect(intake.reason).toContain('No programme matches tour code EXR-B12-FD')
    expect(intake.resolved_at).toBeUndefined()
    expect(notices[0].link).toBe(`/intake/order?intake=${intake.id}`)
    expect((await rows('email_messages'))[0].order_checked_at).toBeTruthy()
  })

  it('the same order sent twice is one quote; the second links to it', async () => {
    inbox([{ id: 'm1', body: OPTIONAL_TOUR_MAIL }, { id: 'm2', body: OPTIONAL_TOUR_MAIL }])
    const out = await processNewWebOrders(db())
    expect(out.map(o => o.outcome)).toEqual(['quote_created', 'duplicate'])
    const quotes = await rows('tour_quotes')
    expect(quotes).toHaveLength(1)
    expect((await rows('web_order_intakes'))[1]).toMatchObject({ outcome: 'duplicate', quote_id: quotes[0].id })
  })

  it('different customers threaded into one conversation are each their own order', async () => {
    const other = OPTIONAL_TOUR_MAIL.replace('yamada.test@example.jp', 'kato.test@example.jp').replace('山田 花子', '加藤 恵').replace('YAMADA HANAKO', 'KATO MEGUMI')
    inbox([{ id: 'm1', body: OPTIONAL_TOUR_MAIL }, { id: 'm2', body: other }])
    const out = await processNewWebOrders(db())
    expect(out.map(o => o.outcome)).toEqual(['quote_created', 'quote_created'])
    expect((await rows('clients')).map(c => c.email).sort()).toEqual(['kato.test@example.jp', 'yamada.test@example.jp'])
  })

  it('mail that is not an order is only marked looked-at; an HTML-only order is still read', async () => {
    inbox([
      { id: 'm1', body: 'Hello, do you have availability for Siwa in November?' },
      { id: 'm2', body: OPTIONAL_TOUR_MAIL, html: true },
    ])
    const out = await processNewWebOrders(db())
    expect(out.map(o => o.outcome)).toEqual(['quote_created'])
    expect((await rows('email_messages')).every(m => m.order_checked_at)).toBe(true)
    expect(await rows('web_order_intakes')).toHaveLength(1)
  })

  it('a message already looked at is never read again', async () => {
    inbox([{ id: 'm1', body: OPTIONAL_TOUR_MAIL }])
    await processNewWebOrders(db())
    expect(await processNewWebOrders(db())).toEqual([])
    expect(await rows('tour_quotes')).toHaveLength(1)
  })
})
