// ============================================
// When a quote stops being editable
// ============================================
// A quote that has been converted to an itinerary, or booked, is the record of
// the price the trip and the booking were made at. Editing its price or status
// afterwards, or deleting it, left the booking pointing at a quote that no
// longer said what was sold (bookings.quote_id has no foreign key, so a delete
// left a dangling id and lost the "from quote X" trail). The revert routes
// already refused such quotes; edits and deletes now ask the same question.
//
// Pure decision + one small reader, so the routes and their tests share it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export type QuoteKind = 'b2b' | 'b2c'
export type LockReason = 'converted' | 'booked'

/** Why this quote is read-only (except its notes), or null if it is not. */
export function quoteLockReason(
  quote: { status?: string | null; converted_to_itinerary_id?: string | null },
  bookingCount: number
): LockReason | null {
  if (bookingCount > 0) return 'booked'
  if (quote.status === 'converted' || quote.converted_to_itinerary_id) return 'converted'
  return null
}

/** The bookings made from this quote. */
export async function bookingsFromQuote(db: Db, kind: QuoteKind, quoteId: string): Promise<number> {
  const { count } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('quote_id', quoteId)
    .eq('quote_type', kind)
  return count ?? 0
}

/** What the operator is told when a delete is refused. */
export function deleteRefusalMessage(reason: LockReason): string {
  return reason === 'booked'
    ? 'This quote has a booking made from it and cannot be deleted: the booking keeps it as the record of the price it was sold at. Cancel the booking first if the quote really has to go.'
    : 'This quote has been converted to an itinerary and cannot be deleted: the trip was priced from it and points back to it.'
}

/** What the operator is told when an edit other than the notes is refused. */
export function editRefusalMessage(reason: LockReason): string {
  return reason === 'booked'
    ? 'This quote has been booked; only its notes can still be changed.'
    : 'This quote has been converted to an itinerary; only its notes can still be changed.'
}

export const MANAGER_ROLES = ['owner', 'admin', 'manager']

/** Deleting a quote is manager and above, one at a time as in bulk. */
export function canDeleteQuotes(role: string | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role)
}
