// Finance (customer side), second round: the routes, on the in-memory Supabase
// mock. Pins
//   1. the invoice amount is the SERVER's (the saved trip's selling price,
//      lines + season supplement), not the browser's; a deposit, a final and a
//      full invoice are worked out from it; a different amount is a manual
//      override for an admin or manager, recorded with its reason;
//   2. one ledger per trip: POST /api/payments is refused once the trip has a
//      non-cancelled invoice;
//   3. cancelling an invoice releases its extras and is refused while money is
//      recorded against it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const session = vi.hoisted(() => ({ role: 'manager' as string | null }))

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
  getCurrentUserRole: async () => session.role,
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/accounting', () => ({ syncInvoice: async () => undefined, syncInvoicePayment: async () => undefined }))
vi.mock('@/lib/document-numbering', () => {
  let n = 0
  return {
    nextDocumentNumber: async () => `INV-2026-${String(++n).padStart(3, '0')}`,
    insertWithUniqueRetry: async ({ generateRow, insert }: { generateRow: () => Promise<unknown>; insert: (r: unknown) => Promise<unknown> }) => insert(await generateRow()),
  }
})

import { POST as createInvoice } from '@/app/api/invoices/route'
import { GET as invoiceAmounts } from '@/app/api/invoices/amounts/route'
import { PUT as editInvoice } from '@/app/api/invoices/[id]/route'
import { POST as createPayment } from '@/app/api/payments/route'
import { PUT as editPayment } from '@/app/api/payments/[id]/route'

const req = (method: string, body?: unknown, url = 'http://localhost/api/x') =>
  new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const call = async (res: Response) => ({ status: res.status, json: await res.json() })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const params = (id: string) => ({ params: Promise.resolve({ id }) })

// Lines: 400,000 + 300,000 + (200,000 cost, no client price = +25% = 250,000)
// = 950,000, plus a 50,000 season supplement = 1,000,000. The stored total_cost
// (999) is stale on purpose: the lines are the truth, as on the itinerary page.
const lines = (day: string) => [
  { itinerary_day_id: day, total_cost: 300000, client_price: 400000 },
  { itinerary_day_id: day, total_cost: 200000, client_price: 300000 },
  { itinerary_day_id: day, total_cost: 200000, client_price: null },
]
const TRIP = 1_000_000

const body = (extra: Record<string, unknown> = {}) => ({
  client_name: 'C', client_id: 'cl-1', itinerary_id: 'it-a', currency: 'JPY',
  // What an old or hostile browser might send: ignored for a trip.
  total_amount: 1, full_trip_cost: 5,
  line_items: [{ description: 'Trip', quantity: 1, unit_price: 1, amount: 1 }],
  ...extra,
})

beforeEach(() => {
  session.role = 'manager'
  setMockTables({
    organizations: [{ id: 'org-1', default_currency: 'JPY', rate_currency: 'JPY', vat_rate: 14 }],
    clients: [{ id: 'cl-1', org_id: 'org-1' }],
    itineraries: [
      { id: 'it-a', org_id: 'org-1', currency: 'JPY', total_cost: 999, season_uplift_amount: 50000, vat_applied: false },
      { id: 'it-c', org_id: 'org-1', currency: 'JPY', total_cost: 999, season_uplift_amount: 50000, vat_applied: false },
      { id: 'it-vat', org_id: 'org-1', currency: 'JPY', total_cost: 100000, vat_applied: true, vat_rate: 14 },
      { id: 'it-nolines', org_id: 'org-1', currency: 'JPY', total_cost: 80000, vat_applied: false },
      { id: 'it-empty', org_id: 'org-1', currency: 'JPY', total_cost: 0, vat_applied: false },
      { id: 'it-plain', org_id: 'org-1', currency: 'JPY', total_cost: 50000, vat_applied: false },
      { id: 'it-cancelled', org_id: 'org-1', currency: 'JPY', total_cost: 50000, vat_applied: false },
    ],
    itinerary_days: [
      { id: 'd-a', itinerary_id: 'it-a' },
      { id: 'd-c', itinerary_id: 'it-c' },
    ],
    itinerary_services: [...lines('d-a'), ...lines('d-c')],
    invoices: [
      { id: 'inv-dep-a', org_id: 'org-1', invoice_number: 'INV-1-DEP', status: 'sent', invoice_type: 'deposit', itinerary_id: 'it-a', deposit_percent: 20, total_amount: 200000, tax_amount: 0, amount_paid: 0, balance_due: 200000, currency: 'JPY' },
      // A deposit raised before trips were linked: no trip, but it stored its trip cost.
      { id: 'inv-dep-old', org_id: 'org-1', invoice_number: 'INV-2-DEP', status: 'sent', invoice_type: 'deposit', itinerary_id: null, deposit_percent: 20, full_trip_cost: 500000, total_amount: 100000, tax_amount: 0, amount_paid: 0, balance_due: 100000, currency: 'JPY' },
      { id: 'inv-live', org_id: 'org-1', invoice_number: 'INV-3', status: 'sent', itinerary_id: 'it-vat', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY' },
      { id: 'inv-gone', org_id: 'org-1', invoice_number: 'INV-4', status: 'cancelled', itinerary_id: 'it-cancelled', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY' },
      { id: 'inv-unpaid', org_id: 'org-1', invoice_number: 'INV-5', status: 'sent', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY' },
      { id: 'inv-paid', org_id: 'org-1', invoice_number: 'INV-6', status: 'partial', total_amount: 1000, amount_paid: 400, balance_due: 600, currency: 'JPY' },
      { id: 'inv-cx', org_id: 'org-1', invoice_number: 'INV-7', status: 'cancelled', total_amount: 1000, amount_paid: 0, balance_due: 1000, currency: 'JPY' },
    ],
    invoice_payments: [{ id: 'ip-1', invoice_id: 'inv-paid', amount: 400 }],
    booking_extras: [
      { id: 'x-1', org_id: 'org-1', invoice_id: 'inv-unpaid', invoiced_at: '2026-10-01T00:00:00Z', status: 'confirmed' },
      { id: 'x-2', org_id: 'org-1', invoice_id: 'inv-live', invoiced_at: '2026-10-01T00:00:00Z', status: 'confirmed' },
    ],
    payments: [],
  })
})

describe('POST /api/invoices: the amount is the server\'s', () => {
  it('a full invoice bills the saved trip total (lines + season supplement), not the browser total', async () => {
    const { status, json } = await call(await createInvoice(req('POST', body())))
    expect(status).toBe(201)
    expect(json).toMatchObject({ total_amount: TRIP, subtotal: TRIP, balance_due: TRIP, amount_source: 'trip', computed_amount: TRIP })
    expect(json.override_amount ?? null).toBeNull()
    // The lines the browser sent did not add up to it, so one line says what is billed.
    expect(json.line_items).toHaveLength(1)
    expect(json.line_items[0]).toMatchObject({ amount: TRIP })
  })

  it('the caller\'s own lines are kept when they add up to the server total', async () => {
    const mine = [
      { description: 'Trip', quantity: 1, unit_price: 950000, amount: 950000 },
      { description: 'Season supplement', quantity: 1, unit_price: 50000, amount: 50000 },
    ]
    const { json } = await call(await createInvoice(req('POST', body({ line_items: mine }))))
    expect(json.line_items).toEqual(mine)
  })

  it('a trip with no priced lines bills its stored total', async () => {
    const { json } = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-nolines' }))))
    expect(json.total_amount).toBe(80000)
  })

  it('VAT is still worked out by the server on the server\'s net', async () => {
    const { json } = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-vat', vat_applied: true }))))
    expect(json).toMatchObject({ subtotal: 100000, tax_amount: 14000, total_amount: 114000, vat_applied: true })
  })

  it('a deposit is its percent of the server total; the browser full_trip_cost is ignored', async () => {
    const { json } = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-c', invoice_type: 'deposit', deposit_percent: 20 }))))
    expect(json).toMatchObject({ invoice_type: 'deposit', total_amount: 200000, full_trip_cost: TRIP, computed_amount: 200000, amount_source: 'trip' })
  })

  it('a final is the server total less the deposit invoice\'s net, even with itinerary_id left out', async () => {
    const { itinerary_id: _it, ...noTrip } = body({ invoice_type: 'final', parent_invoice_id: 'inv-dep-a', deposit_percent: 20 })
    void _it
    const { status, json } = await call(await createInvoice(req('POST', noTrip)))
    expect(status).toBe(201)
    expect(json).toMatchObject({ invoice_type: 'final', itinerary_id: 'it-a', total_amount: 800000, full_trip_cost: TRIP, amount_source: 'trip' })
  })

  it('a final repriced trip: the balance follows the saved trip, not the old deposit percent', async () => {
    ;(await rows('invoices')).find(i => i.id === 'inv-dep-a').total_amount = 150000
    const { json } = await call(await createInvoice(req('POST', body({ invoice_type: 'final', parent_invoice_id: 'inv-dep-a' }))))
    expect(json.total_amount).toBe(850000)
  })

  it('a final whose deposit has no trip uses the trip cost that deposit stored', async () => {
    session.role = 'agent'
    const { itinerary_id: _it, ...noTrip } = body({ invoice_type: 'final', parent_invoice_id: 'inv-dep-old', full_trip_cost: 999999 })
    void _it
    const { status, json } = await call(await createInvoice(req('POST', noTrip)))
    expect(status).toBe(201)
    expect(json).toMatchObject({ total_amount: 400000, full_trip_cost: 500000, amount_source: 'parent' })
  })

  it('a trip with no price is refused (a manager can enter one by hand)', async () => {
    const refused = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-empty' }))))
    expect(refused.status).toBe(400)
    expect(refused.json.error).toContain('no price')
    const manual = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-empty', manual_override: { amount: 70000, reason: 'Agreed by phone' } }))))
    expect(manual.status).toBe(201)
    expect(manual.json).toMatchObject({ total_amount: 70000, amount_source: 'manual_override' })
  })

  it('an invoice in another currency than the trip is refused', async () => {
    const { status, json } = await call(await createInvoice(req('POST', body({ currency: 'EUR' }))))
    expect(status).toBe(400)
    expect(json.error).toContain('JPY')
  })

  it('a discount on a trip invoice is a different amount: refused without an override', async () => {
    const { status, json } = await call(await createInvoice(req('POST', body({ discount_amount: 50000 }))))
    expect(status).toBe(400)
    expect(json.error).toContain('discount')
  })
})

describe('POST /api/invoices: manual override', () => {
  const override = (amount: number, reason = 'Repeat client discount') => ({ manual_override: { amount, reason } })

  it('an admin or manager can bill another amount; the invoice records it and why', async () => {
    for (const role of ['manager', 'admin', 'owner']) {
      session.role = role
      const { status, json } = await call(await createInvoice(req('POST', body(override(900000)))))
      expect(status).toBe(201)
      expect(json).toMatchObject({
        total_amount: 900000, amount_source: 'manual_override', computed_amount: TRIP,
        override_amount: 900000, override_reason: 'Repeat client discount', override_by: 'user-1',
      })
    }
  })

  it('an agent cannot override, and nothing is saved', async () => {
    session.role = 'agent'
    const before = (await rows('invoices')).length
    const { status, json } = await call(await createInvoice(req('POST', body(override(900000)))))
    expect(status).toBe(403)
    expect(json.error).toContain('admin or manager')
    expect((await rows('invoices')).length).toBe(before)
  })

  it('an agent still raises the invoice at the server\'s amount', async () => {
    session.role = 'agent'
    const { status, json } = await call(await createInvoice(req('POST', body())))
    expect(status).toBe(201)
    expect(json.total_amount).toBe(TRIP)
  })

  it('an override needs a reason and a sane amount', async () => {
    for (const manual_override of [{ amount: 900000 }, { amount: 900000, reason: '   ' }, { amount: -1, reason: 'x' }, { amount: 'abc', reason: 'x' }, 'yes']) {
      const { status } = await call(await createInvoice(req('POST', body({ manual_override }))))
      expect(status, JSON.stringify(manual_override)).toBe(400)
    }
  })

  it('an override equal to the server amount is not an override', async () => {
    const { json } = await call(await createInvoice(req('POST', body(override(TRIP)))))
    expect(json).toMatchObject({ total_amount: TRIP, amount_source: 'trip' })
    expect(json.override_amount ?? null).toBeNull()
  })

  it('a discounted amount is billed as an override, with the discount printed', async () => {
    const { json } = await call(await createInvoice(req('POST', body({ ...override(950000), discount_amount: 50000 }))))
    expect(json).toMatchObject({ total_amount: 950000, subtotal: 1000000, discount_amount: 50000, amount_source: 'manual_override' })
  })

  it('a deposit override replaces the deposit; the final then settles what is left', async () => {
    const dep = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-c', invoice_type: 'deposit', deposit_percent: 20, ...override(300000, 'Client asked to pay more up front') }))))
    expect(dep.json).toMatchObject({ total_amount: 300000, computed_amount: 200000, full_trip_cost: TRIP, amount_source: 'manual_override' })
    const fin = await call(await createInvoice(req('POST', body({ itinerary_id: 'it-c', invoice_type: 'final', parent_invoice_id: dep.json.id }))))
    expect(fin.json).toMatchObject({ total_amount: 700000, amount_source: 'trip' })
  })
})

describe('POST /api/invoices: an invoice with nothing to work out from', () => {
  const free = () => { const { itinerary_id: _it, ...rest } = body({ total_amount: 12345 }); void _it; return rest }

  it('is typed by an admin or manager and recorded as a manual entry', async () => {
    const { status, json } = await call(await createInvoice(req('POST', free())))
    expect(status).toBe(201)
    expect(json).toMatchObject({ total_amount: 12345, amount_source: 'manual_entry' })
    expect(json.computed_amount ?? null).toBeNull()
  })

  it('is refused for an agent', async () => {
    session.role = 'agent'
    const { status, json } = await call(await createInvoice(req('POST', free())))
    expect(status).toBe(403)
    expect(json.error).toContain('not linked to a trip')
  })
})

describe('GET /api/invoices/amounts', () => {
  const get = (q: string) => invoiceAmounts(req('GET', undefined, `http://localhost/api/invoices/amounts?${q}`) as NextRequest)

  it('answers with the figures POST /api/invoices will bill', async () => {
    const { json } = await call(await get('itineraryId=it-a&type=deposit&percent=20'))
    expect(json).toMatchObject({ currency: 'JPY', trip_total: TRIP, amount: 200000, deposit_amount: 200000, balance_amount: 800000, can_override: true })
    expect((await call(await get('itineraryId=it-a&type=standard'))).json.amount).toBe(TRIP)
    expect((await call(await get('itineraryId=it-a&type=final&percent=20&parentId=inv-dep-a'))).json.amount).toBe(800000)
  })

  it('tells an agent they cannot override', async () => {
    session.role = 'agent'
    expect((await call(await get('itineraryId=it-a'))).json.can_override).toBe(false)
  })

  it('refuses a missing or foreign trip and a bad percent', async () => {
    expect((await get('type=deposit')).status).toBe(400)
    expect((await get('itineraryId=nope')).status).toBe(404)
    expect((await get('itineraryId=it-a&percent=0')).status).toBe(400)
  })
})

describe('PUT /api/invoices/[id]: cancelling', () => {
  it('releases the extras the invoice billed, exactly as delete does', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { status: 'cancelled' }), params('inv-unpaid')))
    expect(status).toBe(200)
    expect(json.status).toBe('cancelled')
    const extras = await rows('booking_extras')
    expect(extras.find(e => e.id === 'x-1')).toMatchObject({ invoiced_at: null, invoice_id: null })
    // another invoice's extras are not touched
    expect(extras.find(e => e.id === 'x-2')).toMatchObject({ invoice_id: 'inv-live' })
    expect(extras.find(e => e.id === 'x-2').invoiced_at).toBeTruthy()
  })

  it('is refused while payments are recorded, and says what to do; nothing changes', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { status: 'cancelled' }), params('inv-paid')))
    expect(status).toBe(409)
    expect(json.error).toContain('payment')
    expect(json.error).toContain('refunded')
    expect((await rows('invoices')).find(i => i.id === 'inv-paid').status).toBe('partial')
  })

  it('is allowed once the payments were refunded (deleted from the invoice)', async () => {
    // The payment was handed back and its record deleted from the invoice.
    ;(await rows('invoice_payments')).forEach(p => { p.invoice_id = 'deleted' })
    const invoice = (await rows('invoices')).find(i => i.id === 'inv-paid')
    invoice.amount_paid = 0
    invoice.balance_due = 1000
    expect((await editInvoice(req('PUT', { status: 'cancelled' }), params('inv-paid'))).status).toBe(200)
  })

  it('a cancelled invoice cannot be reopened (its extras may be on another invoice)', async () => {
    const { status, json } = await call(await editInvoice(req('PUT', { status: 'sent' }), params('inv-cx')))
    expect(status).toBe(409)
    expect(json.error).toContain('new invoice')
    // setting it cancelled again is harmless
    expect((await editInvoice(req('PUT', { status: 'cancelled' }), params('inv-cx'))).status).toBe(200)
  })

  it('an update that does not touch the status does not release anything', async () => {
    await editInvoice(req('PUT', { notes: 'n' }), params('inv-unpaid'))
    expect((await rows('booking_extras')).find(e => e.id === 'x-1').invoice_id).toBe('inv-unpaid')
  })
})

describe('trip payments once the trip has an invoice', () => {
  const pay = (extra: Record<string, unknown> = {}) => ({ itinerary_id: 'it-vat', payment_type: 'deposit', amount: 5000, currency: 'JPY', payment_status: 'completed', ...extra })

  it('POST /api/payments is refused and points to the invoice', async () => {
    const { status, json } = await call(await createPayment(req('POST', pay())))
    expect(status).toBe(409)
    expect(json.success).toBe(false)
    expect(json.error).toContain('INV-3')
    expect(json.error).toContain('Record the payment against the invoice')
    expect((await rows('payments')).length).toBe(0)
  })

  it('a trip whose only invoice is cancelled, and a trip with none, still take trip payments', async () => {
    expect((await createPayment(req('POST', pay({ itinerary_id: 'it-cancelled' })))).status).toBe(200)
    expect((await createPayment(req('POST', pay({ itinerary_id: 'it-plain' })))).status).toBe(200)
  })

  it('an invoice that is still a draft already counts: the money goes there', async () => {
    ;(await rows('invoices')).find(i => i.id === 'inv-live').status = 'draft'
    expect((await createPayment(req('POST', pay()))).status).toBe(409)
  })

  it('PUT cannot move a payment onto a trip with an invoice, but can correct one already there', async () => {
    const onPlain = (await call(await createPayment(req('POST', pay({ itinerary_id: 'it-plain' }))))).json.data
    const moved = await call(await editPayment(req('PUT', { itinerary_id: 'it-vat' }), params(onPlain.id)))
    expect(moved.status).toBe(409)
    expect((await rows('payments')).find(p => p.id === onPlain.id).itinerary_id).toBe('it-plain')

    // A legacy payment already on the invoiced trip: editing it is allowed.
    ;(await rows('payments')).find(p => p.id === onPlain.id).itinerary_id = 'it-vat'
    const fixed = await call(await editPayment(req('PUT', { notes: 'fixed' }), params(onPlain.id)))
    expect(fixed.status).toBe(200)
  })
})
