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

type Row = Record<string, unknown>
// Structural, so the engine's client, a route's client and the test mock all fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export async function hotelCandidates(db: Db, city: string, tier: string): Promise<Row[]> {
  const { data, error } = await db
    .from('accommodation_rates')
    .select('*')
    .eq('tier', tier)
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Row[]
}

export async function cruiseCandidates(db: Db, tier: string, embarkCity?: string | null): Promise<Row[]> {
  const base = () => db
    .from('nile_cruises')
    .select('*')
    .eq('tier', tier)
    .eq('is_active', true)
  const ordered = (q: ReturnType<typeof base>) =>
    q.order('is_preferred', { ascending: false }).order('created_at', { ascending: false })
  if (embarkCity) {
    const { data, error } = await ordered(base().ilike('embark_city', `%${embarkCity}%`))
    if (error) throw new Error(error.message)
    if (data && data.length) return data as Row[]
  }
  const { data, error } = await ordered(base())
  if (error) throw new Error(error.message)
  return (data ?? []) as Row[]
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
