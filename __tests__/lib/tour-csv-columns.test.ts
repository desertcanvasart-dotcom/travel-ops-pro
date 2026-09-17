// ============================================
// The tour sheet against the table it writes to
// ============================================
// Two failures, found 2026-09-15 by asking whether the sample sheet still
// matched the form:
//
//   1. `name_ja` was on the sheet and is NOT a column on tour_templates. The
//      export names every column in its select, so PostgREST refused the whole
//      query — `42703 column tour_templates.name_ja does not exist` — and
//      GET /api/tours/bulk/export returned a 500 to every user for as long as
//      that column was listed. The import wrote the unknown column too, so any
//      row carrying a Japanese name was rejected; the sample sheet shipped
//      with one filled in, teaching people to populate the field that broke
//      their import. A Japanese name lives in tour_template_versions.
//
//   2. The sheet had drifted behind the form. Nine fields the form collects
//      and the table stores — the theme, the physical level, "Best for",
//      highlights, attractions, inclusions, exclusions, meals, the image —
//      could not travel at all.
//
// write-contract.test.ts could not see the first one: the import route writes
// `.update(row as never)`, a variable rather than an object literal, and that
// guard documents literals-only to keep itself free of false positives. So the
// invariant is stated here instead, against the schema the migrations build —
// replayed into PGlite, no credentials, the same source the other schema
// guards use.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { TEMPLATE_CSV_COLUMNS, TEMPLATE_CSV_DB_COLUMNS, splitVirtualFields } from '@/lib/tours/template-csv'
import { replayMigrations, publicTableColumns } from '@/scripts/replay-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

// ---------------------------------------------------------------------------
// Columns tour_templates has that the sheet deliberately does NOT carry.
// Each needs a reason about the DATA, never "it was inconvenient" — an
// exclusion added to make this pass is a lie told to the next person. A new
// column fails here until somebody decides which side it belongs on.
// ---------------------------------------------------------------------------
const NOT_ON_THE_SHEET: Record<string, string> = {
  id: 'surrogate key; template_code is the portable identifier',
  created_at: 'audit timestamp, set by the database',
  updated_at: 'audit timestamp, set by the database',

  category_id: 'install-local UUID link, superseded by theme_key (migration 20261011)',
  primary_destination_id: 'install-local UUID link; no portable key exists for it yet',
  destinations_covered: 'install-local UUID list; cities_covered is the portable free-text equivalent',

  itinerary: 'the nested day-by-day programme; does not fit a flat sheet and is never overwritten by an import',
  hotels: 'nested per-tier hotel choices; install-local rate links',

  cached_starting_price: 'derived by the pricing engine, not authored',
  cached_starting_tier: 'derived by the pricing engine, not authored',
  cached_price_updated_at: 'derived by the pricing engine, not authored',
  cached_price_complete: 'derived by the pricing engine, not authored',
  cached_price_gaps: 'derived by the pricing engine, not authored',
  popularity_score: 'derived from usage, not authored',

  pricing_mode: 'per-install pricing behaviour, not tour content',
  uses_day_builder: 'per-install editing behaviour, not tour content',
  default_transportation_service: 'per-install pricing default, not tour content',
  transportation_city: 'per-install pricing default, not tour content',
  accommodation_nights: 'derived from the itinerary the sheet does not carry',

  age_suitability: 'vestigial: the form writes the constant "all_ages" in three places and never renders a picker for it',
  gallery_urls: 'the form collects no gallery; image_url carries the single cover image it does collect',
}

let schema: Map<string, Set<string>>
let db: { close(): Promise<void> }

beforeAll(async () => {
  const replay = await replayMigrations()
  db = replay.db
  expect(replay.failed, 'migrations did not replay cleanly').toEqual([])
  schema = await publicTableColumns(db)
})

afterAll(async () => {
  await db?.close()
})

describe('every column the sheet names', () => {
  it('is a real column on tour_templates, or is declared virtual', () => {
    // THE bug: name_ja was neither, and it broke export and import both.
    const real = schema.get('tour_templates')!
    const wrong = TEMPLATE_CSV_COLUMNS
      .filter(c => !c.virtual && !real.has(c.name))
      .map(c => c.name)
    expect(
      wrong,
      `these are on the sheet but are not columns of tour_templates. The export names every column in its select, so one of these makes the WHOLE export fail: ${wrong.join(', ')}`,
    ).toEqual([])
  })

  it('is not declared virtual when the table actually has it', () => {
    // The opposite slip: marking a real column virtual would silently stop it
    // being written at all.
    const real = schema.get('tour_templates')!
    const pointless = TEMPLATE_CSV_COLUMNS.filter(c => c.virtual && real.has(c.name)).map(c => c.name)
    expect(pointless, `declared virtual but tour_templates has it — the import would drop it`).toEqual([])
  })

  it('and the export only ever selects the real ones', () => {
    expect(TEMPLATE_CSV_DB_COLUMNS.every(c => !c.virtual)).toBe(true)
    expect(TEMPLATE_CSV_DB_COLUMNS.length).toBeLessThan(TEMPLATE_CSV_COLUMNS.length)
  })
})

describe('every column tour_templates has', () => {
  it('is on the sheet, or excluded for a stated reason', () => {
    const real = [...schema.get('tour_templates')!]
    const onSheet = new Set(TEMPLATE_CSV_COLUMNS.map(c => c.name))
    const unaccounted = real.filter(c => !onSheet.has(c) && !(c in NOT_ON_THE_SHEET))
    expect(
      unaccounted,
      `tour_templates gained columns the sheet neither carries nor explains. Add them to TEMPLATE_CSV_COLUMNS, or to NOT_ON_THE_SHEET with the reason: ${unaccounted.join(', ')}`,
    ).toEqual([])
  })

  it('has no stale exclusion for a column that no longer exists', () => {
    const real = schema.get('tour_templates')!
    const stale = Object.keys(NOT_ON_THE_SHEET).filter(c => !real.has(c))
    expect(stale, `NOT_ON_THE_SHEET names columns tour_templates does not have: ${stale.join(', ')}`).toEqual([])
  })

  it('has a real reason against each exclusion', () => {
    for (const [col, reason] of Object.entries(NOT_ON_THE_SHEET)) {
      expect(reason.length, `${col} needs a reason about the data`).toBeGreaterThan(25)
    }
  })
})

describe('splitVirtualFields', () => {
  it('keeps the virtual cells out of the row that reaches the table', () => {
    const { row, virtual } = splitVirtualFields({
      template_code: 'X-1', template_name: 'A tour', name_ja: '日本語名', theme_key: 'cultural',
    })
    expect(row).toEqual({ template_code: 'X-1', template_name: 'A tour', theme_key: 'cultural' })
    expect(virtual).toEqual({ name_ja: '日本語名' })
  })

  it('leaves a record with no virtual cells untouched', () => {
    const { row, virtual } = splitVirtualFields({ template_code: 'X-2', template_name: 'B' })
    expect(row).toEqual({ template_code: 'X-2', template_name: 'B' })
    expect(virtual).toEqual({})
  })
})
