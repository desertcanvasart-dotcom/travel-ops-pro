// ============================================
// What a PUT may change on a B2B quote
// ============================================
// Both B2B PUTs spread the request body into the update on the service-role
// client, so any column was the caller's to set: selling_price (a quote saved
// at 5,000 re-priced to 1 and then booked at 1), quote_number (one edited to
// "QT-2026-X1" stopped every company's next quote from saving), and
// status 'converted' with any converted_to_itinerary_id (from-quote then
// booked a quote nobody accepted onto a trip it was never converted to).
//
// The price of a B2B quote is the engine's (POST re-prices it on the server);
// to change it, price it again in the calculator. Conversion is the convert
// endpoint's. What a person edits here is the status, the client's details,
// the notes and how long the offer stands. Anything else in the body is
// ignored, as in lib/email/conversation-updates.ts; a field of the wrong
// shape refuses the whole update rather than writing half of it.
//
// Once a quote is converted or booked (lib/quotes/lock.ts) only its notes
// change.
//
// vat_applied is the one price-side choice a person makes here: VAT on top of
// the engine's price or not. Only the flag is taken; the rate and amount are
// worked out by lib/b2b/update-quote.ts (lib/vat.ts), and a locked quote keeps
// the VAT it was converted or booked with.

import { isPastValidUntil, todayIso } from '@/lib/quotes/validity'
import { editRefusalMessage, type LockReason } from '@/lib/quotes/lock'

/** The statuses a person sets. 'converted' is set by convert only. */
export const B2B_SETTABLE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const

export interface B2bQuoteUpdates {
  status?: string
  client_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  client_nationality?: string | null
  notes?: string | null
  valid_until?: string | null
  vat_applied?: boolean
}

const TEXT_FIELDS = ['client_name', 'client_email', 'client_phone', 'client_nationality', 'notes'] as const
const DATE = /^\d{4}-\d{2}-\d{2}$/

export type Picked<T> = { ok: true; updates: T } | { ok: false; status: number; error: string }

export function pickB2bQuoteUpdates(
  body: Record<string, unknown>,
  current: { valid_until?: string | null; lock: LockReason | null },
  today: string = todayIso()
): Picked<B2bQuoteUpdates> {
  const out: B2bQuoteUpdates = {}
  if (body.status !== undefined) {
    if (body.status === 'converted') {
      return { ok: false, status: 400, error: "A quote becomes 'converted' only by converting it to an itinerary." }
    }
    if (!(B2B_SETTABLE_STATUSES as readonly unknown[]).includes(body.status)) {
      return { ok: false, status: 400, error: `status must be one of ${B2B_SETTABLE_STATUSES.join(', ')}` }
    }
    out.status = body.status as string
  }
  for (const f of TEXT_FIELDS) {
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
  if (body.vat_applied !== undefined) {
    if (typeof body.vat_applied !== 'boolean') return { ok: false, status: 400, error: 'vat_applied must be true or false' }
    out.vat_applied = body.vat_applied
  }

  if (current.lock) {
    const other = Object.keys(out).filter((k) => k !== 'notes')
    if (other.length > 0) return { ok: false, status: 409, error: editRefusalMessage(current.lock) }
  }

  // Accepting an offer past its date would let it be converted and booked at
  // the old price. Extending valid_until in the same request is allowed.
  if (out.status === 'accepted') {
    const until = out.valid_until !== undefined ? out.valid_until : current.valid_until
    if (isPastValidUntil(until, today)) {
      return { ok: false, status: 409, error: `This offer expired on ${String(until).slice(0, 10)}. Extend "Valid until" before accepting it.` }
    }
  }
  return { ok: true, updates: out }
}
