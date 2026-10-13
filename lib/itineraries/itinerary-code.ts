// ============================================
// A new trip's code — drawn again when it is taken
// ============================================
// itinerary_code is unique across the install. POST /api/itineraries drew
// ITN-YYYY-<4 random digits> and AI generation ITN-<tier>-YYYY-<3 random
// digits> (1,000 per tier and year) with no retry, so a clash surfaced as a
// 500 — for generation, only after the whole AI run had been paid for. Both
// now insert through here, the way the duplicate route already did: a clash
// on the code draws another and retries the same insert. Any other error
// (one itinerary per thread, a missing column) comes back unchanged.

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface DbError { code?: string; message?: string; details?: string }

const ATTEMPTS = 6

/** ITN-YYYY-NNNN (manual) or ITN-<T>-YYYY-NNNN (generated, T = tier initial). */
export function itineraryCode(year: number, tierInitial?: string | null, random = Math.random()): string {
  const digits = String(Math.floor(random * 9000) + 1000)
  return tierInitial ? `ITN-${tierInitial.toUpperCase()}-${year}-${digits}` : `ITN-${year}-${digits}`
}

export function isItineraryCodeClash(error: DbError | null | undefined): boolean {
  if (!error || error.code !== '23505') return false
  return /itinerary_code/.test(`${error.message ?? ''} ${error.details ?? ''}`)
}

/**
 * Insert `row` with `makeCode()` as its itinerary_code, drawing again on a
 * clash. A caller that names its own code gets exactly that code, once.
 */
export async function insertItineraryWithCode<Row>(
  supabase: DbClient,
  row: Record<string, unknown>,
  makeCode: () => string,
  opts: { fixedCode?: string | null; select?: string } = {}
): Promise<{ data: Row | null; error: DbError | null }> {
  const attempts = opts.fixedCode ? 1 : ATTEMPTS
  let last: { data: Row | null; error: DbError | null } = { data: null, error: null }
  for (let attempt = 0; attempt < attempts; attempt++) {
    const code = opts.fixedCode || makeCode()
    const { data, error } = await supabase
      .from('itineraries')
      .insert({ ...row, itinerary_code: code })
      .select(opts.select ?? '*')
      .single()
    last = { data: (data as Row) ?? null, error: error ?? null }
    if (!error || !isItineraryCodeClash(error)) return last
  }
  return last
}
