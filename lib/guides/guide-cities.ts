// ============================================
// The cities a guide works in
// ============================================
// Operator, 2026-11-13: a guide charges the same wherever they guide, and one
// guide works several cities (a Cairo guide also does Alexandria; one guide
// covers Luxor and Aswan; some guides work everywhere).
//
// So the cities belong to the GUIDE, not to each rate: supplier_cities
// (migration 20270118) holds one row per (guide, city), edited on Rates ›
// Guides next to the guide's languages. A guide_rates row is the price only.
// No cities on a guide = the guide works in every city.
//
// 20270117 had put a city LIST on every guide_rates row; guide_rates.city /
// .cities are retired — never read here, never written.
//
// Readers attach the guide's cities to each rate row as `guide_cities`
// (lib/guides/guide-coverage, server side) and the pure functions below read
// only that. A row with no `guide_cities` reads as an every-city guide.
//
// Client-safe and pure.

/** A rate row carrying its guide's cities (attached by the reader). */
export type WithGuideCities = { guide_cities?: readonly (string | null)[] | null }

const clean = (v: unknown) => String(v ?? '').trim()
const lc = (v: unknown) => clean(v).toLowerCase()

/** Trimmed, blank-free, case-insensitively de-duplicated (first spelling wins). */
export function cleanCityList(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of list) {
    const c = clean(v)
    if (!c || seen.has(c.toLowerCase())) continue
    seen.add(c.toLowerCase())
    out.push(c)
  }
  return out
}

/** Every city the rate's guide works in; [] = every city. */
export function guideRateCities(row: WithGuideCities): string[] {
  return cleanCityList(row.guide_cities ?? [])
}

/** Does the guide work in `city` by name (not merely as an every-city guide)? */
export function guideRateNamesCity(row: WithGuideCities, city: string | null | undefined): boolean {
  const want = lc(city)
  return !!want && guideRateCities(row).some(c => lc(c) === want)
}

/**
 * How well a rate's guide fits the day's city, for ordering:
 * 0 = the guide works in that city by name, 1 = an every-city guide (or a
 * rate with no guide), 2 = the guide works in other cities only. With no
 * city asked, an every-city guide fits best.
 */
export function guideCityRank(row: WithGuideCities, city: string | null | undefined): number {
  const covered = guideRateCities(row)
  if (!clean(city)) return covered.length ? 1 : 0
  if (!covered.length) return 1
  return guideRateNamesCity(row, city) ? 0 : 2
}

/** "Cairo, Alexandria" — or null for an every-city guide (the caller words that). */
export function guideCitiesText(row: WithGuideCities): string | null {
  const list = guideRateCities(row)
  return list.length ? list.join(', ') : null
}

/** Each rate row with its guide's cities attached, from a supplier → cities map. */
export function withGuideCities<T extends { supplier_id?: string | null }>(
  rows: readonly T[],
  bySupplier: ReadonlyMap<string, readonly string[]>,
): (T & { guide_cities: string[] })[] {
  return rows.map(r => ({
    ...r,
    guide_cities: r.supplier_id ? [...(bySupplier.get(r.supplier_id) ?? [])] : [],
  }))
}
