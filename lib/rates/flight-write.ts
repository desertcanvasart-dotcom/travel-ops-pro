// ============================================
// A flight fare's periods, as every save path stores them
// ============================================
// Rates → Flights edits a fare through PUT /api/rates/flights/[id], and that
// route stored `seasons` exactly as posted: no sanitizing, no period limit,
// and no refresh of the base columns. The base columns (base_rate_eur,
// tax_eur, guide_rate, rate_valid_from/to) are the FIRST period's copy that
// every reader without a date takes — the pricing grid's option price, the
// CSV export — so after an edit of the first period's fare from 100 to 150
// they kept saying 100. The create and the collection PUT did it right; this
// is that handling, once, for all three.
//
// The guide's seat: a blank guide fare is stored as null (not entered → the
// guide pays the customer fare), never the 0 the generic period sanitizer
// writes (lib/rates/ticket-guide-fare).

import { sanitizeSeasons, legacyColumnMirror, datedPeriodCount, tooManyPeriodsMessage } from './rate-seasons'
import { enteredFare, keepBlankGuideFares } from './ticket-guide-fare'

export type FlightPeriodsPatch =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * The columns to write for a posted `seasons` value: the sanitized periods
 * plus the first period mirrored onto the base columns. A malformed or empty
 * payload reads as "no periods" and leaves the base columns alone; over the
 * period limit is refused, never truncated.
 */
export function flightPeriodsPatch(rawSeasons: unknown): FlightPeriodsPatch {
  const limit = tooManyPeriodsMessage(datedPeriodCount(rawSeasons))
  if (limit) return { ok: false, error: limit }
  const periods = keepBlankGuideFares(rawSeasons, sanitizeSeasons(rawSeasons, 'flight'))
  if (!periods) return { ok: true, patch: { seasons: null } }
  const mirror: Record<string, unknown> = { ...legacyColumnMirror(periods, 'flight') }
  // The mirror copies the period's guide fare; a blank stays NULL on the column too.
  mirror.guide_rate = enteredFare(periods[0].rates.guide_rate)
  return { ok: true, patch: { seasons: periods, ...mirror } }
}
