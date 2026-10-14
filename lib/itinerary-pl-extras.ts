// ============================================
// The trip card's extra expenses, converted like the P&L converts them
// ============================================
// The card converted a foreign-currency extra expense with a hardcoded table of
// fallback rates (getFallbackRates), a rate nobody captured, while the Profit &
// Loss page converts the same expense at the rate on ITS OWN date from the
// stored history (lib/fx-report.ts), so one trip showed two margins. This is
// the P&L's conversion: an expense with no rate is LEFT OUT and reported, never
// converted at a made-up rate and never added at face value.

import { convertLine, emptyFxSummary, type FxHole, type FxIndex } from './fx-report'
import { EXPENSE_NOT_A_COST_STATUSES } from './expense-status'

export interface TripExtraExpense {
  amount?: unknown
  currency?: string | null
  expense_date?: string | null
  category?: string | null
  expense_number?: string | null
  status?: string | null
  booking_supplier_status_id?: string | null
}

export interface TripExtrasConverted {
  /** Sum of the converted extras, in the trip's currency. */
  total: number
  /** How many were converted into the total. */
  count: number
  /** Extras with no usable rate: NOT in the total. */
  missing: FxHole[]
}

/**
 * The trip's own extra expenses in the trip's currency. Rejected and cancelled
 * ones are not a cost, and a booking supplier's confirmed cost is the same money
 * as the supplier cost already counted: both are left out, as in the P&L.
 */
export function convertTripExtras(index: FxIndex, expenses: TripExtraExpense[], tripCurrency: string): TripExtrasConverted {
  const fx = emptyFxSummary()
  const missing: FxHole[] = []
  let total = 0
  let count = 0
  for (const exp of expenses) {
    if (exp.booking_supplier_status_id) continue
    if ((EXPENSE_NOT_A_COST_STATUSES as readonly string[]).includes(exp.status ?? '')) continue
    const { amount, hole } = convertLine(index, fx, {
      amount: exp.amount,
      fromCurrency: exp.currency,
      toCurrency: tripCurrency,
      date: exp.expense_date,
      kind: 'expense',
      reference: exp.expense_number || exp.category || 'expense',
    })
    if (hole) {
      missing.push(hole)
      continue
    }
    total += amount ?? 0
    count += 1
  }
  return { total, count, missing }
}
