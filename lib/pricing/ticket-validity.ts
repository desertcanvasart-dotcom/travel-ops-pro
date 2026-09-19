// ============================================
// The fare that is valid on the day it flies
// ============================================
// flight_rates has carried `season`, `rate_valid_from` and `rate_valid_to`
// since the table was created, and Rates → Flights lets the operator fill
// them. Nothing read them. A route's candidates were matched on from/to and
// cabin alone, so a seasonal pair did not price a summer departure at the
// summer fare — it made the leg AMBIGUOUS and left it unpriced:
//
//     2 flights serve CAI → NRT (EgyptAir, MS). Pick the exact flight on the day.
//
// The shape here is deliberately NOT the hotels' one. Hotels and ships carry
// dated periods inside a single rate row (lib/rates/rate-seasons) because only
// the numbers change between seasons. An airline's winter schedule is a
// different flight — its own number, its own times, sometimes its own airline —
// so a season is its own row, and the validity window is what selects it.
//
// Pure. No database, no engine.

/** The columns this reads. Every ticket table has them (flights, trains,
 *  sleepers); only the flight path uses this so far. */
export interface DatedTicketRow {
  rate_valid_from?: string | null
  rate_valid_to?: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A date-only edge as a number, or null when it is absent or unusable. */
function edge(value: string | null | undefined): number | null {
  const iso = String(value ?? '').trim().slice(0, 10)
  if (!ISO_DATE.test(iso)) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

/**
 * Whether a fare may be used on a date.
 *
 * BOTH ENDS INCLUSIVE, like every other window in the pricing engine.
 *
 * AN ABSENT OR UNREADABLE EDGE DOES NOT EXCLUDE. Most rows in the table are
 * open-ended — the form defaults `rate_valid_to` to 2099-12-31 and plenty of
 * rows predate anyone filling these in — and a fare that has always been used
 * must not stop pricing because nobody typed a window for it. That also makes
 * this filter a no-op on today's data: it starts discriminating only where the
 * operator has actually entered seasons.
 */
export function ticketValidOn(row: DatedTicketRow, travelDate: string | null | undefined): boolean {
  const at = edge(travelDate)
  // No date in hand — a template priced without a departure. Every fare stands;
  // the same answer periodRatesFor gives a date-less caller.
  if (at == null) return true

  const from = edge(row.rate_valid_from)
  const to = edge(row.rate_valid_to)
  if (from != null && at < from) return false
  if (to != null && at > to) return false
  return true
}

export interface TicketValidity<T> {
  /** Fares usable on the date — what the resolver should choose between. */
  valid: T[]
  /** Fares for this route that the date ruled out. Not junk: these are why
   *  "no fare for this route" would be the wrong thing to tell the operator. */
  expired: T[]
}

/**
 * Split a route's fares into the ones the date allows and the ones it does not.
 *
 * The excluded list is returned rather than dropped so the caller can tell the
 * two silences apart — a route nobody has a fare for, and a route whose fares
 * all sit in another season. They need opposite actions from the operator, and
 * one message for both sends them to the wrong page.
 */
export function ticketsValidOn<T extends DatedTicketRow>(
  rows: T[],
  travelDate: string | null | undefined
): TicketValidity<T> {
  const valid: T[] = []
  const expired: T[] = []
  for (const row of rows) {
    ;(ticketValidOn(row, travelDate) ? valid : expired).push(row)
  }
  return { valid, expired }
}

/** A window as it reads to a person: "1 Jun 2026 – 30 Sep 2026", or an open
 *  end as "from"/"until", or null when the fare carries no window at all. */
export function ticketWindowLabel(row: DatedTicketRow): string | null {
  const from = edge(row.rate_valid_from) != null ? String(row.rate_valid_from).slice(0, 10) : null
  const to = edge(row.rate_valid_to) != null ? String(row.rate_valid_to).slice(0, 10) : null
  if (from && to) return `${from} – ${to}`
  if (from) return `from ${from}`
  if (to) return `until ${to}`
  return null
}

// ── What to tell the operator when the date ruled everything out ──────────
// Three legs (flight, train, sleeper) reach the same two dead ends, and the
// sentences have to stay identical in shape or the same situation reads as two
// different problems depending on which ticket it happened to.

/**
 * "Nobody sells this route on this date" — as distinct from "nobody sells this
 * route", which is what the engine used to say for both.
 *
 * The two send the operator to opposite places: this one to the calendar, the
 * other to the contract. Naming the windows that WERE found is most of the
 * value — it turns "add a fare" into "your fare stops on 30 September".
 */
export function outOfSeasonMessage(opts: {
  rows: DatedTicketRow[]
  routeLabel: string
  legDate: string | null
  /** Where the operator goes to fix it, e.g. 'Rates → Flights'. */
  addWhere: string
}): string {
  const { rows, routeLabel, legDate, addWhere } = opts
  const windows = [...new Set(rows.map(ticketWindowLabel).filter(Boolean))]
  const subject = rows.length === 1 ? 'The fare' : `All ${rows.length} fares`
  const verb = rows.length === 1 ? 'covers' : 'cover'
  const found = windows.length ? ` (${windows.join(', ')})` : ''
  return `${subject} for ${routeLabel} ${verb} other dates, not ${legDate}${found}. Add the season's fare in ${addWhere}.`
}

/**
 * A stored pick that the date has left behind.
 *
 * THE dangerous case: move a sold trip six months and a resolver that honoured
 * the pick would quietly charge the old season's price. So it is a hole, and
 * the hole says which window the picked ticket actually covers rather than
 * implying it was deleted.
 */
export function namedOutOfSeasonMessage(opts: {
  row: DatedTicketRow
  /** 'flight', 'train', 'sleeping train' — used in both halves of the sentence. */
  noun: string
  dayNumber: number
  routeLabel: string
  legDate: string | null
}): string {
  const { row, noun, dayNumber, routeLabel, legDate } = opts
  const window = ticketWindowLabel(row) ?? 'other dates'
  return `The ${noun} picked for day ${dayNumber} (${routeLabel}) is not sold on ${legDate} — its fare covers ${window}. Pick the season's ${noun} on the day.`
}
