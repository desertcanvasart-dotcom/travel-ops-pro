// ============================================
// B2B quotes: the server prices them, and edits cannot re-price them
// ============================================
// Sell audit (2026-10-13) #1, #2, #3, #5, #6, #8, #9, #10, #11. The routes on
// the in-memory Supabase mock; the pricing engine (/api/b2b/calculate-price)
// is canned — its own tests price.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

let role: string | null = 'agent'
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  getCurrentUserRole: async () => role,
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/org-rate-currency', async (orig) => ({ ...(await orig<typeof import('@/lib/org-rate-currency')>()), getOrgRateCurrency: async () => 'EUR' }))

const ENGINE = {
  services: [
    { service_id: 's1', service_name: 'Hotel', line_total: 3000, day_number: 1 },
    { service_id: 's2', service_name: 'Guide', line_total: 1000, day_number: 2 },
  ],
  optional_services: [],
  total_cost: 4000, margin_percent: 25, margin_amount: 1000, selling_price: 5750, price_per_person: 2875,
  tour_leader_cost: 0, single_supplement: 0, currency: 'EUR',
  season_uplift: { season_name: 'Peak', percent: 15, amount: 750 },
}
const engine = vi.fn(async (_req: NextRequest) => Response.json({ success: true, data: ENGINE }))
vi.mock('@/app/api/b2b/calculate-price/route', () => ({ POST: (req: NextRequest) => engine(req) }))

import { POST, GET, PUT as PUT_COLLECTION, DELETE as DELETE_COLLECTION } from '@/app/api/b2b/quotes/route'
import { PUT, DELETE } from '@/app/api/b2b/quotes/[id]/route'
import { DELETE as BULK_DELETE } from '@/app/api/b2b/quotes/bulk-delete/route'

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const call = async (res: Response) => ({ status: res.status, json: await res.json() })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  role = 'agent'
  engine.mockClear()
  setMockTables({
    tour_variations: [{ id: 'var-1', template_id: 'tpl-1' }],
    tour_quotes: [
      { id: 'q-draft', org_id: 'org-1', quote_number: 'QT-2026-00001', status: 'draft', selling_price: 5000, total_cost: 4000, valid_until: '2099-01-01', converted_to_itinerary_id: null },
      { id: 'q-conv', org_id: 'org-1', quote_number: 'QT-2026-00002', status: 'converted', selling_price: 900, valid_until: '2099-01-01', converted_to_itinerary_id: 'it-1' },
      { id: 'q-booked', org_id: 'org-1', quote_number: 'QT-2026-00003', status: 'accepted', selling_price: 800, valid_until: '2099-01-01', converted_to_itinerary_id: null },
      { id: 'q-old', org_id: 'org-1', quote_number: 'QT-2026-00004', status: 'sent', selling_price: 700, valid_until: '2020-01-01', converted_to_itinerary_id: null },
      { id: 'q-other', org_id: 'org-2', quote_number: 'QT-2026-00001', status: 'draft', selling_price: 1, valid_until: '2099-01-01' },
    ],
    bookings: [{ id: 'b-1', quote_id: 'q-booked', quote_type: 'b2b' }],
    quote_versions: [],
  })
})

describe('POST — the price is the server’s (#1, #5, #10)', () => {
  const body = { variation_id: 'var-1', num_adults: 2, travel_date: '2027-05-01', margin_percent: 25, created_by: 'someone-else', notes: 'hi' }

  it('stores the engine’s price, lines and season premium — never the body’s', async () => {
    const { status, json } = await call(await POST(req('/api/b2b/quotes', 'POST', {
      ...body, selling_price: 5750, total_cost: 1, price_per_person: 1, services_snapshot: [{ service_name: 'fake', line_total: 1 }],
    })))
    expect(status).toBe(201)
    const saved = (await rows('tour_quotes')).find((q) => q.id === json.data.id)
    expect(saved).toMatchObject({
      org_id: 'org-1', total_cost: 4000, margin_amount: 1000, selling_price: 5750, price_per_person: 2875,
      season_name: 'Peak', season_uplift_percent: 15, season_uplift_amount: 750, currency: 'EUR',
      created_by: 'user-1', status: 'draft',
    })
    expect(saved.services_snapshot.map((s: any) => s.service_name)).toEqual(['Hotel', 'Guide'])
    expect(saved).not.toHaveProperty('quote_number')
    // The engine was asked with the inputs, not the prices.
    const asked = await engine.mock.calls[0][0].json()
    expect(asked).toMatchObject({ variation_id: 'var-1', num_pax: 2, travel_date: '2027-05-01', margin_percent: 25 })
    expect(asked).not.toHaveProperty('selling_price')
  })

  it('a shown price that does not match the server’s is refused (selling_price: 1)', async () => {
    const { status, json } = await call(await POST(req('/api/b2b/quotes', 'POST', { ...body, selling_price: 1 })))
    expect(status).toBe(409)
    expect(json.selling_price).toBe(5750)
    expect((await rows('tour_quotes')).length).toBe(5)
  })

  it('a margin outside 0–100 is refused', async () => {
    expect((await POST(req('/api/b2b/quotes', 'POST', { ...body, margin_percent: 150 }))).status).toBe(400)
  })

  it('a quote from a trip is made elsewhere', async () => {
    expect((await POST(req('/api/b2b/quotes', 'POST', { itinerary_id: 'it-1', selling_price: 1 }))).status).toBe(400)
  })
})

describe('PUT — only what a person edits (#1, #2, #3, #11)', () => {
  it('prices and the quote number are left unchanged', async () => {
    const { status } = await call(await PUT(req('/api/b2b/quotes/q-draft', 'PUT', { selling_price: 1, quote_number: 'QT-2026-X1', notes: 'n' }), params('q-draft')))
    expect(status).toBe(200)
    const q = (await rows('tour_quotes')).find((r) => r.id === 'q-draft')
    expect(q).toMatchObject({ selling_price: 5000, quote_number: 'QT-2026-00001', notes: 'n', last_modified_by: 'user-1' })
  })

  it("status 'converted' is refused", async () => {
    const { status } = await call(await PUT(req('/api/b2b/quotes/q-draft', 'PUT', { status: 'converted', converted_to_itinerary_id: 'it-9' }), params('q-draft')))
    expect(status).toBe(400)
    expect((await rows('tour_quotes')).find((r) => r.id === 'q-draft')).toMatchObject({ status: 'draft', converted_to_itinerary_id: null })
  })

  it('a converted or booked quote keeps its status', async () => {
    expect((await PUT(req('/x', 'PUT', { status: 'draft' }), params('q-conv'))).status).toBe(409)
    expect((await PUT(req('/x', 'PUT', { status: 'rejected' }), params('q-booked'))).status).toBe(409)
    expect((await PUT(req('/x', 'PUT', { notes: 'still editable' }), params('q-booked'))).status).toBe(200)
  })

  it('an offer past its date is not accepted', async () => {
    expect((await PUT(req('/x', 'PUT', { status: 'accepted' }), params('q-old'))).status).toBe(409)
  })

  it('the collection PUT follows the same rules', async () => {
    const { status } = await call(await PUT_COLLECTION(req('/api/b2b/quotes', 'PUT', { id: 'q-draft', selling_price: 1, status: 'sent' })))
    expect(status).toBe(200)
    expect((await rows('tour_quotes')).find((r) => r.id === 'q-draft')).toMatchObject({ selling_price: 5000, status: 'sent' })
    expect((await PUT_COLLECTION(req('/api/b2b/quotes', 'PUT', { id: 'q-other', status: 'sent' }))).status).toBe(404)
  })
})

describe('DELETE (#6)', () => {
  it('is manager and above', async () => {
    role = 'agent'
    expect((await DELETE(req('/x', 'DELETE'), params('q-draft'))).status).toBe(403)
    expect((await DELETE_COLLECTION(req('/api/b2b/quotes?id=q-draft', 'DELETE'))).status).toBe(403)
  })

  it('refuses a booked or converted quote, with the reason', async () => {
    role = 'manager'
    const booked = await call(await DELETE(req('/x', 'DELETE'), params('q-booked')))
    expect(booked.status).toBe(409)
    expect(booked.json.error).toMatch(/booking/)
    expect((await DELETE(req('/x', 'DELETE'), params('q-conv'))).status).toBe(409)
    expect((await DELETE(req('/x', 'DELETE'), params('q-draft'))).status).toBe(200)
    expect((await rows('tour_quotes')).map((q) => q.id)).not.toContain('q-draft')
  })

  it('bulk delete skips converted and booked quotes and says how many', async () => {
    role = 'admin'
    const { json } = await call(await BULK_DELETE(req('/api/b2b/quotes/bulk-delete', 'DELETE', { quote_ids: ['q-draft', 'q-conv', 'q-booked', 'q-other'] })))
    expect(json).toMatchObject({ success: true, deleted_count: 1, skipped_count: 2 })
    expect((await rows('tour_quotes')).map((q) => q.id).sort()).toEqual(['q-booked', 'q-conv', 'q-old', 'q-other'])
  })
})

describe('GET list (#8, #9, #11)', () => {
  it('counts the company’s whole book, whatever the filter, and shows past-date offers as expired', async () => {
    const { json } = await call(await GET(req('/api/b2b/quotes?status=sent&limit=1', 'GET')))
    expect(json.counts).toEqual({ total: 4, draft: 1, sent: 0, accepted: 1, expired: 1, converted: 1 })
    // "Sent" no longer lists the sent offer whose date has passed.
    expect(json.data).toEqual([])
    const expired = await call(await GET(req('/api/b2b/quotes?status=expired', 'GET')))
    expect(expired.json.data.map((q: any) => [q.id, q.status, q.stored_status])).toEqual([['q-old', 'expired', 'sent']])
  })
})
