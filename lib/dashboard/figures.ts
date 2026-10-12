// ============================================
// The dashboard's arithmetic, pure — what the summary, money and attention
// routes compute from the rows they read
// ============================================
// Kept out of the routes so the rules can be pinned without a database
// (__tests__/lib/dashboard-figures.test.ts). Pure and client-safe.

import { roleAllows } from '@/lib/auth/roles'

export type CurrencyTotals = Record<string, number>

/** Money is summed PER CURRENCY and never across them (house rule from
 *  accounts-payable). A row without a currency is the schema default, EUR. */
export function addTo(t: CurrencyTotals, currency: string | null | undefined, amount: number | string | null | undefined) {
  const c = currency || 'EUR'
  t[c] = (t[c] || 0) + Number(amount || 0)
}

/** Outstanding receivables, and the part of them past due. Overdue means the
 *  due date is BEFORE today: an invoice due today is still current, which is
 *  how /api/accounts-receivable ages it. */
export function receivableTotals(
  invoices: readonly { balance_due: number | string | null; currency: string | null; due_date: string | null }[],
  today: string,
): { totals: CurrencyTotals; overdue: CurrencyTotals } {
  const totals: CurrencyTotals = {}
  const overdue: CurrencyTotals = {}
  for (const inv of invoices) {
    addTo(totals, inv.currency, inv.balance_due)
    if (inv.due_date && inv.due_date.slice(0, 10) < today) addTo(overdue, inv.currency, inv.balance_due)
  }
  return { totals, overdue }
}

/** Supplier bills that are not already counted as an unpaid expense. Matching
 *  a bill (supplier_invoice_expenses) links it to the expenses it pays for;
 *  those expenses are summed on their own, so adding the bill as well counted
 *  the same money twice. Only a bill with no linked expense adds anything. */
export function billsWithoutExpenses<T extends { id: string }>(
  bills: readonly T[],
  links: readonly { supplier_invoice_id: string }[],
): T[] {
  const linked = new Set(links.map(l => l.supplier_invoice_id))
  return bills.filter(b => !linked.has(b.id))
}

/** Money in, net of money handed back. A refund is a payments row with
 *  payment_type 'refund' and a POSITIVE amount (the booking ledger and
 *  lib/booking-extras subtract it the same way). `count` is the payments
 *  received, `refundCount` the refunds netted out of the total. */
export function netReceived(
  payments: readonly { amount: number | string | null; currency: string | null; payment_type?: string | null }[],
): { totals: CurrencyTotals; count: number; refundCount: number } {
  const totals: CurrencyTotals = {}
  let count = 0
  let refundCount = 0
  for (const p of payments) {
    if (p.payment_type === 'refund') {
      addTo(totals, p.currency, -Number(p.amount || 0))
      refundCount += 1
    } else {
      addTo(totals, p.currency, p.amount)
      count += 1
    }
  }
  return { totals, count, refundCount }
}

/** The quote pipeline. A completed trip was sent and confirmed on its way to
 *  completing, so it counts in both — leaving it out made the conversion rate
 *  fall every time a trip finished. */
export function quotePipeline(rows: readonly { status: string | null }[]): { sent: number; confirmed: number } {
  const SENT = ['sent', 'confirmed', 'completed']
  const CONFIRMED = ['confirmed', 'completed']
  return {
    sent: rows.filter(q => SENT.includes(q.status || '')).length,
    confirmed: rows.filter(q => CONFIRMED.includes(q.status || '')).length,
  }
}

/** Staff: the roles the /api/email and /api/itineraries gates admit. */
export const STAFF_ROLES = ['admin', 'manager', 'agent']
/** Who sees money: the roles the money row (/api/dashboard/money) admits. */
export const MONEY_ROLES = ['admin', 'manager']

interface RoleShapedItem {
  type: string
  detail: Record<string, unknown>
  currency?: string | null
}

/** What of the Needs attention list a role may see. The dashboard is open to
 *  viewers, so it must not hand them what their own pages refuse: customer
 *  emails (names and subjects) are staff-only behind /api/email, and amounts
 *  are manager-and-up like the money row. A balance row stays — that a
 *  booking's balance is due is operational — but without the figure. Run it
 *  AFTER the dismiss key and fingerprint are computed, so a dismissal reads
 *  the same whoever made it. */
export function attentionForRole<T extends RoleShapedItem>(items: readonly T[], role: string | null | undefined): T[] {
  const staff = roleAllows(role, STAFF_ROLES)
  const money = roleAllows(role, MONEY_ROLES)
  const out: T[] = []
  for (const item of items) {
    if (item.type === 'reply_overdue' && !staff) continue
    if (item.type === 'balance_due' && !money) {
      const detail = { ...item.detail }
      delete detail.balanceDue
      out.push({ ...item, detail, currency: null })
      continue
    }
    out.push(item)
  }
  return out
}
