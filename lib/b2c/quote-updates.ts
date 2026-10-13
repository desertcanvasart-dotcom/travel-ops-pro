// ============================================
// A B2C offer: who it is for, and what a PUT may change
// ============================================
// The offer's cost is the itinerary's whole-party supplier cost, priced for
// THAT itinerary's travellers. The offer's own num_travelers (default 2 in the
// form) only divided it: a trip costed for 4 sent "per person" twice too high,
// and re-pricing a 2-person trip for 4 kept the total and halved the per-person
// figure — two more people's rooms and entrance fees never charged. The
// travellers are now the itinerary's; a different number is refused with the
// way forward (re-price the itinerary for that party).
//
// PUT took total_cost, currency, quote_number, created_by, season fields and
// any other column from the body: {total_cost: 1} re-priced the offer from a
// fake cost, {margin_percent: -50} sold below cost, {currency: 'JPY'} relabelled
// euros as yen. What a person edits is the margin (which re-prices from the
// itinerary), the status, the notes and the valid-until date. Everything else
// is ignored; a field of the wrong shape refuses the whole update. A booked
// offer keeps everything but its notes (lib/quotes/lock.ts).

import { normaliseMargin } from '@/lib/org-default-margin'
import { isPastValidUntil, todayIso } from '@/lib/quotes/validity'
import { editRefusalMessage, type LockReason } from '@/lib/quotes/lock'

export const B2C_SETTABLE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const

/** The party an itinerary is priced for: adults + children, else its traveller count; null when it does not say. */
export function itineraryPax(it: { num_adults?: unknown; num_children?: unknown; num_travelers?: unknown } | null | undefined): number | null {
  const ac = (Math.floor(Number(it?.num_adults) || 0)) + (Math.floor(Number(it?.num_children) || 0))
  if (ac > 0) return ac
  const t = Math.floor(Number(it?.num_travelers) || 0)
  return t > 0 ? t : null
}

/**
 * The travellers an offer divides by: the itinerary's own party. A request
 * naming a different number is refused (null travellers + an error); a trip
 * that records no party falls back to the request, then 1.
 */
export function resolveTravellers(requested: unknown, pax: number | null): { travellers: number } | { error: string } {
  const asked = requested === undefined || requested === null || requested === '' ? null : Math.floor(Number(requested))
  if (asked !== null && (!Number.isFinite(asked) || asked < 1)) return { error: 'num_travelers must be a whole number of at least 1' }
  if (pax === null) return { travellers: asked ?? 1 }
  if (asked !== null && asked !== pax) {
    return { error: `The itinerary is priced for ${pax} traveller(s). To quote ${asked}, re-price the itinerary for ${asked} first, then make the offer from it.` }
  }
  return { travellers: pax }
}

/**
 * What an offer is priced from: the itinerary's SUPPLIER cost.
 * itineraries.total_cost is the CLIENT price (margin already in), so
 * margining it compounded margins; it is the fallback only for legacy trips
 * that never had supplier_cost.
 */
export function offerCostBase(it: { supplier_cost?: unknown; total_cost?: unknown } | null | undefined): number {
  return Number(it?.supplier_cost) || Number(it?.total_cost) || 0
}

/** The itinerary columns an offer is priced from. */
export const OFFER_ITINERARY_COLUMNS = 'id, org_id, start_date, total_cost, supplier_cost, currency, num_adults, num_children, num_travelers, client_name, client_email'

/**
 * The offer's currency is the itinerary's: the cost it is priced from is the
 * itinerary's supplier cost, in the itinerary's currency. A request naming
 * another currency was stored as given with no conversion — a EUR 2,500 cost
 * offered as ¥2,500. It is refused rather than relabelled.
 */
export function resolveOfferCurrency(requested: unknown, itineraryCurrency: string | null | undefined): { currency: string } | { error: string } {
  const trip = (itineraryCurrency || 'EUR').toUpperCase()
  if (requested === undefined || requested === null || requested === '') return { currency: trip }
  if (typeof requested !== 'string' || requested.toUpperCase() !== trip) {
    return { error: `An offer is priced in its itinerary's currency (${trip}). To offer in another currency, change the itinerary's currency and re-price it first.` }
  }
  return { currency: trip }
}

export interface B2cQuoteUpdates {
  margin_percent?: number
  status?: string
  client_notes?: string | null
  internal_notes?: string | null
  valid_until?: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
export type Picked<T> = { ok: true; updates: T } | { ok: false; status: number; error: string }

export function pickB2cQuoteUpdates(
  body: Record<string, unknown>,
  current: { valid_until?: string | null; lock: LockReason | null },
  today: string = todayIso()
): Picked<B2cQuoteUpdates> {
  const out: B2cQuoteUpdates = {}
  if (body.margin_percent !== undefined) {
    const m = normaliseMargin(body.margin_percent)
    if (m === null) return { ok: false, status: 400, error: 'margin_percent must be between 0 and 100' }
    out.margin_percent = m
  }
  if (body.status !== undefined) {
    if (!(B2C_SETTABLE_STATUSES as readonly unknown[]).includes(body.status)) {
      return { ok: false, status: 400, error: `status must be one of ${B2C_SETTABLE_STATUSES.join(', ')}` }
    }
    out.status = body.status as string
  }
  for (const f of ['client_notes', 'internal_notes'] as const) {
    const v = body[f]
    if (v === undefined) continue
    if (v !== null && typeof v !== 'string') return { ok: false, status: 400, error: `${f} must be text` }
    out[f] = v === null || v.trim() === '' ? null : v
  }
  if (body.valid_until !== undefined) {
    if (body.valid_until !== null && !(typeof body.valid_until === 'string' && DATE.test(body.valid_until))) {
      return { ok: false, status: 400, error: 'valid_until must be a date (YYYY-MM-DD)' }
    }
    out.valid_until = body.valid_until as string | null
  }

  if (current.lock) {
    const other = Object.keys(out).filter((k) => k !== 'client_notes' && k !== 'internal_notes')
    if (other.length > 0) return { ok: false, status: 409, error: editRefusalMessage(current.lock) }
  }
  if (out.status === 'accepted') {
    const until = out.valid_until !== undefined ? out.valid_until : current.valid_until
    if (isPastValidUntil(until, today)) {
      return { ok: false, status: 409, error: `This offer expired on ${String(until).slice(0, 10)}. Extend "Valid until" before accepting it.` }
    }
  }
  return { ok: true, updates: out }
}
