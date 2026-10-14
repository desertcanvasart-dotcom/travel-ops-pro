// ============================================
// What an invoice counts as, on every finance screen
// ============================================
// "Overdue" is never stored (nothing writes status 'overdue'); it is a sent
// invoice whose due date has passed with money still owing. The Invoices page
// worked it out one way (a draft past its date counted), the Payments page
// another, and the status filter asked the database for a status that does
// not exist. One rule, here: the API answers with it (display_status, and
// ?status=overdue) and the pages use the same function.
//
// A draft was never sent, so nothing is owed on it yet, and a cancelled
// invoice is not owed at all: neither is Billed, Outstanding or Overdue.
import { addToTotals, emptyTotals, type CurrencyTotals } from '@/lib/currency-totals'

/** Statuses an invoice can be overdue from: it has been sent and is not settled. */
export const OVERDUE_ELIGIBLE_STATUSES = ['sent', 'viewed', 'partial', 'overdue'] as const

/** Statuses whose amounts are not receivable: never sent, or withdrawn. */
const NOT_RECEIVABLE = ['draft', 'cancelled']

export interface InvoiceLike {
  status?: string | null
  due_date?: string | null
  balance_due?: unknown
  total_amount?: unknown
  amount_paid?: unknown
  currency?: string | null
}

/** Owed, sent, and past its due date. `today` is YYYY-MM-DD. */
export function isOverdue(inv: InvoiceLike, today: string): boolean {
  if (!inv.due_date || !(OVERDUE_ELIGIBLE_STATUSES as readonly string[]).includes(String(inv.status))) return false
  return String(inv.due_date).slice(0, 10) < today && (Number(inv.balance_due) || 0) > 0
}

/** The status the screens show: 'overdue' when it is, else the stored one. */
export function displayStatus(inv: InvoiceLike, today: string): string {
  return isOverdue(inv, today) ? 'overdue' : String(inv.status ?? '')
}

/** Is this invoice part of what the company has billed and is owed? */
export function isReceivable(inv: InvoiceLike): boolean {
  return !NOT_RECEIVABLE.includes(String(inv.status))
}

/** The money tiles of the Invoices page: per currency, drafts and cancelled left out. */
export function invoiceTiles(invoices: InvoiceLike[], today: string): {
  billed: CurrencyTotals
  paid: CurrencyTotals
  outstanding: CurrencyTotals
  overdue: CurrencyTotals
} {
  const billed = emptyTotals()
  const paid = emptyTotals()
  const outstanding = emptyTotals()
  const overdue = emptyTotals()
  for (const inv of invoices) {
    if (!isReceivable(inv)) continue
    addToTotals(billed, inv.total_amount, inv.currency)
    addToTotals(paid, inv.amount_paid, inv.currency)
    addToTotals(outstanding, inv.balance_due, inv.currency)
    if (isOverdue(inv, today)) addToTotals(overdue, inv.balance_due, inv.currency)
  }
  return { billed, paid, outstanding, overdue }
}

/** The Payments page's Pending tile: sent invoices still owing, drafts and overdue ones apart. */
export function pendingInvoice(inv: InvoiceLike): boolean {
  return ['sent', 'partial', 'viewed'].includes(String(inv.status))
}
