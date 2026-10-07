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
