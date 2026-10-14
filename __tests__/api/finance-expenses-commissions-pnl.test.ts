// Expenses, Commissions and Profit & Loss routes, against an in-memory
// database with two companies. Pins the fixes from the finance audit:
//   expenses     status / category / currency validated; company currency
//                default; trip checked against the company; deleting a paid or
//                invoice-matched expense refused (409)
//   commissions  trip / client checked against the company on POST; PUT is a
//                whitelist (amounts cannot change, paid date follows status);
//                cancelled ones are out of the cards; deleting a generated one
//                releases its service
//   generation   a service is marked generated only when all of it was made,
//                and a commission it already has is not made twice
//   P&L          a failed core query is an error, not zeros; revenue is net of
//                VAT; draft and cancelled trips are out of the aggregate
//   roles        an agent is refused by every handler
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, role: 'manager' as string, failTable: null as string | null }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => {
    const real = createMockClient()
    return {
      ...real,
      from: (table: string) => {
        if (table !== ctx.failTable) return real.from(table)
        // A query that errors: every chained call answers with the error.
        const failing: any = new Proxy(() => undefined, {
          get: (_t, prop) => (prop === 'then'
            ? (ok: any) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(ok)
            : () => failing),
        })
        return failing
      },
    }
  },
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u1',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
    requireRole: async (allowed: string[]) =>
      ctx.role === 'owner' || allowed.includes(ctx.role)
        ? null
        : NextResponse.json({ success: false, error: 'Forbidden — insufficient role' }, { status: 403 }),
  }
})
// The numbering rpc is not part of the mock database.
vi.mock('@/lib/expense-number', () => ({ nextExpenseNumber: async () => 'EXP-2026-001' }))
vi.mock('@/lib/accounting', () => ({ syncExpense: async () => undefined }))

import * as expenses from '@/app/api/expenses/route'
import * as expenseById from '@/app/api/expenses/[id]/route'
import * as commissions from '@/app/api/commissions/route'
import * as commissionById from '@/app/api/commissions/[id]/route'
import * as generate from '@/app/api/itineraries/[id]/generate-commissions/route'
import * as profitLoss from '@/app/api/profit-loss/route'
import * as taxReport from '@/app/api/profit-loss/tax/route'

const json = (body: unknown) => new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) })
const get = (qs = '') => new NextRequest(`http://x/api${qs}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const table = async (name: string) => ((await (createMockClient().from(name) as any).select('*')).data ?? []) as Record<string, any>[]

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.role = 'manager'
  ctx.failTable = null
  setMockTables({
    organizations: [{ id: 'org-a', default_currency: 'JPY', rate_currency: 'USD' }],
    suppliers: [
      { id: 'sup-a', org_id: 'org-a', name: 'Nile Palace' },
      { id: 'sup-b', org_id: 'org-b', name: 'Other Palace' },
    ],
    itineraries: [
      { id: 'it-a', org_id: 'org-a', itinerary_code: 'A-1', client_name: 'A', status: 'confirmed', currency: 'EUR', total_cost: 1000, supplier_cost: 800, start_date: '2026-07-01', end_date: '2026-07-05' },
      { id: 'it-draft', org_id: 'org-a', itinerary_code: 'A-D', client_name: 'D', status: 'draft', currency: 'EUR', total_cost: 500, supplier_cost: 300, start_date: '2026-08-01', end_date: '2026-08-05' },
      { id: 'it-cx', org_id: 'org-a', itinerary_code: 'A-X', client_name: 'X', status: 'cancelled', currency: 'EUR', total_cost: 700, supplier_cost: 400, start_date: '2026-09-01', end_date: '2026-09-05' },
      { id: 'it-b', org_id: 'org-b', itinerary_code: 'B-1', client_name: 'B', status: 'confirmed', currency: 'EUR', total_cost: 900, supplier_cost: 100, start_date: '2026-07-01', end_date: '2026-07-05' },
    ],
    clients: [
      { id: 'cl-a', org_id: 'org-a', first_name: 'Ann' },
      { id: 'cl-b', org_id: 'org-b', first_name: 'Bob' },
    ],
    expenses: [],
    supplier_invoice_expenses: [],
    commissions: [],
    invoices: [],
    invoice_payments: [],
    itinerary_days: [],
    itinerary_services: [],
  })
})

const expenseBody = (over: Record<string, unknown> = {}) => ({ category: 'guide', amount: 10, expense_date: '2026-10-01', ...over })

describe('POST /api/expenses', () => {
  it('refuses a status, category or currency outside the lists', async () => {
    for (const bad of [{ status: 'foo' }, { category: 'bogus' }, { currency: 'XXX' }]) {
      const res = await expenses.POST(json(expenseBody(bad)))
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
    expect(await table('expenses')).toHaveLength(0)
  })

  it('accepts cancelled as a status', async () => {
    expect((await expenses.POST(json(expenseBody({ status: 'cancelled' })))).status).toBe(201)
  })

  it("defaults to the company's currency, not EUR; an explicit one is kept (upper-cased)", async () => {
    const a = await (await expenses.POST(json(expenseBody()))).json()
    expect(a.currency).toBe('JPY')
    const b = await (await expenses.POST(json(expenseBody({ currency: 'usd' })))).json()
    expect(b.currency).toBe('USD')
  })

  it("will not link another company's trip", async () => {
    expect((await expenses.POST(json(expenseBody({ itinerary_id: 'it-b' })))).status).toBe(404)
    expect((await expenses.POST(json(expenseBody({ itinerary_id: 'it-a' })))).status).toBe(201)
    expect(await table('expenses')).toHaveLength(1)
  })

  it('is refused for an agent', async () => {
    ctx.role = 'agent'
    expect((await expenses.POST(json(expenseBody()))).status).toBe(403)
    expect((await expenses.GET(get())).status).toBe(403)
  })
})

describe('PUT /api/expenses/[id]', () => {
  beforeEach(() => {
    setMockTables({
      suppliers: [], itineraries: [
        { id: 'it-a', org_id: 'org-a' }, { id: 'it-b', org_id: 'org-b' },
      ],
      expenses: [{ id: 'e1', org_id: 'org-a', status: 'pending', category: 'guide', amount: 5 }],
      supplier_invoice_expenses: [],
    })
  })

  it("will not move an expense onto another company's trip", async () => {
    expect((await expenseById.PUT(json({ itinerary_id: 'it-b' }), params('e1'))).status).toBe(404)
    expect((await expenseById.PUT(json({ itinerary_id: 'it-a' }), params('e1'))).status).toBe(200)
  })

  it('validates category and currency, and accepts cancelled', async () => {
    expect((await expenseById.PUT(json({ category: 'bogus' }), params('e1'))).status).toBe(400)
    expect((await expenseById.PUT(json({ currency: 'XXX' }), params('e1'))).status).toBe(400)
    expect((await expenseById.PUT(json({ status: 'cancelled' }), params('e1'))).status).toBe(200)
  })

  it('an unknown expense is a 404, not a 500', async () => {
    expect((await expenseById.PUT(json({ notes: 'x' }), params('nope'))).status).toBe(404)
  })
})

describe('DELETE /api/expenses/[id]', () => {
  beforeEach(() => {
    setMockTables({
      expenses: [
        { id: 'e-pending', org_id: 'org-a', status: 'pending' },
        { id: 'e-paid', org_id: 'org-a', status: 'paid' },
        { id: 'e-matched', org_id: 'org-a', status: 'approved' },
        { id: 'e-other', org_id: 'org-b', status: 'pending' },
      ],
      supplier_invoice_expenses: [{ id: 'm1', supplier_invoice_id: 'si1', expense_id: 'e-matched' }],
    })
  })

  it('refuses a paid expense with the reason', async () => {
    const res = await expenseById.DELETE(get(), params('e-paid'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/paid/i)
    expect((await table('expenses')).some(e => e.id === 'e-paid')).toBe(true)
  })

  it('refuses an expense matched to a supplier invoice, and keeps the match', async () => {
    const res = await expenseById.DELETE(get(), params('e-matched'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/supplier invoice/i)
    expect(await table('supplier_invoice_expenses')).toHaveLength(1)
  })

  it('deletes a pending, unmatched one; another company\'s is a 404', async () => {
    expect((await expenseById.DELETE(get(), params('e-pending'))).status).toBe(200)
    expect((await table('expenses')).some(e => e.id === 'e-pending')).toBe(false)
    expect((await expenseById.DELETE(get(), params('e-other'))).status).toBe(404)
    expect((await table('expenses')).some(e => e.id === 'e-other')).toBe(true)
  })
})

const commissionBody = (over: Record<string, unknown> = {}) => ({
  commission_type: 'receivable', category: 'hotel', commission_amount: 50, ...over,
})

describe('POST /api/commissions', () => {
  it("will not link another company's trip or client", async () => {
    expect((await commissions.POST(json(commissionBody({ itinerary_id: 'it-b' })))).status).toBe(404)
    expect((await commissions.POST(json(commissionBody({ client_id: 'cl-b' })))).status).toBe(404)
    expect((await commissions.POST(json(commissionBody({ supplier_id: 'sup-b' })))).status).toBe(404)
    expect(await table('commissions')).toHaveLength(0)
    const ok = await commissions.POST(json(commissionBody({ itinerary_id: 'it-a', client_id: 'cl-a', supplier_id: 'sup-a' })))
    expect(ok.status).toBe(201)
  })

  it('refuses a type, category, status or currency the database would refuse', async () => {
    for (const bad of [{ commission_type: 'x' }, { category: 'x' }, { status: 'x' }, { currency: 'XXX' }]) {
      expect((await commissions.POST(json(commissionBody(bad)))).status, JSON.stringify(bad)).toBe(400)
    }
  })

  it("defaults to the company's currency", async () => {
    const { data } = await (await commissions.POST(json(commissionBody()))).json()
    expect(data.currency).toBe('JPY')
  })

  it('a paid commission carries a paid date; a pending one none', async () => {
    const paid = await (await commissions.POST(json(commissionBody({ status: 'paid' })))).json()
    expect(paid.data.paid_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const pending = await (await commissions.POST(json(commissionBody({ paid_date: '2026-01-01' })))).json()
    expect(pending.data.paid_date).toBeNull()
  })

  it('is refused for an agent', async () => {
    ctx.role = 'agent'
    expect((await commissions.POST(json(commissionBody()))).status).toBe(403)
    expect((await commissions.GET(get())).status).toBe(403)
  })
})

describe('PUT /api/commissions/[id]', () => {
  beforeEach(() => {
    setMockTables({
      commissions: [{
        id: 'c1', org_id: 'org-a', commission_type: 'receivable', category: 'hotel', commission_amount: 50, base_amount: 500,
        commission_rate: 10, currency: 'EUR', status: 'pending', paid_date: null, itinerary_id: 'it-a', supplier_id: 'sup-a', notes: 'old',
      }],
    })
  })
  const row = async () => (await table('commissions'))[0]

  it('saves the status, paid date and notes', async () => {
    const res = await commissionById.PUT(json({ status: 'received', paid_date: '2026-10-02', notes: 'banked' }), params('c1'))
    expect(res.status).toBe(200)
    expect(await row()).toMatchObject({ status: 'received', paid_date: '2026-10-02', notes: 'banked' })
  })

  it('cannot change the money, the links or the company', async () => {
    await commissionById.PUT(json({
      commission_amount: 999, base_amount: 1, commission_rate: 99, currency: 'USD', commission_type: 'payable',
      itinerary_id: 'it-b', supplier_id: 'sup-b', client_id: 'cl-b', org_id: 'org-b', category: 'spa', notes: 'n',
    }), params('c1'))
    expect(await row()).toMatchObject({
      commission_amount: 50, base_amount: 500, commission_rate: 10, currency: 'EUR', commission_type: 'receivable',
      itinerary_id: 'it-a', supplier_id: 'sup-a', org_id: 'org-a', category: 'hotel', notes: 'n',
    })
  })

  it('moving back to pending clears the paid date', async () => {
    await commissionById.PUT(json({ status: 'paid' }), params('c1'))
    expect((await row()).paid_date).toMatch(/^\d{4}-/)
    await commissionById.PUT(json({ status: 'pending' }), params('c1'))
    expect((await row()).paid_date).toBeNull()
  })

  it('a bad status is a 400 with the reason, an unknown row a 404', async () => {
    const bad = await commissionById.PUT(json({ status: 'foo' }), params('c1'))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toMatch(/status must be one of/)
    expect((await commissionById.PUT(json({ status: 'paid' }), params('nope'))).status).toBe(404)
  })
})

describe('GET /api/commissions summary', () => {
  it('leaves cancelled commissions out of every card', async () => {
    setMockTables({
      commissions: [
        { id: 'a', org_id: 'org-a', commission_type: 'receivable', category: 'hotel', commission_amount: 100, currency: 'EUR', status: 'pending' },
        { id: 'b', org_id: 'org-a', commission_type: 'receivable', category: 'hotel', commission_amount: 40, currency: 'EUR', status: 'cancelled' },
        { id: 'c', org_id: 'org-a', commission_type: 'payable', category: 'hotel', commission_amount: 30, currency: 'EUR', status: 'cancelled' },
      ],
    })
    const body = await (await commissions.GET(get())).json()
    expect(body.data).toHaveLength(3) // the list still shows them
    expect(body.summary.total_receivable).toEqual({ EUR: 100 })
    expect(body.summary.total_payable).toEqual({})
    expect(body.summary.net_commission).toEqual({ EUR: 100 })
    expect(body.summary.by_category.hotel.count).toBe(1)
  })
})

describe('deleting a commission releases its service', () => {
  beforeEach(() => {
    setMockTables({
      commissions: [
        { id: 'c-linked', org_id: 'org-a', service_id: 's1' },
        { id: 'c-manual', org_id: 'org-a', service_id: null },
        { id: 'c-other', org_id: 'org-b', service_id: 's2' },
      ],
      itinerary_services: [
        { id: 's1', commission_status: 'generated' },
        { id: 's2', commission_status: 'generated' },
      ],
    })
  })

  it('flips the service back to pending', async () => {
    expect((await commissionById.DELETE(get(), params('c-linked'))).status).toBe(200)
    expect((await table('itinerary_services')).find(s => s.id === 's1')!.commission_status).toBe('pending')
  })

  it('a manual commission releases nothing; another company\'s is untouched', async () => {
    expect((await commissionById.DELETE(get(), params('c-manual'))).status).toBe(200)
    expect((await commissionById.DELETE(get(), params('c-other'))).status).toBe(404)
    expect((await table('itinerary_services')).every(s => s.commission_status === 'generated')).toBe(true)
  })
})

describe('Generate commissions', () => {
  const hotel = { id: 'sup-h', org_id: 'org-a', name: 'Hotel', commission_type: 'receivable', default_commission_rate: 10 }
  const guideNoRate = { id: 'sup-g', org_id: 'org-a', name: 'Ahmed', commission_type: 'payable', default_commission_rate: 0 }
  const service = (over: Record<string, unknown>) => ({
    id: 's', itinerary_day_id: 'd1', service_type: 'accommodation', service_name: 'Stay', client_price: 150, total_cost: 100,
    supplier_id: 'sup-h', supplier: hotel, commission_rate: null, commission_status: 'pending',
    sold_by_supplier_id: null, seller: null, ...over,
  })
  const run = () => generate.POST(json({}), params('it-a'))
  const status = async (id: string) => (await table('itinerary_services')).find(s => s.id === id)!.commission_status

  beforeEach(() => {
    setMockTables({
      itineraries: [{ id: 'it-a', org_id: 'org-a', itinerary_code: 'A-1', status: 'confirmed', currency: 'EUR', start_date: '2026-07-01' }],
      itinerary_days: [{ id: 'd1', itinerary_id: 'it-a' }],
      itinerary_services: [],
      commissions: [],
    })
  })

  const seed = (rows: Record<string, unknown>[]) =>
    setMockTables({
      itineraries: [{ id: 'it-a', org_id: 'org-a', itinerary_code: 'A-1', status: 'confirmed', currency: 'EUR', start_date: '2026-07-01' }],
      itinerary_days: [{ id: 'd1', itinerary_id: 'it-a' }],
      itinerary_services: rows,
      commissions: [],
    })

  it('a fully generated service is marked generated and its commission names it', async () => {
    seed([service({ id: 's1' })])
    const body = await (await run()).json()
    expect(body.generated).toBe(1)
    expect(await status('s1')).toBe('generated')
    expect((await table('commissions'))[0]).toMatchObject({ service_id: 's1', commission_type: 'receivable', commission_amount: 10 })
  })

  it('a service that could only be generated in part stays pending, and nothing is made twice', async () => {
    // The seller (a guide) is owed 20% of the 50 profit; the provider (the hotel)
    // has no rate until it is fixed, so only the seller's commission can be made.
    seed([service({
      id: 's2', supplier: { ...hotel, default_commission_rate: 0 },
      sold_by_supplier_id: 'sup-g', seller: { ...guideNoRate, default_commission_rate: 20 },
    })])
    const first = await (await run()).json()
    expect(first.generated).toBe(1)
    expect(first.skipped.map((s: any) => s.reason)).toContain('no_rate')
    // The page shows only the message, so the reason is in it.
    expect(first.message).toMatch(/Skipped: Stay \(no commission rate\)/)
    expect(await status('s2')).toBe('pending')

    // Run again: the seller's commission already exists, so nothing new.
    const second = await (await run()).json()
    expect(second.generated).toBe(0)
    expect(await table('commissions')).toHaveLength(1)

    // Fix the provider's rate: only the provider's commission is added, and now
    // the service is complete.
    const svc = (await table('itinerary_services')).find(s => s.id === 's2')!
    svc.supplier = { ...hotel, default_commission_rate: 10 }
    const third = await (await run()).json()
    expect(third.generated).toBe(1)
    expect(await table('commissions')).toHaveLength(2)
    expect(await status('s2')).toBe('generated')
  })

  it("a supplier that is not the company's is treated as absent, never commissioned", async () => {
    seed([service({ id: 's4', supplier: { ...hotel, id: 'sup-b', org_id: 'org-b' }, supplier_id: 'sup-b' })])
    const body = await (await run()).json()
    expect(body.generated).toBe(0)
    expect(body.skipped.map((s: any) => s.reason)).toEqual(['no_supplier'])
    expect(await table('commissions')).toHaveLength(0)
  })

  it('a deleted commission can be generated again', async () => {
    seed([service({ id: 's3' })])
    await run()
    const [made] = await table('commissions')
    await commissionById.DELETE(get(), params(made.id))
    expect(await status('s3')).toBe('pending')
    const again = await (await run()).json()
    expect(again.generated).toBe(1)
    expect(await table('commissions')).toHaveLength(1)
  })
})

describe('GET /api/profit-loss', () => {
  const seedMoney = () => setMockTables({
    itineraries: [
      { id: 'it-a', org_id: 'org-a', itinerary_code: 'A-1', client_name: 'A', status: 'confirmed', currency: 'EUR', total_cost: 1000, supplier_cost: 800, start_date: '2026-07-01', end_date: '2026-07-05' },
      { id: 'it-draft', org_id: 'org-a', itinerary_code: 'A-D', client_name: 'D', status: 'draft', currency: 'EUR', total_cost: 500, supplier_cost: 300, start_date: '2026-08-01', end_date: '2026-08-05' },
      { id: 'it-cx', org_id: 'org-a', itinerary_code: 'A-X', client_name: 'X', status: 'cancelled', currency: 'EUR', total_cost: 700, supplier_cost: 400, start_date: '2026-09-01', end_date: '2026-09-05' },
      { id: 'it-b', org_id: 'org-b', itinerary_code: 'B-1', client_name: 'B', status: 'confirmed', currency: 'EUR', total_cost: 900, supplier_cost: 100, start_date: '2026-07-01', end_date: '2026-07-05' },
    ],
    invoices: [{ id: 'inv-1', org_id: 'org-a', itinerary_id: 'it-a', total_amount: 1140, tax_amount: 140, amount_paid: 0, status: 'sent', currency: 'EUR' }],
    invoice_payments: [], commissions: [], expenses: [],
  })

  it('a failed core query is an error, not a confident report with zero costs', async () => {
    for (const failing of ['expenses', 'invoices', 'commissions']) {
      seedMoney()
      ctx.failTable = failing
      const res = await profitLoss.GET(get())
      expect(res.status, failing).toBe(500)
      const body = await res.json()
      expect(body.data).toBeUndefined()
      expect(body.error).toMatch(/not computed/)
    }
  })

  it('revenue is net of VAT; the billed total and the VAT ride beside it', async () => {
    seedMoney()
    const body = await (await profitLoss.GET(get('?itineraryId=it-a'))).json()
    expect(body.data[0]).toMatchObject({ total_revenue: 1000, total_invoiced: 1140, vat_recorded: 140, gross_profit: 200 })
  })

  it('the aggregate leaves out draft and cancelled trips, and says so', async () => {
    seedMoney()
    const body = await (await profitLoss.GET(get())).json()
    expect(body.data.map((t: any) => t.itinerary_code)).toEqual(['A-1'])
    expect(body.excluded_statuses).toEqual(['draft', 'cancelled'])
  })

  it('asking for a status or one trip still answers', async () => {
    seedMoney()
    const draft = await (await profitLoss.GET(get('?status=draft'))).json()
    expect(draft.data.map((t: any) => t.itinerary_code)).toEqual(['A-D'])
    const one = await (await profitLoss.GET(get('?itineraryId=it-cx'))).json()
    expect(one.data.map((t: any) => t.itinerary_code)).toEqual(['A-X'])
  })

  it("never includes another company's trips", async () => {
    seedMoney()
    const body = await (await profitLoss.GET(get())).json()
    expect(body.data.some((t: any) => t.itinerary_code === 'B-1')).toBe(false)
  })

  it('is refused for an agent', async () => {
    seedMoney()
    ctx.role = 'agent'
    expect((await profitLoss.GET(get())).status).toBe(403)
    expect((await taxReport.GET(get())).status).toBe(403)
  })
})

describe('GET /api/profit-loss/tax', () => {
  it("reports the VAT the company's issued invoices recorded, nothing else", async () => {
    setMockTables({
      invoices: [
        { id: '1', org_id: 'org-a', currency: 'EUR', status: 'sent', total_amount: 1140, tax_amount: 140, tax_rate: 14, vat_applied: true, issue_date: '2026-07-01' },
        { id: '2', org_id: 'org-a', currency: 'EUR', status: 'paid', total_amount: 1000, tax_amount: 0, tax_rate: 0, vat_applied: false, issue_date: '2026-07-02' },
        { id: '3', org_id: 'org-a', currency: 'EUR', status: 'draft', total_amount: 570, tax_amount: 70, tax_rate: 14, vat_applied: true, issue_date: '2026-07-03' },
        { id: '4', org_id: 'org-a', currency: 'EUR', status: 'cancelled', total_amount: 570, tax_amount: 70, tax_rate: 14, vat_applied: true, issue_date: '2026-07-03' },
        { id: '5', org_id: 'org-b', currency: 'EUR', status: 'sent', total_amount: 5700, tax_amount: 700, tax_rate: 14, vat_applied: true, issue_date: '2026-07-04' },
      ],
    })
    const { data } = await (await taxReport.GET(get())).json()
    expect(data.invoice_count).toBe(2)
    expect(data.not_applied_count).toBe(1)
    expect(data.currencies).toHaveLength(1)
    expect(data.currencies[0]).toMatchObject({ currency: 'EUR', vat: 140, net: 2000, total: 2140, not_applied: 1 })
  })

  it('filters by issue date', async () => {
    setMockTables({
      invoices: [
        { id: '1', org_id: 'org-a', currency: 'EUR', status: 'sent', total_amount: 1140, tax_amount: 140, tax_rate: 14, vat_applied: true, issue_date: '2026-01-01' },
        { id: '2', org_id: 'org-a', currency: 'EUR', status: 'sent', total_amount: 570, tax_amount: 70, tax_rate: 14, vat_applied: true, issue_date: '2026-07-01' },
      ],
    })
    const { data } = await (await taxReport.GET(get('?startDate=2026-06-01'))).json()
    expect(data.currencies[0].vat).toBe(70)
  })

  it('a failed query is an error', async () => {
    setMockTables({ invoices: [] })
    ctx.failTable = 'invoices'
    expect((await taxReport.GET(get())).status).toBe(500)
  })
})
