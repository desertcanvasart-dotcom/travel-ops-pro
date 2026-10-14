// Finance (customer side): the invoice and payment routes, run on the
// in-memory Supabase mock. Pins the audit fixes that live in the routes:
// validated amounts, no duplicate deposit/final, payments only on a sent
// invoice, a guarded delete that releases billed extras, a status that cannot
// be set to paid by hand, per-company numbering, the company's own currency,
// whitelisted payment writes with the VAT recorded, and a list that never
// shows another company's trip.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const numbering = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/supabase-server', async () => {
  const mock = await import('../_mock-supabase')
  return { createServerClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  getCurrentUserRole: async () => 'manager',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/accounting', () => ({ syncInvoice: async () => undefined, syncInvoicePayment: async () => undefined }))
vi.mock('@/lib/document-numbering', () => ({
  nextDocumentNumber: async (opts: Record<string, unknown>) => { numbering.calls.push(opts); return `INV-2026-${String(numbering.calls.length).padStart(3, '0')}` },
  insertWithUniqueRetry: async ({ generateRow, insert }: { generateRow: () => Promise<unknown>; insert: (r: unknown) => Promise<unknown> }) => insert(await generateRow()),
}))

import { GET as listInvoices, POST as createInvoice } from '@/app/api/invoices/route'
import { GET as getInvoice, PUT as editInvoice, DELETE as deleteInvoice } from '@/app/api/invoices/[id]/route'
import { POST as payInvoice } from '@/app/api/invoices/[id]/payments/route'
import { GET as listPayments, POST as createPayment } from '@/app/api/payments/route'
import { PUT as editPayment } from '@/app/api/payments/[id]/route'

const req = (method: string, body?: unknown, url = 'http://localhost/api/x') =>
  new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const call = async (res: Response) => ({ status: res.status, json: await res.json() })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const PAST = '2020-01-01'
const FUTURE = '2099-01-01'
const base = { client_name: 'C', client_id: 'cl-1', currency: 'JPY', total_amount: 100000, line_items: [{ description: 'Trip', quantity: 1, unit_price: 100000, amount: 100000 }] }

beforeEach(() => {
  numbering.calls.length = 0
  setMockTables({
    organizations: [{ id: 'org-1', default_currency: 'JPY', rate_currency: 'JPY', vat_rate: 14 }, { id: 'org-2', default_currency: 'EUR' }],
    clients: [{ id: 'cl-1', org_id: 'org-1' }],
    itineraries: [
      { id: 'it-jpy', org_id: 'org-1', currency: 'JPY', total_cost: 100000, vat_applied: false },
      { id: 'it-eur', org_id: 'org-1', currency: 'EUR', total_cost: 1000, vat_applied: false },
      { id: 'it-vat', org_id: 'org-1', currency: 'JPY', total_cost: 114000, vat_applied: true, vat_rate: 14 },
      { id: 'it-theirs', org_id: 'org-2', currency: 'EUR', itinerary_code: 'THEIRS', client_name: 'Their client', client_phone: '+999', client_email: 't@x', total_cost: 7 },
    ],
    invoices: [
      { id: 'inv-draft', org_id: 'org-1', invoice_number: 'INV-1', status: 'draft', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY', due_date: PAST },
      { id: 'inv-sent', org_id: 'org-1', invoice_number: 'INV-2', status: 'sent', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY', due_date: FUTURE, vat_applied: false },
      { id: 'inv-late', org_id: 'org-1', invoice_number: 'INV-3', status: 'sent', total_amount: 500, amount_paid: 0, balance_due: 500, currency: 'JPY', due_date: PAST },
      { id: 'inv-cancelled', org_id: 'org-1', invoice_number: 'INV-4', status: 'cancelled', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY', due_date: FUTURE },
      { id: 'inv-vat', org_id: 'org-1', invoice_number: 'INV-5', status: 'sent', total_amount: 1140, tax_amount: 140, amount_paid: 0, balance_due: 1140, currency: 'JPY', due_date: FUTURE, vat_applied: true },
      { id: 'inv-paid', org_id: 'org-1', invoice_number: 'INV-6', status: 'partial', total_amount: 1000, amount_paid: 400, balance_due: 600, currency: 'JPY', due_date: FUTURE },
      { id: 'inv-deposit', org_id: 'org-1', invoice_number: 'INV-7-DEP', status: 'sent', invoice_type: 'deposit', itinerary_id: 'it-jpy', total_amount: 10000, tax_amount: 0, amount_paid: 0, balance_due: 10000, currency: 'JPY', due_date: FUTURE },
      { id: 'inv-theirs', org_id: 'org-2', invoice_number: 'INV-8', status: 'sent', invoice_type: 'deposit', total_amount: 1, amount_paid: 0, balance_due: 1, currency: 'EUR' },
    ],
    invoice_payments: [{ id: 'ip-1', invoice_id: 'inv-paid', amount: 400 }],
    booking_extras: [
      { id: 'x-1', org_id: 'org-1', invoice_id: 'inv-draft', invoiced_at: '2026-10-01T00:00:00Z', status: 'confirmed' },
      { id: 'x-2', org_id: 'org-1', invoice_id: 'inv-sent', invoiced_at: '2026-10-01T00:00:00Z', status: 'confirmed' },
    ],
    payments: [],
  })
})

describe('POST /api/invoices: amounts', () => {
  it('a negative total is refused', async () => {
    const { status, json } = await call(await createInvoice(req('POST', { ...base, total_amount: -100 })))
    expect(status).toBe(400)
    expect(json.error).toContain('total_amount')
  })

  it('a deposit of more than 100% or of 0% is refused', async () => {
    expect((await createInvoice(req('POST', { ...base, invoice_type: 'deposit', deposit_percent: 150, itinerary_id: 'it-eur' }))).status).toBe(400)
    expect((await createInvoice(req('POST', { ...base, invoice_type: 'deposit', deposit_percent: 0, itinerary_id: 'it-eur' }))).status).toBe(400)
  })

  it('a numeric-string total is a number, not text joined to the additions', async () => {
    const { status, json } = await call(await createInvoice(req('POST', { ...base, total_amount: '100000' })))
    expect(status).toBe(201)
    expect(json.total_amount).toBe(100000)
  })
})

describe('POST /api/invoices: numbering and currency', () => {
  it("the number is the company's own: its id and the per-company counter are passed", async () => {
    await createInvoice(req('POST', base))
    expect(numbering.calls[0]).toMatchObject({ orgId: 'org-1', counterRpc: 'next_invoice_number', prefix: 'INV' })
    // …never the install-wide sequence alone.
    expect(numbering.calls[0].orgId).toBeTruthy()
  })

  it("no currency sent: the company's own, not EUR", async () => {
    const { currency: _c, ...noCurrency } = base
    void _c
    const { json } = await call(await createInvoice(req('POST', noCurrency)))
    expect(json.currency).toBe('JPY')
    // org-1 bills in JPY; a trip in euro names its own.
    const trip = await call(await createInvoice(req('POST', { ...noCurrency, itinerary_id: 'it-eur', total_amount: 1000 })))
    expect(trip.json.currency).toBe('EUR')
  })

  it('a stored next_reminder_date starts reminders a week before it falls due', async () => {
    const { json } = await call(await createInvoice(req('POST', { ...base, due_date: '2026-11-15' })))
    expect(json.next_reminder_date).toBe('2026-11-08')
    const none = await call(await createInvoice(req('POST', base)))
    expect(none.json.next_reminder_date).toBeNull()
  })
})

describe('POST /api/invoices: no duplicates, no foreign parent', () => {
  it('a second final invoice for the same deposit is refused; a cancelled one can be replaced', async () => {
    const body = { ...base, invoice_type: 'final', parent_invoice_id: 'inv-deposit', itinerary_id: 'it-jpy', full_trip_cost: 100000 }
    expect((await createInvoice(req('POST', body))).status).toBe(201)
    const second = await call(await createInvoice(req('POST', body)))
    expect(second.status).toBe(409)
    expect(second.json.error).toContain('final invoice')
    ;(await rows('invoices')).filter(i => i.invoice_type === 'final').forEach(i => { i.status = 'cancelled' })
    expect((await createInvoice(req('POST', body))).status).toBe(201)
  })

  it('a second deposit invoice for the same trip is refused', async () => {
    const { status, json } = await call(await createInvoice(req('POST', { ...base, invoice_type: 'deposit', itinerary_id: 'it-jpy', full_trip_cost: 100000 })))
    expect(status).toBe(409)
    expect(json.error).toContain('deposit invoice')
    // another trip is fine
    expect((await createInvoice(req('POST', { ...base, invoice_type: 'deposit', itinerary_id: 'it-vat', full_trip_cost: 100000 }))).status).toBe(201)
  })

  it("another company's invoice cannot be the parent", async () => {
    const { status } = await call(await createInvoice(req('POST', { ...base, invoice_type: 'final', parent_invoice_id: 'inv-theirs', full_trip_cost: 100000 })))
    expect(status).toBe(404)
  })
})

describe('GET /api/invoices: overdue is worked out by the server', () => {
  it('?status=overdue returns the sent invoice past its date, not the draft past its date', async () => {
    const { json } = await call(await listInvoices(req('GET', undefined, 'http://localhost/api/invoices?status=overdue')))
    expect(json.map((i: any) => i.id)).toEqual(['inv-late'])
  })

  it('every invoice carries the status the screens show', async () => {
    const { json } = await call(await listInvoices(req('GET', undefined, 'http://localhost/api/invoices')))
    const shown = Object.fromEntries(json.map((i: any) => [i.id, i.display_status]))
    expect(shown).toMatchObject({ 'inv-late': 'overdue', 'inv-draft': 'draft', 'inv-sent': 'sent', 'inv-cancelled': 'cancelled' })
    const one = await call(await getInvoice(req('GET'), params('inv-late')))
    expect(one.json.display_status).toBe('overdue')
  })
})

describe('POST /api/invoices/[id]/payments', () => {
  it('a cancelled or a draft invoice takes no payment, and its status stays', async () => {
    const cancelled = await call(await payInvoice(req('POST', { amount: 100 }), params('inv-cancelled')))
    expect(cancelled.status).toBe(409)
    const draft = await call(await payInvoice(req('POST', { amount: 100 }), params('inv-draft')))
    expect(draft.status).toBe(409)
    const invoices = await rows('invoices')
    expect(invoices.find(i => i.id === 'inv-cancelled').status).toBe('cancelled')
    expect(invoices.find(i => i.id === 'inv-draft').status).toBe('draft')
    expect((await rows('invoice_payments')).length).toBe(1)
  })

  it('a sent invoice takes a payment up to its balance', async () => {
    expect((await payInvoice(req('POST', { amount: 1100 }), params('inv-sent'))).status).toBe(400)
    expect((await payInvoice(req('POST', { amount: 1000 }), params('inv-sent'))).status).toBe(201)
  })

  it('a text amount is refused with a 400, not a 500', async () => {
    expect((await payInvoice(req('POST', { amount: 'abc' }), params('inv-sent'))).status).toBe(400)
    expect((await payInvoice(req('POST', { amount: '' }), params('inv-sent'))).status).toBe(400)
    expect((await payInvoice(req('POST', { amount: '100' }), params('inv-sent'))).status).toBe(201)
  })
})

describe('DELETE /api/invoices/[id]', () => {
  it('an invoice with payments is refused (delete the payments first) and nothing is touched', async () => {
    const { status, json } = await call(await deleteInvoice(req('DELETE'), params('inv-paid')))
    expect(status).toBe(409)
    expect(json.error).toContain('payments')
    expect((await rows('invoices')).some(i => i.id === 'inv-paid')).toBe(true)
    expect((await rows('invoice_payments')).length).toBe(1)
  })

  it('a draft is deleted and the extras it billed are free to be billed again', async () => {
    const { status } = await call(await deleteInvoice(req('DELETE'), params('inv-draft')))
    expect(status).toBe(200)
    expect((await rows('invoices')).some(i => i.id === 'inv-draft')).toBe(false)
    const extras = await rows('booking_extras')
    expect(extras.find(e => e.id === 'x-1')).toMatchObject({ invoiced_at: null, invoice_id: null })
    // another invoice's extras are not touched
    expect(extras.find(e => e.id === 'x-2')).toMatchObject({ invoice_id: 'inv-sent' })
    expect(extras.find(e => e.id === 'x-2').invoiced_at).toBeTruthy()
  })

  it("another company's invoice is not found", async () => {
    expect((await deleteInvoice(req('DELETE'), params('inv-theirs'))).status).toBe(404)
  })
})

describe('PUT /api/invoices/[id]', () => {
  it('paid cannot be set by hand: {status: "paid"} on an unpaid invoice is a 400', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { status: 'paid' }), params('inv-sent')))
    expect(status).toBe(400)
    expect(json.error).toContain('status')
    expect((await rows('invoices')).find(i => i.id === 'inv-sent').status).toBe('sent')
    for (const s of ['partial', 'overdue', 'nonsense']) {
      expect((await editInvoice(req('PUT', { status: s }), params('inv-sent'))).status).toBe(400)
    }
  })

  it('marking as sent still works', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { status: 'sent', sent_at: new Date().toISOString() }), params('inv-draft')))
    expect(status).toBe(200)
    expect(json.status).toBe('sent')
  })

  it('a new total on an invoice that carries VAT is refused (the tax would be stale)', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { total_amount: 5000 }), params('inv-vat')))
    expect(status).toBe(409)
    expect(json.error).toContain('VAT')
    expect((await rows('invoices')).find(i => i.id === 'inv-vat').total_amount).toBe(1140)
  })

  it('a new total without VAT keeps subtotal + tax - discount = total and the balance', async () => {
    const { json } = await call(await editInvoice(req('PUT', { total_amount: 800, discount_amount: 50 }), params('inv-sent')))
    expect(json).toMatchObject({ total_amount: 800, subtotal: 850, balance_due: 800 })
  })

  it('a caller cannot set the subtotal by itself', async () => {
    const { json } = await call(await editInvoice(req('PUT', { subtotal: 1, notes: 'n' }), params('inv-sent')))
    expect(json.subtotal).toBeUndefined()
    expect(json.notes).toBe('n')
  })
})

describe('trip payments: POST and PUT', () => {
  const pay = (extra: Record<string, unknown> = {}) => ({ itinerary_id: 'it-vat', payment_type: 'deposit', amount: 114000, currency: 'JPY', payment_status: 'completed', ...extra })

  it('POST takes only the columns a caller may set', async () => {
    const { json } = await call(await createPayment(req('POST', pay({ id: 'forced-id', org_id: 'org-2', receipt_number: 'FAKE', vat_amount: 1, created_at: '1999-01-01' }))))
    expect(json.success).toBe(true)
    expect(json.data.id).not.toBe('forced-id')
    expect(json.data.org_id).toBe('org-1')
    expect(json.data.receipt_number).toBeUndefined()
    expect(json.data.created_at).toBeUndefined()
  })

  it("POST records the trip's VAT inside the amount on the payment", async () => {
    const { json } = await call(await createPayment(req('POST', pay())))
    // ¥114,000 incl. 14% VAT: ¥14,000 of it is VAT.
    expect(json.data).toMatchObject({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
    const plain = await call(await createPayment(req('POST', pay({ itinerary_id: 'it-jpy' }))))
    expect(plain.json.data).toMatchObject({ vat_applied: false, vat_amount: 0 })
  })

  it('POST still refuses a bad amount, a foreign trip and a different currency', async () => {
    expect((await createPayment(req('POST', pay({ amount: -5 })))).status).toBe(400)
    expect((await createPayment(req('POST', pay({ amount: 'abc' })))).status).toBe(400)
    expect((await createPayment(req('POST', pay({ itinerary_id: 'it-theirs', currency: 'EUR' })))).status).toBe(404)
    expect((await createPayment(req('POST', pay({ currency: 'EUR' })))).status).toBe(400)
  })

  it('PUT refuses a non-positive amount (POST always did)', async () => {
    const created = (await call(await createPayment(req('POST', pay())))).json.data
    for (const amount of [-1, 0, 'abc', null]) {
      const { status } = await call(await editPayment(req('PUT', { amount }), params(created.id)))
      expect(status).toBe(400)
    }
    expect((await rows('payments')).find(p => p.id === created.id).amount).toBe(114000)
  })

  it('PUT cannot change the id, the org, the receipt number or the recorded VAT', async () => {
    const created = (await call(await createPayment(req('POST', pay())))).json.data
    const { json } = await call(await editPayment(req('PUT', { id: 'other', org_id: 'org-2', receipt_number: 'FAKE', vat_amount: 5, created_at: '1999-01-01', notes: 'edited' }), params(created.id)))
    expect(json.data).toMatchObject({ id: created.id, org_id: 'org-1', notes: 'edited', vat_amount: 14000 })
    expect(json.data.receipt_number).toBeUndefined()
    expect(await call(await editPayment(req('PUT', { id: 'other' }), params(created.id)))).toMatchObject({ status: 400 })
  })

  it('PUT with a new amount re-records the VAT inside it, at the rate it was recorded with', async () => {
    const created = (await call(await createPayment(req('POST', pay())))).json.data
    ;(await rows('itineraries')).find(i => i.id === 'it-vat').vat_applied = false // the trip is switched later
    const { json } = await call(await editPayment(req('PUT', { amount: 57000 }), params(created.id)))
    expect(json.data).toMatchObject({ amount: 57000, vat_applied: true, vat_rate: 14, vat_amount: 7000 })
  })

  it("the list never shows another company's trip on a payment", async () => {
    // The mock does not join: the embedded trip is part of the fixture row.
    const theirs = { org_id: 'org-2', itinerary_code: 'THEIRS', client_name: 'Their client', client_phone: '+999', client_email: 't@x', total_cost: 7 }
    const ours = { org_id: 'org-1', itinerary_code: 'OURS', client_name: 'Our client', client_phone: '+1', client_email: 'o@x', total_cost: 9 }
    await (createMockClient().from('payments') as any).insert([
      { id: 'p-legacy', org_id: 'org-1', itinerary_id: 'it-theirs', payment_type: 'deposit', amount: 1, currency: 'EUR', payment_status: 'completed', created_at: '2026-01-01', itineraries: theirs },
      { id: 'p-own', org_id: 'org-1', itinerary_id: 'it-jpy', payment_type: 'deposit', amount: 1, currency: 'JPY', payment_status: 'completed', created_at: '2026-01-02', itineraries: ours },
    ])
    const { json } = await call(await listPayments(req('GET', undefined, 'http://localhost/api/payments')))
    const legacy = json.data.find((p: any) => p.id === 'p-legacy')
    expect(legacy.itineraries).toBeNull()
    expect(legacy.client_name).toBeUndefined()
    expect(JSON.stringify(legacy)).not.toContain('Their client')
    expect(json.data.find((p: any) => p.id === 'p-own')).toMatchObject({ client_name: 'Our client', client_phone: '+1', itinerary_code: 'OURS' })
  })

  it('?itineraryId lists one trip’s payments', async () => {
    await (createMockClient().from('payments') as any).insert([
      { id: 'p-1', org_id: 'org-1', itinerary_id: 'it-jpy', payment_type: 'deposit', amount: 1, currency: 'JPY', payment_status: 'completed', created_at: '2026-01-01' },
      { id: 'p-2', org_id: 'org-1', itinerary_id: 'it-vat', payment_type: 'deposit', amount: 2, currency: 'JPY', payment_status: 'completed', created_at: '2026-01-02' },
    ])
    const { json } = await call(await listPayments(req('GET', undefined, 'http://localhost/api/payments?itineraryId=it-jpy')))
    expect(json.data.map((p: any) => p.id)).toEqual(['p-1'])
  })
})
