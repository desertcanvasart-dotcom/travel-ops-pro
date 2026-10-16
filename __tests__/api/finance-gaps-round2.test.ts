// Routes for the second round of finance fixes, against the in-memory database:
//   POST /api/commissions                   a duplicate is refused with 409 naming the existing one
//   POST generate-commissions               a repriced service updates its pending commission,
//                                           flags the paid one, never touches it
//   POST /api/commissions/recalculate       the same, for the whole Commissions page
//   POST/PUT /api/expenses                  created_by / approved_by come from the session; the
//                                           creator cannot approve unless owner or admin
//   GET /api/itineraries/[id]/extras-fx     extras converted like the P&L; a missing rate is listed
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, role: 'manager' as string, userId: 'u1' as string | null }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
    requireRole: async (allowed: string[]) =>
      ctx.role === 'owner' || allowed.includes(ctx.role)
        ? null
        : NextResponse.json({ success: false, error: 'Forbidden — insufficient role' }, { status: 403 }),
  }
})
vi.mock('@/lib/expense-number', () => ({ nextExpenseNumber: async () => 'EXP-2026-001' }))
vi.mock('@/lib/accounting', () => ({ syncExpense: async () => undefined }))

import * as expenses from '@/app/api/expenses/route'
import * as expenseById from '@/app/api/expenses/[id]/route'
import * as commissions from '@/app/api/commissions/route'
import * as recalc from '@/app/api/commissions/recalculate/route'
import * as generate from '@/app/api/itineraries/[id]/generate-commissions/route'
import * as extrasFx from '@/app/api/itineraries/[id]/extras-fx/route'

const json = (body: unknown) => new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) })
const put = (body: unknown) => new NextRequest('http://x/api', { method: 'PUT', body: JSON.stringify(body) })
const get = () => new NextRequest('http://x/api')
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const table = async (name: string) => ((await (createMockClient().from(name) as any).select('*')).data ?? []) as Record<string, any>[]

const hotel = { id: 'sup-h', org_id: 'org-a', name: 'Hotel', commission_type: 'receivable', default_commission_rate: 10 }
const svc = (over: Record<string, unknown> = {}) => ({
  id: 's1', itinerary_day_id: 'd1', service_type: 'accommodation', service_name: 'Stay', client_price: 150, total_cost: 100,
  supplier_id: 'sup-h', supplier: hotel, commission_rate: null, commission_status: 'generated', sold_by_supplier_id: null, seller: null, ...over,
})
const comm = (over: Record<string, unknown> = {}) => ({
  id: 'c1', org_id: 'org-a', itinerary_id: 'it-a', service_id: 's1', supplier_id: 'sup-h', commission_type: 'receivable',
  category: 'hotel', description: 'Stay - A-1', base_amount: 100, cost_amount: 100, commission_rate: 10, commission_amount: 10,
  status: 'pending', ...over,
})

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.role = 'manager'
  ctx.userId = 'u1'
  setMockTables({
    organizations: [{ id: 'org-a', default_currency: 'EUR', rate_currency: 'USD' }],
    suppliers: [hotel],
    itineraries: [
      { id: 'it-a', org_id: 'org-a', itinerary_code: 'A-1', client_name: 'A', status: 'confirmed', currency: 'EUR', start_date: '2026-07-01' },
      { id: 'it-b', org_id: 'org-b', itinerary_code: 'B-1', client_name: 'B', status: 'confirmed', currency: 'EUR', start_date: '2026-07-01' },
    ],
    clients: [],
    itinerary_days: [{ id: 'd1', itinerary_id: 'it-a' }],
    itinerary_services: [svc()],
    commissions: [],
    expenses: [],
    exchange_rate_snapshots: [
      { base_currency: 'EUR', target_currency: 'JPY', rate: 160, captured_at: '2026-01-01T00:00:00Z' },
    ],
    user_profiles: [{ id: 'u2', full_name: 'Sara Manager', email: 's@x.test' }],
  })
})

describe('POST /api/commissions: a duplicate', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    commission_type: 'receivable', category: 'hotel', itinerary_id: 'it-a', supplier_id: 'sup-h', commission_amount: 10, ...over,
  })

  it('is refused with 409, naming the commission it repeats', async () => {
    setMockTables({ organizations: [{ id: 'org-a' }], suppliers: [hotel], itineraries: [{ id: 'it-a', org_id: 'org-a' }], clients: [],
      commissions: [comm({ id: '1a2b3c4d-0000-4000-8000-000000000000' })] })
    const res = await commissions.POST(json(body()))
    expect(res.status).toBe(409)
    const out = await res.json()
    expect(out.error).toContain('COM-1A2B3C4D')
    expect(out.existing_commission_id).toBe('1a2b3c4d-0000-4000-8000-000000000000')
    expect(await table('commissions')).toHaveLength(1)
  })

  it('lets a different amount, type or trip through, and one repeating only a cancelled commission', async () => {
    setMockTables({ organizations: [{ id: 'org-a' }], suppliers: [hotel], itineraries: [{ id: 'it-a', org_id: 'org-a' }, { id: 'it-c', org_id: 'org-a' }], clients: [],
      commissions: [comm(), comm({ id: 'c-x', commission_amount: 77, status: 'cancelled' })] })
    expect((await commissions.POST(json(body({ commission_amount: 11 })))).status).toBe(201)
    expect((await commissions.POST(json(body({ commission_type: 'payable' })))).status).toBe(201)
    expect((await commissions.POST(json(body({ itinerary_id: 'it-c' })))).status).toBe(201)
    expect((await commissions.POST(json(body({ commission_amount: 77 })))).status).toBe(201)
  })

  it("does not see another company's commission", async () => {
    setMockTables({ organizations: [{ id: 'org-a' }], suppliers: [hotel], itineraries: [{ id: 'it-a', org_id: 'org-a' }], clients: [],
      commissions: [comm({ org_id: 'org-b' })] })
    expect((await commissions.POST(json(body()))).status).toBe(201)
  })
})

describe('generate commissions: a service repriced after its commission', () => {
  const run = (b: unknown = {}) => generate.POST(json(b), params('it-a'))

  it('recalculates the pending commission from the current price', async () => {
    setMockTables({ ...(await snapshot()), itinerary_services: [svc({ total_cost: 120 })], commissions: [comm()] })
    const out = await (await run()).json()
    expect(out.recalculated).toHaveLength(1)
    expect(out.recalculated[0]).toMatchObject({ commission_id: 'c1', old_base: 100, new_base: 120, new_amount: 12 })
    expect(out.message).toContain('Recalculated 1 pending commission')
    const row = (await table('commissions'))[0]
    expect(row).toMatchObject({ base_amount: 120, cost_amount: 120, commission_amount: 12, status: 'pending' })
  })

  it('never changes a paid commission, and says "price changed since paid"', async () => {
    setMockTables({ ...(await snapshot()), itinerary_services: [svc({ total_cost: 120 })], commissions: [comm({ status: 'paid' })] })
    const out = await (await run()).json()
    expect(out.recalculated).toEqual([])
    expect(out.price_changed).toEqual([expect.objectContaining({ commission_id: 'c1', status: 'paid', label: 'price changed since paid' })])
    expect(out.message).toContain('price changed since paid')
    expect((await table('commissions'))[0]).toMatchObject({ base_amount: 100, commission_amount: 10, status: 'paid' })
  })

  it('leaves a commission whose price has not changed alone', async () => {
    setMockTables({ ...(await snapshot()), commissions: [comm()] })
    const out = await (await run()).json()
    expect(out.recalculated).toEqual([])
    expect(out.price_changed).toEqual([])
  })

  it('action "recalculate" only recalculates: it generates nothing', async () => {
    setMockTables({
      ...(await snapshot()),
      itinerary_services: [svc({ total_cost: 120 }), svc({ id: 's2', service_name: 'Spa', commission_status: 'pending' })],
      commissions: [comm()],
    })
    const out = await (await run({ action: 'recalculate' })).json()
    expect(out.generated).toBe(0)
    expect(out.recalculated).toHaveLength(1)
    expect(await table('commissions')).toHaveLength(1)
  })

  it('a recalculation does not overwrite a commission paid since it was read', async () => {
    // The conditional update (status = pending) is the guard: a paid row matches nothing.
    const stored = comm({ status: 'pending' })
    setMockTables({ ...(await snapshot()), commissions: [stored] })
    const { syncCommissionPrices } = await import('@/lib/commission-price-sync')
    const real = createMockClient()
    const racing = {
      from: (t: string) => {
        const q: any = real.from(t)
        if (t !== 'commissions') return q
        const update = q.update.bind(q)
        // Between the read and the write the commission is paid.
        q.update = (patch: any) => {
          stored.status = 'paid'
          return update(patch)
        }
        return q
      },
    }
    const result = await syncCommissionPrices(racing as any, 'org-a', {
      services: [svc({ total_cost: 120 }) as any],
      ctx: { orgId: 'org-a', itineraryId: 'it-a', itineraryCode: 'A-1', currency: 'EUR' },
    })
    expect(result.recalculated).toEqual([])
    expect(result.failed).toEqual(['c1'])
    expect((await table('commissions'))[0]).toMatchObject({ base_amount: 100, status: 'paid' })
  })
})

async function snapshot() {
  const names = ['organizations', 'suppliers', 'itineraries', 'clients', 'itinerary_days', 'itinerary_services', 'commissions', 'expenses', 'exchange_rate_snapshots', 'user_profiles']
  const out: Record<string, any[]> = {}
  for (const n of names) out[n] = await table(n)
  return out
}

describe('POST /api/commissions/recalculate (Recalculate from price)', () => {
  it('recalculates pending commissions across trips and flags the paid ones', async () => {
    setMockTables({
      ...(await snapshot()),
      itinerary_services: [svc({ total_cost: 120 }), svc({ id: 's2', service_name: 'Spa', total_cost: 200 })],
      commissions: [comm(), comm({ id: 'c2', service_id: 's2', description: 'Spa - A-1', status: 'paid', base_amount: 150, commission_amount: 15 })],
    })
    const out = await (await recalc.POST(json({}))).json()
    expect(out.success).toBe(true)
    expect(out.recalculated.map((r: any) => r.commission_id)).toEqual(['c1'])
    expect(out.price_changed.map((r: any) => [r.commission_id, r.label])).toEqual([['c2', 'price changed since paid']])
    const rows = await table('commissions')
    expect(rows.find(r => r.id === 'c1')).toMatchObject({ base_amount: 120, commission_amount: 12 })
    expect(rows.find(r => r.id === 'c2')).toMatchObject({ base_amount: 150, commission_amount: 15, status: 'paid' })
  })

  it("will not read another company's trip, and is refused for an agent", async () => {
    expect((await recalc.POST(json({ itinerary_id: 'it-b' }))).status).toBe(404)
    ctx.role = 'agent'
    expect((await recalc.POST(json({}))).status).toBe(403)
  })
})

describe('expense approver', () => {
  const body = (over: Record<string, unknown> = {}) => ({ category: 'guide', amount: 10, expense_date: '2026-10-01', ...over })

  it('records the signed-in user as creator, whatever the request says', async () => {
    const out = await (await expenses.POST(json(body({ created_by: 'forged', approved_by: 'forged' })))).json()
    expect(out.created_by).toBe('u1')
    expect(out.approved_by ?? null).toBeNull()
  })

  it('a manager cannot enter an expense as already approved or paid; an admin can, and becomes the approver', async () => {
    for (const status of ['approved', 'paid']) {
      const res = await expenses.POST(json(body({ status })))
      expect(res.status, status).toBe(403)
    }
    expect(await table('expenses')).toHaveLength(0)
    ctx.role = 'admin'
    const res = await expenses.POST(json(body({ status: 'approved' })))
    expect(res.status).toBe(201)
    const row = await res.json()
    expect(row.approved_by).toBe('u1')
    expect(row.approved_at).toBeTruthy()
  })

  describe('PUT', () => {
    beforeEach(() => {
      setMockTables({
        suppliers: [], itineraries: [],
        expenses: [{ id: 'e1', org_id: 'org-a', status: 'pending', category: 'guide', amount: 5, created_by: 'u1' }],
        user_profiles: [{ id: 'u2', full_name: 'Sara Manager', email: 's@x.test' }],
      })
    })

    it('refuses the creator approving their own expense (403), and changes nothing', async () => {
      const res = await expenseById.PUT(put({ status: 'approved' }), params('e1'))
      expect(res.status).toBe(403)
      expect((await res.json()).error).toMatch(/someone else must approve/)
      expect((await table('expenses'))[0]).toMatchObject({ status: 'pending' })
      expect((await table('expenses'))[0].approved_by).toBeUndefined()
    })

    it('also refuses the creator marking their pending expense paid', async () => {
      expect((await expenseById.PUT(put({ status: 'paid' }), params('e1'))).status).toBe(403)
    })

    it('lets another manager approve it, recording them and the time', async () => {
      ctx.userId = 'u2'
      const res = await expenseById.PUT(put({ status: 'approved' }), params('e1'))
      expect(res.status).toBe(200)
      const out = await res.json()
      expect(out).toMatchObject({ status: 'approved', approved_by: 'u2', approved_by_name: 'Sara Manager' })
      expect(out.approved_at).toBeTruthy()
    })

    it('lets an owner or admin approve their own', async () => {
      ctx.role = 'admin'
      const res = await expenseById.PUT(put({ status: 'approved' }), params('e1'))
      expect(res.status).toBe(200)
      expect((await res.json()).approved_by).toBe('u1')
      ctx.role = 'owner'
      setMockTables({ expenses: [{ id: 'e2', org_id: 'org-a', status: 'pending', category: 'guide', amount: 5, created_by: 'u1' }], suppliers: [], itineraries: [] })
      expect((await expenseById.PUT(put({ status: 'approved' }), params('e2'))).status).toBe(200)
    })

    it('paying an approved expense keeps its approver; moving it back to pending withdraws it', async () => {
      ctx.userId = 'u2'
      await expenseById.PUT(put({ status: 'approved' }), params('e1'))
      ctx.userId = 'u1'
      const paid = await (await expenseById.PUT(put({ status: 'paid' }), params('e1'))).json()
      expect(paid).toMatchObject({ status: 'paid', approved_by: 'u2' })
      const back = await (await expenseById.PUT(put({ status: 'pending' }), params('e1'))).json()
      expect(back).toMatchObject({ status: 'pending', approved_by: null, approved_at: null })
    })

    it('an approver cannot be written from the request', async () => {
      const res = await expenseById.PUT(put({ notes: 'x', approved_by: 'forged', created_by: 'forged' }), params('e1'))
      expect(res.status).toBe(200)
      const row = (await table('expenses'))[0]
      expect(row.approved_by).toBeUndefined()
      expect(row.created_by).toBe('u1')
    })

    it('GET shows the approver by name, on the list and the detail', async () => {
      ctx.userId = 'u2'
      await expenseById.PUT(put({ status: 'approved' }), params('e1'))
      const detail = await (await expenseById.GET(get(), params('e1'))).json()
      expect(detail.approved_by_name).toBe('Sara Manager')
      const list = await (await expenses.GET(new NextRequest('http://x/api'))).json()
      expect(list[0].approved_by_name).toBe('Sara Manager')
    })

    it('an unknown expense is a 404', async () => {
      expect((await expenseById.PUT(put({ status: 'approved' }), params('nope'))).status).toBe(404)
    })
  })
})

describe('GET /api/itineraries/[id]/extras-fx', () => {
  const expense = (over: Record<string, unknown> = {}) => ({
    org_id: 'org-a', itinerary_id: 'it-a', amount: 100, currency: 'EUR', expense_date: '2026-03-01', category: 'guide', status: 'pending', ...over,
  })

  it('converts at the stored rate and lists an expense with no rate instead of converting it', async () => {
    setMockTables({
      ...(await snapshot()),
      expenses: [
        expense(),
        expense({ amount: 16000, currency: 'JPY' }),
        expense({ amount: 1000, currency: 'GBP', expense_number: 'EXP-2026-009' }),
        expense({ status: 'rejected', amount: 999 }),
        expense({ org_id: 'org-b', amount: 5555 }),
      ],
    })
    const out = await (await extrasFx.GET(get(), params('it-a'))).json()
    expect(out.currency).toBe('EUR')
    expect(out.total).toBe(200)
    expect(out.count).toBe(2)
    expect(out.missing).toEqual([expect.objectContaining({ reference: 'EXP-2026-009', amount: 1000, fromCurrency: 'GBP', toCurrency: 'EUR' })])
  })

  it("is 404 for another company's trip and 403 for an agent", async () => {
    expect((await extrasFx.GET(get(), params('it-b'))).status).toBe(404)
    ctx.role = 'agent'
    expect((await extrasFx.GET(get(), params('it-a'))).status).toBe(403)
  })
})
