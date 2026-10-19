// ============================================
// Payables: what is owed to suppliers, and keeping bills and expenses in step
// ============================================
// Money owed to a supplier lives in two places: an expense (what the trip
// cost) and a supplier bill (what the supplier invoiced), linked through
// supplier_invoice_expenses. Paying one has to settle the other, or Payables,
// Bills and the dashboard each show a different "owed".

import type { SupabaseClient } from '@supabase/supabase-js'
import { billsWithoutExpenses } from '@/lib/dashboard/figures'

const DAY_MS = 24 * 60 * 60 * 1000

/** Bills that still count as owed: not yet paid, disputed or cancelled. Same
 *  set the dashboard adds up. */
export const OWED_BILL_STATUSES = ['received', 'matched', 'approved'] as const

/** Payables ages a bill without a due date from its invoice date, as it does an
 *  expense: due 14 days after it was incurred. */
export const DEFAULT_DUE_DAYS = 14

export type PayableAgingKey = 'current' | 'days30' | 'days60' | 'days90Plus'

/** The one cut-off table for Payables: not due / 1-30 / 31-60 / over 60. */
export function payableAgingKey(daysPastDue: number): PayableAgingKey {
  if (daysPastDue > 60) return 'days90Plus'
  if (daysPastDue > 30) return 'days60'
  if (daysPastDue > 0) return 'days30'
  return 'current'
}

export const PAYABLE_BUCKET_OF_KEY: Record<PayableAgingKey, string> = {
  current: 'current', days30: '30', days60: '60', days90Plus: '90plus',
}

export function payableDueDate(expenseDate: string, daysDefault = DEFAULT_DUE_DAYS): string {
  // UTC midnight of the calendar date: a local midnight made this a day early
  // on any server east of UTC (an office in Japan).
  const d = new Date(`${String(expenseDate).slice(0, 10)}T00:00:00Z`)
  return new Date(d.getTime() + daysDefault * DAY_MS).toISOString().slice(0, 10)
}

export interface BillRow {
  id: string
  internal_reference: string | null
  supplier_invoice_number: string | null
  supplier_name: string | null
  invoice_date: string
  due_date: string | null
  amount: number | string | null
  currency: string | null
  status: string
  description?: string | null
}

/** An unmatched bill as a row of the Payables list, shaped like an expense so
 *  the screen can age, group and total it with the same code. `kind: 'bill'`
 *  tells the page to link to the bill and offer no expense actions. */
export function billToPayableRow(bill: BillRow) {
  return {
    id: bill.id,
    kind: 'bill' as const,
    expense_number: bill.internal_reference || bill.supplier_invoice_number || 'Bill',
    category: 'other',
    description: bill.description || `Supplier bill ${bill.supplier_invoice_number ?? ''}`.trim(),
    amount: Number(bill.amount || 0),
    currency: bill.currency || 'EUR',
    expense_date: bill.invoice_date,
    supplier_name: bill.supplier_name || 'Unknown Supplier',
    supplier_type: 'other',
    status: 'bill',
    bill_status: bill.status,
    bill_due_date: bill.due_date,
    supplier_invoice_number: bill.supplier_invoice_number,
  }
}

/** Open bills with no expense behind them: the money Payables would otherwise
 *  miss. (A bill matched to an expense is already counted through the expense.) */
export function unmatchedBillRows(
  bills: readonly BillRow[],
  links: readonly { supplier_invoice_id: string }[],
) {
  return billsWithoutExpenses(
    bills.filter(b => (OWED_BILL_STATUSES as readonly string[]).includes(b.status)),
    links,
  ).map(billToPayableRow)
}

// ---- paying an expense settles its bill --------------------------------

/** Bills that a just-paid expense completes: the bill is approved and every
 *  expense linked to it is now paid. A bill not yet approved is left for its
 *  own approve and pay steps. */
export function billsCompletedByExpensePayment(
  bills: readonly { id: string; status: string }[],
  links: readonly { supplier_invoice_id: string; expense_id: string }[],
  expenseStatus: ReadonlyMap<string, string>,
): string[] {
  return bills
    .filter(b => b.status === 'approved')
    .filter(b => {
      const mine = links.filter(l => l.supplier_invoice_id === b.id)
      return mine.length > 0 && mine.every(l => expenseStatus.get(l.expense_id) === 'paid')
    })
    .map(b => b.id)
}

export interface PayExpenseInput { payment_date: string; payment_method?: string | null; payment_reference?: string | null }

/** Mark one expense paid and settle any approved bill it completes. Returns the
 *  paid expense, or an error to send back. `payment_date` comes from the caller
 *  (the operator's own day, see lib/today). */
export async function payExpenseAndSettleBills(
  supabase: SupabaseClient,
  orgId: string,
  expenseId: string,
  input: PayExpenseInput,
): Promise<{ ok: true; expense: any; bills_paid: string[] } | { ok: false; status: number; error: string }> {
  const now = new Date().toISOString()
  // Conditional on the status so a second click, or a bill payment landing
  // first, matches no row instead of overwriting the first payment's date.
  const { data: expense, error } = await supabase
    .from('expenses')
    .update({
      status: 'paid',
      payment_date: input.payment_date,
      payment_method: input.payment_method || null,
      payment_reference: input.payment_reference || null,
      updated_at: now,
    })
    .eq('id', expenseId)
    .eq('org_id', orgId)
    // Approved only: approving is where the approver is recorded and where the
    // creator-cannot-approve rule applies, so a pending expense is approved first.
    .eq('status', 'approved')
    .select()
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: 'Failed to record payment' }
  if (!expense) return { ok: false, status: 409, error: 'Only an approved expense can be paid - approve it first' }

  const billsPaid = await settleBillsForPaidExpense(supabase, orgId, expenseId, input)
  return { ok: true, expense, bills_paid: billsPaid }
}

/** After an expense is paid by any route: mark an approved bill paid when all
 *  of its expenses are. Safe to call from the Expenses screen as well. */
export async function settleBillsForPaidExpense(
  supabase: SupabaseClient,
  orgId: string,
  expenseId: string,
  payment: Partial<PayExpenseInput> = {},
): Promise<string[]> {
  const { data: mine } = await supabase
    .from('supplier_invoice_expenses')
    .select('supplier_invoice_id')
    .eq('expense_id', expenseId)
  const billIds = [...new Set((mine || []).map(l => l.supplier_invoice_id as string))]
  if (!billIds.length) return []

  // Org-scoped: the junction has no org_id, the bill does.
  const { data: bills } = await supabase
    .from('supplier_invoices')
    .select('id, status')
    .in('id', billIds)
    .eq('org_id', orgId)
  if (!bills?.length) return []

  const { data: links } = await supabase
    .from('supplier_invoice_expenses')
    .select('supplier_invoice_id, expense_id')
    .in('supplier_invoice_id', bills.map(b => b.id))
  const { data: exps } = await supabase
    .from('expenses')
    .select('id, status')
    .in('id', [...new Set((links || []).map(l => l.expense_id as string))])
    .eq('org_id', orgId)
  const expenseStatus = new Map((exps || []).map(e => [e.id as string, e.status as string]))

  const done = billsCompletedByExpensePayment(bills as any, (links || []) as any, expenseStatus)
  const paid: string[] = []
  for (const id of done) {
    const { data } = await supabase
      .from('supplier_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: payment.payment_method || null,
        payment_reference: payment.payment_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()
    if (data) paid.push(id)
  }
  return paid
}

// ---- deleting an expense -----------------------------------------------

/** Why an expense must not be deleted, or null when it may be. A paid expense
 *  is a payment record; one matched to a bill is what that bill's match, status
 *  and amounts rest on (the link would cascade away and leave the bill showing
 *  a match that no longer exists). Meant for the Expenses delete route. */
export async function expenseDeleteBlocker(
  supabase: SupabaseClient,
  orgId: string,
  expenseId: string,
): Promise<string | null> {
  const { data: exp } = await supabase
    .from('expenses')
    .select('status')
    .eq('id', expenseId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (exp?.status === 'paid') return 'A paid expense cannot be deleted'
  const { data: links } = await supabase
    .from('supplier_invoice_expenses')
    .select('supplier_invoice_id')
    .eq('expense_id', expenseId)
    .limit(1)
  if (links?.length) return 'This expense is matched to a supplier bill. Unmatch it from the bill first.'
  return null
}
