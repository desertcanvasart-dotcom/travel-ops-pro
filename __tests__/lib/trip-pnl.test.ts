import { describe, it, expect } from 'vitest'
import { buildFxIndex, type FxSnapshotRow } from '@/lib/fx-conversion'
import {
  computeTripPnL,
  type PnLCommission,
  type PnLExpense,
  type PnLPayment,
  type TripPnLInputs,
} from '@/lib/trip-pnl'

// ============================================
// What these lock in:
//
//  1. An agent's commission comes OFF the margin. A trip whose gross looks
//     healthy but whose whole margin goes to the agent must not report as
//     profitable.
//  2. "Realized" means money that actually moved — it must NOT include
//     supplier_cost, which is a pricing estimate nobody has billed or paid.
//  3. Every line converts at the rate on ITS OWN date, and a line with no
//     usable rate is EXCLUDED and reported, never summed at face value.
// ============================================

const snap = (
  base: string,
  target: string,
  rate: number,
  capturedAt: string
): FxSnapshotRow => ({
  base_currency: base,
  target_currency: target,
  rate,
  captured_at: capturedAt,
  source: 'er-api',
})

// EGP weakened against EUR through 2026 — the reason a dated rate matters.
const FX = buildFxIndex([
  snap('EUR', 'EGP', 50, '2026-01-15T01:00:00Z'),
  snap('EUR', 'EGP', 56, '2026-06-15T01:00:00Z'),
  snap('EUR', 'USD', 1.1, '2026-01-15T01:00:00Z'),
])

const trip = (over: Partial<TripPnLInputs['itinerary']> = {}) => ({
  id: 'itin-1',
  itinerary_code: 'ITN-1',
  trip_name: 'Nile in 8 days',
  client_name: 'Acme Travel',
  start_date: '2026-07-01',
  end_date: '2026-07-08',
  status: 'confirmed',
  currency: 'EUR',
  total_cost: 10000,
  supplier_cost: 6000,
  ...over,
})

const inputs = (over: Partial<TripPnLInputs> = {}): TripPnLInputs => ({
  itinerary: trip(),
  invoices: [{ id: 'inv-1', itinerary_id: 'itin-1', total_amount: 10000, amount_paid: 0 }],
  payments: [],
  expenses: [],
  commissions: [],
  ...over,
})

const payable = (over: Partial<PnLCommission> = {}): PnLCommission => ({
  itinerary_id: 'itin-1',
  commission_type: 'payable',
  commission_amount: 1000,
  currency: 'EUR',
  transaction_date: '2026-07-01',
  status: 'pending',
  description: 'Agent commission',
  ...over,
})

const expense = (over: Partial<PnLExpense> = {}): PnLExpense => ({
  itinerary_id: 'itin-1',
  amount: 500,
  category: 'guide',
  status: 'pending',
  currency: 'EUR',
  expense_date: '2026-07-01',
  expense_number: 'EXP-1',
  ...over,
})

const payment = (over: Partial<PnLPayment> = {}): PnLPayment => ({
  invoice_id: 'inv-1',
  amount: 4000,
  currency: 'EUR',
  payment_date: '2026-07-01',
  transaction_reference: 'PAY-1',
  ...over,
})

describe('agent commissions come off the margin', () => {
  it('subtracts payable commissions from gross to give net', () => {
    const { pnl } = computeTripPnL(FX, inputs({ commissions: [payable()] }))

    expect(pnl.gross_profit).toBe(4000)      // 10,000 revenue − 6,000 supplier cost
    expect(pnl.agent_commissions).toBe(1000)
    expect(pnl.net_profit).toBe(3000)
    expect(pnl.net_margin).toBeCloseTo(30, 6)
  })

  it('a trip whose whole margin goes to the agent is NOT profitable', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({ commissions: [payable({ commission_amount: 4200 })] })
    )

    // The headline still looks fine — that is exactly the trap.
    expect(pnl.gross_profit).toBe(4000)
    expect(pnl.profit_margin).toBeGreaterThan(0)
    // But we kept nothing; we lost money.
    expect(pnl.net_profit).toBe(-200)
    expect(pnl.net_margin).toBeLessThan(0)
  })

  it('sums several payable commissions and tracks how much is already paid', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        commissions: [
          payable({ commission_amount: 600, status: 'paid' }),
          payable({ commission_amount: 400, status: 'pending' }),
        ],
      })
    )

    expect(pnl.agent_commissions).toBe(1000)
    expect(pnl.agent_commissions_paid).toBe(600)
    expect(pnl.commission_count).toBe(2)
  })

  it('reports receivable commissions but never adds them — owed is not earned', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        commissions: [payable({ commission_type: 'receivable', commission_amount: 800 })],
      })
    )

    expect(pnl.supplier_commissions_receivable).toBe(800)
    expect(pnl.agent_commissions).toBe(0)
    // The receivable must NOT inflate the margin.
    expect(pnl.net_profit).toBe(pnl.gross_profit)
    expect(pnl.net_profit).toBe(4000)
  })

  it('converts a foreign-currency commission at the rate on its own date', () => {
    // 28,000 EGP on 2026-07-01 → the 15 Jun rate of 56, i.e. €500.
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        commissions: [payable({ commission_amount: 28000, currency: 'EGP' })],
      })
    )

    expect(pnl.agent_commissions).toBeCloseTo(500, 2)
    expect(pnl.net_profit).toBeCloseTo(3500, 2)
    expect(pnl.fx_complete).toBe(true)
  })

  it('excludes an unconvertible commission and says so, rather than guessing', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        commissions: [
          payable({ commission_amount: 100000, currency: 'JPY', transaction_date: '2026-07-01' }),
        ],
      })
    )

    // Never added at face value — ¥100,000 as "€100,000" would invert the trip.
    expect(pnl.agent_commissions).toBe(0)
    expect(pnl.net_profit).toBe(4000)
    // ...but the report refuses to look settled.
    expect(pnl.fx_complete).toBe(false)
    expect(pnl.fx_holes).toHaveLength(1)
    expect(pnl.fx_holes[0].kind).toBe('commission')
  })

  it('shows the commission in the expense breakdown so the cost is visible', () => {
    const { pnl } = computeTripPnL(FX, inputs({ commissions: [payable()] }))
    expect(pnl.expense_breakdown.agent_commission).toBe(1000)
  })
})

describe('realized: only money that actually moved', () => {
  it('excludes supplier_cost — an estimate is not a payment', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        payments: [payment({ amount: 4000 })],
        expenses: [expense({ amount: 500, status: 'paid' })],
      })
    )

    expect(pnl.supplier_cost).toBe(6000) // present in the accrued layer...
    expect(pnl.realized_cost).toBe(500)  // ...and deliberately absent here
    expect(pnl.realized_revenue).toBe(4000)
    expect(pnl.realized_profit).toBe(3500)
  })

  it('counts only expenses actually marked paid', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        payments: [payment()],
        expenses: [
          expense({ amount: 500, status: 'paid', expense_number: 'EXP-1' }),
          expense({ amount: 900, status: 'pending', expense_number: 'EXP-2' }),
        ],
      })
    )

    expect(pnl.manual_expenses).toBe(1400) // accrued: both
    expect(pnl.expenses_paid).toBe(500)
    expect(pnl.expenses_pending).toBe(900)
    expect(pnl.realized_cost).toBe(500)    // realized: only the paid one
  })

  it('counts only commissions actually paid out', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        payments: [payment()],
        commissions: [
          payable({ commission_amount: 600, status: 'paid' }),
          payable({ commission_amount: 400, status: 'pending' }),
        ],
      })
    )

    expect(pnl.agent_commissions).toBe(1000) // owed
    expect(pnl.realized_cost).toBe(600)      // actually gone out of the bank
    expect(pnl.realized_profit).toBe(3400)
  })

  it('converts each payment at the rate on ITS OWN date, not one blended rate', () => {
    // 25,000 EGP in January (rate 50) is €500; the same 25,000 EGP in July
    // (rate 56) is only €446.43. Using one rate for both would misstate revenue.
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        payments: [
          payment({ amount: 25000, currency: 'EGP', payment_date: '2026-01-20' }),
          payment({ amount: 25000, currency: 'EGP', payment_date: '2026-07-20' }),
        ],
      })
    )

    expect(pnl.realized_revenue).toBeCloseTo(500 + 25000 / 56, 2)
    expect(pnl.realized_revenue).not.toBeCloseTo(1000, 1)
  })

  it('is zero, not negative, on a trip where no money has moved at all', () => {
    const { pnl } = computeTripPnL(FX, inputs())
    expect(pnl.realized_revenue).toBe(0)
    expect(pnl.realized_cost).toBe(0)
    expect(pnl.realized_profit).toBe(0)
    expect(pnl.realized_margin).toBe(0) // not NaN or Infinity
  })

  it('excludes an unconvertible payment instead of overstating cash received', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({
        payments: [payment({ amount: 100000, currency: 'JPY', payment_date: '2026-07-01' })],
      })
    )

    expect(pnl.realized_revenue).toBe(0)
    expect(pnl.fx_complete).toBe(false)
    expect(pnl.fx_holes[0].kind).toBe('revenue')
  })
})

describe('accrued layer keeps its existing behaviour', () => {
  it('falls back to the quote when nothing has been invoiced yet', () => {
    const { pnl } = computeTripPnL(FX, inputs({ invoices: [] }))
    // Without the fallback an un-invoiced trip would read as a 6,000 loss.
    expect(pnl.total_revenue).toBe(0)
    expect(pnl.gross_profit).toBe(4000)
    expect(pnl.profit_margin).toBeCloseTo(40, 6)
  })

  it('does not divide by zero on a trip with no revenue at all', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({ itinerary: trip({ total_cost: 0, supplier_cost: 0 }), invoices: [] })
    )
    expect(pnl.profit_margin).toBe(0)
    expect(pnl.net_margin).toBe(0)
    expect(Number.isFinite(pnl.profit_margin)).toBe(true)
  })

  it('rejected expenses are neither paid nor pending', () => {
    const { pnl } = computeTripPnL(
      FX,
      inputs({ expenses: [expense({ amount: 500, status: 'rejected' })] })
    )
    expect(pnl.expenses_paid).toBe(0)
    expect(pnl.expenses_pending).toBe(0)
  })

  it('keeps the trip currency on the output', () => {
    const { pnl } = computeTripPnL(FX, inputs({ itinerary: trip({ currency: 'usd' }) }))
    expect(pnl.currency).toBe('USD')
  })
})

// ============================================
// Extras and upgrades
// ============================================
// They are sold after the trip was priced and never touch the itinerary, so
// without them the report earns what an extra brings in and knows nothing of
// what it cost — every extra reading as pure profit.

describe('extras and upgrades', () => {
  const extra = (over: Record<string, unknown> = {}) => ({
    title: 'Business class, Cairo–Aswan',
    quantity: 1,
    unit_price: 820,
    currency: 'EUR',
    supplier_cost: 600,
    supplier_currency: 'EUR',
    confirmed_at: '2026-06-20T10:00:00Z',
    ...over,
  })

  it('changes nothing on a trip that has none', () => {
    const withNone = computeTripPnL(FX, inputs()).pnl
    const withEmpty = computeTripPnL(FX, inputs({ extras: [] })).pnl
    expect(withEmpty).toEqual(withNone)
    expect(withNone.extras_revenue).toBe(0)
  })

  it('counts what the extra cost us, so the margin is not a lie', () => {
    const base = computeTripPnL(FX, inputs()).pnl
    const { pnl } = computeTripPnL(FX, inputs({ extras: [extra()] }))

    expect(pnl.extras_supplier_cost).toBe(600)
    expect(pnl.supplier_cost).toBe(base.supplier_cost + 600)
    expect(pnl.extras_revenue).toBe(820)
    // Quoted follows too, or quoted and invoiced diverge by the extras.
    expect(pnl.quoted_amount).toBe(base.quoted_amount + 820)
  })

  it('multiplies the price by the quantity', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      extras: [extra({ quantity: 2, unit_price: 340, supplier_cost: 250 })],
    }))
    expect(pnl.extras_revenue).toBe(680)
    expect(pnl.extras_supplier_cost).toBe(250) // a cost is per extra, not per unit
  })

  it('counts an extra with no supplier cost as revenue only, never as zero cost', () => {
    const { pnl } = computeTripPnL(FX, inputs({ extras: [extra({ supplier_cost: null })] }))
    expect(pnl.extras_revenue).toBe(820)
    expect(pnl.extras_supplier_cost).toBe(0)
  })

  it('converts a foreign extra at the rate on the day it was confirmed', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      extras: [extra({
        unit_price: 5600, currency: 'EGP',
        supplier_cost: 2800, supplier_currency: 'EGP',
        confirmed_at: '2026-06-20T10:00:00Z',
      })],
    }))
    // June rate is 56 EGP to the euro, not January's 50.
    expect(pnl.extras_revenue).toBe(100)
    expect(pnl.extras_supplier_cost).toBe(50)
  })

  it('excludes an extra it cannot convert and reports it as a hole', () => {
    const { pnl } = computeTripPnL(FX, inputs({
      extras: [extra({ title: 'Desert camp', currency: 'ZAR', supplier_currency: 'ZAR' })],
    }))
    expect(pnl.extras_revenue).toBe(0)
    expect(pnl.extras_supplier_cost).toBe(0)
    expect(pnl.fx_holes.some(h => h.reference === 'Desert camp')).toBe(true)
    expect(pnl.fx_complete).toBe(false)
  })
})
