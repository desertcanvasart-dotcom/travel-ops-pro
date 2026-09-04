// ============================================
// Dated supplier rate periods for hotels and Nile cruises
// ============================================
// Both catalogs used to carry three hardcoded price levels and four date
// windows. Contracts do not: the number of dated periods depends on the
// property, and six is ordinary. `seasons` (migration 20260826_rate_seasons)
// is an ordered JSONB array on the rate row, each entry a real dated window
// carrying its own complete rate set — the same shape as activity_rates.tiers.
//
// REAL DATES, INCLUDING THE YEAR. detectCruiseSeason compared month-day only,
// so a window entered for one contract year silently applied to every year
// after it. Contracts are re-issued annually with moved dates.
//
// OVERLAP: the SHORTEST window containing the date wins. The old resolver
// checked peak, then high, then fell through to low — a priority order, and
// the backfilled data reflects it (Christmas/New Year sits inside the broad
// high-season window). Shortest-wins reproduces that precedence without asking
// the operator to name a priority, and reads the way a contract does: the
// specific Christmas line overrides the general October–April line.

/** Dates are 'YYYY-MM-DD'. Rates are entity-specific — see RATE_FIELDS. */
export interface RateSeason {
  name: string
  from: string
  to: string
  rates: Record<string, number>
}

/** The rate fields each catalog's periods carry, in display order.
 *  `guide_rate` is the property's special per-night rate for a throughout
 *  guide travelling with the group (the operator's "+1") — one number, no
 *  passport split, because the guide is Egyptian either way. 0 = not
 *  entered, which prices as a HOLE, never a free bed. */
export const RATE_FIELDS = {
  accommodation: [
    'pp_double_eur', 'single_supp_eur', 'triple_red_eur',
    'pp_double_non_eur', 'single_supp_non_eur', 'triple_red_non_eur',
    'guide_rate',
  ],
  cruise: [
    'single_eur', 'double_eur', 'triple_eur', 'suite_eur',
    'single_non_eur', 'double_non_eur', 'triple_non_eur', 'suite_non_eur',
    'guide_rate',
  ],
} as const

export type RateSeasonEntity = keyof typeof RATE_FIELDS

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Parse/validate a seasons payload from a form or API body. Returns null when
 *  the input is absent or unusable (never throws — a bad payload should read as
 *  "no periods entered", falling back to the legacy columns, not a 500). */
export function sanitizeSeasons(input: unknown, entity: RateSeasonEntity): RateSeason[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const seasons: RateSeason[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const s = raw as Record<string, unknown>
    const from = typeof s.from === 'string' ? s.from.trim() : ''
    const to = typeof s.to === 'string' ? s.to.trim() : ''
    // A period without both dates prices nothing — it is a half-filled row in
    // the editor, not a period. Drop it rather than failing the whole save.
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) continue
    if (to < from) return null

    const rates: Record<string, number> = {}
    const src = (s.rates && typeof s.rates === 'object' ? s.rates : {}) as Record<string, unknown>
    for (const field of RATE_FIELDS[entity]) {
      const value = src[field]
      // A blank rate is an unpriced hole, not a zero — it is stored as 0 and
      // read back through usableRate() at pricing time, same as every other
      // rate table.
      const n = value === null || value === undefined || value === '' ? 0 : Number(value)
      rates[field] = Number.isFinite(n) && n >= 0 ? n : 0
    }

    const name = typeof s.name === 'string' && s.name.trim()
      ? s.name.trim().slice(0, 80)
      : `${from} – ${to}`
    seasons.push({ name, from, to, rates })
  }
  if (seasons.length === 0) return null
  seasons.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  return seasons
}

/** Read a seasons value off a rate row. Tolerates the JSONB arriving as a
 *  string, which some Supabase client paths do for jsonb columns. */
export function parseSeasons(value: unknown, entity: RateSeasonEntity): RateSeason[] | null {
  if (typeof value === 'string') {
    try { return sanitizeSeasons(JSON.parse(value), entity) } catch { return null }
  }
  return sanitizeSeasons(value, entity)
}

const daySpan = (s: RateSeason): number => {
  const from = Date.parse(`${s.from}T00:00:00Z`)
  const to = Date.parse(`${s.to}T00:00:00Z`)
  return Number.isFinite(from) && Number.isFinite(to) ? to - from : Number.MAX_SAFE_INTEGER
}

/** The period a travel date falls in, or null when no window covers it.
 *  Overlapping windows resolve to the shortest — see the header note. */
export function seasonForTravelDate(
  seasons: RateSeason[] | null | undefined,
  travelDate: string | null | undefined
): RateSeason | null {
  if (!seasons?.length || !travelDate) return null
  // 'YYYY-MM-DD' string comparison is a correct date comparison and sidesteps
  // the timezone shift that Date-based comparisons put on window boundaries.
  const day = travelDate.slice(0, 10)
  if (!ISO_DATE.test(day)) return null
  const hits = seasons.filter(s => day >= s.from && day <= s.to)
  if (hits.length === 0) return null
  return hits.reduce((best, s) => (daySpan(s) < daySpan(best) ? s : best))
}

/** Periods whose windows overlap, for the editor to warn on. Returns the
 *  index pairs that collide. Overlap is legal (Christmas inside high season)
 *  but it is worth showing, because it is also how a typo looks. */
export function overlappingSeasons(seasons: RateSeason[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < seasons.length; i++) {
    for (let j = i + 1; j < seasons.length; j++) {
      if (seasons[i].from <= seasons[j].to && seasons[j].from <= seasons[i].to) pairs.push([i, j])
    }
  }
  return pairs
}

/** Dates inside the contract's overall span that no period covers. A date
 *  falling in a gap prices at the legacy base rate, which is almost never what
 *  the operator meant — the editor surfaces these. */
export function seasonGaps(seasons: RateSeason[]): Array<{ from: string; to: string }> {
  if (seasons.length < 2) return []
  const sorted = [...seasons].sort((a, b) => (a.from < b.from ? -1 : 1))
  const gaps: Array<{ from: string; to: string }> = []
  let covered = sorted[0].to
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from > nextDay(covered)) {
      gaps.push({ from: nextDay(covered), to: prevDay(sorted[i].from) })
    }
    if (sorted[i].to > covered) covered = sorted[i].to
  }
  return gaps
}

const shiftDay = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const nextDay = (iso: string) => shiftDay(iso, 1)
const prevDay = (iso: string) => shiftDay(iso, -1)

// ── Legacy bridge ────────────────────────────────────────────────────────
// Rows created before the migration, or by the bulk CSV importer (which still
// writes the fixed low_/high_/peak_ columns), have no `seasons`. Rather than
// carry two resolvers, derive periods from the legacy columns and run the same
// lookup over them.

/** A rate catalog row. The public entry points take `object` because callers
 *  hold typed interfaces (AccommodationRate, Cruise) that have no index
 *  signature; they are read by column name internally. */
export type RateRow = Record<string, unknown>
const asRow = (row: object | null | undefined): RateRow => (row ?? {}) as RateRow

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** A legacy window whose end precedes its start meant "wraps into next year" —
 *  the old resolver compared month-day, so 01 Oct → 30 Apr was a single high
 *  season spanning the new year. Real dated windows cannot express that, so
 *  unwrap it by moving the end into the following year. New periods entered
 *  through the editor are strict and never take this path. */
function unwrapLegacyWindow(from: string, to: string): { from: string; to: string } {
  if (to >= from) return { from, to }
  const endYear = Number(from.slice(0, 4)) + 1
  return { from, to: `${endYear}${to.slice(4)}` }
}

/** Build periods from an accommodation_rates row's legacy season columns. */
export function seasonsFromAccommodationColumns(input: object): RateSeason[] {
  const row = asRow(input)
  const build = (name: string, from: unknown, to: unknown, prefix: '' | 'high_' | 'peak_'): RateSeason | null => {
    if (!from || !to) return null
    const window = unwrapLegacyWindow(String(from).slice(0, 10), String(to).slice(0, 10))
    return {
      name, ...window,
      rates: {
        pp_double_eur:       num(row[`${prefix}pp_double_eur`]),
        single_supp_eur:     num(row[`${prefix}single_supp_eur`]),
        triple_red_eur:      num(row[`${prefix}triple_red_eur`]),
        pp_double_non_eur:   num(row[`${prefix}pp_double_non_eur`]),
        single_supp_non_eur: num(row[`${prefix}single_supp_non_eur`]),
        triple_red_non_eur:  num(row[`${prefix}triple_red_non_eur`]),
      },
    }
  }
  return [
    build('Low Season', row.low_season_from, row.low_season_to, ''),
    build('High Season', row.high_season_from, row.high_season_to, 'high_'),
    build('Peak Season', row.peak_season_from, row.peak_season_to, 'peak_'),
    build('Peak Season 2', row.peak_season_2_from, row.peak_season_2_to, 'peak_'),
  ].filter((s): s is RateSeason => s !== null)
}

/** Build periods from a nile_cruises row's legacy season columns. */
export function seasonsFromCruiseColumns(input: object): RateSeason[] {
  const row = asRow(input)
  const build = (name: string, from: unknown, to: unknown, level: 'low' | 'high' | 'peak'): RateSeason | null => {
    if (!from || !to) return null
    const window = unwrapLegacyWindow(String(from).slice(0, 10), String(to).slice(0, 10))
    return {
      name, ...window,
      rates: {
        single_eur:     num(row[`rate_${level}_single_eur`]),
        double_eur:     num(row[`rate_${level}_double_eur`]),
        triple_eur:     num(row[`rate_${level}_triple_eur`]),
        suite_eur:      num(row[`rate_${level}_suite_eur`]),
        single_non_eur: num(row[`rate_${level}_single_non_eur`]),
        double_non_eur: num(row[`rate_${level}_double_non_eur`]),
        triple_non_eur: num(row[`rate_${level}_triple_non_eur`]),
        suite_non_eur:  num(row[`rate_${level}_suite_non_eur`]),
      },
    }
  }
  return [
    build('Low Season', row.low_season_start, row.low_season_end, 'low'),
    build('High Season', row.high_season_start, row.high_season_end, 'high'),
    build('Peak Season', row.peak_season_1_start, row.peak_season_1_end, 'peak'),
    build('Peak Season 2', row.peak_season_2_start, row.peak_season_2_end, 'peak'),
  ].filter((s): s is RateSeason => s !== null)
}

/** Every period for a rate row: the edited `seasons` list when present,
 *  otherwise derived from the legacy columns. */
export function seasonsForRow(input: object, entity: RateSeasonEntity): RateSeason[] {
  const row = asRow(input)
  const stored = parseSeasons(row.seasons, entity)
  if (stored?.length) return stored
  return entity === 'accommodation'
    ? seasonsFromAccommodationColumns(row)
    : seasonsFromCruiseColumns(row)
}

/** The rates that apply to a rate row on a travel date, or null when no period
 *  covers it (the caller then falls back to the row's base columns). */
export function ratesForTravelDate(
  row: object,
  entity: RateSeasonEntity,
  travelDate: string | null | undefined
): { season: RateSeason; rates: Record<string, number> } | null {
  const season = seasonForTravelDate(seasonsForRow(row, entity), travelDate)
  return season ? { season, rates: season.rates } : null
}

// ── Base-column mirror ───────────────────────────────────────────────────
// Plenty of readers take a rate row with no travel date in hand and use its
// base columns: the pricing grid, the B2B calculators, the tour builder's
// accommodation picker, the AI service creator. They are right to — a
// template with no departure date has no period to resolve against.
//
// So the FIRST period is mirrored back onto those columns on every save.
// Before this the base columns were the low season, which was the first period
// anyway; the meaning is unchanged and the mirror keeps one source of truth.
// The later high_/peak_ columns are left alone: once `seasons` is set nothing
// reads them for pricing, and clearing them would throw away data the bulk
// CSV export still shows.

/** Columns to write alongside a saved `seasons` list so date-less readers keep
 *  seeing a real base rate. Returns {} when there are no periods to mirror. */
export function legacyColumnMirror(
  seasons: RateSeason[] | null,
  entity: RateSeasonEntity
): Record<string, string | number> {
  const first = seasons?.[0]
  if (!first) return {}
  if (entity === 'accommodation') {
    return {
      low_season_from: first.from,
      low_season_to: first.to,
      pp_double_eur: first.rates.pp_double_eur,
      single_supp_eur: first.rates.single_supp_eur,
      triple_red_eur: first.rates.triple_red_eur,
      pp_double_non_eur: first.rates.pp_double_non_eur,
      single_supp_non_eur: first.rates.single_supp_non_eur,
      triple_red_non_eur: first.rates.triple_red_non_eur,
    }
  }
  return {
    low_season_start: first.from,
    low_season_end: first.to,
    rate_low_single_eur: first.rates.single_eur,
    rate_low_double_eur: first.rates.double_eur,
    rate_low_triple_eur: first.rates.triple_eur,
    rate_low_suite_eur: first.rates.suite_eur,
    rate_low_single_non_eur: first.rates.single_non_eur,
    rate_low_double_non_eur: first.rates.double_non_eur,
    rate_low_triple_non_eur: first.rates.triple_non_eur,
    rate_low_suite_non_eur: first.rates.suite_non_eur,
    // The flat legacy trio is EUR-only and predates seasons entirely.
    rate_single_eur: first.rates.single_eur,
    rate_double_eur: first.rates.double_eur,
    rate_triple_eur: first.rates.triple_eur,
  }
}
