// The three dashboard routes run against a fake Supabase client that records
// every query chain and answers per table. Pins the Home › Dashboard audit
// fixes that live in the routes rather than in lib/dashboard/figures.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { method: string; args: unknown[] }
type Chain = { table: string; calls: Call[] }
type Answer = { data?: unknown; count?: number | null; error?: unknown }

let chains: Chain[] = []
let answer: (c: Chain) => Answer = () => ({ data: [] })
let role: string | null = 'admin'

const has = (c: Chain, method: string, ...args: unknown[]) =>
  c.calls.some(x => x.method === method && args.every((a, i) => x.args[i] === a))

function fakeClient() {
  return {
    from(table: string) {
      const chain: Chain = { table, calls: [] }
      chains.push(chain)
      const q: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => {
              const a = answer(chain)
              resolve({ data: a.data ?? null, count: a.count ?? null, error: a.error ?? null })
            }
          }
          return (...args: unknown[]) => { chain.calls.push({ method: prop, args }); return q }
        },
      })
      return q
    },
  }
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => fakeClient() }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserRole: async () => role,
  noOrgResponse: () => new Response(null, { status: 400 }),
}))
vi.mock('@/lib/email/connected-mailboxes', () => ({
  // (db, orgId, build) since the per-company mailbox scoping (hotfix + 20261204).
  scopedToConnectedMailboxes: async (_db: unknown, _orgId: unknown, build: (f: string | null) => PromiseLike<unknown>) => build(null),
}))
vi.mock('@/lib/demo-data', () => ({
  loadDemoItineraryIds: async () => new Set<string>(),
  excludeDemoLinked: (rows: unknown[] | null) => ({ real: rows || [], exclusion: { excluded: 0 } }),
}))

import { GET as summaryGET } from '@/app/api/dashboard/summary/route'
import { GET as moneyGET } from '@/app/api/dashboard/money/route'
import { GET as attentionGET } from '@/app/api/dashboard/attention/route'

const TODAY = new Date().toISOString().slice(0, 10)
const req = (path: string) => new Request(`http://x${path}?today=${TODAY}`) as never

beforeEach(() => { chains = []; answer = () => ({ data: [] }); role = 'admin' })

describe('/api/dashboard/summary', () => {
  it('counts departures with an exact head query, not the length of the capped list', async () => {
    answer = c => {
      if (c.table === 'bookings' && has(c, 'limit', 6)) {
        return { data: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}` })) }
      }
      if (c.table === 'bookings' && c.calls.some(x => x.method === 'lt' && x.args[0] === 'start_date')) {
        return { count: 11 }
      }
      return { data: [], count: 0 }
    }
    const body = await (await summaryGET(req('/api/dashboard/summary'))).json()
    expect(body.data.ops.departingSoon.count).toBe(11)
    expect(body.data.ops.departingSoon.items).toHaveLength(6)
  })

  it('takes "today" from ?today=, like attention and money', async () => {
    await summaryGET(req('/api/dashboard/summary'))
    const departing = chains.find(c => c.table === 'bookings' && has(c, 'limit', 6))!
    expect(has(departing, 'gte', 'start_date', TODAY)).toBe(true)
  })

  it("does not count a refund among today's payments received", async () => {
    await summaryGET(req('/api/dashboard/summary'))
    const payments = chains.find(c => c.table === 'payments')!
    expect(has(payments, 'neq', 'payment_type', 'refund')).toBe(true)
  })

  it('counts completed quotes as sent and confirmed', async () => {
    answer = c => c.table === 'itineraries' && !has(c, 'limit', 5) && !c.calls.some(x => x.method === 'gte')
      ? { data: [{ status: 'sent' }, { status: 'confirmed' }, { status: 'completed' }, { status: 'draft' }] }
      : { data: [], count: 0 }
    const body = await (await summaryGET(req('/api/dashboard/summary'))).json()
    expect(body.data.quotes.sent).toBe(3)
    expect(body.data.quotes.confirmed).toBe(2)
  })

  it('serves the five recent quotes itself, org-scoped and with only the fields shown', async () => {
    answer = c => c.table === 'itineraries' && has(c, 'limit', 5)
      ? { data: [{ id: 'i1', itinerary_code: 'ITN-1', client_name: 'A', status: 'sent', created_at: '2026-10-01' }] }
      : { data: [], count: 0 }
    const body = await (await summaryGET(req('/api/dashboard/summary'))).json()
    expect(body.data.quotes.recent).toHaveLength(1)
    const recent = chains.find(c => c.table === 'itineraries' && has(c, 'limit', 5))!
    expect(has(recent, 'select', 'id, itinerary_code, client_name, status, created_at')).toBe(true)
    expect(has(recent, 'eq', 'org_id', 'org-1')).toBe(true)
    expect(has(recent, 'not', 'source', 'eq', 'b2b_custom')).toBe(true)
  })

  it('gives a viewer no recent quotes (the itineraries API is staff-only)', async () => {
    role = 'viewer'
    const body = await (await summaryGET(req('/api/dashboard/summary'))).json()
    expect(body.data.quotes.recent).toEqual([])
    expect(chains.some(c => c.table === 'itineraries' && has(c, 'limit', 5))).toBe(false)
  })
})

describe('/api/dashboard/money', () => {
  it('adds only supplier bills with no linked expense', async () => {
    answer = c => {
      if (c.table === 'expenses' && has(c, 'in', 'status')) return { data: [{ amount: 50_000, currency: 'JPY', itinerary_id: null }] }
      if (c.table === 'supplier_invoices') return { data: [{ id: 'si-1', amount: 50_000, currency: 'JPY' }, { id: 'si-2', amount: 8_000, currency: 'JPY' }] }
      if (c.table === 'supplier_invoice_expenses') return { data: [{ supplier_invoice_id: 'si-1' }] }
      return { data: [] }
    }
    const body = await (await moneyGET(req('/api/dashboard/money'))).json()
    expect(body.data.payables.expenseTotals).toEqual({ JPY: 50_000 })
    expect(body.data.payables.billTotals).toEqual({ JPY: 8_000 })
    expect(body.data.payables.billCount).toBe(1)
  })

  it('nets refunds out of Received This Month', async () => {
    answer = c => c.table === 'payments'
      ? { data: [
          { amount: 100_000, currency: 'JPY', itinerary_id: null, payment_type: 'deposit' },
          { amount: 40_000, currency: 'JPY', itinerary_id: null, payment_type: 'refund' },
        ] }
      : { data: [] }
    const body = await (await moneyGET(req('/api/dashboard/money'))).json()
    expect(body.data.month.received).toEqual({ JPY: 60_000 })
    expect(body.data.month.receivedCount).toBe(1)
    expect(body.data.month.refundCount).toBe(1)
  })

  it('Received This Month adds invoice payments and does not count a trip payment twice', async () => {
    answer = c => {
      if (c.table === 'payments') return { data: [
        { amount: 100_000, currency: 'JPY', itinerary_id: 'trip-invoiced', payment_type: 'deposit' },
        { amount: 30_000, currency: 'JPY', itinerary_id: 'trip-plain', payment_type: 'deposit' },
      ] }
      if (c.table === 'invoice_payments') return { data: [{ amount: 100_000, currency: 'JPY', invoices: { org_id: 'org-1', itinerary_id: 'trip-invoiced' } }] }
      if (c.table === 'invoices' && has(c, 'not', 'itinerary_id')) return { data: [{ itinerary_id: 'trip-invoiced', status: 'sent' }] }
      return { data: [] }
    }
    const body = await (await moneyGET(req('/api/dashboard/money'))).json()
    // 100,000 on the invoice + 30,000 on the plain trip; the invoiced trip's own
    // trip-level 100,000 is the same money entered twice.
    expect(body.data.month.received).toEqual({ JPY: 130_000 })
  })

  it('an invoice due today is not overdue', async () => {
    answer = c => c.table === 'invoices'
      ? { data: [{ balance_due: 10, currency: 'EUR', due_date: TODAY, itinerary_id: null }] }
      : { data: [] }
    const body = await (await moneyGET(req('/api/dashboard/money'))).json()
    expect(body.data.receivables.totals).toEqual({ EUR: 10 })
    expect(body.data.receivables.overdue).toEqual({})
  })
})

describe('/api/dashboard/attention', () => {
  const booking = {
    id: 'b1', booking_code: 'BK-1', trip_name: 'Trip', client_name: 'C', start_date: TODAY,
    status: 'confirmed', itinerary_id: null, balance_due: 120_000, balance_due_date: TODAY,
    payment_status: 'partial', currency: 'JPY',
  }
  const email = { id: 'e1', client_name: 'Jane', client_email: 'jane@example.com', subject: 'Our trip', awaiting_reply_since: '2026-01-01T00:00:00Z', last_message_at: null }

  beforeEach(() => {
    answer = c => {
      if (c.table === 'bookings') return { data: [booking] }
      if (c.table === 'email_conversations') return { data: [email] }
      return { data: [] }
    }
  })

  it("filters settled bookings on 'paid', the value lib/booking-extras writes", async () => {
    await attentionGET(req('/api/dashboard/attention'))
    const balanceQuery = chains.find(c => c.table === 'bookings' && has(c, 'gt', 'balance_due', 0))!
    expect(has(balanceQuery, 'neq', 'payment_status', 'paid')).toBe(true)
    expect(has(balanceQuery, 'select')).toBe(true)
    expect(String(balanceQuery.calls.find(x => x.method === 'select')!.args[0])).toContain('currency')
  })

  it('a manager gets the balance with its currency, and the waiting emails', async () => {
    role = 'manager'
    const body = await (await attentionGET(req('/api/dashboard/attention'))).json()
    const balance = body.data.items.find((i: any) => i.type === 'balance_due')
    expect(balance.detail.balanceDue).toBe(120_000)
    expect(balance.currency).toBe('JPY')
    expect(body.data.items.some((i: any) => i.type === 'reply_overdue')).toBe(true)
  })

  it('a viewer gets no emails, and the balance row without its amount', async () => {
    role = 'viewer'
    const body = await (await attentionGET(req('/api/dashboard/attention'))).json()
    expect(body.data.items.some((i: any) => i.type === 'reply_overdue')).toBe(false)
    expect(chains.some(c => c.table === 'email_conversations')).toBe(false)
    const balance = body.data.items.find((i: any) => i.type === 'balance_due')
    expect(balance).toBeDefined()
    expect(balance.detail).not.toHaveProperty('balanceDue')
    expect(balance.currency).toBeNull()
  })

  it('the dismiss fingerprint is the same whoever reads the row', async () => {
    role = 'manager'
    const asManager = (await (await attentionGET(req('/api/dashboard/attention'))).json()).data.items.find((i: any) => i.type === 'balance_due')
    role = 'agent'
    const asAgent = (await (await attentionGET(req('/api/dashboard/attention'))).json()).data.items.find((i: any) => i.type === 'balance_due')
    expect(asAgent.dismissFingerprint).toBe(asManager.dismissFingerprint)
    expect(asAgent.dismissKey).toBe(asManager.dismissKey)
  })
})
