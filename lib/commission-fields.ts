// ============================================
// What a commission may hold, and how the Commissions screen adds it up
// ============================================
// The PUT spread the whole body into the table, so an unknown key or a status
// the CHECK constraint refuses came back as a bare 500, a commission moved from
// paid back to pending kept its paid date, and the edit form offered amounts
// and links the server then silently dropped. The POST validated none of it.
//
// CHECK sets (baseline commissions_*_check): status, commission_type, category.
// Currency is one of the company's rate currencies.
//
// An existing commission's MONEY is not editable: type, category, currency,
// base, rate, amount, supplier, trip and client define what is owed and to
// whom. A wrong one is deleted and made again (deleting a generated one
// releases its service so it can be generated again).

import { RATE_CURRENCIES } from '@/lib/org-rate-currency'
import { emptyTotals, addToTotals, sumByCurrency, type CurrencyTotals } from '@/lib/currency-totals'

export const COMMISSION_STATUSES = ['pending', 'invoiced', 'received', 'paid', 'cancelled', 'disputed'] as const
export const COMMISSION_TYPES = ['receivable', 'payable'] as const
export const COMMISSION_CATEGORIES = [
  'hotel', 'shopping', 'restaurant', 'transport', 'cruise', 'attraction', 'optional_tour',
  'activity', 'show', 'spa', 'agent_referral', 'partner', 'other',
] as const

/** The fields PUT /api/commissions/[id] persists. */
export const COMMISSION_EDITABLE_FIELDS = [
  'status', 'paid_date', 'due_date', 'payment_method', 'payment_reference',
  'notes', 'description', 'source_name', 'source_contact',
] as const

/** Statuses in which the money has moved, so there is a date it moved on. */
const SETTLED = new Set(['paid', 'received'])

const DAY = /^\d{4}-\d{2}-\d{2}/

/** The first problem with the type, category, status and currency sent, or null. Absent fields pass. */
export function commissionFieldError(body: { commission_type?: unknown; category?: unknown; status?: unknown; currency?: unknown }): string | null {
  if (body.commission_type !== undefined && !(COMMISSION_TYPES as readonly string[]).includes(body.commission_type as string)) {
    return `commission_type must be one of: ${COMMISSION_TYPES.join(', ')}`
  }
  if (body.category !== undefined && !(COMMISSION_CATEGORIES as readonly string[]).includes(body.category as string)) {
    return `category must be one of: ${COMMISSION_CATEGORIES.join(', ')}`
  }
  if (body.status !== undefined && !(COMMISSION_STATUSES as readonly string[]).includes(body.status as string)) {
    return `status must be one of: ${COMMISSION_STATUSES.join(', ')}`
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
 * The paid_date a commission with this status carries: when paid or received,
 * the date given, else the one it has, else today; any other status, none (a
 * commission moved back to pending kept the date it was paid on).
 */
export function commissionPaidDate(
  status: string,
  given?: unknown,
  existing?: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  if (!SETTLED.has(status)) return null
  if (typeof given === 'string' && DAY.test(given)) return given.slice(0, 10)
  if (existing && DAY.test(existing)) return existing.slice(0, 10)
  return today
}

/**
 * The update a PUT may apply: the whitelisted fields only, with paid_date
 * following the status. `existing` is the stored row.
 */
export function buildCommissionUpdate(
  body: Record<string, unknown>,
  existing: { status?: string | null; paid_date?: string | null },
  today?: string,
): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  for (const field of COMMISSION_EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field]
  }
  if (body.status !== undefined || body.paid_date !== undefined) {
    const status = (body.status as string | undefined) ?? existing.status ?? 'pending'
    update.paid_date = commissionPaidDate(status, body.paid_date, existing.paid_date, today)
  }
  update.updated_at = new Date().toISOString()
  return update
}

// ============================================
// A manual commission that repeats one already on the books
// ============================================
// Generating commissions and typing the same one in by hand put the money in
// twice, and every figure that adds commissions (the cards, the trip P&L)
// doubled it. A commission has its own number (COM-YYYY-NNN, migration 20261231); the
// short id-derived reference stays only as the fallback for a row without one.

export interface DuplicateCheckRow {
  id: string
  commission_number?: string | null
  itinerary_id?: string | null
  supplier_id?: string | null
  source_name?: string | null
  commission_type?: string | null
  commission_amount?: unknown
  status?: string | null
  description?: string | null
  currency?: string | null
}

/** The short reference a commission is known by on screen and in messages. */
export function commissionRef(id: string): string {
  return `COM-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

const sameCents = (a: unknown, b: unknown) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100)

/**
 * The commission this one repeats, or null: same trip, same supplier (or, with
 * none, the same source name), same type and same amount. A cancelled one does
 * not count; it is not owed to or by anyone.
 */
export function findDuplicateCommission(existing: DuplicateCheckRow[], candidate: DuplicateCheckRow): DuplicateCheckRow | null {
  if (!candidate.itinerary_id) return null
  const source = (v: unknown) => String(v ?? '').trim().toLowerCase()
  return existing.find(e =>
    e.status !== 'cancelled' &&
    e.itinerary_id === candidate.itinerary_id &&
    e.commission_type === candidate.commission_type &&
    sameCents(e.commission_amount, candidate.commission_amount) &&
    (candidate.supplier_id || e.supplier_id
      ? (e.supplier_id ?? null) === (candidate.supplier_id ?? null)
      : source(e.source_name) === source(candidate.source_name))
  ) ?? null
}

/** The 409 message for a duplicate. */
export function duplicateCommissionMessage(existing: DuplicateCheckRow): string {
  const what = existing.description ? ` "${existing.description}"` : ''
  return `Commission ${existing.commission_number || commissionRef(existing.id)}${what} already records this: same trip, supplier, type and amount. Change the existing commission instead, or delete it first if this one replaces it.`
}

interface SummaryRow {
  commission_type?: string | null
  commission_amount?: unknown
  currency?: unknown
  status?: string | null
  category?: string | null
}

/**
 * The cards on the Commissions screen, PER CURRENCY (nothing converts). A
 * cancelled commission is owed and earned by nobody, so it is left out of every
 * figure; the list still shows it.
 */
export function summariseCommissions(rows: SummaryRow[]) {
  const live = rows.filter(c => c.status !== 'cancelled')
  const receivable = live.filter(c => c.commission_type === 'receivable')
  const payable = live.filter(c => c.commission_type === 'payable')

  const amount = (c: SummaryRow) => c.commission_amount
  const cur = (c: SummaryRow) => c.currency
  const net = emptyTotals()
  for (const c of receivable) addToTotals(net, Number(c.commission_amount) || 0, c.currency)
  for (const c of payable) addToTotals(net, -(Number(c.commission_amount) || 0), c.currency)

  const byCategory: Record<string, { receivable: CurrencyTotals; payable: CurrencyTotals; count: number }> = {}
  for (const c of live) {
    const key = c.category || 'other'
    if (!byCategory[key]) byCategory[key] = { receivable: emptyTotals(), payable: emptyTotals(), count: 0 }
    byCategory[key].count++
    if (c.commission_type === 'receivable') addToTotals(byCategory[key].receivable, c.commission_amount, c.currency)
    else addToTotals(byCategory[key].payable, c.commission_amount, c.currency)
  }

  return {
    total_receivable: sumByCurrency(receivable, amount, cur),
    total_payable: sumByCurrency(payable, amount, cur),
    pending_receivable: sumByCurrency(
      receivable.filter(c => c.status === 'pending' || c.status === 'invoiced'), amount, cur),
    pending_payable: sumByCurrency(payable.filter(c => c.status === 'pending'), amount, cur),
    received: sumByCurrency(receivable.filter(c => c.status === 'received'), amount, cur),
    paid: sumByCurrency(payable.filter(c => c.status === 'paid'), amount, cur),
    net_commission: net,
    by_category: byCategory,
  }
}
