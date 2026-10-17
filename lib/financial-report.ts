// ============================================
// FINANCIAL REPORTS — the rules that decide what counts
// ============================================
// Pure helpers for /api/financial-reports, kept out of the route so they can
// be tested without a database. Each one is a decision the report used to get
// wrong:
//
//   - a DRAFT invoice is not revenue (new invoices are created as 'draft' and
//     only become a claim on the client once sent)
//   - a trip is a sale once it is confirmed or completed, not when someone
//     opens a draft
//   - a date belongs to the year and month written on it, not the one the
//     server's timezone turns it into
//   - a commission recipient's "trips" are distinct itineraries, not lines

/**
 * Invoice statuses that are not revenue. A draft has not been sent to anyone
 * and a cancelled invoice is not owed. There is no 'void' status in this
 * schema (invoices.status is free text defaulting to 'draft'; the app writes
 * draft/sent/partial/paid/overdue/cancelled).
 */
export const NON_REVENUE_INVOICE_STATUSES = ['draft', 'cancelled'] as const

/** Does this invoice count towards revenue, receivables, tax and YoY? */
export function invoiceCountsAsRevenue(status: string | null | undefined): boolean {
  // The column defaults to 'draft', so a missing status is read the same way.
  const s = (status || 'draft').toLowerCase()
  return !(NON_REVENUE_INVOICE_STATUSES as readonly string[]).includes(s)
}

/** Itinerary statuses that are a sold trip. */
export const COUNTED_TRIP_STATUSES = ['confirmed', 'completed'] as const

export function tripCounts(status: string | null | undefined): boolean {
  return (COUNTED_TRIP_STATUSES as readonly string[]).includes((status || '').toLowerCase())
}

/**
 * Year of an ISO date or timestamp, read off the string.
 *
 * new Date('2026-01-01').getFullYear() parses as UTC midnight and then reads
 * it back in the server's local zone — on a server west of UTC that is 2025.
 * The date the user typed is the date that counts.
 */
export function yearOf(date: string | null | undefined): number | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}/.test(date)) return null
  return Number(date.slice(0, 4))
}

/** Month (1-12) of an ISO date or timestamp, read off the string. */
export function monthOf(date: string | null | undefined): number | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}/.test(date)) return null
  return Number(date.slice(5, 7))
}

/**
 * The years the year picker offers, newest first: every year between the
 * oldest and newest dated row, always including the year being shown — a new
 * year with no invoices yet must still be selectable, or the picker shows a
 * year other than the one on screen.
 */
export function availableYearRange(
  dates: readonly (string | null | undefined)[],
  selectedYear: number,
): number[] {
  const years = dates.map(yearOf).filter((y): y is number => y !== null)
  const min = Math.min(selectedYear, ...years)
  const max = Math.max(selectedYear, ...years)
  return Array.from({ length: max - min + 1 }, (_, i) => max - i)
}

/**
 * Sum amounts into twelve monthly buckets (index 0 = January) for one year,
 * by the date on each row. Rows dated in another year, or undated, are skipped.
 */
export function sumByMonth<T>(
  rows: readonly T[],
  year: number,
  getDate: (row: T) => string | null | undefined,
  getAmount: (row: T) => number,
): number[] {
  const buckets = Array.from({ length: 12 }, () => 0)
  for (const row of rows) {
    const date = getDate(row)
    if (yearOf(date) !== year) continue
    const m = monthOf(date)
    if (m === null || m < 1 || m > 12) continue
    buckets[m - 1] += Number(getAmount(row) || 0)
  }
  return buckets
}

/**
 * How many distinct trips a set of expense lines belongs to. Lines not linked
 * to an itinerary (office costs, a guide paid outside a trip) count for none:
 * there is no trip to count.
 */
export function distinctTripCount(rows: readonly { itinerary_id?: string | null }[]): number {
  const ids = new Set<string>()
  for (const r of rows) if (r.itinerary_id) ids.add(r.itinerary_id)
  return ids.size
}
