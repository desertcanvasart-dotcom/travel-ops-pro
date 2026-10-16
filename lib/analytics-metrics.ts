// ============================================
// ANALYTICS ARITHMETIC — pure, so it can be tested without a database
// ============================================
// /api/analytics loads rows and converts money; everything it then DERIVES
// from them lives here. Each function below replaces a piece of inline math
// that had quietly drifted away from the numbers next to it on the page:
//
//   - "Pending" counted `pending`/`quoted`, statuses an itinerary never has
//     (they are draft, sent, confirmed, completed, cancelled), so the status
//     buckets never added up to Total Bookings.
//   - the weekly chart kept the last five NON-EMPTY weeks and renamed them
//     "Week 1..5", so on any range longer than five weeks it did not sum to
//     Total Revenue and "your busiest period was Week 3" named nothing real.
//   - every trip in the window was converted, drafts and cancellations
//     included, and the won ones a second time for the chart — each missing
//     exchange rate was reported twice, and for trips that are not revenue.

/** Revenue is booked on these, and only these. */
export function isWon(status: string | null | undefined): boolean {
  return status === 'confirmed' || status === 'completed'
}

export interface BookingBuckets {
  total: number
  confirmed: number
  /** Not yet won and not cancelled: draft and sent. */
  pending: number
  cancelled: number
  completed: number
}

/**
 * Split itineraries into the four status buckets the page shows. Pending is
 * whatever is neither won nor cancelled — in practice draft and sent (and a
 * null status, which the column defaults to draft) — so the buckets always
 * add up to `total`.
 */
export function bookingBuckets(rows: Array<{ status?: string | null }>): BookingBuckets {
  const b: BookingBuckets = { total: rows.length, confirmed: 0, pending: 0, cancelled: 0, completed: 0 }
  for (const r of rows) {
    if (r.status === 'confirmed') b.confirmed++
    else if (r.status === 'completed') b.completed++
    else if (r.status === 'cancelled') b.cancelled++
    else b.pending++
  }
  return b
}

/** Won trips (confirmed + completed) as a percentage of all trips created. */
export function conversionRate(b: BookingBuckets): number {
  return b.total > 0 ? ((b.confirmed + b.completed) / b.total) * 100 : 0
}

/**
 * Average over the trips that actually HAVE a converted amount. A trip dropped
 * for a missing exchange rate contributes nothing to the total, so counting it
 * in the divisor would drag the average down by a trip that is not there.
 */
export function avgDealSize(amounts: Array<number | null>): number {
  const known = amounts.filter((a): a is number => a !== null)
  return known.length > 0 ? known.reduce((s, a) => s + a, 0) / known.length : 0
}

/**
 * Period-over-period growth in percent, or null when there is nothing to grow
 * FROM. "+100%" against a previous period of zero was a number with no meaning.
 */
export function revenueGrowth(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Monday 00:00 UTC of the week containing `date`, as YYYY-MM-DD. */
export function utcWeekStart(date: Date): string {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const sinceMonday = (date.getUTCDay() + 6) % 7
  return new Date(midnight - sinceMonday * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Revenue per week across the WHOLE range, zero-filled, each week labelled by
 * the date it starts on (UTC, so the server's timezone cannot move a trip into
 * another week). The points sum to exactly what was passed in.
 *
 * `month` is the field name the chart has always keyed on; it holds a week
 * start date.
 */
export function groupByWeek(
  rows: Array<{ created_at: string | null; amount: number }>,
  start: Date,
  end: Date
): { month: string; revenue: number }[] {
  const weeks = new Map<string, number>()
  const last = utcWeekStart(end)
  for (let key = utcWeekStart(start); key <= last;) {
    weeks.set(key, 0)
    key = new Date(Date.parse(key) + 7 * DAY_MS).toISOString().slice(0, 10)
  }
  for (const r of rows) {
    if (!r.created_at) continue
    const key = utcWeekStart(new Date(r.created_at))
    // A row outside the range is the caller's bug, but its money must still
    // land somewhere visible rather than vanish from the chart.
    weeks.set(key, (weeks.get(key) ?? 0) + r.amount)
  }
  return Array.from(weeks.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, revenue]) => ({ month, revenue }))
}

/**
 * Everything the dashboard derives from the itineraries in range, with the
 * money converted ONCE per won trip. `convert` returns null when a trip cannot
 * be stated in the reporting currency (the caller records that as an FX hole);
 * it is never called for a draft, sent or cancelled trip, since none of those
 * are revenue.
 */
export function summariseItineraries<T extends { id: string; status?: string | null; created_at: string | null }>(
  rows: T[],
  convert: (row: T) => number | null,
  range: { start: Date; end: Date }
) {
  const bookings = bookingBuckets(rows)
  const revenueById = new Map<string, number | null>()
  for (const r of rows) if (isWon(r.status)) revenueById.set(r.id, convert(r))

  const amounts = Array.from(revenueById.values())
  const totalRevenue = amounts.reduce<number>((s, a) => s + (a ?? 0), 0)
  const weekly = groupByWeek(
    rows
      .filter(r => revenueById.get(r.id) != null)
      .map(r => ({ created_at: r.created_at, amount: revenueById.get(r.id) as number })),
    range.start,
    range.end
  )

  return {
    bookings,
    revenueById,
    totalRevenue,
    conversionRate: conversionRate(bookings),
    avgDealSize: avgDealSize(amounts),
    weekly,
  }
}
