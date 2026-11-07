// ============================================
// The cities one guide rate covers
// ============================================
// Operator, 2026-11-07: a guide rate could name one city. In practice a Cairo
// guide also works Alexandria, one guide covers Luxor and Aswan together, and
// some guides work every city.
//
// guide_rates.cities (migration 20270117) is the list a rate covers. An empty
// list is "All cities" — the meaning a rate with no city always had. The old
// single `city` column is kept as the list's FIRST city, so the unique key,
// CSV export, filters and anything else that reads `city` keep working; a row
// written before the migration (cities empty, city set) covers just that city.
//
// Client-safe and pure.

type Row = { city?: string | null; cities?: readonly (string | null)[] | null }

const clean = (v: unknown) => String(v ?? '').trim()
const lc = (v: unknown) => clean(v).toLowerCase()

/** Every city this rate covers; [] = all cities. */
export function guideRateCities(row: Row): string[] {
  const list = dedupe(row.cities ?? [])
  if (list.length) return list
  const one = clean(row.city)
  return one ? [one] : []
}

/** Does the rate cover `city` by name (not merely as an all-cities rate)? */
export function guideRateNamesCity(row: Row, city: string | null | undefined): boolean {
  const want = lc(city)
  return !!want && guideRateCities(row).some(c => lc(c) === want)
}

/**
 * How well a rate fits the day's city, for ordering:
 * 0 = it names the city (any city in its list), 1 = an all-cities rate,
 * 2 = it covers other cities only. With no city asked, an all-cities rate
 * fits best.
 */
export function guideCityRank(row: Row, city: string | null | undefined): number {
  const covered = guideRateCities(row)
  if (!clean(city)) return covered.length ? 1 : 0
  if (!covered.length) return 1
  return guideRateNamesCity(row, city) ? 0 : 2
}

/** "Cairo, Alexandria" — or null for an all-cities rate (the caller words that). */
export function guideCitiesText(row: Row): string | null {
  const list = guideRateCities(row)
  return list.length ? list.join(', ') : null
}

/**
 * The `city` + `cities` columns a write stores, from a body carrying either.
 * `cities` wins when sent (the form); a caller that only knows `city` (CSV,
 * bulk import, older clients) writes a one-city list. Returns null when the
 * body touches neither, so a partial update leaves both alone.
 */
export function guideCitiesWrite(body: { city?: unknown; cities?: unknown }): { city: string | null; cities: string[] } | null {
  if (Array.isArray(body.cities)) {
    const list = dedupe(body.cities)
    return { city: list[0] ?? null, cities: list }
  }
  if (body.city !== undefined) {
    const one = clean(body.city)
    return { city: one || null, cities: one ? [one] : [] }
  }
  return null
}

function dedupe(list: readonly unknown[]): string[] {
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
