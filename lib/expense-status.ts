// ============================================
// An expense's payment date follows its status
// ============================================
// Setting an expense to paid left payment_date empty unless the caller sent
// one, and moving it back to pending or approved left the old date behind —
// Payables and cash flow read both. Ported from autoura-saas (#573).
//
// Paid: the date given, else the one it already has, else today (the
// server's day — every button in the app sends the operator's own). Any
// other status: none.

import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'
import { RATE_CURRENCIES } from '@/lib/org-rate-currency'

const DAY = /^\d{4}-\d{2}-\d{2}/

/** The payment_date an expense moving to `status` should carry. */
export function paymentDateForStatus(
  status: string,
  given?: unknown,
  existing?: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  if (status !== 'paid') return null
  if (typeof given === 'string' && DAY.test(given)) return given.slice(0, 10)
  if (existing && DAY.test(existing)) return existing.slice(0, 10)
  return today
}

/** Paying a supplier invoice settles only the expenses still owed: a rejected
 *  one was never owed, and a paid one keeps its own payment. */
export const PAYABLE_EXPENSE_STATUSES = ['pending', 'approved'] as const

// ============================================
// What an expense may hold
// ============================================
// expenses has no CHECK on status, category or currency, and only the PUT
// checked status. A POST with status "foo" was stored, showed as Pending, and
// the P&L counted it as a live cost (it skips only rejected and cancelled).
// Both routes check the same lists now.

export const EXPENSE_STATUSES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'] as const

/** Statuses that are not a cost of the business: totals and the P&L leave them out. */
export const EXPENSE_NOT_A_COST_STATUSES = ['rejected', 'cancelled'] as const

const CATEGORY_VALUES = EXPENSE_CATEGORIES.map(c => c.value)

/**
 * The first problem with the status, category and currency a caller sent, or
 * null. Absent fields pass (a partial PUT); the routes require what they need.
 * A currency is one of the company's rate currencies.
 */
export function expenseFieldError(body: { status?: unknown; category?: unknown; currency?: unknown }): string | null {
  if (body.status !== undefined && !(EXPENSE_STATUSES as readonly string[]).includes(body.status as string)) {
    return `status must be one of: ${EXPENSE_STATUSES.join(', ')}`
  }
  if (body.category !== undefined && !CATEGORY_VALUES.includes(body.category as string)) {
    return `category must be one of: ${CATEGORY_VALUES.join(', ')}`
  }
  if (body.currency !== undefined && body.currency !== null && body.currency !== '') {
    const code = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''
    if (!(RATE_CURRENCIES as readonly string[]).includes(code)) {
      return `currency must be one of: ${RATE_CURRENCIES.join(', ')}`
    }
  }
  return null
}

/**
 * Why an expense may not be deleted, or null. A paid expense is money that
 * moved and an expense matched to a supplier invoice is part of that
 * invoice's settlement (deleting it cascaded the match away); both are
 * cancelled or rejected instead, which keeps the record.
 */
export function expenseDeleteBlock(expense: { status?: string | null }, matchedInvoices: number): string | null {
  if (expense.status === 'paid') {
    return 'This expense is paid. A paid expense is a record of money that moved, so it cannot be deleted. Set it to Cancelled instead.'
  }
  if (matchedInvoices > 0) {
    return `This expense is matched to ${matchedInvoices === 1 ? 'a supplier invoice' : `${matchedInvoices} supplier invoices`}. Unmatch it there first, or set it to Cancelled instead.`
  }
  return null
}
