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

import { randomBytes } from 'crypto'

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface DbError { code?: string; message?: string; details?: string }

const ATTEMPTS = 6

/** ITN-YYYY-XXXXXXXX (manual) or ITN-<T>-YYYY-XXXXXXXX (generated, T = tier initial). */
export function itineraryCode(year: number, tierInitial?: string | null): string {
  return newItineraryCode(tierInitial ? `ITN-${tierInitial.toUpperCase()}` : 'ITN', year)
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
// ---- the code itself ----
// itinerary_code is UNIQUE across every organisation. The generators drew
// from 1000 (concierge commit, AI generate) or 9000 (create, duplicate,
// quote convert) random numbers a year, so clashes came at modest volume —
// and the concierge commit read a code clash as a thread race and threw
// (AUDIT L8). Eight hex characters give ~4.3 billion codes a year.


/** Eight random upper-case hex characters. */
export function itineraryCodeSuffix(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

/** `${prefix}-${year}-XXXXXXXX`, e.g. ITN-2026-3FA9C01B or ITN-S-2026-…. */
export function newItineraryCode(prefix = 'ITN', year = new Date().getUTCFullYear()): string {
  return `${prefix}-${year}-${itineraryCodeSuffix()}`
}
