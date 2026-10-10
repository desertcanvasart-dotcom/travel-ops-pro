import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapInvoiceToPayload } from '@/lib/accounting/mappers'
import { buildFxIndex } from '@/lib/fx-conversion'
import { computeTripPnL, type TripPnLInputs } from '@/lib/trip-pnl'
import { cellText } from '@/lib/finance-export'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('accounting sync goes to the entity\'s own org', () => {
  it('the token is picked by org_id, with no created_by lookup and no oldest-org fallback', () => {
    const s = src('lib/accounting/sync-service.ts')
    expect(s).toContain('export async function getAuthenticatedProvider(orgId: string)')
    expect(s).toMatch(/\.from\('accounting_tokens'\)\s*\n\s*\.select\('\*'\)\s*\n\s*\.eq\('org_id', orgId\)\s*\n\s*\.eq\('is_active', true\)/)
    expect(s).not.toContain('getUserIdForEntity')
    expect(s).not.toContain("select('created_by')")
    expect(s).not.toMatch(/from\('organizations'\)/)
    expect(s.match(/getAuthenticatedProvider\(orgId\)/g)).toHaveLength(4)
  })

  it('sync routes 404 an entity from another org; accounts reads the org connection', () => {
    const single = src('app/api/accounting/sync/route.ts')
    expect(single).toContain('getOrgIdForEntity(entityType as SyncEntityType, entityId)')
    expect(single).toContain('entityOrgId !== orgId')
    expect(single).toContain("{ status: 404 }")
    const batch = src('app/api/accounting/sync/batch/route.ts')
    expect(batch).toContain('getOrgIdForEntity(entityType as SyncEntityType, id)')
    expect(batch).toContain('entityOrgId !== orgId')
    const accounts = src('app/api/accounting/accounts/route.ts')
    expect(accounts).toContain('getAuthenticatedProvider(orgId)')
    expect(accounts).not.toContain('getCurrentUserId')
  })
})

describe('deposit invoices post the deposit, not the trip', () => {
  const trip = [
    { description: 'Tour', quantity: 1, unit_price: 900000, amount: 900000 },
    { description: 'Fuel surcharge', quantity: 1, unit_price: 100000, amount: 100000 },
  ]

  it('a deposit goes over as ONE line for what it bills', () => {
    const p = mapInvoiceToPayload({
      invoice_number: 'INV-0042-DEP', invoice_type: 'deposit', deposit_percent: 20,
      line_items: trip, full_trip_cost: 1000000, subtotal: 200000, tax_amount: 0,
      total_amount: 200000, currency: 'JPY',
    })
    expect(p.line_items).toEqual([
      { description: 'Deposit 20% – INV-0042-DEP', quantity: 1, unit_price: 200000, amount: 200000 },
    ])
    expect(p.subtotal).toBe(200000)
    expect(p.total_amount).toBe(200000)
  })

  it('a standard invoice whose lines add up keeps its itemisation', () => {
    const p = mapInvoiceToPayload({
      invoice_number: 'INV-1', invoice_type: 'standard', line_items: trip,
      subtotal: 1000000, tax_amount: 100000, total_amount: 1100000, currency: 'JPY',
    })
    expect(p.line_items).toHaveLength(2)
    expect(p.line_items.reduce((s, l) => s + l.amount, 0)).toBe(1000000)
  })

  it('lines that do not add up to the subtotal collapse to one line for the subtotal', () => {
    const p = mapInvoiceToPayload({
      invoice_number: 'INV-2', invoice_type: 'standard', line_items: trip,
      subtotal: 950000, tax_amount: 0, total_amount: 950000, currency: 'JPY',
    })
    expect(p.line_items).toEqual([{ description: 'Invoice INV-2', quantity: 1, unit_price: 950000, amount: 950000 }])
  })

  it('no lines at all still bills the subtotal', () => {
    const p = mapInvoiceToPayload({ invoice_number: 'INV-3', subtotal: 100, tax_amount: 10, total_amount: 110, currency: 'EUR' })
    expect(p.line_items[0].amount).toBe(100)
  })
})

describe('trip P&L', () => {
  const FX = buildFxIndex([])
  const base = (over: Partial<TripPnLInputs> = {}): TripPnLInputs => ({
    itinerary: {
      id: 't', itinerary_code: 'T-1', trip_name: '', client_name: '', start_date: '2026-07-01',
      end_date: '2026-07-08', status: 'confirmed', currency: 'EUR', total_cost: 10000, supplier_cost: 6000,
    },
    invoices: [],
    payments: [],
    expenses: [],
    commissions: [],
    ...over,
  })

  it('a cancelled invoice is not revenue', () => {
    const { pnl } = computeTripPnL(FX, base({
      invoices: [
        { id: 'a', total_amount: 10000, amount_paid: 0, status: 'sent' },
        { id: 'b', total_amount: 4000, amount_paid: 0, status: 'cancelled' },
      ],
    }))
    expect(pnl.total_revenue).toBe(10000)
  })

  it('rejected and cancelled expenses are not costs, nor pending', () => {
    const exp = (status: string) => ({ amount: 500, category: 'guide', status, currency: 'EUR', expense_date: '2026-07-01' })
    const { pnl } = computeTripPnL(FX, base({
      invoices: [{ id: 'a', total_amount: 10000, amount_paid: 0, status: 'sent' }],
      expenses: [exp('pending'), exp('rejected'), exp('cancelled')],
    }))
    expect(pnl.manual_expenses).toBe(500)
    expect(pnl.expenses_pending).toBe(500)
  })

  it('an uninvoiced trip counts its extras on BOTH sides', () => {
    const { pnl } = computeTripPnL(FX, base({
      extras: [{ title: 'Balloon', quantity: 1, unit_price: 1000, currency: 'EUR', supplier_cost: 600, supplier_currency: 'EUR', confirmed_at: '2026-06-01' }],
    }))
    // revenue 10,000 + 1,000; cost 6,000 + 600
    expect(pnl.gross_profit).toBe(11000 - 6600)
  })
})

describe('financial reports', () => {
  it('cancelled invoices and rejected/cancelled expenses are dropped; receivables are converted', () => {
    const r = src('app/api/financial-reports/route.ts')
    expect(r).toContain("total_amount, amount_paid, balance_due, currency, status')")
    expect(r).toContain(".filter(inv => inv.status !== 'cancelled')")
    expect(r).toContain(".filter(exp => exp.status !== 'rejected' && exp.status !== 'cancelled')")
    expect(r).not.toContain('Number(inv.balance_due')
    expect(r).toContain('Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)')
  })

  it('exports format money in the row currency, and the PDF margin is the year margin', () => {
    expect(cellText({ key: 'revenue', label: 'R', money: true }, { revenue: 1234.5, currency: 'JPY' })).toBe('1235')
    for (const p of ['app/financial-reports/page.tsx', 'app/profit-loss/page.tsx']) {
      expect(src(p)).not.toContain("v.toFixed(2) : String(v ?? '')")
    }
    const page = src('app/financial-reports/page.tsx')
    expect(page).toContain('currency: reportCurrency }))')
    expect(page).toContain('summary?.profit_margin')
    expect(page).not.toContain('avgMargin')
    expect(page).toContain('roundToCurrency(v, reportCurrency).toFixed(dp)')
  })
})

describe('commissions', () => {
  it('the summary is per currency and rendered with formatTotals', () => {
    const api = src('app/api/commissions/route.ts')
    expect(api).toContain('total_receivable: sumByCurrency(receivable, amount, cur)')
    expect(api).not.toMatch(/reduce\(\(sum, c\) => sum \+ Number\(c\.commission_amount\)/)
    const page = src('app/commissions/page.tsx')
    expect(page).toContain('formatTotals(summary.total_receivable)')
    expect(page).toContain('formatTotals(summary.net_commission)')
    expect(page).not.toContain('formatCurrency(summary.')
  })

  it('no commissions for a cancelled trip; PUT cannot move org or client', () => {
    const gen = src('app/api/itineraries/[id]/generate-commissions/route.ts')
    expect(gen).toContain("if (itinerary.status === 'cancelled')")
    expect(gen).toContain('{ status: 409 }')
    const put = src('app/api/commissions/[id]/route.ts')
    expect(put).toContain('org_id: _org, client_id: _client,')
  })
})

describe('deleting a payment already in the books', () => {
  it('flags the synced log row for reversal and warns the caller', () => {
    const r = src('app/api/invoices/[id]/payments/[paymentId]/route.ts')
    const lookup = r.indexOf(".eq('entity_type', 'invoice_payment')")
    const del = r.indexOf(".from('invoice_payments')\n      .delete()")
    expect(lookup).toBeGreaterThan(0)
    expect(lookup).toBeLessThan(del)
    expect(r).toContain(".eq('sync_status', 'synced')")
    expect(r).toContain("sync_status: 'failed'")
    expect(r).toContain('Deleted in Autoura — reverse this payment in ${provider}')
    expect(r).toContain('retry_count: 5')
    expect(r).toContain('{ success: true, warning }')
  })
})
