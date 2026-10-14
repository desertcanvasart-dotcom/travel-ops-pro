// "Move to invoice": a legacy trip payment on a trip that now has a live
// invoice becomes a payment on that invoice, then the trip row is deleted.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, resetDb, tables } from './_finance-fake-db'
import { planMoveToInvoice } from '@/lib/payments/move-to-invoice'

let ROLE: string | null = 'manager'
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'o1',
  noOrgResponse: () => new Response(null, { status: 403 }),
  requireRole: async (allowed: string[]) =>
    ROLE === 'owner' || (ROLE && allowed.includes(ROLE)) ? null : new Response(JSON.stringify({ success: false }), { status: 403 }),
}))
vi.mock('@/lib/accounting', () => ({ syncInvoicePayment: async () => undefined }))

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'p1', org_id: 'o1', itinerary_id: 't1', amount: 300, currency: 'EUR', payment_method: 'cash',
  payment_date: '2026-06-01', transaction_reference: 'REF-1', notes: 'deposit', payment_type: 'deposit', payment_status: 'completed', ...over,
})
const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'i1', org_id: 'o1', itinerary_id: 't1', invoice_number: 'INV-2026-001', status: 'sent', currency: 'EUR', balance_due: 1000, ...over,
})

describe('planMoveToInvoice', () => {
  it('copies amount, currency, date, method, reference and notes onto the invoice payment', () => {
    const plan = planMoveToInvoice(payment(), [invoice()])
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.invoicePayment).toMatchObject({
      invoice_id: 'i1', amount: 300, currency: 'EUR', payment_method: 'cash',
      payment_date: '2026-06-01', transaction_reference: 'REF-1', notes: 'deposit',
    })
  })
  it('refuses when it would exceed the balance, allowing the 0.01 rounding the invoice route allows', () => {
    expect(planMoveToInvoice(payment({ amount: 1000.01 }), [invoice()]).ok).toBe(true)
    const over = planMoveToInvoice(payment({ amount: 1000.5 }), [invoice()])
    expect(over).toMatchObject({ ok: false, status: 400 })
  })
  it('refuses with no live invoice, with several, with a draft, and in another currency', () => {
    expect(planMoveToInvoice(payment(), [])).toMatchObject({ ok: false, status: 409 })
    expect(planMoveToInvoice(payment(), [invoice(), invoice({ id: 'i2', invoice_number: 'INV-2026-002' })])).toMatchObject({ ok: false, status: 409 })
    expect(planMoveToInvoice(payment(), [invoice({ status: 'draft' })])).toMatchObject({ ok: false, status: 409 })
    expect(planMoveToInvoice(payment({ currency: 'USD' }), [invoice()])).toMatchObject({ ok: false, status: 400 })
  })
  it('refuses a refund or a payment that was not completed', () => {
    expect(planMoveToInvoice(payment({ payment_type: 'refund' }), [invoice()]).ok).toBe(false)
    expect(planMoveToInvoice(payment({ payment_status: 'pending' }), [invoice()]).ok).toBe(false)
  })
})

describe('POST /api/payments/[id]/move-to-invoice', () => {
  beforeEach(() => { ROLE = 'manager'; resetDb({ payments: [payment()], invoices: [invoice()], invoice_payments: [] }) })
  const post = async (id = 'p1') => {
    const { POST } = await import('@/app/api/payments/[id]/move-to-invoice/route')
    return POST(new NextRequest('http://x/api', { method: 'POST' }), { params: Promise.resolve({ id }) } as never)
  }

  it('creates the invoice payment and deletes the trip row', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(tables.invoice_payments).toHaveLength(1)
    expect(tables.invoice_payments[0]).toMatchObject({ invoice_id: 'i1', amount: 300, payment_method: 'cash', transaction_reference: 'REF-1' })
    expect(tables.payments).toHaveLength(0)
  })

  it('an agent may; a viewer may not; the owner always may', async () => {
    ROLE = 'viewer'
    expect((await post()).status).toBe(403)
    expect(tables.payments).toHaveLength(1)
    ROLE = 'agent'
    expect((await post()).status).toBe(200)
    resetDb({ payments: [payment()], invoices: [invoice()], invoice_payments: [] })
    ROLE = 'owner'
    expect((await post()).status).toBe(200)
  })

  it('over the balance: refused, nothing inserted, trip row kept', async () => {
    tables.invoices[0].balance_due = 100
    const res = await post()
    expect(res.status).toBe(400)
    expect(tables.invoice_payments).toHaveLength(0)
    expect(tables.payments).toHaveLength(1)
  })

  it('a trip with no live invoice is refused (a cancelled invoice does not count)', async () => {
    tables.invoices[0].status = 'cancelled'
    expect((await post()).status).toBe(409)
    expect(tables.payments).toHaveLength(1)
  })

  it('another company\'s payment is not found', async () => {
    tables.payments[0].org_id = 'o2'
    expect((await post()).status).toBe(404)
  })

  it('if the delete fails after the insert, says so clearly and keeps the invoice payment', async () => {
    const realFrom = fakeClient.from
    ;(fakeClient as any).from = (t: string) => {
      const b = realFrom(t)
      if (t === 'payments') {
        b.delete = () => { const c: any = { eq: () => c, then: (r: any) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(r) }; return c }
      }
      return b
    }
    try {
      const res = await post()
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.moved).toBe(true)
      expect(body.error).toMatch(/recorded on INV-2026-001, but the original trip payment could not be deleted/)
      expect(tables.invoice_payments).toHaveLength(1)
    } finally {
      ;(fakeClient as any).from = realFrom
    }
  })
})
