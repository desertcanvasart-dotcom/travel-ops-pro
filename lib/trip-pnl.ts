// ============================================
// TRIP P&L — the money math, as a pure function
// ============================================
// Extracted from app/api/profit-loss so it can be tested directly. Everything
// here is pure: rows in, numbers out, no database. The route does the fetching.
//
// THREE LAYERS, kept apart on purpose:
//
//   quoted    — total_cost. What we told the client. An intention.
//   accrued   — invoiced revenue, less supplier_cost + expenses. supplier_cost
//               is a PRICING ESTIMATE, not a bill anyone sent us.
//   realized  — cash that actually moved: payments received, expenses marked
//               paid, commissions paid out. No estimates in it at all.
//
// Collapsing these into one "profit" number is what made the old report
// misleading: an estimate and a bank movement were added together and presented
// with the same confidence.
//
// AGENT COMMISSIONS. A trip sold through an agent pays that agent out of our
// margin. `net_profit` is gross less every payable commission — that is the
// money the business keeps. Receivable commissions (what suppliers owe US) are
// reported but never added: owed is not earned, and adding it would flatter
// every trip by money that may never arrive.
//
// FX. Each line is converted at the rate on ITS OWN date, per lib/fx-report.
// A line with no usable rate is EXCLUDED and recorded as a hole — never summed
// at face value, which would overstate an EGP cost ~56x in a EUR trip.

import { convertLine, emptyFxSummary, type FxHole, type FxIndex } from './fx-report'
import { type FxSummary } from './fx-conversion'

/** Commission statuses that mean the money has actually moved. */
export const COMMISSION_PAID_STATUSES = new Set(['paid', 'received', 'settled'])

export const REALIZED_BASIS =
  'Payments received, expenses marked paid, and commissions paid out — each converted at the rate on its own date. Excludes supplier_cost, which is a pricing estimate rather than a payment.'

export interface PnLItinerary {
  id: string
  itinerary_code?: string | null
  trip_name?: string | null
  client_name?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  currency?: string | null
  total_cost?: number | string | null
  /** Stored in the trip's own currency by construction — needs no conversion. */
  supplier_cost?: number | string | null
}

export interface PnLInvoice {
  id?: string | null
  itinerary_id?: string | null
  total_amount?: number | string | null
  amount_paid?: number | string | null
  status?: string | null
}

export interface PnLPayment {
  invoice_id?: string | null
  amount?: number | string | null
  currency?: string | null
  payment_date?: string | null
  transaction_reference?: string | null
}

export interface PnLExpense {
  itinerary_id?: string | null
  amount?: number | string | null
  category?: string | null
  status?: string | null
  currency?: string | null
  expense_date?: string | null
  expense_number?: string | null
}

export interface PnLCommission {
  itinerary_id?: string | null
  /** 'payable' = we owe an agent. Anything else is treated as receivable. */
  commission_type?: string | null
  commission_amount?: number | string | null
  currency?: string | null
  transaction_date?: string | null
  status?: string | null
  description?: string | null
  category?: string | null
}

export interface TripPnL {
  itinerary_id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  status: string
  currency: string
  quoted_amount: number
  total_revenue: number
  total_paid: number
  supplier_cost: number
  manual_expenses: number
  total_expenses: number
  expenses_paid: number
  expenses_pending: number
  gross_profit: number
  profit_margin: number
  expense_breakdown: Record<string, number>
  invoice_count: number
  expense_count: number

  agent_commissions: number
  agent_commissions_paid: number
  supplier_commissions_receivable: number
  commission_count: number
  net_profit: number
  net_margin: number

  realized_revenue: number
  realized_cost: number
  realized_profit: number
  realized_margin: number
  realized_basis: string

  fx_holes: FxHole[]
  fx_complete: boolean
}

export interface TripPnLInputs {
  itinerary: PnLItinerary
  /** Only this trip's rows; the caller filters. */
  invoices: PnLInvoice[]
  payments: PnLPayment[]
  expenses: PnLExpense[]
  commissions: PnLCommission[]
}

export interface TripPnLResult {
  pnl: TripPnL
  /** This trip's FX basis tally, for folding into a response-level total. */
  fx: FxSummary
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

/**
 * Compute one trip's P&L.
 *
 * `fxIndex` is the shared rate history — load it once per request, not per trip.
 */
export function computeTripPnL(fxIndex: FxIndex, inputs: TripPnLInputs): TripPnLResult {
  const { itinerary, invoices, payments, expenses, commissions } = inputs

  const tripCurrency = (itinerary.currency || 'EUR').toUpperCase()
  const fx = emptyFxSummary()
  const holes: FxHole[] = []

  // ---- Invoiced revenue -------------------------------------------------
  // Invoice totals are not converted: they are raised in the trip's currency,
  // and amount_paid is a running total with no date to convert on. The realized
  // layer below uses the payment rows instead, which DO carry a date.
  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
  const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

  // ---- Expenses ---------------------------------------------------------
  let manualExpenses = 0
  let expensesPaid = 0
  let expensesPending = 0
  const expenseBreakdown: Record<string, number> = {}

  for (const exp of expenses) {
    const { amount, hole } = convertLine(fxIndex, fx, {
      amount: exp.amount,
      fromCurrency: exp.currency,
      toCurrency: tripCurrency,
      date: exp.expense_date,
      kind: 'expense',
      reference: exp.expense_number || exp.category || 'expense',
    })

    if (hole) {
      holes.push(hole)
      continue
    }

    const value = amount ?? 0
    manualExpenses += value
    if (exp.status === 'paid') expensesPaid += value
    // 'rejected' is excluded from pending: a rejected expense is not owed.
    if (exp.status !== 'paid' && exp.status !== 'rejected') expensesPending += value

    const cat = exp.category || 'other'
    expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + value
  }

  const supplierCost = Number(itinerary.supplier_cost || 0)
  const totalExpenses = supplierCost + manualExpenses
  if (supplierCost > 0) expenseBreakdown['supplier_services'] = supplierCost

  // ---- Commissions ------------------------------------------------------
  let agentCommissions = 0
  let agentCommissionsPaid = 0
  let supplierCommissionsReceivable = 0

  for (const comm of commissions) {
    const { amount, hole } = convertLine(fxIndex, fx, {
      amount: comm.commission_amount,
      fromCurrency: comm.currency,
      toCurrency: tripCurrency,
      date: comm.transaction_date,
      kind: 'commission',
      reference: comm.description || comm.category || 'commission',
    })

    if (hole) {
      // An unconvertible commission understates what we owe, so the trip is
      // flagged incomplete like any other hole rather than quietly ignored.
      holes.push(hole)
      continue
    }

    const value = amount ?? 0
    if (comm.commission_type === 'payable') {
      agentCommissions += value
      if (COMMISSION_PAID_STATUSES.has(String(comm.status || '').toLowerCase())) {
        agentCommissionsPaid += value
      }
    } else {
      supplierCommissionsReceivable += value
    }
  }

  if (agentCommissions > 0) expenseBreakdown['agent_commission'] = agentCommissions

  // ---- Realized: only money that actually moved -------------------------
  let realizedRevenue = 0
  for (const pay of payments) {
    const { amount, hole } = convertLine(fxIndex, fx, {
      amount: pay.amount,
      fromCurrency: pay.currency,
      toCurrency: tripCurrency,
      date: pay.payment_date,
      kind: 'revenue',
      reference: pay.transaction_reference || 'payment',
    })
    if (hole) {
      holes.push(hole)
      continue
    }
    realizedRevenue += amount ?? 0
  }

  // supplier_cost is deliberately absent: it is what the pricing engine
  // estimated, not a bill we paid. Including it would make "realized" mean the
  // same thing as "accrued" and hide the difference this layer exists to show.
  const realizedCost = expensesPaid + agentCommissionsPaid
  const realizedProfit = realizedRevenue - realizedCost

  // ---- Accrued ----------------------------------------------------------
  // Falls back to the quote when nothing has been invoiced yet, so a trip in
  // progress still reports a margin rather than a 100% loss.
  const revenueForCalc = totalRevenue > 0 ? totalRevenue : Number(itinerary.total_cost || 0)
  const grossProfit = revenueForCalc - totalExpenses
  const netProfit = grossProfit - agentCommissions

  return {
    fx,
    pnl: {
      itinerary_id: itinerary.id,
      itinerary_code: itinerary.itinerary_code || '',
      trip_name: itinerary.trip_name || '',
      client_name: itinerary.client_name || '',
      start_date: itinerary.start_date || '',
      end_date: itinerary.end_date || '',
      status: itinerary.status || 'draft',
      currency: tripCurrency,
      quoted_amount: Number(itinerary.total_cost || 0),
      total_revenue: totalRevenue,
      total_paid: totalPaid,
      supplier_cost: supplierCost,
      manual_expenses: manualExpenses,
      total_expenses: totalExpenses,
      expenses_paid: expensesPaid,
      expenses_pending: expensesPending,
      gross_profit: grossProfit,
      profit_margin: pct(grossProfit, revenueForCalc),
      expense_breakdown: expenseBreakdown,
      invoice_count: invoices.length,
      expense_count: expenses.length,

      agent_commissions: agentCommissions,
      agent_commissions_paid: agentCommissionsPaid,
      supplier_commissions_receivable: supplierCommissionsReceivable,
      commission_count: commissions.length,
      net_profit: netProfit,
      net_margin: pct(netProfit, revenueForCalc),

      realized_revenue: realizedRevenue,
      realized_cost: realizedCost,
      realized_profit: realizedProfit,
      realized_margin: pct(realizedProfit, realizedRevenue),
      realized_basis: REALIZED_BASIS,

      fx_holes: holes,
      fx_complete: holes.length === 0 && fx.unconverted === 0,
    },
  }
}
