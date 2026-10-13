// ============================================
// The hotels and ships a stay can use, in the engine's order
// ============================================
// ONE list, read by both the pricing engine (it takes the first as the
// automatic pick) and the day editor's picker (it shows the list and names
// the first as "Automatic"). Two copies of this query would drift, and the
// editor would then promise one hotel while the quote priced another.
//
// Hotels: active rows in the city at the tier, newest first (hotels carry no
// preferred star — see engine-order-columns.test). Ships: active rows at the
// tier, the starred ship first then newest; a named embarkation port narrows
// the list, and a port that matches nothing (programme days are usually
// filed under "Nile Cruise") falls back to every ship at the tier.
//
// One company's rows only (org_id): a company prices and picks from its own
// hotels and ships. No organisation, no rows.
//
// WITH A TRAVEL DATE (the engine has one; the day editor does not) the list is
// re-ranked, stably, so the order above holds within each rank:
//   1. the Rate Card Validity (rate_valid_from/to; a blank end is open)
//      covers the date AND a dated period covers it (or the row has none);
//   2. the validity covers the date but no period does;
//   3. the validity does not cover the date — an expired or future sheet.
// The newest row used to win outright, so an expired rate sheet kept being
// picked, and filing next year's contract as a new row turned this year's
// remaining nights into "outside periods" holes. A row is never dropped:
// when nothing covers the date the best of the rest still prices, exactly
// as before.

import { ANY_TIER } from './property-choice'
import { seasonsForRow, seasonForTravelDate, type RateSeasonEntity } from '@/lib/rates/rate-seasons'

type Row = Record<string, unknown>
// Structural, so the engine's client, a route's client and the test mock all fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** ANY_TIER lists every tier's properties — the day editor offering the
 *  operator a property to NAME, which then prices whatever tier the quote
 *  runs at (lib/pricing/property-choice). The engine's own automatic pick
 *  never passes it: an unnamed stay still takes the tier it was sold at. */
const atTier = <T>(q: T, tier: string): T =>
  tier === ANY_TIER ? q : ((q as { eq: (c: string, v: string) => T }).eq('tier', tier))

// Matches no organisation (an org-less caller reads nothing).
const NO_ORG = '00000000-0000-0000-0000-000000000000'

const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')

/** 0 = covers the date fully, 1 = validity only, 2 = validity does not. */
export function dateRank(row: Row, entity: RateSeasonEntity, travelDate: string): number {
  const from = day(row.rate_valid_from)
  const to = day(row.rate_valid_to)
  if ((from && travelDate < from) || (to && travelDate > to)) return 2
  const seasons = seasonsForRow(row, entity)
  return seasons.length === 0 || seasonForTravelDate(seasons, travelDate) ? 0 : 1
}

/** `rows` re-ranked for a travel date (stable). No date, no change. */
export function rankForDate(rows: Row[], entity: RateSeasonEntity, travelDate?: string | null): Row[] {
  const d = day(travelDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return rows
  return rows
    .map((row, i) => ({ row, i, rank: dateRank(row, entity, d) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(x => x.row)
}

export async function hotelCandidates(db: Db, orgId: string | null | undefined, city: string, tier: string, travelDate?: string | null): Promise<Row[]> {
  const { data, error } = await atTier(
    db.from('accommodation_rates').select('*').eq('org_id', orgId ?? NO_ORG),
    tier
  )
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return rankForDate((data ?? []) as Row[], 'accommodation', travelDate)
}

export async function cruiseCandidates(db: Db, orgId: string | null | undefined, tier: string, embarkCity?: string | null, nights?: number | null, travelDate?: string | null): Promise<Row[]> {
  // A sailing as long as the programme's cruise comes first (stable, so the
  // starred-then-newest order holds within): a 4-night programme's automatic
  // ship used to be the starred 3-night sailing the other way up the Nile,
  // ending in the wrong port — which now decides where the next day's road
  // transfer starts (NMS803, 2026-09-17).
  // Within each length, a sheet covering the travel date first (header).
  const byNights = (all: Row[]): Row[] => {
    const rows = rankForDate(all, 'cruise', travelDate)
    return nights && nights > 0
      ? [...rows.filter(r => Number(r.duration_nights) === nights), ...rows.filter(r => Number(r.duration_nights) !== nights)]
      : rows
  }
  const base = () => atTier(db.from('nile_cruises').select('*').eq('org_id', orgId ?? NO_ORG), tier)
    .eq('is_active', true)
  const ordered = (q: ReturnType<typeof base>) =>
    q.order('is_preferred', { ascending: false }).order('created_at', { ascending: false })
  if (embarkCity) {
    const { data, error } = await ordered(base().ilike('embark_city', `%${embarkCity}%`))
    if (error) throw new Error(error.message)
    if (data && data.length) return byNights(data as Row[])
  }
  const { data, error } = await ordered(base())
  if (error) throw new Error(error.message)
  return byNights((data ?? []) as Row[])
}

/** One row by id, whatever its tier or city — the operator chose it. Null
 *  when it no longer exists — or is another company's; `inactive` when it was
 *  switched off. */
export async function propertyById(
  db: Db,
  orgId: string | null | undefined,
  table: 'accommodation_rates' | 'nile_cruises',
  id: string
): Promise<{ row: Row | null; inactive: boolean }> {
  const { data, error } = await db.from(table).select('*').eq('org_id', orgId ?? NO_ORG).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { row: null, inactive: false }
  return (data as Row).is_active === false ? { row: null, inactive: true } : { row: data as Row, inactive: false }
}
