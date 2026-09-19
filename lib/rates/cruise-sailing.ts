// ============================================
// Which way a ship sails, how long, and on which days
// ============================================
// A Nile cruise is not one product per ship. The same ship sells a DOWNSTREAM
// sailing and an UPSTREAM one, and they are different lengths — Aswan→Luxor in
// three nights, Luxor→Aswan in four — at different prices. So they are two rate
// rows, which is also what the engine selects on (cruiseCandidates matches by
// embark city AND nights).
//
// On screen they were indistinguishable. `route_name` is free text that was set
// once and never followed the direction: all four of the agency's rows said
// "Aswan to Luxor", including the two that embark in Luxor. And the pickers
// showed route + tier + cabin, never the nights — the one field that separated
// them. So the label is DERIVED here from the columns that are true, and it
// cannot drift from them again.
//
// Sailing days are the other half of the same problem (operator, 2026-09-19:
// "most of my cruises has fixed starting day"). A ship that leaves Aswan only
// on Mondays and Fridays cannot serve a Wednesday itinerary, and nothing in the
// system knew that, so the quote looked right and the booking was impossible.

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type SailingDay = (typeof DAY_KEYS)[number]
export const SAILING_DAYS: readonly SailingDay[] = DAY_KEYS

const DAY_NAMES: Record<SailingDay, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}
/** Date.getUTCDay() is 0=Sunday. */
const BY_INDEX: readonly SailingDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export const isSailingDay = (v: unknown): v is SailingDay =>
  typeof v === 'string' && (DAY_KEYS as readonly string[]).includes(v)

/** The stored list, cleaned: known keys only, in week order, no repeats.
 *  An empty result means "no fixed day" — the ship sails whenever. */
export function sanitizeSailingDays(input: unknown): SailingDay[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<SailingDay>()
  for (const v of input) if (isSailingDay(v)) seen.add(v)
  return DAY_KEYS.filter(d => seen.has(d))
}

/** The weekday a date falls on, or null when it is not a date. */
export function dayOfDate(iso: string | null | undefined): SailingDay | null {
  const s = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) ? null : BY_INDEX[new Date(t).getUTCDay()]
}

/**
 * Whether this sailing can start on this date.
 *
 * TRUE when the ship has no fixed day — most do not, and a rate that has never
 * said otherwise must not start failing. TRUE when there is no date to check.
 * Only a date that lands outside a list the operator actually entered is false.
 */
export function sailsOn(days: unknown, date: string | null | undefined): boolean {
  const list = sanitizeSailingDays(days)
  if (list.length === 0) return true
  const day = dayOfDate(date)
  if (!day) return true
  return list.includes(day)
}

/** "Mondays and Fridays" / "Mondays, Wednesdays and Fridays". */
export function sailingDaysLabel(days: unknown): string {
  const list = sanitizeSailingDays(days).map(d => `${DAY_NAMES[d]}s`)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export const dayName = (d: SailingDay): string => DAY_NAMES[d]

/** A cruise row, as much of it as the label needs. */
export interface CruiseRouteRow {
  embark_city?: string | null
  disembark_city?: string | null
  route_name?: string | null
  duration_nights?: number | null
}

/**
 * "Aswan → Luxor" — from the columns that are TRUE.
 *
 * route_name is only the fallback, for a row that has no embark/disembark: it
 * is free text, and on this agency's data it contradicts the direction on half
 * the rows.
 */
export function cruiseRouteLabel(row: CruiseRouteRow): string {
  const from = String(row.embark_city ?? '').trim()
  const to = String(row.disembark_city ?? '').trim()
  if (from && to) return `${from} → ${to}`
  return String(row.route_name ?? '').trim()
}

/** The nights, as they read on a picker line. */
export function nightsLabel(nights: number | null | undefined): string {
  const n = Number(nights)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `${n} ${n === 1 ? 'night' : 'nights'}`
}

/**
 * How a sailing reads in a list: direction, length, then the fixed days.
 *
 * Direction and length are what make two rows of one ship different products,
 * so they lead. Everything the caller already shows (tier, cabin) is appended
 * by the caller.
 */
export function cruiseSailingLabel(row: CruiseRouteRow & { sailing_days?: unknown }): string {
  return [cruiseRouteLabel(row), nightsLabel(row.duration_nights), sailingDaysLabel(row.sailing_days)]
    .filter(Boolean)
    .join(' · ')
}
