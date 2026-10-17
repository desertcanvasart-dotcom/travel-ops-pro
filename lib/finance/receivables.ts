// ============================================
// Receivables: what counts, when it is due, which aging bucket it is in
// ============================================
// The Receivables screen used to age every open invoice from `new Date(due_date)`.
// A draft (never sent) has balance_due = total_amount and usually no due date,
// and new Date(null) is 1 January 1970 — so every draft landed in "90+ Days" and
// "Overdue". These helpers keep the rules in one place so the row badge, the
// bucket sums and the aging filter cannot drift apart again.

/** Statuses whose balance is not (yet) a receivable: a draft was never sent to
 *  the client, a cancelled/void one is no longer owed. */
export const NON_RECEIVABLE_INVOICE_STATUSES = ['draft', 'cancelled', 'void', 'voided'] as const

export type AgingKey = 'current' | 'days30' | 'days60' | 'days90' | 'days90Plus' | 'noDueDate'

/** Row badge values, one per AgingKey. */
export type AgingBucket = 'current' | '30' | '60' | '90' | '90plus' | 'nodate'

const DAY_MS = 24 * 60 * 60 * 1000
const YMD = /^(\d{4})-(\d{2})-(\d{2})/

/** True when the invoice is open money the client owes us. */
export function isReceivable(inv: { balance_due?: unknown; status?: string | null }): boolean {
  if (!(Number(inv.balance_due) > 0)) return false
  const status = String(inv.status || '').toLowerCase()
  return !(NON_RECEIVABLE_INVOICE_STATUSES as readonly string[]).includes(status)
}

/** Days from "Payment due within 30 days" / "Net 30"; null when no number is stated. */
export function paymentTermsDays(terms: unknown): number | null {
  if (typeof terms !== 'string') return null
  const m = terms.match(/(\d{1,3})\s*(?:calendar\s+)?days?\b/i) || terms.match(/\bnet\s*(\d{1,3})\b/i)
  return m ? Number(m[1]) : null
}

const DEFAULT_TERMS_DAYS = 14

export interface EffectiveDue {
  /** YYYY-MM-DD, or null when the invoice has neither a due date nor an issue date. */
  date: string | null
  /** True when the date was worked out from issue date + payment terms. */
  fromTerms: boolean
}

/** The invoice's own due date; else its issue date plus the payment terms
 *  (14 days when the terms state no number); else none. */
export function effectiveDueDate(inv: {
  due_date?: string | null
  issue_date?: string | null
  payment_terms?: string | null
}): EffectiveDue {
  if (inv.due_date && YMD.test(inv.due_date)) return { date: inv.due_date.slice(0, 10), fromTerms: false }
  const issue = inv.issue_date && YMD.exec(inv.issue_date)
  if (!issue) return { date: null, fromTerms: false }
  const days = paymentTermsDays(inv.payment_terms) ?? DEFAULT_TERMS_DAYS
  const due = new Date(Date.UTC(Number(issue[1]), Number(issue[2]) - 1, Number(issue[3])) + days * DAY_MS)
  return { date: due.toISOString().slice(0, 10), fromTerms: true }
}

/** Today's calendar day (server local) as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Whole days between two YYYY-MM-DD dates (today minus due; positive = late). */
export function daysPastDue(dueDate: string, today: string): number {
  const a = YMD.exec(today)!
  const b = YMD.exec(dueDate)!
  const t = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const d = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.round((t - d) / DAY_MS)
}

/** The one cut-off table: Current (not late, due today included) / 1-30 / 31-60 /
 *  61-90 / over 90. Null days = no due date at all. */
export function agingKeyFor(days: number | null): AgingKey {
  if (days === null) return 'noDueDate'
  if (days > 90) return 'days90Plus'
  if (days > 60) return 'days90'
  if (days > 30) return 'days60'
  if (days > 0) return 'days30'
  return 'current'
}

const BUCKET_OF_KEY: Record<AgingKey, AgingBucket> = {
  current: 'current', days30: '30', days60: '60', days90: '90', days90Plus: '90plus', noDueDate: 'nodate',
}

/** Age one invoice. The badge (`aging_bucket`) and the sums (`aging_key`) come
 *  from the same call, so they always agree. */
export function ageInvoice<T extends { due_date?: string | null; issue_date?: string | null; payment_terms?: string | null }>(
  inv: T,
  today: string,
) {
  const due = effectiveDueDate(inv)
  const days = due.date ? daysPastDue(due.date, today) : null
  const key = agingKeyFor(days)
  return {
    ...inv,
    effective_due_date: due.date,
    due_date_from_terms: due.fromTerms,
    days_past_due: days === null ? 0 : Math.max(0, days),
    aging_key: key,
    aging_bucket: BUCKET_OF_KEY[key],
    is_overdue: days !== null && days > 0,
  }
}

/** Value of the `aging` query parameter -> the AgingKey it selects. The old
 *  '90' meant "over 60"; it now means 61-90 and '90plus' is over 90. */
export const AGING_FILTER_KEYS: Record<string, AgingKey> = {
  current: 'current', '30': 'days30', '60': 'days60', '90': 'days90', '90plus': 'days90Plus', nodate: 'noDueDate',
}

// ---- reading every row, not the first thousand ----

export interface PagedResult<T> { data: T[] | null; error: { message: string } | null }

/** Walk a range()-able query until a short page comes back. `truncated` is true
 *  only if maxPages was reached with more rows possibly waiting. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  pageSize = 1000,
  maxPages = 50,
): Promise<{ rows: T[]; truncated: boolean; error: { message: string } | null }> {
  const rows: T[] = []
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * pageSize, i * pageSize + pageSize - 1)
    if (error) return { rows, truncated: false, error }
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) return { rows, truncated: false, error: null }
  }
  return { rows, truncated: true, error: null }
}
