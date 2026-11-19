// ============================================
// Transport by the hotel's area, and by the sights a rate covers
// ============================================
// Step 4 of the transport zones plan (ported from autoura-saas #833).
//
// PICKUP AREA. A transfer or day tour is priced for the area of the city the
// guests' hotel is in (a West Bank hotel, a 6th of October hotel). The area
// comes from the hotel the engine chose for that city: the night the guests
// arrive at it, or the night they woke up in it. A day states its own pickup
// area when it has no hotel there (a cruise day, a quote with no hotel).
// No hotel night in the city and nothing stated → the city's default area.
//
// SIGHTS. A sightseeing rate may list the sights it covers (Luxor East Bank:
// Karnak, Luxor Temple). Among one lookup's rates that list sights, the ones
// covering EVERY sight of the day with the FEWEST sights are the candidates
// (East Bank for Karnak alone; East & West Bank for Karnak and the Valley of
// the Kings). Between those the usual rule decides (lib/pricing/transport-
// choice: the starred one, else the cheapest with a warning; several
// companies and no star is a gap). None covers → the rates that list no
// sights, as before; none of those either → a gap naming the sights.
//
// Pure: the engine and its tests share it.

export interface ZoneDay {
  city: string
  /** Where the guests sleep when it is not `city` (a day trip). */
  overnight_city?: string | null
  accommodation_type?: string | null
  /** The day's own pickup area (a zone key), when it states one. */
  pickup_zone?: string | null
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/**
 * The area a transport line on `days[index]` in `city` is picked up in.
 * `hotelZoneIn(city)` is the area of the hotel the engine chose there.
 * null = the city's default area.
 */
export function pickupZoneFor(
  days: readonly ZoneDay[],
  index: number,
  city: string | null | undefined,
  hotelZoneIn: (city: string) => string | null | undefined,
): string | null {
  const day = days[index]
  const where = norm(city)
  if (!day || !where) return null
  if (day.pickup_zone && norm(day.city) === where) return day.pickup_zone
  const hotelNight = (d: ZoneDay | undefined) =>
    !!d && d.accommodation_type === 'hotel' && norm(d.overnight_city || d.city) === where
  // Tonight's hotel (arriving at it), or last night's (setting out from it).
  if (hotelNight(day) || hotelNight(days[index - 1])) return hotelZoneIn(String(city)) || null
  return null
}

export interface SightRate {
  covers_sights?: readonly string[] | null
}

export type SightPool<T> =
  | { kind: 'pool'; rates: T[] }
  | { kind: 'uncovered'; rates: T[] }

const lower = (s: string) => s.trim().toLowerCase()

/**
 * The rates a day's sights leave in play, among one lookup's rates (same
 * service, city, duration, area). Only meaningful when one of them lists sights.
 */
export function ratesForSights<T extends SightRate>(rates: readonly T[], daySights: readonly string[]): SightPool<T> {
  const want = [...new Set(daySights.map(lower).filter(Boolean))]
  const listing = rates.filter(r => (r.covers_sights?.length ?? 0) > 0)
  const plain = rates.filter(r => (r.covers_sights?.length ?? 0) === 0)
  // A day with no sights is a transfer, not a sightseeing package.
  if (want.length > 0) {
    const covering = listing.filter(r => {
      const has = new Set((r.covers_sights ?? []).map(lower))
      return want.every(s => has.has(s))
    })
    if (covering.length > 0) {
      const fewest = Math.min(...covering.map(r => r.covers_sights!.length))
      return { kind: 'pool', rates: covering.filter(r => r.covers_sights!.length === fewest) }
    }
  }
  if (plain.length > 0) return { kind: 'pool', rates: plain }
  if (want.length === 0) return { kind: 'pool', rates: listing }
  return { kind: 'uncovered', rates: listing }
}

/** The gap for a day whose sights no rate covers. */
export function uncoveredSightsMessage(what: string, sights: readonly string[], rateNames: readonly string[]): string {
  return `No ${what} rate covers ${sights.join(' + ')} (rates: ${rateNames.join(', ')}). Add a rate that covers them, or add the sight to a rate's "Sights covered", in Rates → Transportation.`
}
