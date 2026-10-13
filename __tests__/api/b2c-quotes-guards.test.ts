// ============================================
// B2C offers: priced for the trip's own party, in its own currency
// ============================================
// Sell audit (2026-10-13) #6, #11, #13, #14, #15, #16, #18 — the routes on the
// in-memory Supabase mock.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

let role: string | null = 'manager'
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
vi.mock('@/lib/auto-pricing-service', () => ({ loadSeasonWindows: async () => [] }))
const sendEmail = vi.fn(async () => ({ success: true }))
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: (...a: unknown[]) => sendEmail(...(a as [])) }))
vi.mock('@/lib/org-identity', () => ({ orgIdentity: async () => ({ name: 'Nile Co' }) }))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: async () => ({ success: true }) }))

import { POST } from '@/app/api/b2c/quotes/route'
import { PUT, DELETE } from '@/app/api/b2c/quotes/[id]/route'
import { POST as SEND } from '@/app/api/b2c/quotes/[id]/send/route'

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/b2c/quotes', { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const call = async (res: Response) => ({ status: res.status, json: await res.json() })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  role = 'manager'
  sendEmail.mockClear()
  setMockTables({
    organizations: [{ id: 'org-1', default_margin_percent: 18 }],
    itineraries: [
      { id: 'it-4', org_id: 'org-1', start_date: '2027-03-01', supplier_cost: 4000, total_cost: 5000, currency: 'EUR', num_adults: 4, num_children: 0, client_email: 'c@x.com', client_name: 'C', trip_name: 'Nile' },
    ],
    b2c_quotes: [
      { id: 'o-open', org_id: 'org-1', itinerary_id: 'it-4', status: 'draft', total_cost: 4000, margin_percent: 25, num_travelers: 4, season_uplift_percent: 0, currency: 'EUR', selling_price: 5000, price_per_person: 1250, valid_until: '2099-01-01' },
      { id: 'o-booked', org_id: 'org-1', itinerary_id: 'it-4', status: 'accepted', total_cost: 4000, margin_percent: 25, num_travelers: 4, currency: 'EUR', selling_price: 5000, valid_until: '2099-01-01' },
      { id: 'o-rejected', org_id: 'org-1', itinerary_id: 'it-4', status: 'rejected', currency: 'EUR', valid_until: '2099-01-01', itineraries: { client_email: 'c@x.com' } },
      { id: 'o-lapsed', org_id: 'org-1', itinerary_id: 'it-4', status: 'sent', currency: 'EUR', valid_until: '2020-01-01', itineraries: { client_email: 'c@x.com' } },
    ],
    bookings: [{ id: 'b-1', quote_id: 'o-booked', quote_type: 'b2c' }],
    clients: [],
  })
})

describe('POST', () => {
  it('a 4-person trip with no traveller count is per person over 4, at the company default margin (#13, #16)', async () => {
    const { status, json } = await call(await POST(req('POST', { itinerary_id: 'it-4' })))
    expect(status).toBe(200)
    expect(json.data).toMatchObject({ num_travelers: 4, total_cost: 4000, margin_percent: 18, selling_price: 4720, price_per_person: 1180, currency: 'EUR', created_by: 'user-1' })
    expect(json.data).not.toHaveProperty('quote_number')
  })

  it('another party size is refused with the way forward (#13)', async () => {
    const { status, json } = await call(await POST(req('POST', { itinerary_id: 'it-4', num_travelers: 2 })))
    expect(status).toBe(422)
    expect(json.error).toMatch(/re-price the itinerary/)
  })

  it('another currency is refused, not relabelled (#15)', async () => {
    expect((await POST(req('POST', { itinerary_id: 'it-4', currency: 'JPY' }))).status).toBe(422)
  })

  it('an out-of-range margin is refused, not swapped for the default (#16)', async () => {
    expect((await POST(req('POST', { itinerary_id: 'it-4', margin_percent: 150 }))).status).toBe(400)
  })

  it('authorship is the session’s, not the body’s (#18)', async () => {
    const { json } = await call(await POST(req('POST', { itinerary_id: 'it-4', created_by: 'someone-else' })))
    expect(json.data.created_by).toBe('user-1')
  })
})

describe('PUT (#14)', () => {
  it('ignores the cost, currency and number; a margin re-prices from the itinerary', async () => {
    const { status, json } = await call(await PUT(req('PUT', { total_cost: 1, currency: 'JPY', quote_number: 'X', margin_percent: 10 }), params('o-open')))
    expect(status).toBe(200)
    expect(json.data).toMatchObject({ total_cost: 4000, margin_percent: 10, selling_price: 4400, price_per_person: 1100, currency: 'EUR', num_travelers: 4 })
    expect(json.data.quote_number).toBeUndefined()
  })

  it('{total_cost: 1} alone changes nothing', async () => {
    expect((await PUT(req('PUT', { total_cost: 1 }), params('o-open'))).status).toBe(400)
    expect((await rows('b2c_quotes')).find((q) => q.id === 'o-open').total_cost).toBe(4000)
  })

  it('a negative margin is refused', async () => {
    expect((await PUT(req('PUT', { margin_percent: -50 }), params('o-open'))).status).toBe(400)
  })

  it('a booked offer keeps its price and status; its notes still change', async () => {
    expect((await PUT(req('PUT', { margin_percent: 5 }), params('o-booked'))).status).toBe(409)
    expect((await PUT(req('PUT', { status: 'rejected' }), params('o-booked'))).status).toBe(409)
    expect((await PUT(req('PUT', { client_notes: 'See you in Cairo' }), params('o-booked'))).status).toBe(200)
  })

  it('changing the margin is manager and above', async () => {
    role = 'agent'
    expect((await PUT(req('PUT', { margin_percent: 10 }), params('o-open'))).status).toBe(403)
  })
})

describe('DELETE (#6)', () => {
  it('a booked offer is kept, with the reason; an agent cannot delete', async () => {
    const booked = await call(await DELETE(req('DELETE'), params('o-booked')))
    expect(booked.status).toBe(409)
    expect(booked.json.error).toMatch(/booking/)
    role = 'agent'
    expect((await DELETE(req('DELETE'), params('o-open'))).status).toBe(403)
    role = 'admin'
    expect((await DELETE(req('DELETE'), params('o-open'))).status).toBe(200)
  })
})

describe('send (#11, #18)', () => {
  it('a rejected or lapsed offer is not sent', async () => {
    expect((await SEND(req('POST', { send_via: 'email' }), params('o-rejected'))).status).toBe(409)
    expect((await SEND(req('POST', { send_via: 'email' }), params('o-lapsed'))).status).toBe(409)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
