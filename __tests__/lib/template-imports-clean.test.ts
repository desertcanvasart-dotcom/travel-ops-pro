// ============================================
// A downloaded template must import as a no-op
// ============================================
// Download the sample sheet for a rate table, import it untouched, and the
// answer should be "skipped 1 unedited example row" — not an error. Filling
// the sheet in underneath the example and importing the lot is the obvious
// mistake to make, so the example row carries EXAMPLE-DELETE-THIS-ROW in its
// unique-key column and the importer drops it.
//
// It used to drop it too LATE. The row was removed just before the upsert,
// long after supplier resolution had already looked at it — and the sample
// names a supplier called "Example Name", which resolves to nothing. So for
// every table whose sheet carries supplier_name, importing the untouched
// template came back "1 row(s) have validation errors" with no counts at all,
// instead of the intended warning. The E2E suite caught it on
// accommodation_rates; meal_rates, flight_rates and activity_rates had been
// shipping the same landmine unnoticed, because nothing covered them.
//
// The example row is now dropped before any resolver sees it. These tests are
// here rather than only in e2e/csv-template.authed.spec.ts because the E2E job
// needs a live Supabase project and its secrets, so it does not run on fork
// PRs and cannot run locally — this catches the same bug with neither.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import {
  RATE_TABLE_CONFIGS,
  getTemplateHeaders,
  buildTemplateRow,
  validateImportData,
  isExampleRow,
} from '@/lib/bulk-rate-service'

/** The template as the export route serves it, parsed back as the import
 *  route parses it. */
function templateRows(config: (typeof RATE_TABLE_CONFIGS)[string]) {
  const csv = Papa.unparse({ fields: getTemplateHeaders(config), data: [buildTemplateRow(config)] })
  return Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  }).data
}

const TABLES = Object.entries(RATE_TABLE_CONFIGS)

describe('every rate table’s own template', () => {
  it.each(TABLES)('%s: the sample row validates, so nothing else can mask a real error', name => {
    const config = RATE_TABLE_CONFIGS[name]
    const preview = validateImportData(templateRows(config), config)
    expect(preview.errors, `${name}: the sample the app itself hands out does not validate`).toEqual([])
    expect(preview.invalidRows).toBe(0)
  })

  it.each(TABLES)('%s: the sample row is recognised as the example, by the unique key', name => {
    const config = RATE_TABLE_CONFIGS[name]
    const [row] = validateImportData(templateRows(config), config).parsedValidRows!
    const key = config.uniqueKey[0]
    expect(
      isExampleRow(row[key]),
      `${name}: the example row must carry the sentinel in ${key}, or the importer cannot skip it`,
    ).toBe(true)
  })

  it.each(TABLES)('%s: nothing survives the example filter, so no resolver ever sees it', name => {
    // This is the ordering the import route depends on: the example row is
    // filtered out BEFORE supplier and property resolution. If a template ever
    // ships a row the filter does not catch, that row reaches the resolvers —
    // which is exactly how "Example Name" sank a whole import.
    const config = RATE_TABLE_CONFIGS[name]
    const rows = validateImportData(templateRows(config), config).parsedValidRows!
    const survivors = rows.filter(r => !isExampleRow(r[config.uniqueKey[0]]))
    expect(survivors, `${name}: a template row would reach the resolvers`).toEqual([])
  })
})

describe('the sample values that reach a resolver', () => {
  it('names a supplier on some sheets — which is why the row must be dropped first', () => {
    // Pinning the reason, not the behaviour: these templates genuinely do
    // carry an unresolvable supplier_name, and that is fine precisely because
    // the row never reaches batchResolveSuppliers. If this list ever empties,
    // the ordering above stops being load-bearing — but it is today.
    const naming = TABLES
      .filter(([, config]) => Boolean(buildTemplateRow(config).supplier_name))
      .map(([name]) => name)
    expect(naming.length, 'no template names a supplier any more — see the comment').toBeGreaterThan(0)
    for (const name of naming) {
      expect(buildTemplateRow(RATE_TABLE_CONFIGS[name]).supplier_name).toBe('Example Name')
    }
  })
})
