// ============================================
// Cruise sightseeing transport: which package a sailing needs
// ============================================
// A package in Tours › Transport Packages is sold by the cruise's length in
// DAYS: "4D" is a 3-night cruise, "5D" a 4-night one. Pricing counted the
// NIGHTS aboard (the days marked as cruise days) and sold a 4-night cruise the
// 4D package, then fell back to the closest length when the exact one was
// missing — the wrong package, at the wrong price (operator, 2026-09-17).
//
//   - a sailing is a run of consecutive cruise nights; its length in days is
//     nights + 1 (the disembarkation day, whose transfer off the ship the
//     package covers)
//   - a package is matched by that exact length; none → No rate, never a
//     neighbour
//   - only a Cruise Sightseeing package prices a sailing. The type was never
//     read, so a 5-day "Multi-Day Tour Cairo→Alexandria" priced a 4-night
//     cruise whenever Postgres returned it first (audit, 2026-10)
//   - the package's cities are checked against the sailing's when both are
//     known: a Luxor→Aswan package does not price an Aswan→Luxor sailing,
//     nor one that touches neither city
//   - several packages left: a fixed order, never the database's — one whose
//     two cities both lie on the route first, then the OLDEST (created_at,
//     then id). Oldest, not latest-edited: editing a package must not move
//     every cruise quote onto another one. Saving a second active package of
//     the same type, length and route is refused (lib/b2b/transport-packages)
//
// Client-safe: no database, no engine import.

type DayLike = { day: number; is_cruise_day?: boolean; city?: string | null }

/** The package type that prices a sailing (b2b_transport_packages.package_type). */
export const CRUISE_SIGHTSEEING = 'cruise_sightseeing'

export interface Sailing {
  /** Nights aboard. */
  nights: number
  /** The package length this sailing needs: nights + 1. */
  durationDays: number
  /** The day numbers spent aboard (one per night). */
  nightDays: number[]
  /** The day the party leaves the ship, when the programme has one. */
  disembarkDay: number | null
}

/** Every sailing in the programme, in order. */
export function cruiseSailings(days: readonly DayLike[]): Sailing[] {
  const sailings: Sailing[] = []
  let run: number[] = []
  const close = (nextIndex: number) => {
    if (run.length === 0) return
    const after = days[nextIndex]
    sailings.push({
      nights: run.length,
      durationDays: run.length + 1,
      nightDays: run,
      disembarkDay: after ? after.day : null,
    })
    run = []
  }
  days.forEach((d, i) => {
    if (d.is_cruise_day === true) run.push(d.day)
    else close(i)
  })
  close(days.length)
  return sailings
}

/** A sailing's route, in order: the city of the day before the first night
 *  (where the party boards), each night aboard, and the disembark day.
 *  Lower-cased; blanks dropped. Empty when the days name no city. */
export function sailingRoute(days: readonly DayLike[], sailing: Sailing): string[] {
  const byDay = new Map(days.map(d => [d.day, d]))
  const first = sailing.nightDays[0]
  const before = days[days.findIndex(d => d.day === first) - 1]
  const dayNums = [before?.day, ...sailing.nightDays, sailing.disembarkDay]
  return dayNums
    .map(n => (n == null ? '' : cityKey(byDay.get(n)?.city)))
    .filter(c => c !== '')
}

export interface PackageLike {
  id?: string | number | null
  duration_days?: number | null
  package_type?: string | null
  origin_city?: string | null
  destination_city?: string | null
  created_at?: string | null
}

function cityKey(c: string | null | undefined): string {
  return (c ?? '').trim().toLowerCase()
}

// "Luxor" names the stop "Luxor (East Bank)" too.
const sameCity = (a: string, b: string) => a === b || a.includes(b) || b.includes(a)

/** How a package's cities sit on a route: 'match' (both on it, in this
 *  direction), 'open' (nothing to check — no route, or the package names no
 *  city, or only one of them is on it), 'conflict' (wrong direction, or
 *  neither named city is on the route). */
export function routeFit(pkg: PackageLike, route: readonly string[]): 'match' | 'open' | 'conflict' {
  const o = cityKey(pkg.origin_city)
  const d = cityKey(pkg.destination_city)
  if (route.length === 0 || (!o && !d)) return 'open'
  const oi = o ? route.findIndex(c => sameCity(c, o)) : -1
  let di = -1
  if (d) for (let i = route.length - 1; i >= 0; i--) if (sameCity(route[i], d)) { di = i; break }
  if (oi >= 0 && di >= 0) return oi <= di ? 'match' : 'conflict'
  if (oi < 0 && di < 0) return 'conflict'
  return 'open'
}

/** Oldest first, then id — the order a pick falls back on. */
function byAge(a: PackageLike, b: PackageLike): number {
  const ca = a.created_at ?? ''
  const cb = b.created_at ?? ''
  if (ca !== cb) return ca < cb ? -1 : 1
  const ia = String(a.id ?? '')
  const ib = String(b.id ?? '')
  return ia < ib ? -1 : ia > ib ? 1 : 0
}

/** The one package of `type` (and `durationDays`, when given) for a route,
 *  chosen the same way whatever order the rows arrive in. */
export function pickPackage<P extends PackageLike>(
  packages: readonly P[],
  want: { type: string; durationDays?: number | null; route?: readonly string[] },
): P | null {
  const route = want.route ?? []
  const fits = packages
    .filter(p => (p.package_type ?? '') === want.type)
    .filter(p => want.durationDays == null || p.duration_days === want.durationDays)
    .map(p => ({ p, fit: routeFit(p, route) }))
    .filter(x => x.fit !== 'conflict')
  fits.sort((a, b) => (a.fit === b.fit ? byAge(a.p, b.p) : a.fit === 'match' ? -1 : 1))
  return fits[0]?.p ?? null
}

/** The package for a sailing of `durationDays`: a Cruise Sightseeing package
 *  of the exact length only, on the sailing's route when it is known. */
export function packageForDuration<P extends PackageLike>(packages: readonly P[], durationDays: number, route: readonly string[] = []): P | null {
  return pickPackage(packages, { type: CRUISE_SIGHTSEEING, durationDays, route })
}

/** The first sailing of a programme's days (a template's `itinerary`), as the
 *  package lookup needs it; a programme with no cruise days falls back to
 *  `fallbackDays` (the tour's length) and no route to check. */
export function firstSailing(days: unknown, fallbackDays: number): { durationDays: number; route: string[] } {
  const list = Array.isArray(days)
    ? (days as unknown[]).filter((d): d is DayLike => !!d && typeof (d as DayLike).day === 'number')
    : []
  const s = cruiseSailings(list)[0]
  return s ? { durationDays: s.durationDays, route: sailingRoute(list, s) } : { durationDays: fallbackDays, route: [] }
}
