// ============================================
// Which Nile cruise rows compete: for the Preferred star and for pricing
// ============================================
// A cruise row is ONE sailing: a ship, its tier, its route (embark →
// disembark) and its length in nights.
//
// Here any number of cruises could be starred, so two starred ships on the
// same tier and port were settled silently by whichever was entered last,
// and pricing ignored where the sailing ends: an Aswan → Luxor and a
// Luxor → Aswan ship could stand in for each other.
//
// Owner, 2026-11-18 (as autoura-saas #825, "one boat per route"): two rows
// compete only when a tour could be priced from either:
//   · same tier, same embark city, same disembark city (case-insensitive);
//   · their lengths overlap (a row that states no length overlaps any).
// Starring one clears only the stars it competes with. The weekday does not
// split the star: one starred boat per route and length.
//
// Pure.

export interface CruiseScopeRow {
  id?: unknown
  tier?: unknown
  embark_city?: unknown
  disembark_city?: unknown
  duration_nights?: unknown
  ship_name?: unknown
}

const word = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** The row's length in nights, or null for "not stated" (= any). */
export function cruiseNights(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

const lengthsOverlap = (a: unknown, b: unknown) => {
  const x = cruiseNights(a), y = cruiseNights(b)
  return x == null || y == null || x === y
}

/** Whether a tour could be priced from either row: the star's scope. */
export function cruisesCompete(a: CruiseScopeRow, b: CruiseScopeRow): boolean {
  return word(a.tier) === word(b.tier)
    && word(a.embark_city) === word(b.embark_city)
    && word(a.disembark_city) === word(b.disembark_city)
    && lengthsOverlap(a.duration_nights, b.duration_nights)
}

/** The starred rows that `saved` (just starred) competes with, itself excluded. */
export function competingStars<T extends CruiseScopeRow & { is_preferred?: unknown }>(saved: CruiseScopeRow, rows: readonly T[]): T[] {
  return rows.filter(r => r.is_preferred === true && String(r.id ?? '') !== String(saved.id ?? '') && cruisesCompete(saved, r))
}

/**
 * The ships a sailing is priced from: narrowed to the tour's length in
 * nights, then to where it ends (the disembark city). Each narrowing applies
 * only when it leaves at least one ship: a length or port no ship matches
 * keeps the wider list, priced as before rather than losing its cruise.
 * Order is kept (the starred ship first).
 */
export function narrowCruiseCandidates<T extends CruiseScopeRow>(rows: readonly T[], want: { nights?: number | null; disembark?: string | null }): T[] {
  let out = [...rows]
  if (want.nights && want.nights > 0) {
    const fit = out.filter(r => { const n = cruiseNights(r.duration_nights); return n == null || n === want.nights })
    if (fit.length > 0) out = fit
  }
  const port = word(want.disembark)
  if (port) {
    const fit = out.filter(r => word(r.disembark_city) === port)
    if (fit.length > 0) out = fit
  }
  return out
}

/** "standard · Aswan → Luxor · 3 nights": the star's scope, for the notice. */
export function describeCruiseScope(r: CruiseScopeRow): string {
  const n = cruiseNights(r.duration_nights)
  const route = [r.embark_city, r.disembark_city].map(v => String(v ?? '').trim()).filter(Boolean).join(' → ')
  return [String(r.tier ?? '').trim(), route, n ? `${n} night${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
}

/** Where the first sailing ends: the city of the first day ashore after it. */
export function sailingEndCity(days: ReadonlyArray<{ accommodation_type?: unknown; city?: unknown }>): string | null {
  const first = days.findIndex(d => d.accommodation_type === 'cruise')
  if (first < 0) return null
  let last = first
  while (last + 1 < days.length && days[last + 1].accommodation_type === 'cruise') last++
  const ashore = days[last + 1]
  const city = String(ashore?.city ?? '').trim()
  return city || null
}
