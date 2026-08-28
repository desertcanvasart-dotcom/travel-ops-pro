// ============================================
// DEMO FIXTURES ARE NOT REVENUE
// ============================================
// This database carries seeded records that exist so people can be shown the
// product working: the extras walkthrough (DEMO-EXT-*), the portal demo
// (DEMO-*), and the Playwright smoke fixture (E2E-*). They are real rows with
// real money on them, and every financial aggregate has been counting them.
//
// The 29 August QA audit reported this as a Critical data-integrity failure —
// "Total Revenue ¥1,099,897 + €5,953.88 + $3,000.00". Two of those three
// numbers are fixtures: ¥1,099,897 is DEMO-PORTAL-001 and $3,000 is
// DEMO-EXT-2026-001. The reported contradiction between modules was largely
// the fixtures being counted in some places and not others.
//
// The tempting fix is to delete them. That is wrong: E2E-SMOKE-001 is created
// by scripts/seed-e2e.mjs and consumed by the Playwright suite, the extras
// fixture backs a walkthrough that is not finished, and re-seeding would
// silently reintroduce the problem a deletion appeared to solve. So the
// fixtures stay and the MONEY QUERIES learn to skip them.
//
// NOT excluded, deliberately:
//   ITN-S-*  — "S = from pricing grid (slot-based)" (app/api/pricing-grid/save).
//              A real itinerary made a real way. €5,953.88 of the figure above
//              is one of these and it belongs in revenue.
//   QA ...   — the auditor's own 13 records carry ordinary codes and cannot be
//              recognised by shape. They are disposable and should be deleted,
//              which is a separate, human-approved action.
//
// The exclusion is REPORTED, never silent. A total that quietly changed is how
// this mess started; every aggregate that filters says how many rows it
// dropped so the number can be explained rather than argued about.

/**
 * Code prefixes that mark a seeded demonstration or test record.
 *
 * Matching is on the human-facing code (itinerary_code, booking_code), because
 * that is what the seed scripts control and what a person can recognise on
 * screen. Add a prefix here when a new fixture family is introduced.
 */
export const DEMO_CODE_PREFIXES = ['DEMO-', 'E2E-'] as const

/** Does this code belong to a seeded fixture rather than real trading? */
export function isDemoCode(code: unknown): boolean {
  if (typeof code !== 'string') return false
  const upper = code.trim().toUpperCase()
  return DEMO_CODE_PREFIXES.some(prefix => upper.startsWith(prefix))
}

export interface DemoExclusion {
  /** How many rows were held back. 0 means the totals are unfiltered. */
  excluded: number
  /** Their codes, so a total can be explained without re-querying. */
  codes: string[]
}

export interface Partitioned<T> {
  /** Rows that count towards money. */
  real: T[]
  /** Seeded fixtures, kept for callers that want to show them separately. */
  demo: T[]
  exclusion: DemoExclusion
}

/**
 * Split rows into real trading and seeded fixtures.
 *
 * Done in code rather than SQL on purpose: PostgREST cannot express "starts
 * with any of these" without string-interpolating the list into the query,
 * and interpolating into .select()/.or() strings is how this codebase has
 * been bitten before. The row counts here are small — these are aggregates
 * over an agency's trips, not a log table.
 */
export function partitionDemoRows<T>(
  rows: readonly T[] | null | undefined,
  getCode: (row: T) => unknown,
): Partitioned<T> {
  const real: T[] = []
  const demo: T[] = []
  for (const row of rows ?? []) {
    if (isDemoCode(getCode(row))) demo.push(row)
    else real.push(row)
  }
  return {
    real,
    demo,
    exclusion: {
      excluded: demo.length,
      codes: demo.map(row => String(getCode(row))),
    },
  }
}

/**
 * The ids of this org's seeded itineraries.
 *
 * Money rows — invoices, expenses, payments — carry an `itinerary_id` but not
 * a code, so filtering them means resolving the fixtures' ids first. One small
 * query; the result is a Set so callers filter in O(1).
 *
 * Fails OPEN: if the lookup errors, it returns an empty set and the caller
 * reports unfiltered totals. Showing a number that is slightly too big is
 * recoverable; hiding real revenue because a helper query failed is not.
 */
export interface DemoLookupClient {
  from: (table: string) => {
    // PostgREST's builder is thenable rather than a Promise, and its generic
    // chain is deep enough that naming it here makes tsc give up. `any` is the
    // narrow, deliberate exception; the shape is asserted below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (cols: string) => { eq: (col: string, val: unknown) => PromiseLike<any> }
  }
}

export async function loadDemoItineraryIds(
  supabase: DemoLookupClient,
  orgId: string,
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('itineraries')
      .select('id, itinerary_code')
      .eq('org_id', orgId)
    if (error || !data) return new Set()
    const rows = data as Array<{ id?: unknown; itinerary_code?: unknown }>
    return new Set(
      rows.filter(r => isDemoCode(r.itinerary_code)).map(r => String(r.id)),
    )
  } catch {
    return new Set()
  }
}

/** Drop rows whose itinerary is a seeded fixture. Rows with no itinerary stay. */
export function excludeDemoLinked<T extends { itinerary_id?: unknown }>(
  rows: readonly T[] | null | undefined,
  demoItineraryIds: ReadonlySet<string>,
): { real: T[]; exclusion: DemoExclusion } {
  const real: T[] = []
  const demo: T[] = []
  for (const row of rows ?? []) {
    const id = row.itinerary_id
    if (typeof id === 'string' && demoItineraryIds.has(id)) demo.push(row)
    else real.push(row)
  }
  return { real, exclusion: { excluded: demo.length, codes: [] } }
}
