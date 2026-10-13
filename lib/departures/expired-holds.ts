// ============================================
// Seat holds whose quote has lapsed
// ============================================
// A website order holds seats on its departure, tied to its quote
// (departure_bookings.quote_id, migration 20261215). Rejecting, expiring or
// deleting the quote releases the hold in the database — but nothing ever
// stores 'expired': a draft or sent quote past its valid-until date only
// READS as expired (lib/quotes/validity.ts), so its hold stayed pending and
// the seats stayed taken. The daily job app/api/cron/release-expired-holds
// releases those holds; this is its rule, pure so it can be tested.

import { isPastValidUntil } from '@/lib/quotes/validity'

export interface PendingHold {
  id: string
  org_id: string
  departure_id: string
  quote_id: string | null
  notes: string | null
}

export interface HoldQuote {
  id: string
  org_id: string
  quote_number: string | null
  status: string | null
  valid_until: string | null
}

/** Only an offer that is still open lapses: accepted and converted quotes keep
 *  their holds (the office books those), and rejected / expired ones were
 *  already released by the trigger. */
const OPEN = new Set(['draft', 'sent'])

/** The holds to release on `today` (YYYY-MM-DD), each with its quote. A quote
 *  of another company never releases a hold, whatever its id says. */
export function lapsedHolds(
  holds: PendingHold[],
  quotes: HoldQuote[],
  today: string
): Array<{ hold: PendingHold; quote: HoldQuote }> {
  const byId = new Map(quotes.map(q => [q.id, q]))
  const out: Array<{ hold: PendingHold; quote: HoldQuote }> = []
  for (const hold of holds) {
    const quote = hold.quote_id ? byId.get(hold.quote_id) : undefined
    if (!quote || quote.org_id !== hold.org_id) continue
    if (!OPEN.has(quote.status || 'draft')) continue
    if (!isPastValidUntil(quote.valid_until, today)) continue
    out.push({ hold, quote })
  }
  return out
}

/** The hold's note with the reason it was released, so the departure page
 *  says why the seats came free. Japanese, like the order note it extends. */
export function releaseNote(notes: string | null, quote: Pick<HoldQuote, 'quote_number' | 'valid_until'>, today: string): string {
  const reason = `見積 ${quote.quote_number ?? ''} の有効期限（${String(quote.valid_until ?? '').slice(0, 10)}）切れにより ${today} 自動解放`
  return notes ? `${notes}\n${reason}` : reason
}
