// ============================================
// Which flight type a route is — from the agency's destinations
// ============================================
// The flights form used to decide "domestic" from a hardcoded list of eight
// Egyptian cities, so for any other country every flight came out
// international, and the agency's own Flight types vocabulary was never
// offered. The destinations the agency sells already carry their cities
// (Settings → Destinations), so the rule is theirs:
//
//   both cities in the SAME destination        → domestic
//   one known, the other in no destination     → international (abroad by
//                                                 definition: a city the
//                                                 agency sells nothing in)
//   both known, different destinations         → international
//   neither city known                         → null — no guess; the form
//                                                 keeps what it has
//
// The answer is a vocabulary KEY (flight_type); the words are the agency's.
// It is a pre-fill: the form's Flight type picker can always override it.

export interface DestinationLike {
  id: string
  cities: ReadonlyArray<{ name: string; aliases?: ReadonlyArray<string> | null }>
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** The destination a city name (or alias) belongs to, or null when none lists it. */
export function destinationOfCity(city: string, destinations: ReadonlyArray<DestinationLike>): string | null {
  const wanted = norm(city)
  if (!wanted) return null
  for (const d of destinations) {
    for (const c of d.cities) {
      if (norm(c.name) === wanted) return d.id
      if ((c.aliases ?? []).some(a => norm(a) === wanted)) return d.id
    }
  }
  return null
}

export function flightTypeForRoute(
  from: string,
  to: string,
  destinations: ReadonlyArray<DestinationLike>,
  keys: { domestic: string; international: string } = { domestic: 'domestic', international: 'international' }
): string | null {
  const a = destinationOfCity(from, destinations)
  const b = destinationOfCity(to, destinations)
  if (a === null && b === null) return null
  if (a !== null && b !== null) return a === b ? keys.domestic : keys.international
  return keys.international
}
