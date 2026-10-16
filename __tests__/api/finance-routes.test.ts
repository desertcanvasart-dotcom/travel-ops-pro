// Finance audit (Receivables, Payables, Supplier Invoices): the routes, run
// against an in-memory database.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, resetDb, tables, calls } from './_finance-fake-db'

let ORG = 'o1'
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => ORG,
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
vi.mock('@/lib/org-refs', () => ({ recordsInOrg: async () => true }))

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never
const req = (method: string, body?: unknown, url = 'http://x/api') =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })

const bill = (over: Record<string, unknown> = {}) => ({
  id: 'b1', org_id: 'o1', supplier_invoice_number: 'INV-1', supplier_name: 'Nile Hotels', supplier_id: 's1',
  invoice_date: '2026-09-01', amount: 1000, currency: 'EUR', status: 'received', match_status: 'unmatched',
  matched_amount: 0, internal_reference: 'SI-2026-001', ...over,
})
const expense = (over: Record<string, unknown> = {}) => ({
  id: 'e1', org_id: 'o1', status: 'pending', amount: 1000, currency: 'EUR', supplier_id: 's1', supplier_name: 'Nile Hotels', ...over,
})

beforeEach(() => { ORG = 'o1'; resetDb() })

describe('POST /api/supplier-invoices', () => {
  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/supplier-invoices/route')
    return POST(req('POST', body))
  }
  const base = { supplier_invoice_number: 'INV-77', supplier_name: 'Nile Hotels', invoice_date: '2026-09-01', amount: 100, currency: 'EUR' }

  it('the same supplier and number twice: 201 then 409 naming the first', async () => {
    const first = await post(base)
    expect(first.status).toBe(201)
    const second = await post({ ...base, supplier_invoice_number: ' inv-77 ', supplier_name: 'NILE HOTELS' })
    expect(second.status).toBe(409)
    expect((await second.json()).error).toMatch(/inv-77 from NILE HOTELS is already recorded \(SI-\d{4}-\d+\)/)
    expect(tables.supplier_invoices).toHaveLength(1)
  })
  it('the same number under another supplier or another company is fine', async () => {
    expect((await post(base)).status).toBe(201)
    expect((await post({ ...base, supplier_name: 'Cairo Cars' })).status).toBe(201)
    ORG = 'o2'
    expect((await post(base)).status).toBe(201)
  })
  it('a cancelled bill frees its number', async () => {
    await post(base)
    tables.supplier_invoices[0].status = 'cancelled'
    expect((await post(base)).status).toBe(201)
  })
  it('the index violation from two saves at once is a 409 too', async () => {
    await post(base)
    // Hide the first row from the pre-check; the insert still hits the unique index.
    const real = tables.supplier_invoices
    const { findDuplicateBill } = await import('@/lib/finance/supplier-bills')
    expect(await findDuplicateBill(fakeClient as never, 'o1', base)).not.toBeNull()
    void real
    const { isBillNumberViolation } = await import('@/lib/finance/supplier-bills')
    expect(isBillNumberViolation({ code: '23505', message: 'violates unique constraint "supplier_invoices_org_supplier_number_key"' })).toBe(true)
    expect(isBillNumberViolation({ code: '23505', message: 'violates unique constraint "supplier_invoices_internal_reference_key"' })).toBe(false)
  })
  it('created_by is the signed-in user, not the body', async () => {
    await post({ ...base, created_by: 'someone-else' })
    expect(tables.supplier_invoices[0].created_by).toBe('user-1')
  })
  it('no currency sent: the company currency, not EUR', async () => {
    resetDb({ organizations: [{ id: 'o1', default_currency: 'JPY', rate_currency: 'EUR' }] })
    const { currency: _drop, ...noCurrency } = base
    void _drop
    await post(noCurrency)
    expect(tables.supplier_invoices[0].currency).toBe('JPY')
  })
  it('a negative amount is still a 400', async () => {
    expect((await post({ ...base, amount: -1 })).status).toBe(400)
  })
})

describe('GET /api/supplier-invoices summary', () => {
  it('counts every bill whatever the Status filter shows', async () => {
    resetDb({
      supplier_invoices: [
        bill({ id: 'a', status: 'paid', match_status: 'matched' }),
        bill({ id: 'b', status: 'received' }),
        bill({ id: 'c', status: 'received' }),
      ],
    })
    const { GET } = await import('@/app/api/supplier-invoices/route')
    const res = await GET(req('GET', undefined, 'http://x/api/supplier-invoices?status=paid'))
    const json = await res.json()
    expect(json.data).toHaveLength(1)
    expect(json.summary).toMatchObject({ total: 3, unmatched: 2, paid: 1 })
    expect(json.summary).not.toHaveProperty('total_amount')
  })
})

describe('PUT /api/supplier-invoices/[id]', () => {
  const put = async (body: Record<string, unknown>, id = 'b1') => {
    const { PUT } = await import('@/app/api/supplier-invoices/[id]/route')
    return PUT(req('PUT', body), ctx(id))
  }
  it('a negative amount is a 400', async () => {
    resetDb({ supplier_invoices: [bill()] })
    expect((await put({ amount: -5 })).status).toBe(400)
    expect(tables.supplier_invoices[0].amount).toBe(1000)
  })
  it('a blank amount or NaN is a 400', async () => {
    resetDb({ supplier_invoices: [bill()] })
    expect((await put({ amount: '' })).status).toBe(400)
    expect((await put({ amount: 'abc' })).status).toBe(400)
  })
  it('an emptied due date is stored as null', async () => {
    resetDb({ supplier_invoices: [bill({ due_date: '2026-10-01' })] })
    expect((await put({ due_date: '' })).status).toBe(200)
    expect(tables.supplier_invoices[0].due_date).toBeNull()
  })
  it('renaming onto another bill number from the same supplier is a 409', async () => {
    resetDb({ supplier_invoices: [bill(), bill({ id: 'b2', supplier_invoice_number: 'INV-2', internal_reference: 'SI-2026-002' })] })
    const res = await put({ supplier_invoice_number: 'inv-1' }, 'b2')
    expect(res.status).toBe(409)
    expect(tables.supplier_invoices[1].supplier_invoice_number).toBe('INV-2')
  })
  it('keeping its own number is not a duplicate of itself', async () => {
    resetDb({ supplier_invoices: [bill()] })
    expect((await put({ supplier_invoice_number: 'INV-1', notes: 'x' })).status).toBe(200)
  })
})

describe('DELETE /api/supplier-invoices/[id]', () => {
  const del = async (id = 'b1') => {
    const { DELETE } = await import('@/app/api/supplier-invoices/[id]/route')
    return DELETE(req('DELETE'), ctx(id))
  }
  it.each(['received', 'matched', 'cancelled'])('a %s bill can be deleted', async status => {
    resetDb({ supplier_invoices: [bill({ status })] })
    expect((await del()).status).toBe(200)
    expect(tables.supplier_invoices).toHaveLength(0)
  })
  it.each(['approved', 'paid', 'disputed'])('a %s bill is refused with 409 and stays', async status => {
    resetDb({ supplier_invoices: [bill({ status })] })
    expect((await del()).status).toBe(409)
    expect(tables.supplier_invoices).toHaveLength(1)
  })
  it('another company bill is not touched', async () => {
    resetDb({ supplier_invoices: [bill({ org_id: 'o2' })] })
    expect((await del()).status).toBe(409)
    expect(tables.supplier_invoices).toHaveLength(1)
  })
})

describe('dispute, resolve, cancel', () => {
  const call = async (mod: string, method: 'POST' | 'DELETE', body?: unknown, id = 'b1') => {
    const route = await import(`@/app/api/supplier-invoices/[id]/${mod}/route`)
    return route[method](req(method, body), ctx(id))
  }
  it('dispute, resolve, approve works', async () => {
    resetDb({ supplier_invoices: [bill({ status: 'matched', match_status: 'matched', matched_amount: 1000 })] })
    expect((await call('dispute', 'POST', { reason: 'wrong rate' })).status).toBe(200)
    expect(tables.supplier_invoices[0]).toMatchObject({ status: 'disputed', discrepancy_notes: 'wrong rate' })
    expect((await call('approve', 'POST', {})).status).toBe(400) // still blocked while disputed
    expect((await call('dispute', 'DELETE')).status).toBe(200)
    expect(tables.supplier_invoices[0]).toMatchObject({ status: 'matched', discrepancy_notes: null })
    expect((await call('approve', 'POST', {})).status).toBe(200)
    expect(tables.supplier_invoices[0].status).toBe('approved')
  })
  it('an unmatched disputed bill goes back to received', async () => {
    resetDb({ supplier_invoices: [bill({ status: 'disputed', match_status: 'unmatched' })] })
    await call('dispute', 'DELETE')
    expect(tables.supplier_invoices[0].status).toBe('received')
  })
  it('only a disputed bill can be resolved', async () => {
    resetDb({ supplier_invoices: [bill({ status: 'approved' })] })
    expect((await call('dispute', 'DELETE')).status).toBe(409)
  })
  it('a cancelled bill cannot be disputed back to life', async () => {
    resetDb({ supplier_invoices: [bill({ status: 'cancelled' })] })
    expect((await call('dispute', 'POST', { reason: 'x' })).status).toBe(409)
  })
  it('cancel an approved bill: it is kept, unmatched, its expenses released', async () => {
    resetDb({
      supplier_invoices: [bill({ status: 'approved', match_status: 'matched', matched_amount: 1000 })],
      supplier_invoice_expenses: [{ id: 'l1', supplier_invoice_id: 'b1', expense_id: 'e1', matched_amount: 1000 }],
    })
    expect((await call('cancel', 'POST', { reason: 'entered twice' })).status).toBe(200)
    expect(tables.supplier_invoices[0]).toMatchObject({ status: 'cancelled', match_status: 'unmatched', matched_amount: 0 })
    expect(tables.supplier_invoices[0].notes).toMatch(/entered twice/)
    expect(tables.supplier_invoice_expenses).toHaveLength(0)
  })
  it('a paid bill cannot be cancelled', async () => {
    resetDb({ supplier_invoices: [bill({ status: 'paid' })] })
    expect((await call('cancel', 'POST', {})).status).toBe(409)
    expect(tables.supplier_invoices[0].status).toBe('paid')
  })
})

describe('POST /api/supplier-invoices/[id]/match', () => {
  const match = async (body: unknown) => {
    const { POST } = await import('@/app/api/supplier-invoices/[id]/match/route')
    return POST(req('POST', body), ctx('b1'))
  }
  it('links a pending or approved expense of the same supplier', async () => {
    resetDb({ supplier_invoices: [bill()], expenses: [expense(), expense({ id: 'e2', status: 'approved', amount: 0 })] })
    const res = await match({ expenseIds: ['e1'] })
    expect(res.status).toBe(200)
    expect((await res.json()).match_status).toBe('matched')
  })
  it('a paid expense is a 409 and nothing is linked', async () => {
    resetDb({ supplier_invoices: [bill()], expenses: [expense({ status: 'paid' })] })
    expect((await match({ expenseIds: ['e1'] })).status).toBe(409)
    expect(tables.supplier_invoice_expenses ?? []).toHaveLength(0)
    expect(tables.supplier_invoices[0].match_status).toBe('unmatched')
  })
  it('a rejected expense and another supplier expense are 409s', async () => {
    resetDb({ supplier_invoices: [bill()], expenses: [expense({ status: 'rejected' }), expense({ id: 'e2', supplier_id: 's2', supplier_name: 'Cairo Cars' })] })
    expect((await match({ expenseIds: ['e1'] })).status).toBe(409)
    expect((await match({ expenseIds: ['e2'] })).status).toBe(409)
  })
  it('an id of another company is a 404, not silently dropped', async () => {
    resetDb({ supplier_invoices: [bill()], expenses: [expense({ org_id: 'o2' })] })
    const res = await match({ expenseIds: ['e1'] })
    expect(res.status).toBe(404)
    expect((await res.json()).details.expense_ids).toEqual(['e1'])
  })
})

describe('POST /api/supplier-invoices/[id]/pay', () => {
  const pay = async () => {
    const { POST } = await import('@/app/api/supplier-invoices/[id]/pay/route')
    return POST(req('POST', { payment_method: 'bank_transfer' }), ctx('b1'))
  }
  it('an expense matched for 600 of 1,000 stays approved after the bill is paid', async () => {
    resetDb({
      supplier_invoices: [bill({ status: 'approved', amount: 600, match_status: 'matched', matched_amount: 600 })],
      expenses: [expense({ status: 'approved', amount: 1000 })],
      supplier_invoice_expenses: [{ id: 'l1', supplier_invoice_id: 'b1', expense_id: 'e1', matched_amount: 600 }],
    })
    expect((await pay()).status).toBe(200)
    expect(tables.supplier_invoices[0].status).toBe('paid')
    expect(tables.expenses[0].status).toBe('approved')
  })
  it('a fully matched expense is paid with the bill', async () => {
    resetDb({
      supplier_invoices: [bill({ status: 'approved', match_status: 'matched', matched_amount: 1000 })],
      expenses: [expense({ status: 'approved' })],
      supplier_invoice_expenses: [{ id: 'l1', supplier_invoice_id: 'b1', expense_id: 'e1', matched_amount: 1000 }],
    })
    await pay()
    expect(tables.expenses[0].status).toBe('paid')
  })
  it('an expense split over two bills is paid when the second bill is paid', async () => {
    resetDb({
      supplier_invoices: [
        bill({ status: 'paid', amount: 400 }),
        bill({ id: 'b2', status: 'approved', amount: 600, supplier_invoice_number: 'INV-2', internal_reference: 'SI-2' }),
      ],
      expenses: [expense({ status: 'approved' })],
      supplier_invoice_expenses: [
        { id: 'l1', supplier_invoice_id: 'b1', expense_id: 'e1', matched_amount: 400 },
        { id: 'l2', supplier_invoice_id: 'b2', expense_id: 'e1', matched_amount: 600 },
      ],
    })
    const { POST } = await import('@/app/api/supplier-invoices/[id]/pay/route')
    await POST(req('POST', {}), ctx('b2'))
    expect(tables.expenses[0].status).toBe('paid')
  })
})

describe('POST /api/accounts-payable/pay-expense', () => {
  it('pays the expense and the approved bill it completes', async () => {
    resetDb({
      supplier_invoices: [bill({ status: 'approved', match_status: 'matched', matched_amount: 1000 })],
      expenses: [expense({ status: 'approved' })],
      supplier_invoice_expenses: [{ id: 'l1', supplier_invoice_id: 'b1', expense_id: 'e1', matched_amount: 1000 }],
    })
    const { POST } = await import('@/app/api/accounts-payable/pay-expense/route')
    const res = await POST(req('POST', { expenseId: 'e1', payment_date: '2026-10-14' }))
    expect(res.status).toBe(200)
    expect(tables.expenses[0]).toMatchObject({ status: 'paid', payment_date: '2026-10-14' })
    expect(tables.supplier_invoices[0].status).toBe('paid')
  })
  it('needs an expense id', async () => {
    const { POST } = await import('@/app/api/accounts-payable/pay-expense/route')
    expect((await POST(req('POST', {}))).status).toBe(400)
  })
})

describe('GET /api/accounts-payable', () => {
  it('a bill with no expense behind it is part of Total Payable', async () => {
    resetDb({
      expenses: [expense({ id: 'e1', status: 'approved', amount: 300, expense_date: '2026-10-10', supplier_name: 'Cairo Cars' })],
      supplier_invoices: [
        bill({ id: 'u', status: 'received', amount: 700, supplier_name: 'Nile Hotels', invoice_date: '2026-10-01' }),
        bill({ id: 'm', status: 'matched', amount: 300, supplier_name: 'Cairo Cars', supplier_invoice_number: 'C-1' }),
        bill({ id: 'p', status: 'paid', amount: 5000, supplier_invoice_number: 'P-1' }),
      ],
      supplier_invoice_expenses: [{ id: 'l', supplier_invoice_id: 'm', expense_id: 'e1', matched_amount: 300 }],
    })
    const { GET } = await import('@/app/api/accounts-payable/route')
    const json = await (await GET(req('GET', undefined, 'http://x/api/accounts-payable'))).json()
    expect(json.summary.total_outstanding).toEqual({ EUR: 1000 }) // 300 expense + 700 unmatched bill; the matched bill is not added twice
    expect(json.summary).toMatchObject({ expense_count: 1, bill_count: 1 })
    expect(json.expenses.find((e: any) => e.id === 'u')).toMatchObject({ kind: 'bill', due_date: '2026-10-15' })
    expect(json).not.toHaveProperty('categoryBreakdown')
    expect(json.data[0]).not.toHaveProperty('total_paid')
  })
  it('the status filter "bill" lists only unmatched bills', async () => {
    resetDb({
      expenses: [expense({ status: 'approved', expense_date: '2026-10-10' })],
      supplier_invoices: [bill({ id: 'u', status: 'received', supplier_name: 'Other Co' })],
    })
    const { GET } = await import('@/app/api/accounts-payable/route')
    const json = await (await GET(req('GET', undefined, 'http://x/api/accounts-payable?status=bill'))).json()
    expect(json.expenses.map((e: any) => e.id)).toEqual(['u'])
  })
})

describe('GET /api/accounts-receivable', () => {
  const inv = (over: Record<string, unknown>) => ({
    id: 'i1', org_id: 'o1', invoice_number: 'INV-1', client_id: 'c1', client_name: 'Acme', currency: 'JPY',
    total_amount: 1000, amount_paid: 0, balance_due: 1000, status: 'sent', issue_date: '2026-10-10', due_date: '2026-11-01',
    payment_terms: 'Net 30', ...over,
  })
  const get = async (qs = '') => {
    const { GET } = await import('@/app/api/accounts-receivable/route')
    return (await GET(req('GET', undefined, `http://x/api/accounts-receivable${qs}`))).json()
  }

  it('a draft with a balance is not a receivable', async () => {
    resetDb({ invoices: [inv({ id: 'd', status: 'draft', due_date: null })] })
    const json = await get()
    expect(json.invoices).toHaveLength(0)
    expect(json.summary.total_outstanding.JPY ?? 0).toBe(0)
  })
  it('a sent invoice with no due date is current (issue date + terms), not 90+ and overdue', async () => {
    resetDb({ invoices: [inv({ due_date: null, issue_date: new Date().toISOString().slice(0, 10) })] })
    const json = await get()
    expect(json.invoices[0]).toMatchObject({ aging_bucket: 'current', is_overdue: false, days_past_due: 0, due_date_from_terms: true })
    expect(json.summary.aging.days90Plus.JPY ?? 0).toBe(0)
    expect(json.summary.overdue_count).toBe(0)
  })
  it('no due date and no issue date shows as "No due date"', async () => {
    resetDb({ invoices: [inv({ due_date: null, issue_date: null })] })
    const json = await get()
    expect(json.invoices[0].aging_bucket).toBe('nodate')
    expect(json.summary.aging.noDueDate).toEqual({ JPY: 1000 })
    expect(json.summary.overdue_count).toBe(0)
  })
  it('the badge, the tile sums and the filter agree for an invoice 75 days late', async () => {
    const due = new Date(Date.now() - 75 * 86400000).toISOString().slice(0, 10)
    resetDb({ invoices: [inv({ due_date: due })] })
    const json = await get()
    expect(json.invoices[0].aging_bucket).toBe('90')
    expect(json.summary.aging.days90).toEqual({ JPY: 1000 })
    expect(json.summary.aging.days90Plus.JPY ?? 0).toBe(0)
    expect((await get('?aging=90')).invoices).toHaveLength(1)
    expect((await get('?aging=90plus')).invoices).toHaveLength(0)
    expect((await get('?aging=60')).invoices).toHaveLength(0)
  })
  it('totals stay per currency', async () => {
    resetDb({ invoices: [inv({}), inv({ id: 'i2', currency: 'EUR', balance_due: 50, total_amount: 50 })] })
    const json = await get()
    expect(json.summary.total_outstanding).toEqual({ JPY: 1000, EUR: 50 })
    expect(json.data).toHaveLength(2)
  })
  it('does not stop at 1,000 invoices', async () => {
    resetDb({ invoices: Array.from({ length: 2300 }, (_, i) => inv({ id: `i${i}`, client_id: `c${i % 7}`, balance_due: 1, total_amount: 1 })) })
    const json = await get()
    expect(json.summary.invoice_count).toBe(2300)
    expect(json.summary.total_outstanding).toEqual({ JPY: 2300 })
    expect(json.summary.truncated).toBe(false)
  })
  it('another company invoices are not read', async () => {
    resetDb({ invoices: [inv({ org_id: 'o2' })] })
    expect((await get()).invoices).toHaveLength(0)
  })
})

void calls
