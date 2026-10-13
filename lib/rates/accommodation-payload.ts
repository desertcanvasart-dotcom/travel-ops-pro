// ============================================
// The columns a cruise or hotel-service rate form may write
// ============================================
// The cruise routes spread the request body straight into insert/update, so
// any column could be set — `id`, `created_at`, or a raw `property_id` of
// another company's ship that the property resolver had (rightly) refused.
// Only these columns pass; seasons, supplements, sailing days, supplier and
// property are added by the routes after they are validated.

export const CRUISE_WRITABLE = [
  'cruise_code', 'ship_name', 'ship_category', 'route_name', 'embark_city', 'disembark_city',
  'duration_nights', 'cabin_type', 'tier', 'is_preferred', 'rate_currency', 'supplier_name',
  'meals_included', 'sightseeing_included', 'description', 'notes', 'is_active', 'season',
  'rate_valid_from', 'rate_valid_to',
  // The flat legacy trio and the old low/high/peak columns the form still
  // sends; a saved period list overrides the low ones (rate-seasons mirror).
  'rate_single_eur', 'rate_double_eur', 'rate_triple_eur',
  'low_season_start', 'low_season_end', 'high_season_start', 'high_season_end',
  'peak_season_1_start', 'peak_season_1_end', 'peak_season_2_start', 'peak_season_2_end',
  ...['low', 'high', 'peak'].flatMap(level =>
    ['single', 'double', 'triple', 'suite'].flatMap(cabin =>
      [`rate_${level}_${cabin}_eur`, `rate_${level}_${cabin}_non_eur`])),
] as const

/** Columns that are uuid/date/CHECKed: '' means absent. */
const EMPTY_MEANS_NULL = new Set([
  'rate_valid_from', 'rate_valid_to', 'rate_currency',
  'low_season_start', 'low_season_end', 'high_season_start', 'high_season_end',
  'peak_season_1_start', 'peak_season_1_end', 'peak_season_2_start', 'peak_season_2_end',
])

/** The writable part of a cruise form body. */
export function pickCruiseColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of CRUISE_WRITABLE) {
    if (!(col in body)) continue
    const v = body[col]
    out[col] = EMPTY_MEANS_NULL.has(col) && (v === '' || v === undefined) ? null : v
  }
  return out
}

/** Why the Rate Card Validity cannot be saved, or null. */
export function validityError(from: unknown, to: unknown): string | null {
  const f = typeof from === 'string' ? from.slice(0, 10) : ''
  const t = typeof to === 'string' ? to.slice(0, 10) : ''
  return f && t && t < f ? `Valid To (${t}) is before Valid From (${f}). Fix the dates, then save again.` : null
}

/** hotel_staff_rates columns a create or edit may set. The POST spread the
 *  raw body, so `id`, `created_at` or an unknown column reached the insert.
 *  The pricing basis (pricing_type, max_capacity) is added by its own cleaner. */
export const HOTEL_SERVICE_WRITABLE = [
  'service_code', 'service_type', 'hotel_category', 'rate_eur', 'destination', 'supplier_id',
  'rate_currency', 'rate_valid_from', 'rate_valid_to', 'description', 'notes', 'is_active',
] as const

export function pickHotelServiceColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of HOTEL_SERVICE_WRITABLE) if (col in body) out[col] = body[col]
  return out
}
