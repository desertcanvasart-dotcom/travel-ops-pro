import { describe, it, expect } from 'vitest'
import { buildFxIndex } from '@/lib/fx-conversion'
import { computeTripPnL, netShareOfInvoice, PNL_EXCLUDED_STATUSES, type TripPnLInputs } from '@/lib/trip-pnl'
import { buildVatReport } from '@/lib/vat-report'

// ============================================
// Profit & Loss revenue is NET of VAT.
//
// invoices.total_amount INCLUDES the VAT recorded on the invoice (tax_amount),
// and VAT is owed to the tax authority, not earned. The report summed the
// total, so revenue, gross profit, margin and realized revenue were all
// overstated by the VAT the moment a trip was invoiced.
//
// Example from the audit: net 1,000, VAT 140, total 1,140, supplier cost 800.
//   before: revenue 1,140, profit 340 (29.8%)
//   after:  revenue 1,000, profit 200 (20.0%)
// ============================================

const FX = buildFxIndex([])

const inputs = (over: Partial<TripPnLInputs> = {}): TripPnLInputs => ({
  itinerary: {
    id: 'itin-1', itinerary_code: 'ITN-1', status: 'confirmed', currency: 'EUR',
    total_cost: 1000, supplier_cost: 800,
  },
  invoices: [{ id: 'inv-1', itinerary_id: 'itin-1', total_amount: 1140, tax_amount: 140, amount_paid: 0, status: 'sent' }],
  payments: [],
  expenses: [],
  commissions: [],
  ...over,
})

describe('revenue is the invoice net of VAT', () => {
  it('1,140 invoice with 140 VAT: revenue 1,000, profit 200, margin 20%', () => {
    const { pnl } = computeTripPnL(FX, inputs())
    expect(pnl.total_revenue).toBe(1000)
    expect(pnl.gross_profit).toBe(200)
    expect(pnl.profit_margin).toBeCloseTo(20, 5)
  })

  it('the figure does not jump when the trip is invoiced: quote 1,000 before, 1,000 after', () => {
    const quoted = computeTripPnL(FX, inputs({ invoices: [] })).pnl
    const invoiced = computeTripPnL(FX, inputs()).pnl
    expect(quoted.gross_profit).toBe(invoiced.gross_profit)
    expect(quoted.profit_margin).toBeCloseTo(invoiced.profit_margin, 5)
  })

  it('an invoice with no VAT is unchanged', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      invoices: [{ id: 'inv-1', total_amount: 1000, tax_amount: 0, amount_paid: 0, status: 'sent' }],
    }))
    expect(pnl.total_revenue).toBe(1000)
    expect(pnl.vat_recorded).toBe(0)
  })

  it('the VAT is reported beside it, and the billed total is kept for balance due', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      invoices: [{ id: 'inv-1', total_amount: 1140, tax_amount: 140, amount_paid: 500, status: 'sent' }],
    }))
    expect(pnl.vat_recorded).toBe(140)
    expect(pnl.total_invoiced).toBe(1140)
    // Paid by the client, VAT included: balance due = total_invoiced - total_paid.
    expect(pnl.total_paid).toBe(500)
  })

  it('a cancelled invoice is neither revenue nor VAT', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      invoices: [{ id: 'inv-1', total_amount: 1140, tax_amount: 140, amount_paid: 0, status: 'cancelled' }],
    }))
    expect(pnl.total_revenue).toBe(0)
    expect(pnl.vat_recorded).toBe(0)
  })

  it('it never works VAT out itself: no recorded tax_amount, nothing is taken off', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      invoices: [{ id: 'inv-1', total_amount: 1140, amount_paid: 0, status: 'sent' }],
    }))
    expect(pnl.total_revenue).toBe(1140)
  })
})

describe('realized revenue is net of VAT too', () => {
  it('a 570 payment on the 1,140 invoice is worth 500 of revenue', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      payments: [{ invoice_id: 'inv-1', amount: 570, currency: 'EUR', payment_date: '2026-07-01' }],
    }))
    expect(pnl.realized_revenue).toBeCloseTo(500, 5)
  })

  it('a payment on a cancelled invoice still counts (the money moved), net of its VAT', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      invoices: [{ id: 'inv-1', total_amount: 1140, tax_amount: 140, amount_paid: 0, status: 'cancelled' }],
      payments: [{ invoice_id: 'inv-1', amount: 1140, currency: 'EUR', payment_date: '2026-07-01' }],
    }))
    expect(pnl.realized_revenue).toBeCloseTo(1000, 5)
  })

  it('a payment on an invoice without VAT is whole', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      invoices: [{ id: 'inv-1', total_amount: 1000, tax_amount: 0, amount_paid: 0, status: 'sent' }],
      payments: [{ invoice_id: 'inv-1', amount: 400, currency: 'EUR', payment_date: '2026-07-01' }],
    }))
    expect(pnl.realized_revenue).toBe(400)
  })
})

describe('netShareOfInvoice', () => {
  it('is net over total', () => {
    expect(netShareOfInvoice({ total_amount: 1140, tax_amount: 140 })).toBeCloseTo(1000 / 1140, 8)
  })
  it('is 1 with no VAT, no total, or a nonsense tax amount', () => {
    expect(netShareOfInvoice({ total_amount: 1000, tax_amount: 0 })).toBe(1)
    expect(netShareOfInvoice({ total_amount: 0, tax_amount: 0 })).toBe(1)
    expect(netShareOfInvoice({ total_amount: 100, tax_amount: 150 })).toBe(1)
  })
})

describe('cancelled commissions', () => {
  const payable = (over = {}) => ({
    itinerary_id: 'itin-1', commission_type: 'payable', commission_amount: 100, currency: 'EUR',
    transaction_date: '2026-07-01', status: 'pending', description: 'Agent', ...over,
  })

  it('a cancelled payable commission leaves net profit equal to gross profit', () => {
    const { pnl } = computeTripPnL(FX, inputs({ commissions: [payable({ status: 'cancelled' })] }))
    expect(pnl.agent_commissions).toBe(0)
    expect(pnl.net_profit).toBe(pnl.gross_profit)
    expect(pnl.commission_count).toBe(0)
  })

  it('a cancelled receivable is not reported as owed to us', () => {
    const { pnl } = computeTripPnL(FX, inputs({ commissions: [payable({ commission_type: 'receivable', status: 'cancelled' })] }))
    expect(pnl.supplier_commissions_receivable).toBe(0)
  })

  it('a cancelled commission with no rate does not raise an FX hole', () => {
    const { pnl } = computeTripPnL(FX, inputs({ commissions: [payable({ status: 'cancelled', currency: 'JPY' })] }))
    expect(pnl.fx_complete).toBe(true)
  })

  it('a pending one still comes off', () => {
    const { pnl } = computeTripPnL(FX, inputs({ commissions: [payable(), payable({ status: 'cancelled' })] }))
    expect(pnl.agent_commissions).toBe(100)
    expect(pnl.net_profit).toBe(pnl.gross_profit - 100)
  })
})

describe('the aggregate leaves out trips that are not business yet', () => {
  it('draft and cancelled', () => {
    expect([...PNL_EXCLUDED_STATUSES]).toEqual(['draft', 'cancelled'])
  })
})

describe('the Tax tab reads only what invoices recorded', () => {
  const inv = (over = {}) => ({ currency: 'EUR', status: 'sent', total_amount: 1140, tax_amount: 140, tax_rate: 14, vat_applied: true, ...over })

  it('sums recorded VAT per currency and rate, never from a rate', () => {
    const r = buildVatReport([
      inv(),
      inv({ total_amount: 570, tax_amount: 70 }),
      inv({ currency: 'JPY', total_amount: 11400, tax_amount: 1400 }),
    ])
    const eur = r.currencies.find(c => c.currency === 'EUR')!
    expect(eur.vat).toBe(210)
    expect(eur.net).toBe(1500)
    expect(eur.total).toBe(1710)
    expect(eur.by_rate).toEqual([{ rate: 14, invoices: 2, net: 1500, vat: 210, total: 1710, excluded_extras: 0 }])
    expect(r.currencies.find(c => c.currency === 'JPY')!.vat).toBe(1400)
  })

  it('counts invoices without VAT and adds no VAT for them', () => {
    const r = buildVatReport([inv(), inv({ total_amount: 1000, tax_amount: 0, tax_rate: 0, vat_applied: false })])
    expect(r.not_applied_count).toBe(1)
    const eur = r.currencies[0]
    expect(eur.not_applied).toBe(1)
    expect(eur.not_applied_net).toBe(1000)
    expect(eur.vat).toBe(140)
  })

  it('leaves drafts and cancelled invoices out', () => {
    const r = buildVatReport([inv({ status: 'draft' }), inv({ status: 'cancelled' }), inv()])
    expect(r.invoice_count).toBe(1)
    expect(r.currencies[0].vat).toBe(140)
  })

  it('counts invoices that left extras or insurance out of the base', () => {
    const r = buildVatReport([inv({ vat_base: 900, tax_amount: 126, total_amount: 1126 })])
    expect(r.currencies[0].excluded_extras).toBe(1)
    expect(r.currencies[0].by_rate[0].excluded_extras).toBe(1)
  })

  it('keeps different recorded rates apart', () => {
    const r = buildVatReport([inv(), inv({ tax_rate: 10, tax_amount: 100, total_amount: 1100 })])
    expect(r.currencies[0].by_rate.map(l => l.rate)).toEqual([14, 10])
  })
})
