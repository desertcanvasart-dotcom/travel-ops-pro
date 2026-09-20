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

import { ANY_TIER } from './property-choice'

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

export async function hotelCandidates(db: Db, city: string, tier: string): Promise<Row[]> {
  const { data, error } = await atTier(
    db.from('accommodation_rates').select('*'),
    tier
  )
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Row[]
}

export async function cruiseCandidates(db: Db, tier: string, embarkCity?: string | null, nights?: number | null): Promise<Row[]> {
  // A sailing as long as the programme's cruise comes first (stable, so the
  // starred-then-newest order holds within): a 4-night programme's automatic
  // ship used to be the starred 3-night sailing the other way up the Nile,
  // ending in the wrong port — which now decides where the next day's road
  // transfer starts (NMS803, 2026-09-17).
  const byNights = (rows: Row[]): Row[] =>
    nights && nights > 0
      ? [...rows.filter(r => Number(r.duration_nights) === nights), ...rows.filter(r => Number(r.duration_nights) !== nights)]
      : rows
  const base = () => atTier(db.from('nile_cruises').select('*'), tier)
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
 *  when it no longer exists; `inactive` when it was switched off. */
export async function propertyById(
  db: Db,
  table: 'accommodation_rates' | 'nile_cruises',
  id: string
): Promise<{ row: Row | null; inactive: boolean }> {
  const { data, error } = await db.from(table).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { row: null, inactive: false }
  return (data as Row).is_active === false ? { row: null, inactive: true } : { row: data as Row, inactive: false }
}
