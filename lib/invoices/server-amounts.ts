// ============================================
// What an invoice bills: worked out by the server, from the saved trip
// ============================================
// POST /api/invoices used the trip price the browser sent, so any agent could
// bill any amount for a trip. The base is now the trip's own saved total — the
// figure the itinerary page shows as the selling price: the priced service
// lines (client price, else cost + the default margin) plus the season
// supplement, else the stored total_cost when no line is priced
// (lib/itinerary-client-price). A deposit, a final and a full (standard)
// invoice are worked out from it and the deposit percent.
//
// A different amount is a MANUAL OVERRIDE: an admin or manager sends the
// amount and a reason, and the invoice records both next to what the server
// worked out (migration 20261228). An agent cannot override. An invoice with
// no trip has nothing to work out from; typing its amount is a manager's job
// and is recorded as such.
import { roundToCurrency } from '@/lib/currency-totals'
import { tripClientTotal } from '@/lib/itinerary-client-price'
import { roleAllows } from '@/lib/auth/roles'

/** Roles that may bill an amount other than the one the server works out. */
export const INVOICE_OVERRIDE_ROLES = ['admin', 'manager'] as const

export function canOverrideInvoiceAmount(role: string | null | undefined): boolean {
  return roleAllows(role, INVOICE_OVERRIDE_ROLES)
}

export type AmountSource = 'trip' | 'parent' | 'manual_override' | 'manual_entry'

// Structural type of the Supabase client: only what the loader calls.
type Reader = { from: (table: string) => any }

export interface TripInvoiceBase {
  /** What the client pays for the trip, to the cent (lines + season supplement). */
  net: number
  /** The trip's currency, upper-case, or '' when it has none. */
  currency: string
}

/**
 * The trip's selling price as the itinerary page shows it, read from the saved
 * rows. null when the trip is not this company's. Throws when its lines cannot
 * be read: an invoice must not fall back to a stale stored total silently.
 */
export async function loadTripInvoiceBase(db: Reader, orgId: string, itineraryId: string): Promise<TripInvoiceBase | null> {
  const { data: trip } = await db
    .from('itineraries')
    .select('*')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!trip) return null

  const { data: days, error: daysError } = await db.from('itinerary_days').select('id').eq('itinerary_id', itineraryId)
  if (daysError) throw new Error(`could not read the days of ${itineraryId}: ${daysError.message}`)
  const ids = ((days ?? []) as Array<{ id: string }>).map(d => d.id)

  let services: Array<{ total_cost?: unknown; client_price?: unknown }> = []
  if (ids.length) {
    const { data, error } = await db
      .from('itinerary_services')
      .select('total_cost, client_price')
      .in('itinerary_day_id', ids)
    if (error) throw new Error(`could not read the lines of ${itineraryId}: ${error.message}`)
    services = data ?? []
  }

  return {
    net: tripClientTotal(trip, [{ services }]),
    currency: typeof trip.currency === 'string' ? trip.currency.trim().toUpperCase() : '',
  }
}

/**
 * The tour part of an invoice, before VAT and without the insurance and extras
 * the route adds: the whole trip for a standard invoice, `percent` of it for a
 * deposit, and for a final what is left after the deposit (the linked deposit
 * invoice's net when there is one, else `percent` of the trip).
 */
export function plannedTourAmount(input: {
  invoiceType: string
  tripNet: number
  depositPercent: number
  currency: string
  /** The net of the deposit invoice a final settles. */
  parentNet?: number | null
}): number {
  const { tripNet, depositPercent, currency } = input
  if (input.invoiceType === 'deposit') return roundToCurrency((tripNet * depositPercent) / 100, currency)
  if (input.invoiceType === 'final') {
    const deposit = input.parentNet != null ? input.parentNet : roundToCurrency((tripNet * depositPercent) / 100, currency)
    return Math.max(0, roundToCurrency(tripNet - deposit, currency))
  }
  return roundToCurrency(tripNet, currency)
}

export interface AmountOverride {
  amount: number
  reason: string
}

export type OverrideResult =
  | { ok: true; override: AmountOverride | null }
  | { ok: false; status: number; error: string }

/**
 * The manual override a request carries: `manual_override: { amount, reason }`.
 * Absent is no override. A malformed one is a 400 and one from a role that may
 * not override is a 403 — it is never quietly ignored, so nobody believes a
 * figure they typed was billed.
 */
export function parseAmountOverride(raw: unknown, role: string | null | undefined): OverrideResult {
  if (raw === undefined || raw === null || raw === false) return { ok: true, override: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, status: 400, error: 'manual_override must be { amount, reason }' }
  const { amount: rawAmount, reason: rawReason } = raw as Record<string, unknown>
  const amount = typeof rawAmount === 'number' ? rawAmount : typeof rawAmount === 'string' && rawAmount.trim() !== '' ? Number(rawAmount) : NaN
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, status: 400, error: 'manual_override.amount must be a non-negative number' }
  const reason = typeof rawReason === 'string' ? rawReason.trim() : ''
  if (!reason) return { ok: false, status: 400, error: 'A manual amount needs a reason (manual_override.reason)' }
  if (reason.length > 500) return { ok: false, status: 400, error: 'manual_override.reason is too long (500 characters at most)' }
  if (!canOverrideInvoiceAmount(role)) {
    return { ok: false, status: 403, error: 'Only an admin or manager can bill a different amount than the one worked out from the trip.' }
  }
  return { ok: true, override: { amount, reason } }
}

/** Do two amounts in this currency differ by more than its smallest unit? */
export function amountsDiffer(a: number, b: number, currency: string): boolean {
  return roundToCurrency(a, currency) !== roundToCurrency(b, currency)
}

/**
 * The line items a trip invoice carries. The caller's lines are kept (their
 * wording is the office's) when they add up to the net the server worked out;
 * otherwise they are replaced by one line for the amount, so the document never
 * lists lines that say something other than what it bills.
 */
export function reconcileLineItems<T extends { amount?: unknown; quantity?: unknown; unit_price?: unknown }>(
  lines: T[],
  net: number,
  currency: string,
  fallbackDescription: string
): Array<T | { description: string; quantity: number; unit_price: number; amount: number }> {
  const sum = lines.reduce((s, l) => s + (Number(l?.amount) || (Number(l?.quantity) || 1) * (Number(l?.unit_price) || 0)), 0)
  if (lines.length && !amountsDiffer(sum, net, currency)) return lines
  const first = lines[0] as { description?: unknown } | undefined
  const description = typeof first?.description === 'string' && first.description.trim() ? first.description : fallbackDescription
  return [{ description, quantity: 1, unit_price: net, amount: net }]
}
