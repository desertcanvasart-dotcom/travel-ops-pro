// ============================================
// VAT on quotes and invoices: the server's figure, recorded
// ============================================
// Owner's decision (2026-10-13; lib/vat.ts): VAT at the company's rate,
// added on top of the net, recorded on each document when it is priced or
// issued. A browser can say WHETHER VAT applies; the rate and the amount are
// always the server's. Runs the real routes on the in-memory Supabase mock.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  getCurrentUserRole: async () => 'manager',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/auto-pricing-service', () => ({ loadSeasonWindows: async () => [] }))
const sendEmail = vi.fn(async (_args: { html: string }) => ({ success: true }))
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: (a: { html: string }) => sendEmail(a) }))
vi.mock('@/lib/org-identity', () => ({ orgIdentity: async () => ({ name: 'Nile Co' }) }))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: async () => ({ success: true }) }))
vi.mock('@/lib/accounting', () => ({ syncInvoice: async () => undefined }))
vi.mock('@/lib/org-refs', () => ({ recordsInOrg: async () => true }))
vi.mock('@/lib/document-numbering', () => ({
  nextDocumentNumber: async () => 'INV-2026-001',
  insertWithUniqueRetry: async ({ generateRow, insert }: { generateRow: () => Promise<unknown>; insert: (r: unknown) => Promise<unknown> }) => insert(await generateRow()),
}))

import { POST as createOffer } from '@/app/api/b2c/quotes/route'
import { PUT as editOffer } from '@/app/api/b2c/quotes/[id]/route'
import { POST as sendOffer } from '@/app/api/b2c/quotes/[id]/send/route'
import { POST as createInvoice } from '@/app/api/invoices/route'
import { PUT as editInvoice } from '@/app/api/invoices/[id]/route'
import { updateB2bQuote } from '@/lib/b2b/update-quote'

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/x', { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const call = async (res: Response) => ({ status: res.status, json: await res.json() })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  sendEmail.mockClear()
  setMockTables({
    // ATS has set 10%; the default would be 14.
    organizations: [{ id: 'org-1', default_margin_percent: 25, vat_rate: 10 }],
    itineraries: [
      { id: 'it-1', org_id: 'org-1', start_date: '2027-03-01', supplier_cost: 4000, total_cost: 5000, currency: 'EUR', num_adults: 2, num_children: 0, client_email: 'c@x.com', client_name: 'C', trip_name: 'Nile' },
      { id: 'it-vat', org_id: 'org-1', start_date: '2027-03-01', total_cost: 100000, currency: 'JPY', num_adults: 2, vat_applied: true, vat_rate: 14 },
    ],
    b2c_quotes: [
      { id: 'o-open', org_id: 'org-1', itinerary_id: 'it-1', status: 'draft', total_cost: 4000, margin_percent: 25, num_travelers: 2, season_uplift_percent: 0, currency: 'EUR', selling_price: 5000, price_per_person: 2500, valid_until: '2099-01-01', vat_applied: false, vat_rate: null, vat_amount: 0, itineraries: { client_email: 'c@x.com', client_name: 'C', trip_name: 'Nile' } },
      { id: 'o-booked', org_id: 'org-1', itinerary_id: 'it-1', status: 'accepted', currency: 'EUR', selling_price: 5000, valid_until: '2099-01-01', vat_applied: false },
    ],
    tour_quotes: [
      { id: 'q-1', org_id: 'org-1', status: 'draft', valid_until: '2099-01-01', selling_price: 123457, currency: 'JPY', vat_applied: false, vat_amount: 0 },
      { id: 'q-conv', org_id: 'org-1', status: 'converted', converted_to_itinerary_id: 'it-1', valid_until: '2099-01-01', selling_price: 1000, currency: 'EUR', vat_applied: false },
    ],
    bookings: [{ id: 'b-1', quote_id: 'o-booked', quote_type: 'b2c' }],
    invoices: [
      { id: 'inv-draft', org_id: 'org-1', invoice_number: 'INV-1', total_amount: 100000, tax_amount: 0, tax_rate: 0, amount_paid: 0, currency: 'JPY', status: 'draft', vat_applied: false },
      { id: 'inv-paid', org_id: 'org-1', invoice_number: 'INV-2', total_amount: 100000, tax_amount: 0, tax_rate: 0, amount_paid: 50000, currency: 'JPY', status: 'partial', vat_applied: false },
    ],
    clients: [],
  })
})

describe('B2C offer', () => {
  it('records VAT at the company rate; a browser-sent rate and amount are ignored', async () => {
    const { status, json } = await call(await createOffer(req('POST', { itinerary_id: 'it-1', vat_applied: true, vat_rate: 50, vat_amount: 1 })))
    expect(status).toBe(200)
    // 4000 + 25% = 5000; VAT 10% (the company's) = 500.
    expect(json.data).toMatchObject({ selling_price: 5000, vat_applied: true, vat_rate: 10, vat_amount: 500 })
  })

  it('without the flag: no VAT columns written (the defaults say "not applied")', async () => {
    const { json } = await call(await createOffer(req('POST', { itinerary_id: 'it-1', vat_amount: 999 })))
    expect(json.data.vat_applied).toBeUndefined()
    expect(json.data.vat_amount).toBeUndefined()
  })

  it('switching VAT on records it on the offer\'s net; a sent amount is ignored', async () => {
    const { status, json } = await call(await editOffer(req('PUT', { vat_applied: true, vat_amount: 3 }), params('o-open')))
    expect(status).toBe(200)
    expect(json.data).toMatchObject({ selling_price: 5000, vat_applied: true, vat_rate: 10, vat_amount: 500 })
  })

  it('a re-price while VAT is on re-works it at the rate the offer recorded', async () => {
    await editOffer(req('PUT', { vat_applied: true }), params('o-open'))
    ;(await rows('organizations'))[0].vat_rate = 20
    const { json } = await call(await editOffer(req('PUT', { margin_percent: 10 }), params('o-open')))
    // 4000 + 10% = 4400; still 10%: 440.
    expect(json.data).toMatchObject({ selling_price: 4400, vat_rate: 10, vat_amount: 440 })
    // …while a new offer takes the company's new rate.
    const fresh = await call(await createOffer(req('POST', { itinerary_id: 'it-1', vat_applied: true })))
    expect(fresh.json.data.vat_rate).toBe(20)
  })

  it('a booked offer keeps its VAT', async () => {
    expect((await editOffer(req('PUT', { vat_applied: true }), params('o-booked'))).status).toBe(409)
  })

  it('a non-boolean flag is refused', async () => {
    expect((await editOffer(req('PUT', { vat_applied: 'yes please' }), params('o-open'))).status).toBe(400)
  })

  it('the email says whether VAT is on it', async () => {
    await sendOffer(req('POST', { send_via: 'email' }), params('o-open'))
    expect(sendEmail.mock.calls[0][0].html).toContain('VAT not applied')
    await editOffer(req('PUT', { vat_applied: true }), params('o-open'))
    await sendOffer(req('POST', { send_via: 'email' }), params('o-open'))
    expect(sendEmail.mock.calls[1][0].html).toContain('VAT 10% included: €500.00')
    expect(sendEmail.mock.calls[1][0].html).toContain('Total incl. VAT: €5,500.00')
  })
})

describe('B2B quote edit', () => {
  const db = () => createMockClient() as never

  it('VAT on: the quote\'s own net at the company rate, in whole yen; the body\'s amount is ignored', async () => {
    const r = await updateB2bQuote(db(), { orgId: 'org-1', id: 'q-1', body: { vat_applied: true, vat_amount: 5, vat_rate: 99 }, actor: 'user-1' })
    expect(r.status).toBe(200)
    // 123,457 × 10% = 12,345.7 → ¥12,346
    expect(r.body.data).toMatchObject({ vat_applied: true, vat_rate: 10, vat_amount: 12346 })
  })

  it('VAT off clears the rate and amount', async () => {
    await updateB2bQuote(db(), { orgId: 'org-1', id: 'q-1', body: { vat_applied: true }, actor: null })
    const r = await updateB2bQuote(db(), { orgId: 'org-1', id: 'q-1', body: { vat_applied: false }, actor: null })
    expect(r.body.data).toMatchObject({ vat_applied: false, vat_rate: null, vat_amount: 0 })
  })

  it('a converted quote keeps the VAT it was converted with', async () => {
    const r = await updateB2bQuote(db(), { orgId: 'org-1', id: 'q-conv', body: { vat_applied: true }, actor: null })
    expect(r.status).toBe(409)
  })
})

describe('invoice', () => {
  const base = { client_name: 'C', client_id: 'cl-1', currency: 'JPY', line_items: [{ description: 'Trip', quantity: 1, unit_price: 100000, amount: 100000 }] }

  it('VAT on top of the net at the company rate; a browser-sent tax is never stored', async () => {
    const { status, json } = await call(await createInvoice(req('POST', { ...base, total_amount: 100000, vat_applied: true, tax_rate: 50, tax_amount: 1 })))
    expect(status).toBe(201)
    expect(json).toMatchObject({ vat_applied: true, tax_rate: 10, tax_amount: 10000, subtotal: 100000, total_amount: 110000, balance_due: 110000 })
  })

  it('a browser-sent tax without the flag is ignored too', async () => {
    const { json } = await call(await createInvoice(req('POST', { ...base, total_amount: 100000, tax_rate: 10, tax_amount: 10000 })))
    expect(json).toMatchObject({ tax_rate: 0, tax_amount: 0, total_amount: 100000 })
    expect(json.vat_applied).toBeUndefined()
  })

  it('an invoice for a trip that carries VAT (from its quote) inherits it', async () => {
    const { json } = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-vat', total_amount: 100000 })))
    expect(json).toMatchObject({ vat_applied: true, tax_amount: 10000, total_amount: 110000 })
  })

  it('…unless the invoice says otherwise', async () => {
    const { json } = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-vat', total_amount: 100000, vat_applied: false })))
    expect(json).toMatchObject({ tax_amount: 0, total_amount: 100000 })
  })

  it('a deposit and its final each carry VAT on their own net', async () => {
    const dep = await call(await createInvoice(req('POST', { ...base, invoice_type: 'deposit', deposit_percent: 20, full_trip_cost: 100000, vat_applied: true })))
    expect(dep.json).toMatchObject({ total_amount: 22000, tax_amount: 2000, full_trip_cost: 100000 })
    // The final inherits the deposit's VAT and settles the trip net less the
    // deposit's NET (20,000), not its total (22,000).
    const fin = await call(await createInvoice(req('POST', { ...base, invoice_type: 'final', deposit_percent: 20, parent_invoice_id: dep.json.id, full_trip_cost: 100000 })))
    expect(fin.json).toMatchObject({ vat_applied: true, tax_amount: 8000, total_amount: 88000 })
    expect(dep.json.total_amount + fin.json.total_amount).toBe(110000)
  })

  it('switching VAT on a draft invoice re-works it from its net; tax fields in the body are ignored', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { vat_applied: true, tax_amount: 1, tax_rate: 1 }), params('inv-draft')))
    expect(status).toBe(200)
    expect(json).toMatchObject({ vat_applied: true, tax_rate: 10, tax_amount: 10000, total_amount: 110000, balance_due: 110000 })
  })

  it('an invoice that has taken a payment keeps its VAT', async () => {
    expect((await editInvoice(req('PUT', { vat_applied: true }), params('inv-paid'))).status).toBe(409)
  })
})
