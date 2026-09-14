// Route-level regression: importing a downloaded template, untouched, must be
// a reported no-op — not an error.
//
// The example row carries EXAMPLE-DELETE-THIS-ROW in its unique-key column and
// the importer has always meant to skip it. It used to skip it too LATE: the
// row was dropped just before the upsert, long after batchResolveSuppliers had
// already looked at it. The sample names a supplier called "Example Name",
// which resolves to nothing, so the row was demoted as a validation error and
// the route took its "N row(s) have validation errors" early return — a
// response with no `inserted` field at all.
//
// The E2E suite caught that on accommodation_rates (`expect(json.inserted)`
// received undefined). meal_rates, flight_rates and activity_rates had been
// shipping the same landmine with nothing covering them. This test is the
// hermetic version: the E2E job needs a live Supabase project and its secrets,
// so it is skipped on fork PRs and cannot run locally at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import Papa from 'papaparse'
import { RATE_TABLE_CONFIGS, getTemplateHeaders, buildTemplateRow } from '@/lib/bulk-rate-service'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

vi.mock('@/lib/vocabulary-server', () => ({
  vocabularyItemsForCurrentOrg: vi.fn(async () => []),
  supplierTypesForCurrentOrg: vi.fn(async () => []),
}))

vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: vi.fn(async () => 'en'),
  lookupServerMessage: vi.fn((_l: string, key: string) => key),
}))

import { POST } from '@/app/api/rates/bulk/import/route'

/** The template exactly as GET /api/rates/bulk/export?template=1 serves it. */
function templateCsv(table: string): string {
  const config = RATE_TABLE_CONFIGS[table]
  return Papa.unparse({ fields: getTemplateHeaders(config), data: [buildTemplateRow(config)] })
}

async function importTemplate(table: string) {
  const res = await POST({ json: async () => ({ table, csvData: templateCsv(table) }) } as any)
  return { status: res.status, json: await res.json() }
}

// The tables whose sheet carries supplier_name — the ones the old ordering
// broke. Everything else is covered by the sweep below.
const SUPPLIER_NAMED = ['accommodation_rates', 'meal_rates', 'flight_rates', 'activity_rates']

beforeEach(() => {
  // An empty install: no suppliers, so "Example Name" resolves to nothing.
  // That is precisely the condition that used to sink the import.
  setMockTables({ suppliers: [], supplier_properties: [] })
})

describe('importing an untouched template', () => {
  it.each(SUPPLIER_NAMED)('%s: reports a skipped example instead of a validation error', async table => {
    const { json } = await importTemplate(table)

    // The exact assertion the E2E makes, and the exact one that failed:
    // `inserted` was undefined because the route returned early.
    expect(json.inserted, `${table}: the route returned before counting anything`).toBe(0)
    expect(json.updated).toBe(0)
    expect(json.warnings?.some((w: { kind: string }) => w.kind === 'example_row_skipped')).toBe(true)
    expect(json.success).toBe(true)
  })

  it.each(Object.keys(RATE_TABLE_CONFIGS))('%s: inserts nothing and reports no errors', async table => {
    const { json } = await importTemplate(table)
    expect(json.inserted, `${table}`).toBe(0)
    expect(json.errors ?? [], `${table}`).toEqual([])
  })

  it('leaves the table empty — the sample never lands as a rate', async () => {
    const { json } = await importTemplate('accommodation_rates')
    expect(json.inserted).toBe(0)
    // Nothing was written under the sentinel key.
    const { createMockClient } = await import('../_mock-supabase')
    const { data } = await (createMockClient().from('accommodation_rates') as any).select('*')
    expect(data ?? []).toEqual([])
  })

  it('still refuses a REAL row that names a supplier it cannot find', async () => {
    // The example row is skipped; genuine rows are still held to the rule that
    // an unresolvable supplier is refused rather than imported unlinked. This
    // is the half of the behaviour the fix must not have loosened.
    const config = RATE_TABLE_CONFIGS.accommodation_rates
    const row = { ...buildTemplateRow(config), service_code: 'HTL-REAL-001' }
    const csv = Papa.unparse({ fields: getTemplateHeaders(config), data: [row] })
    const res = await POST({ json: async () => ({ table: 'accommodation_rates', csvData: csv }) } as any)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(JSON.stringify(json.errors)).toContain('supplierName')
  })
})
