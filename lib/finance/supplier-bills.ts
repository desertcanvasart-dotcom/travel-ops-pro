// ============================================
// Supplier bills (Supplier Invoices screen): the rules the routes share
// ============================================
// Pure functions, so each rule can be tested without a database. The routes
// under app/api/supplier-invoices call these; none of them touch Supabase
// except findDuplicateBill, which takes the client as an argument.

import type { SupabaseClient } from '@supabase/supabase-js'
import { PAYABLE_EXPENSE_STATUSES } from '@/lib/expense-status'

/** The bill statuses the database allows (supplier_invoices_status_check). */
export const BILL_STATUSES = ['received', 'matched', 'approved', 'paid', 'disputed', 'cancelled'] as const

/** A bill nobody has approved or paid can simply be deleted (its match rows go
 *  with it). Anything further along is cancelled instead, which keeps the trail. */
export const DELETABLE_BILL_STATUSES = ['received', 'matched'] as const
export const CANCELLABLE_BILL_STATUSES = ['received', 'matched', 'approved', 'disputed'] as const

/** Money amounts are compared to the cent, as the match route does. */
export const MATCH_TOLERANCE = 0.01

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

// ---- duplicates --------------------------------------------------------

export interface BillKey {
  supplier_invoice_number?: unknown
  supplier_name?: unknown
  supplier_id?: unknown
}

/** Same bill: the same number from the same supplier. The supplier is the same
 *  when the names agree (what the unique index keys on) or both rows point at
 *  one supplier record. */
export function isSameBill(a: BillKey, b: BillKey): boolean {
  if (!norm(a.supplier_invoice_number) || norm(a.supplier_invoice_number) !== norm(b.supplier_invoice_number)) return false
  if (norm(a.supplier_name) && norm(a.supplier_name) === norm(b.supplier_name)) return true
  return !!a.supplier_id && a.supplier_id === b.supplier_id
}

/** The recorded bill this one would duplicate, or null. Cancelled bills do not
 *  count (cancelling frees the number, as the unique index does). */
export async function findDuplicateBill(
  supabase: SupabaseClient,
  orgId: string,
  bill: BillKey,
  excludeId?: string,
): Promise<{ id: string; internal_reference: string | null; supplier_invoice_number: string } | null> {
  const number = String(bill.supplier_invoice_number ?? '').trim()
  if (!number) return null
  // ilike is case-insensitive; % _ and \ in the number are literals here.
  const pattern = number.replace(/[\\%_]/g, c => `\\${c}`)
  const { data } = await supabase
    .from('supplier_invoices')
    .select('id, internal_reference, supplier_invoice_number, supplier_name, supplier_id')
    .eq('org_id', orgId)
    .neq('status', 'cancelled')
    .ilike('supplier_invoice_number', pattern)
  const hit = (data || []).find(r => r.id !== excludeId && isSameBill(bill, r))
  return hit ? { id: hit.id, internal_reference: hit.internal_reference, supplier_invoice_number: hit.supplier_invoice_number } : null
}

export function duplicateBillMessage(bill: BillKey, existing: { internal_reference: string | null }): string {
  return `Invoice ${String(bill.supplier_invoice_number).trim()} from ${String(bill.supplier_name).trim()} is already recorded${existing.internal_reference ? ` (${existing.internal_reference})` : ''}`
}

/** Postgres unique_violation on the bill-number index (the race the pre-check
 *  cannot see: two saves at once). */
export function isBillNumberViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '23505' && /supplier_invoices_org_supplier_number_key/.test(error.message || '')
}

// ---- field validation --------------------------------------------------

/** Validate and normalise the numeric and date fields of a bill body in place.
 *  `partial` (PUT) only checks the keys present; POST checks them all. Returns
 *  an error message, or null. */
export function normalizeBillFields(body: Record<string, unknown>, partial: boolean): string | null {
  const present = (k: string) => !partial || k in body
  if (present('amount')) {
    const n = Number(body.amount)
    // '' and null would become 0 through Number(); an amount must be stated.
    if (body.amount === '' || body.amount === null || body.amount === undefined || !Number.isFinite(n) || n < 0) {
      // A negative amount flips the sign of what is owed and corrupts the
      // payables total. A credit note is a different document.
      return 'amount must be a non-negative number'
    }
    body.amount = n
  }
  if ('tax_amount' in body) {
    if (body.tax_amount === '' || body.tax_amount === null) body.tax_amount = 0
    const t = Number(body.tax_amount)
    if (!Number.isFinite(t) || t < 0) return 'tax_amount must be a non-negative number'
    body.tax_amount = t
  }
  // An emptied date input sends '' and a date column rejects it (500).
  for (const k of ['due_date', 'invoice_date']) {
    if (body[k] === '') body[k] = null
  }
  if (partial && 'invoice_date' in body && body.invoice_date === null) return 'invoice_date cannot be empty'
  return null
}

// ---- rate autofill -----------------------------------------------------

/** The unit price a supplier rate offers for a bill in `billCurrency`, or 0 when
 *  it is in another currency. The rate tables hold EUR figures
 *  (base_rate_eur / rate_eur) or a base_rate with its own currency; copying a
 *  EUR rate into a USD or EGP bill put a euro number on a dollar line. */
export function rateUnitPrice(
  rate: { base_rate_eur?: unknown; rate_eur?: unknown; base_rate?: unknown; currency?: unknown },
  billCurrency: string,
): number {
  const cur = String(billCurrency || '').toUpperCase()
  const eur = Number(rate.base_rate_eur || rate.rate_eur || 0)
  if (eur > 0 && cur === 'EUR') return eur
  const base = Number(rate.base_rate || 0)
  if (base > 0 && rate.currency && String(rate.currency).toUpperCase() === cur) return base
  return 0
}

// ---- disputes ----------------------------------------------------------

/** Where a bill goes when its dispute is resolved: back to the state its
 *  match says, never straight to approved. */
export function statusAfterDispute(matchStatus: string | null | undefined): 'matched' | 'received' {
  return matchStatus === 'matched' ? 'matched' : 'received'
}

// ---- matching ----------------------------------------------------------

export interface MatchableExpense {
  id: string
  status?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
}

export interface MatchRefusal { status: number; error: string; details: Record<string, unknown> }

/** Can these expenses be linked to this bill? The same supplier, still owed
 *  (pending or approved: a paid one is settled, a rejected one never was owed),
 *  and every id asked for must exist in this company. */
export function checkMatchableExpenses(
  bill: { supplier_id?: string | null; supplier_name?: string | null },
  requestedIds: readonly string[],
  found: readonly MatchableExpense[],
): MatchRefusal | null {
  const foundIds = new Set(found.map(e => e.id))
  const unknown = requestedIds.filter(id => !foundIds.has(id))
  if (unknown.length) {
    return { status: 404, error: 'Some expenses were not found', details: { expense_ids: unknown } }
  }
  const owed = new Set<string>(PAYABLE_EXPENSE_STATUSES)
  const notOwed = found.filter(e => !owed.has(String(e.status)))
  if (notOwed.length) {
    return { status: 409, error: 'Only pending or approved expenses can be matched to a bill', details: { expense_ids: notOwed.map(e => e.id) } }
  }
  const otherSupplier = found.filter(e => {
    if (bill.supplier_id && e.supplier_id) return bill.supplier_id !== e.supplier_id
    return !norm(e.supplier_name) || norm(e.supplier_name) !== norm(bill.supplier_name)
  })
  if (otherSupplier.length) {
    return { status: 409, error: 'Expenses must be from the same supplier as the bill', details: { expense_ids: otherSupplier.map(e => e.id) } }
  }
  return null
}

// ---- paying ------------------------------------------------------------

export interface PaidLink { expense_id: string; matched_amount: number | string | null; bill_status: string | null }

/** Which expenses a bill payment settles. An expense is paid only when the
 *  amount matched to bills that are PAID covers it: a EUR 1,000 expense matched
 *  for EUR 600 to this bill keeps EUR 400 owed after this bill is paid. */
export function expensesSettledByPaidBills(
  expenses: readonly { id: string; amount: number | string | null; status?: string | null }[],
  links: readonly PaidLink[],
): string[] {
  const covered = new Map<string, number>()
  for (const l of links) {
    if (l.bill_status !== 'paid') continue
    covered.set(l.expense_id, (covered.get(l.expense_id) || 0) + Number(l.matched_amount || 0))
  }
  const owed = new Set<string>(PAYABLE_EXPENSE_STATUSES)
  return expenses
    .filter(e => owed.has(String(e.status)))
    .filter(e => (covered.get(e.id) || 0) >= Number(e.amount || 0) - MATCH_TOLERANCE)
    .map(e => e.id)
}

/** The summary cards on the list. Counts are over every bill (a status filter
 *  narrows the table, not the cards); amounts stay per currency. */
export function summarizeBills(all: readonly { status: string; match_status: string; amount: number | string | null; currency?: string | null }[]) {
  const totalByCurrency: Record<string, number> = {}
  for (const b of all) {
    if (b.status === 'cancelled') continue
    const c = String(b.currency || 'EUR').toUpperCase()
    totalByCurrency[c] = (totalByCurrency[c] || 0) + Number(b.amount || 0)
  }
  const live = all.filter(b => b.status !== 'cancelled')
  return {
    total: live.length,
    total_by_currency: totalByCurrency,
    received: all.filter(b => b.status === 'received').length,
    unmatched: live.filter(b => b.match_status === 'unmatched').length,
    matched_pending: all.filter(b => b.status === 'matched').length,
    approved: all.filter(b => b.status === 'approved').length,
    paid: all.filter(b => b.status === 'paid').length,
    disputed: all.filter(b => b.status === 'disputed').length,
    cancelled: all.filter(b => b.status === 'cancelled').length,
  }
}
