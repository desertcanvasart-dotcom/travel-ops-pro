// ============================================
// Which hotel or ship a programme day stays at
// ============================================
// The engine used to decide the property alone: the newest hotel in the
// city at the priced tier, the starred ship. A day said "Hotel (Cairo)"
// and nobody could see or change which hotel that was (operator,
// 2026-09-16). Decisions:
//
//   - A day with no choice keeps the automatic pick — and the editor SHOWS
//     it, so the operator can change it.
//   - ONE hotel per destination: every night in Cairo is the same hotel. A
//     choice made on one night applies to every hotel night in that city.
//     Every night aboard is the same ship.
//   - A DIFFERENT property per tier: Standard may stay at one hotel and
//     Deluxe at another, so the choice is kept per tier key.
//
// Stored on the programme day as `property_by_tier: { <tier key>: <rate row
// id> }` — an accommodation_rates id on a hotel night, a nile_cruises id on
// a night aboard. The day JSONB already travels whole through the editor
// (lib/itineraries/editable-day), so no migration.
//
// A chosen property that is gone or switched off is a HOLE naming it —
// never a quiet switch to another hotel.

export const PROPERTY_FIELD = 'property_by_tier' as const

export type PropertyKind = 'hotel' | 'cruise'

/** tier key → rate row id */
export type PropertyChoice = Record<string, string>

const TIER_KEY = /^[a-z0-9][a-z0-9_]{0,59}$/
const ROW_ID = /^[A-Za-z0-9-]{1,64}$/

/** A stored choice, cleaned: well-formed tier keys and row ids only. */
export function sanitizePropertyChoice(input: unknown): PropertyChoice | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out: PropertyChoice = {}
  for (const [tier, id] of Object.entries(input as Record<string, unknown>)) {
    if (TIER_KEY.test(tier) && typeof id === 'string' && ROW_ID.test(id.trim())) out[tier] = id.trim()
  }
  return Object.keys(out).length ? out : undefined
}

type DayLike = {
  city?: string | null
  overnight_city?: string | null
  accommodation_type?: string | null
  property_by_tier?: unknown
}

/** Where a hotel night sleeps — a day trip to Alexandria sleeps in Cairo. */
export const hotelCityOf = (day: DayLike): string => String(day.overnight_city || day.city || '').trim()

const sameCity = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The days one choice covers: every hotel night in the same city, or every
 *  night aboard. */
export function stayIndexes(days: readonly DayLike[], index: number): number[] {
  const day = days[index]
  if (!day) return []
  if (day.accommodation_type === 'cruise') {
    return days.map((d, i) => (d.accommodation_type === 'cruise' ? i : -1)).filter(i => i >= 0)
  }
  if (day.accommodation_type === 'none') return []
  const city = hotelCityOf(day)
  return days
    .map((d, i) => (d.accommodation_type !== 'cruise' && d.accommodation_type !== 'none' && sameCity(hotelCityOf(d), city) ? i : -1))
    .filter(i => i >= 0)
}

/** The property chosen for a stay at a tier: the first night in the stay
 *  that names one. undefined = automatic. */
export function chosenForStay(days: readonly DayLike[], index: number, tier: string): string | undefined {
  for (const i of stayIndexes(days, index)) {
    const id = sanitizePropertyChoice(days[i].property_by_tier)?.[tier]
    if (id) return id
  }
  return undefined
}

/** Set (or clear, with undefined) the property for a whole stay at a tier.
 *  Other tiers' choices are kept. Returns new day objects. */
export function applyStayChoice<T extends DayLike>(days: readonly T[], index: number, tier: string, id: string | undefined): T[] {
  const covered = new Set(stayIndexes(days, index))
  return days.map((day, i) => {
    if (!covered.has(i)) return day
    const next = { ...(sanitizePropertyChoice(day.property_by_tier) ?? {}) }
    if (id) next[tier] = id
    else delete next[tier]
    const copy = { ...day } as T & { property_by_tier?: PropertyChoice }
    if (Object.keys(next).length) copy.property_by_tier = next
    else delete copy.property_by_tier
    return copy
  })
}

/** For the engine: city (lowercased) → chosen hotel id, and the ship id, at a tier. */
export function choicesForTier(
  days: readonly DayLike[],
  tier: string
): { hotelByCity: Map<string, string>; cruiseId: string | undefined } {
  const hotelByCity = new Map<string, string>()
  let cruiseId: string | undefined
  for (const day of days) {
    const id = sanitizePropertyChoice(day.property_by_tier)?.[tier]
    if (!id) continue
    if (day.accommodation_type === 'cruise') {
      cruiseId ??= id
    } else if (day.accommodation_type !== 'none') {
      const key = hotelCityOf(day).toLowerCase()
      if (key && !hotelByCity.has(key)) hotelByCity.set(key, id)
    }
  }
  return { hotelByCity, cruiseId }
}
