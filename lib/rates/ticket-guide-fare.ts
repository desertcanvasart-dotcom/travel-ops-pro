// ============================================
// The throughout guide's ticket — a fare entered, or none
// ============================================
// Flights and day trains carry a `guide_rate` for the guide's own seat. The
// form's promise (rates.common.guideFareHint) is "Blank = the guide pays the
// customer rate; 0 = rides free". Blank and 0 are therefore two different
// answers, and every reader must keep them apart.
//
// They were not kept apart for flights. The period reader
// (lib/rates/rate-seasons) turns every blank period field into 0 — the right
// reading for a FARE, which then prices as a hole — and the guide's seat came
// out of it as 0 too: a throughout guide flew free on every fare where nobody
// had typed a guide price, and the quote was short by one ticket a leg.
//
// So the guide fare is read from what was STORED, never from the sanitized
// period: the raw period entry in `seasons` when the row has periods, else the
// row's own column. null/undefined/'' is "not entered" → the customer fare.
// Only a stored number (0 included) is a guide fare. This holds whether the
// period reader returns null or 0 for a blank.
//
// Pure. No database.

import type { RateSeason } from './rate-seasons'

/** A fare as entered: a finite number ≥ 0, or null when nothing was entered. */
export function enteredFare(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The row's stored periods as written, before any sanitizing. */
function storedPeriods(row: Record<string, unknown>): Array<Record<string, unknown>> | null {
  let value = row.seasons
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!Array.isArray(value) || value.length === 0) return null
  return value.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
}

/**
 * The guide's fare on a flight row for the period that prices the leg, or
 * null when none was entered (the guide then pays the customer fare).
 *
 * `period` is the period periodRatesFor chose; null/absent = the row's first
 * period (a date-less reader). A row with no stored periods reads its column.
 */
export function flightGuideFare(
  row: Record<string, unknown>,
  period?: Pick<RateSeason, 'from' | 'to'> | null
): number | null {
  const periods = storedPeriods(row)
  if (!periods) return enteredFare(row.guide_rate)
  const iso = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 10) : '')
  // Stored periods are not necessarily in date order; the sanitized ones are.
  const dated = periods
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(iso(p.from)) && /^\d{4}-\d{2}-\d{2}$/.test(iso(p.to)))
    .sort((a, b) => (iso(a.from) < iso(b.from) ? -1 : iso(a.from) > iso(b.from) ? 1 : 0))
  const hit = period
    ? dated.find(p => iso(p.from) === period.from && iso(p.to) === period.to)
    : dated[0]
  const rates = hit?.rates && typeof hit.rates === 'object' ? (hit.rates as Record<string, unknown>) : {}
  return enteredFare(rates.guide_rate)
}

/**
 * A flight `seasons` payload as it should be STORED: the sanitized periods,
 * with a guide fare the operator left blank kept blank (null) rather than the
 * 0 the generic period sanitizer writes. Matching is by dates, the identity a
 * sanitized period keeps.
 */
export function keepBlankGuideFares(
  raw: unknown,
  sanitized: RateSeason[] | null
): RateSeason[] | null {
  if (!sanitized) return sanitized
  const rawPeriods = storedPeriods({ seasons: raw }) ?? []
  const iso = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 10) : '')
  return sanitized.map(season => {
    const src = rawPeriods.find(p => iso(p.from) === season.from && iso(p.to) === season.to)
    const rates = src?.rates && typeof src.rates === 'object' ? (src.rates as Record<string, unknown>) : {}
    if (enteredFare(rates.guide_rate) !== null) return season
    // Stored as null: "not entered". The type says number, the column is JSONB.
    return { ...season, rates: { ...season.rates, guide_rate: null as unknown as number } }
  })
}
