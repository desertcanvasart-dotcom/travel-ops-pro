// ============================================
// What a departure write may say
// ============================================
// The departure routes (POST, PUT [id], bulk) each checked a little: PUT took
// any duration (`Number(x) || current`), min_pax above max_pax went through
// everywhere, and an integration-mirrored departure could be edited and
// deleted like a local one — the next sync then put the partner's values back
// (or re-inserted the row) without a word. Pure, so the rules are tested once.

/** The columns an integration's sync writes on a mirrored departure
 *  (lib/integrations/departure-sync.ts mirroredValues). Editing them here is
 *  undone by the next sync, so the routes refuse it. */
export const MIRRORED_FIELDS = [
  'tour_name', 'tour_code', 'start_date', 'end_date', 'duration_days',
  'max_pax', 'booked_pax', 'min_pax', 'status', 'price_per_person', 'currency',
  'is_guaranteed', 'cutoff_days', 'public_notes',
] as const

/** Which of the fields being written the partner owns. */
export function mirroredFieldsTouched(update: Record<string, unknown>): string[] {
  return (MIRRORED_FIELDS as readonly string[]).filter(f => update[f] !== undefined)
}

export const MIRRORED_MESSAGE =
  'This departure is kept in sync by an integration — its dates, seats, status and price are changed at the partner, not here'

/** A tour length: a whole number of days, 1 to 365. */
export function durationError(value: unknown): string | null {
  const n = Number(value)
  if (value === null || value === '' || !Number.isInteger(n) || n < 1 || n > 365) {
    return 'duration_days must be a whole number from 1 to 365'
  }
  return null
}

/** The minimum to run cannot exceed the seats. A null minimum is none. */
export function paxRangeError(maxPax: unknown, minPax: unknown): string | null {
  if (minPax == null || maxPax == null) return null
  if (Number(minPax) > Number(maxPax)) return `min_pax (${minPax}) cannot be more than max_pax (${maxPax})`
  return null
}

/** The message when seats would fall under what is taken. */
export function seatsBelowTakenMessage(r: { booked_pax?: number; held?: number; taken?: number }): string {
  const parts = [
    r.booked_pax ? `${r.booked_pax} booked outside the app` : null,
    r.held ? `${r.held} held` : null,
  ].filter(Boolean)
  return `This date has ${r.taken ?? 0} seat(s) taken${parts.length ? ` (${parts.join(' + ')})` : ''} — seats cannot go below that`
}
