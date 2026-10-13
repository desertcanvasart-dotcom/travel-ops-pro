// ============================================
// /api/financial-reports — what counts, and when
// ============================================
// The audit found the annual report counting things that are not money yet:
// DRAFT invoices as revenue, draft and cancelled itineraries as trips, money
// on DEMO- fixtures' invoices and expenses, and amount_paid filed under the
// invoice's issue date as "cash in". These tests run the real route against
// an in-memory Supabase and pin each rule, plus the pure helpers behind them.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables } from '../_mock-supabase'
import {
  invoiceCountsAsRevenue,
  tripCounts,
  yearOf,
  monthOf,
  availableYearRange,
  sumByMonth,
  distinctTripCount,
} from '@/lib/financial-report'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  noOrgResponse: () => new Response(JSON.stringify({ error: 'No org' }), { status: 403 }),
}))

import { GET } from '@/app/api/financial-reports/route'

const ORG = 'org-1'

// invoice_payments has no org_id; the route scopes it through the joined
// invoice with .eq('invoices.org_id', orgId). The shared mock filters on a
// flat key, so each payment row carries that dotted key alongside the join.
const payment = (row: Record<string, unknown>, inv: Record<string, unknown>) => ({
  ...row,
  invoices: inv,
  'invoices.org_id': inv.org_id,
})

const INV_T1 = { org_id: ORG, invoice_number: 'INV-1', currency: 'EUR', itinerary_id: 't1' }
const INV_PREV = { org_id: ORG, invoice_number: 'INV-5', currency: 'EUR', itinerary_id: null }
const INV_LATE = { org_id: ORG, invoice_number: 'INV-6', currency: 'EUR', itinerary_id: null }
const INV_DEMO = { org_id: ORG, invoice_number: 'INV-DEMO', currency: 'EUR', itinerary_id: 'd1' }

function seed() {
  setMockTables({
    exchange_rate_snapshots: [
      { base_currency: 'EUR', target_currency: 'USD', rate: 1.1, captured_at: '2024-01-01T00:00:00Z', source: 'ecb' },
    ],
    itineraries: [
      { id: 't1', org_id: ORG, itinerary_code: 'ITN-1', start_date: '2026-03-10', status: 'confirmed', total_cost: 900, currency: 'EUR' },
      { id: 't2', org_id: ORG, itinerary_code: 'ITN-2', start_date: '2026-04-01', status: 'draft', total_cost: 900, currency: 'EUR' },
      { id: 't3', org_id: ORG, itinerary_code: 'ITN-3', start_date: '2026-05-01', status: 'cancelled', total_cost: 900, currency: 'EUR' },
      // EGP has no rate on file. A trip is only counted, so this must neither
      // raise an fx_hole nor drop out of the count.
      { id: 't4', org_id: ORG, itinerary_code: 'ITN-4', start_date: '2026-01-01', status: 'completed', total_cost: 50000, currency: 'EGP' },
      { id: 'd1', org_id: ORG, itinerary_code: 'DEMO-PORTAL-001', start_date: '2026-06-01', status: 'confirmed', total_cost: 2000, currency: 'EUR' },
      { id: 'x1', org_id: 'org-2', itinerary_code: 'ITN-X', start_date: '2026-03-01', status: 'confirmed', total_cost: 1, currency: 'EUR' },
    ],
    invoices: [
      { org_id: ORG, invoice_number: 'INV-1', issue_date: '2026-01-01', total_amount: 1000, amount_paid: 1000, balance_due: 0, currency: 'EUR', status: 'sent', itinerary_id: 't1' },
      { org_id: ORG, invoice_number: 'INV-2', issue_date: '2026-02-01', total_amount: 500, amount_paid: 0, balance_due: 500, currency: 'EUR', status: 'draft', itinerary_id: null },
      { org_id: ORG, invoice_number: 'INV-3', issue_date: '2026-02-01', total_amount: 300, amount_paid: 0, balance_due: 300, currency: 'EUR', status: 'cancelled', itinerary_id: null },
      { org_id: ORG, invoice_number: 'INV-DEMO', issue_date: '2026-06-01', total_amount: 2000, amount_paid: 2000, balance_due: 0, currency: 'EUR', status: 'paid', itinerary_id: 'd1' },
      { org_id: ORG, invoice_number: 'INV-5', issue_date: '2025-03-01', total_amount: 400, amount_paid: 400, balance_due: 0, currency: 'EUR', status: 'paid', itinerary_id: null },
      { org_id: ORG, invoice_number: 'INV-6', issue_date: '2026-12-31', total_amount: 600, amount_paid: 100, balance_due: 500, currency: 'EUR', status: 'partial', itinerary_id: null },
      { org_id: 'org-2', invoice_number: 'INV-X', issue_date: '2026-03-01', total_amount: 9999, amount_paid: 9999, balance_due: 0, currency: 'EUR', status: 'paid', itinerary_id: 'x1' },
    ],
    invoice_payments: [
      payment({ amount: 1000, currency: 'EUR', payment_date: '2026-01-15' }, INV_T1),
      // Paid in 2026 for a 2025 invoice: 2026 cash, even though the invoice is 2025 revenue.
      payment({ amount: 400, currency: 'EUR', payment_date: '2026-02-10' }, INV_PREV),
      payment({ amount: 100, currency: null, payment_date: '2026-12-31' }, INV_LATE),
      // Paid in 2027 for a 2026 invoice: not 2026 cash.
      payment({ amount: 500, currency: 'EUR', payment_date: '2027-01-05' }, INV_LATE),
      payment({ amount: 2000, currency: 'EUR', payment_date: '2026-06-02' }, INV_DEMO),
      payment({ amount: 9999, currency: 'EUR', payment_date: '2026-03-02' }, { org_id: 'org-2', invoice_number: 'INV-X', currency: 'EUR', itinerary_id: 'x1' }),
    ],
    expenses: [
      { org_id: ORG, expense_number: 'E1', expense_date: '2026-03-10', amount: 200, status: 'paid', category: 'guide', supplier_name: 'Ahmed', currency: 'EUR', itinerary_id: 't1' },
      { org_id: ORG, expense_number: 'E2', expense_date: '2026-03-11', amount: 100, status: 'pending', category: 'guide', supplier_name: 'Ahmed', currency: 'EUR', itinerary_id: 't1' },
      { org_id: ORG, expense_number: 'E3', expense_date: '2026-04-01', amount: 50, status: 'pending', category: 'guide', supplier_name: 'Ahmed', currency: 'EUR', itinerary_id: null },
      { org_id: ORG, expense_number: 'E4', expense_date: '2026-06-01', amount: 999, status: 'paid', category: 'hotel', supplier_name: 'Demo Hotel', currency: 'EUR', itinerary_id: 'd1' },
      { org_id: ORG, expense_number: 'E5', expense_date: '2026-06-01', amount: 70, status: 'rejected', category: 'office', supplier_name: null, currency: 'EUR', itinerary_id: null },
    ],
  })
}

async function report(query = 'year=2026&currency=EUR') {
  const res = await GET(new NextRequest(`http://localhost/api/financial-reports?${query}`))
  return { status: res.status, body: await res.json() }
}

beforeEach(seed)

describe('GET /api/financial-reports', () => {
  it('draft and cancelled invoices are not revenue, receivables or VAT', async () => {
    const { status, body } = await report()
    expect(status).toBe(200)
    // INV-1 1000 + INV-6 600. Not the draft (500), cancelled (300), demo (2000) or org-2.
    expect(body.summary.total_revenue).toBe(1600)
    expect(body.summary.invoice_count).toBe(2)
    expect(body.taxSummary.gross_revenue).toBe(1600)
    // INV-6 is the only one with a balance; the draft's 500 is not a receivable.
    expect(body.cashFlow.pending_receivables).toBe(500)
    expect(body.yearOverYear.revenue_change).toBe(1600 - 400)
  })

  it('invoices, expenses and payments linked to a DEMO- trip are excluded and reported', async () => {
    const { body } = await report()
    // E1 200 + E2 100 + E3 50. Not the demo hotel (999) or the rejected line.
    expect(body.summary.total_expenses).toBe(350)
    expect(body.demo_excluded).toMatchObject({
      trips: 1, invoices: 1, expenses: 1, payments: 1, excluded: 4,
      codes: ['DEMO-PORTAL-001'],
    })
  })

  it('counts confirmed/completed trips only, without converting them', async () => {
    const { body } = await report()
    // t1 confirmed + t4 completed (EGP, no rate). Not draft, cancelled, demo or org-2.
    expect(body.summary.trip_count).toBe(2)
    expect(body.summary.average_trip_value).toBe(800)
    expect(body.complete).toBe(true)
    expect(body.fx_holes).toEqual([])
    expect(body.monthly[0].trip_count).toBe(1)
    expect(body.monthly[2].trip_count).toBe(1)
  })

  it('cash inflows are payments by payment date, not amount_paid by issue date', async () => {
    const { body } = await report()
    // 1000 (Jan) + 400 (Feb, for a 2025 invoice) + 100 (Dec). Not the 2027 payment or the demo one.
    expect(body.cashFlow.inflows).toBe(1500)
    expect(body.summary.total_collected).toBe(1500)
    expect(body.monthly[0].collected).toBe(1000)
    expect(body.monthly[1].collected).toBe(400)
    expect(body.monthly[11].collected).toBe(100)
    expect(body.cashFlow.monthly_cash_flow[1]).toMatchObject({ inflow: 400 })
    // Outflows stay paid expenses by expense date: E1 only.
    expect(body.cashFlow.outflows).toBe(200)
    expect(body.cashFlow.monthly_cash_flow[2]).toMatchObject({ outflow: 200 })
  })

  it('a payment with no rate on its own date is an fx hole, not a face-value sum', async () => {
    setMockTables({
      exchange_rate_snapshots: [],
      itineraries: [],
      invoices: [],
      expenses: [],
      invoice_payments: [
        payment({ amount: 5000, currency: 'EGP', payment_date: '2026-05-05' }, { ...INV_T1, currency: 'EGP' }),
      ],
    })
    const { body } = await report()
    expect(body.cashFlow.inflows).toBe(0)
    expect(body.complete).toBe(false)
    expect(body.fx_holes).toHaveLength(1)
    expect(body.fx_holes[0].reference).toContain('INV-1 payment 2026-05-05')
  })

  it('commission recipient trips are distinct itineraries, not expense lines', async () => {
    const { body } = await report()
    const ahmed = body.commissionSummary.recipients.find((r: { name: string }) => r.name === 'Ahmed')
    // Three lines: two on t1, one with no trip.
    expect(ahmed.total_earned).toBe(350)
    expect(ahmed.trip_count).toBe(1)
  })

  it('buckets 1 January into January of its own year whatever the server zone', async () => {
    const { body } = await report()
    expect(body.monthly[0].invoiced).toBe(1000)
    expect(body.monthly[11].invoiced).toBe(600)
  })

  it('always offers the selected year, even one with no data', async () => {
    const { body } = await report('year=2030&currency=EUR')
    expect(body.availableYears).toContain(2030)
    expect(body.availableYears[0]).toBe(2030)
  })

  it('falls back to EUR for an unsupported currency and says so', async () => {
    const { body } = await report('year=2026&currency=XYZ')
    expect(body.reporting_currency).toBe('EUR')
  })
})

describe('lib/financial-report helpers', () => {
  it('invoiceCountsAsRevenue drops draft (incl. missing status) and cancelled', () => {
    expect(invoiceCountsAsRevenue('draft')).toBe(false)
    expect(invoiceCountsAsRevenue(null)).toBe(false)
    expect(invoiceCountsAsRevenue('cancelled')).toBe(false)
    for (const s of ['sent', 'partial', 'paid', 'overdue']) expect(invoiceCountsAsRevenue(s)).toBe(true)
  })

  it('tripCounts accepts confirmed and completed only', () => {
    expect(tripCounts('confirmed')).toBe(true)
    expect(tripCounts('completed')).toBe(true)
    for (const s of ['draft', 'sent', 'cancelled', null]) expect(tripCounts(s)).toBe(false)
  })

  it('yearOf/monthOf read the string, never the server zone', () => {
    expect(yearOf('2026-01-01')).toBe(2026)
    expect(monthOf('2026-01-01')).toBe(1)
    expect(yearOf('2025-12-31T23:30:00Z')).toBe(2025)
    expect(monthOf('2025-12-31')).toBe(12)
    expect(yearOf(null)).toBeNull()
    expect(yearOf('garbage')).toBeNull()
  })

  it('availableYearRange spans the data and the selected year, newest first', () => {
    expect(availableYearRange(['2024-05-01', '2025-01-01'], 2026)).toEqual([2026, 2025, 2024])
    expect(availableYearRange([null, undefined], 2026)).toEqual([2026])
    expect(availableYearRange(['2026-02-01'], 2023)).toEqual([2026, 2025, 2024, 2023])
  })

  it('sumByMonth skips other years and undated rows', () => {
    const rows = [
      { d: '2026-01-31', a: 10 },
      { d: '2026-12-01', a: 5 },
      { d: '2027-01-01', a: 99 },
      { d: null, a: 99 },
    ]
    const m = sumByMonth(rows, 2026, r => r.d, r => r.a)
    expect(m[0]).toBe(10)
    expect(m[11]).toBe(5)
    expect(m.reduce((s, v) => s + v, 0)).toBe(15)
  })

  it('distinctTripCount ignores unlinked lines and duplicates', () => {
    expect(distinctTripCount([{ itinerary_id: 'a' }, { itinerary_id: 'a' }, { itinerary_id: null }, { itinerary_id: 'b' }])).toBe(2)
  })
})

describe('route no longer reads the unused params', () => {
  it('type, quarter and month are gone', () => {
    const r = readFileSync(join(process.cwd(), 'app/api/financial-reports/route.ts'), 'utf8')
    expect(r).not.toMatch(/searchParams\.get\('(type|quarter|month)'\)/)
  })
})

// The page is a client component with no render harness in this repo; these
// pin the wiring that keeps it honest.
describe('financial reports page', () => {
  const page = readFileSync(join(process.cwd(), 'app/financial-reports/page.tsx'), 'utf8')

  it('requests the preferred currency but formats with the response currency', () => {
    expect(page).toContain('currency=${encodeURIComponent(requestedCurrency)}')
    expect(page).toContain('setReportCurrency(result.reporting_currency || requestedCurrency)')
    expect(page).toContain('formatMoney(Number(v) || 0, reportCurrency)')
  })

  it('ignores stale responses', () => {
    expect(page).toContain('const seq = ++requestSeq.current')
    expect(page).toContain('if (seq !== requestSeq.current) return')
    expect(page).toContain('new AbortController()')
    expect(page).toContain('controller.abort()')
  })

  it('clears the figures and shows an error when a load fails', () => {
    const catchBlock = page.slice(page.indexOf('} catch (error) {'), page.indexOf('} finally {'))
    expect(catchBlock).toContain('setSummary(null)')
    expect(catchBlock).toContain('setMonthly([])')
    expect(catchBlock).toContain('setLoadError(true)')
    expect(page).toContain("t('loadFailed'")
  })

  it('shows fx holes and demo exclusions', () => {
    expect(page).toContain('!complete && fxHoles.length > 0')
    expect(page).toContain("t('fxHolesTitle'")
    expect(page).toContain("t('demoExcluded'")
  })

  it('the year picker always includes the selected year', () => {
    expect(page).toContain('new Set([selectedYear, ...availableYears])')
  })
})
