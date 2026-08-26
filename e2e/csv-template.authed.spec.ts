import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// Exporting an empty rate table used to hand back a completely blank file, so
// the first import — before any data exists — had no format to copy.

test.use({ storageState: STORAGE_STATE })

test('an empty table still exports its headers', async ({ request }) => {
  // accommodation_rates is empty in this environment, which is exactly the
  // case that produced a blank file.
  const res = await request.get('/api/rates/bulk/export?table=accommodation_rates')
  expect(res.ok()).toBeTruthy()
  const text = await res.text()
  expect(text.trim().length).toBeGreaterThan(0)
  const header = text.split('\n')[0]
  expect(header).toContain('service_code')
  expect(header).toContain('pp_double_eur')
})

test('the sample CSV is a sheet you can actually fill in', async ({ request }) => {
  const res = await request.get('/api/rates/bulk/export?table=accommodation_rates&template=1')
  expect(res.ok()).toBeTruthy()
  const lines = (await res.text()).trim().split('\n')
  expect(lines).toHaveLength(2)                      // header + one example
  expect(lines[0]).toContain('property_name')
  expect(lines[0]).not.toContain('created_at')       // export-only, left out
  expect(lines[1]).toContain('EXAMPLE-DELETE-THIS-ROW')
  expect(lines[1]).toContain('2026-05-01')           // the date format, shown
})

test('the unedited sample is skipped rather than imported as a rate', async ({ request }) => {
  const template = await (await request.get('/api/rates/bulk/export?table=accommodation_rates&template=1')).text()
  const res = await request.post('/api/rates/bulk/import', {
    data: { table: 'accommodation_rates', csvData: template },
  })
  const json = await res.json()
  expect(json.inserted).toBe(0)
  expect(json.warnings?.some((w: any) => w.kind === 'example_row_skipped')).toBe(true)

  // And nothing landed.
  const after = await request.get('/api/rates/bulk/export?table=accommodation_rates')
  expect((await after.text()).trim().split('\n')).toHaveLength(1)  // header only
})

test('the periods sheet has a sample too', async ({ request }) => {
  const res = await request.get('/api/rates/bulk/periods/export?entity=accommodation&template=1')
  expect(res.ok()).toBeTruthy()
  const lines = (await res.text()).trim().split('\n')
  expect(lines).toHaveLength(3)                      // header + two periods
  expect(lines[0]).toContain('Period Name')
  expect(lines[1]).toContain('Summer')
  expect(lines[2]).toContain('Christmas')

  // Importing it untouched is refused, not silently applied.
  const imported = await request.post('/api/rates/bulk/periods/import', {
    data: { entity: 'accommodation', csv: await (await request.get('/api/rates/bulk/periods/export?entity=accommodation&template=1')).text(), dryRun: true },
  })
  expect(imported.status()).toBe(400)
  expect((await imported.json()).error).toContain('example row')
})
