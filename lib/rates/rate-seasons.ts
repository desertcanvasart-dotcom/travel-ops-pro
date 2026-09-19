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

/** Dates are 'YYYY-MM-DD'. Rates are entity-specific — see RATE_FIELDS.
 *
 *  `season` is the agency's own word for the period — a KEY from the
 *  `rate_season` vocabulary (Low, High, Peak, Summer, Christmas…: Settings →
 *  Vocabulary). `name` is free text beside it ("2026", "Winter 26/27"). Either
 *  may be empty; the dates alone decide which period prices a night. */
export interface RateSeason {
  name: string
  season?: string
  from: string
  to: string
  rates: Record<string, number>
}

/** The most dated periods one hotel or ship rate may carry (operator,
 *  2026-09-16). Saves and imports over it are REFUSED, never truncated —
 *  cutting a contract's last periods off silently would un-price them. */
export const MAX_RATE_PERIODS = 6

const SEASON_KEY = /^[a-z0-9][a-z0-9_]{0,59}$/

/** How many periods a raw payload would save (rows with both dates — a
 *  half-filled editor row is dropped by sanitizeSeasons, so it does not count). */
export function datedPeriodCount(input: unknown): number {
  if (!Array.isArray(input)) return 0
  return input.filter(raw => {
    const s = (raw ?? {}) as Record<string, unknown>
    return typeof s.from === 'string' && ISO_DATE.test(s.from.trim())
      && typeof s.to === 'string' && ISO_DATE.test(s.to.trim())
  }).length
}

/** The message every save path returns when a payload is over the limit. */
export function tooManyPeriodsMessage(count: number): string | null {
  return count > MAX_RATE_PERIODS
    ? `A rate can carry at most ${MAX_RATE_PERIODS} periods; this one has ${count}. Merge or remove periods, then save again.`
    : null
}

/** A period's name where no vocabulary is at hand (server-side pricing
 *  notes): the free text, else the season key made readable, else the dates. */
export function plainPeriodName(season: Pick<RateSeason, 'name' | 'season' | 'from' | 'to'>): string {
  return season.name?.trim()
    || (season.season ? season.season.replace(/_/g, ' ') : '')
    || `${season.from} – ${season.to}`
}

/** How a period reads to a person: the season word, then the free text.
 *  `seasonLabel` turns a vocabulary key into the agency's word. */
export function periodTitle(
  season: Pick<RateSeason, 'name' | 'season'> | null | undefined,
  seasonLabel: (key: string) => string,
  fallback: string
): string {
  const word = season?.season ? seasonLabel(season.season) : ''
  const name = season?.name?.trim() ?? ''
  const parts = [word, name && name.toLowerCase() !== word.toLowerCase() ? name : ''].filter(Boolean)
  return parts.length ? parts.join(' · ') : fallback
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
  // A fare and its tax, per passport group, plus the guide's seat. Flights had
  // ONE window per row (rate_valid_from/to), so a route sold across four
  // seasons meant four near-identical rows — same airline, same flight number,
  // same cabin, retyped — and the operator asked for the hotels' shape
  // instead: "we need to be able to add more than one period, maybe up to five
  // or maybe six, like the hotels" (2026-09-19).
  flight: [
    'base_rate_eur', 'tax_eur',
    'base_rate_non_eur', 'tax_non_eur',
    'guide_rate',
  ],
} as const

export type RateSeasonEntity = keyof typeof RATE_FIELDS

/** A supplement's per-night price inside a period's rates: `supp:<key>:eur`
 *  or `supp:<key>:non_eur`, `<key>` a vocabulary key (lib/rates/supplements).
 *  Colons, because a key may itself end in `_non` — an underscore-joined
 *  field could not be split back apart.
 *  Kept by sanitizeSeasons alongside the fixed RATE_FIELDS, so the agency's
 *  own supplements ride every path a period's rates already take. */
export const SUPPLEMENT_FIELD = /^supp:([a-z0-9][a-z0-9_]{0,59}):(eur|non_eur)$/

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
    const readRate = (value: unknown): number => {
      // A blank rate is an unpriced hole, not a zero — it is stored as 0 and
      // read back through usableRate() at pricing time, same as every other
      // rate table.
      const n = value === null || value === undefined || value === '' ? 0 : Number(value)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }
    for (const field of RATE_FIELDS[entity]) rates[field] = readRate(src[field])
    // The agency's supplements, keyed by vocabulary key. Only well-formed
    // fields survive: the shape is the contract, the list is the agency's.
    for (const field of Object.keys(src)) {
      if (SUPPLEMENT_FIELD.test(field)) rates[field] = readRate(src[field])
    }

    const season = typeof s.season === 'string' && SEASON_KEY.test(s.season.trim())
      ? s.season.trim()
      : undefined
    // With a season word the free text is optional; with neither, the dates
    // are the only name the period has.
    const name = typeof s.name === 'string' && s.name.trim()
      ? s.name.trim().slice(0, 80)
      : season ? '' : `${from} – ${to}`
    seasons.push(season ? { name, season, from, to, rates } : { name, from, to, rates })
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

/** Dates inside the contract's overall span that no period covers. A night
 *  falling in a gap has NO rate (see periodRatesFor) — the editor surfaces
 *  these so a missing period is seen before a quote finds it. */
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

/** The single window a flight row carried before periods existed, read as one
 *  period so an unedited row keeps pricing exactly as it did. A row with no
 *  dates at all becomes one open period — which is what "always" meant. */
export function seasonsFromFlightColumns(input: object): RateSeason[] {
  const row = asRow(input)
  const from = typeof row.rate_valid_from === 'string' ? row.rate_valid_from.slice(0, 10) : ''
  const to = typeof row.rate_valid_to === 'string' ? row.rate_valid_to.slice(0, 10) : ''
  const rates: Record<string, number> = {}
  for (const field of RATE_FIELDS.flight) {
    const value = Number(row[field])
    if (Number.isFinite(value)) rates[field] = value
  }
  if (Object.keys(rates).length === 0) return []
  return [{
    name: typeof row.season === 'string' && row.season ? String(row.season) : '',
    season: typeof row.season === 'string' ? String(row.season) : undefined,
    // An absent edge is an open end, the same reading the ticket resolver
    // gave it — never a window that excludes every date.
    from: ISO_DATE.test(from) ? from : '1900-01-01',
    to: ISO_DATE.test(to) ? to : '2099-12-31',
    rates,
  }]
}

/** Every period for a rate row: the edited `seasons` list when present,
 *  otherwise derived from the legacy columns. */
export function seasonsForRow(input: object, entity: RateSeasonEntity): RateSeason[] {
  const row = asRow(input)
  const stored = parseSeasons(row.seasons, entity)
  if (stored?.length) return stored
  if (entity === 'accommodation') return seasonsFromAccommodationColumns(row)
  if (entity === 'flight') return seasonsFromFlightColumns(row)
  return seasonsFromCruiseColumns(row)
}

/** The rates that apply to a rate row on a travel date, or null when no period
 *  covers it. Pricing reads periodRatesFor, which says WHY there is nothing. */
export function ratesForTravelDate(
  row: object,
  entity: RateSeasonEntity,
  travelDate: string | null | undefined
): { season: RateSeason; rates: Record<string, number> } | null {
  const season = seasonForTravelDate(seasonsForRow(row, entity), travelDate)
  return season ? { season, rates: season.rates } : null
}

/**
 * The period that prices a night — the one rule every pricing path uses.
 *
 *   - The row has no periods at all → null: the caller reads its base columns
 *     (rows from before periods existed).
 *   - No travel date (a template priced without a departure) → the FIRST
 *     period, by start date, named as such.
 *   - A date a period covers → that period.
 *   - A date NO period covers → `outside: true` and no rates. That night has
 *     no price; it is an unpriced hole. There is no default period: it used
 *     to fall back to the base columns (the first period's copy), so a trip
 *     after the contract ended priced silently at the wrong season
 *     (operator, 2026-09-16: "the default period is confusing").
 */
export function periodRatesFor(
  row: object,
  entity: RateSeasonEntity,
  travelDate: string | null | undefined
): { season: RateSeason | null; rates: Record<string, number>; outside: boolean } | null {
  const seasons = seasonsForRow(row, entity)
  if (seasons.length === 0) return null
  if (!travelDate) return { season: seasons[0], rates: seasons[0].rates, outside: false }
  const season = seasonForTravelDate(seasons, travelDate)
  return season
    ? { season, rates: season.rates, outside: false }
    : { season: null, rates: {}, outside: true }
}

// ── Base-column mirror ───────────────────────────────────────────────────
// Plenty of readers take a rate row with no travel date in hand and use its
// base columns: the pricing grid, the B2B calculators, the tour builder's
// accommodation picker, the AI service creator. They are right to — a
// template with no departure date has no period to resolve against.
//
// So the FIRST period is mirrored back onto those columns on every save.
// That copy is plumbing for readers without a date, never a fallback for a
// date no period covers — periodRatesFor makes that night a hole.
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
  if (entity === 'flight') {
    // The grid, the CSV export and every date-less reader take these.
    return {
      rate_valid_from: first.from,
      rate_valid_to: first.to,
      base_rate_eur: first.rates.base_rate_eur,
      tax_eur: first.rates.tax_eur,
      base_rate_non_eur: first.rates.base_rate_non_eur,
      tax_non_eur: first.rates.tax_non_eur,
      guide_rate: first.rates.guide_rate,
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
