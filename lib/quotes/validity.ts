// ============================================
// A quote's "valid until", read rather than scheduled
// ============================================
// Nothing ever set a quote to 'expired': valid_until was printed on the offer
// and then ignored, so an offer weeks past its date could still be accepted
// and booked at the old price. No job flips the stored status; a quote that is
// still a draft or sent once its date has passed READS as expired wherever it
// is shown or acted on. Accepted, rejected and converted quotes keep their
// status — the date only limits an offer that is still open.
//
// Dates are compared as YYYY-MM-DD strings: valid_until is a DATE column, and
// "valid until 12 October" means valid through that whole day.

const OPEN = new Set(['draft', 'sent'])

/** Today as YYYY-MM-DD (UTC, like every DATE the routes write). */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Has this offer's last valid day gone by? A quote with no date never lapses. */
export function isPastValidUntil(validUntil: string | null | undefined, today: string = todayIso()): boolean {
  if (!validUntil) return false
  return String(validUntil).slice(0, 10) < today
}

/** The status to show and act on: an open offer past its date is expired. */
export function effectiveQuoteStatus(
  status: string | null | undefined,
  validUntil: string | null | undefined,
  today: string = todayIso()
): string {
  const s = status || 'draft'
  return OPEN.has(s) && isPastValidUntil(validUntil, today) ? 'expired' : s
}

/** A row as read: `status` is the effective one, `stored_status` what the column holds. */
export function withEffectiveStatus<T extends { status?: string | null; valid_until?: string | null }>(
  row: T,
  today: string = todayIso()
): T & { status: string; stored_status: string | null } {
  return { ...row, stored_status: row.status ?? null, status: effectiveQuoteStatus(row.status, row.valid_until, today) }
}

/**
 * PostgREST filters for a status dropdown that agrees with the effective
 * status: "Expired" includes open offers past their date, and "Draft" /
 * "Sent" leave them out. Returns the `.or()` expressions to apply (each one a
 * separate AND-ed call) and an optional plain status to match.
 */
export function statusFilter(status: string, today: string = todayIso()): { eq?: string; or: string[] } {
  if (status === 'expired') {
    return { or: [`status.eq.expired,and(status.in.(draft,sent),valid_until.lt.${today})`] }
  }
  if (OPEN.has(status)) {
    return { eq: status, or: [`valid_until.is.null,valid_until.gte.${today}`] }
  }
  return { eq: status, or: [] }
}
