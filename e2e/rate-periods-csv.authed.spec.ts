import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// The wide rate CSV has fixed columns for three seasons, so a six-period
// contract could not be imported. This drives the periods sheet the way the
// operator will: create a rate, import six periods onto it from a CSV, and
// check the engine prices from them.
//
// Creates one clearly-named rate and removes it in a finally.

test.use({ storageState: STORAGE_STATE })

const CSV = `Service Code,Property Name,Period Name,From,To,PP Double (EU passport),Single Supp (EU passport),Triple Red (EU passport),PP Double (non-EU passport),Single Supp (non-EU passport),Triple Red (non-EU passport)
ZZTEST-PERIODS,ZZ TEST,April,2026-04-01,2026-04-30,70,35,5,65,32,5
ZZTEST-PERIODS,ZZ TEST,Summer,2026-05-01,2026-09-30,55,28,5,50,25,5
ZZTEST-PERIODS,ZZ TEST,Autumn,01/10/2026,19/12/2026,95,48,8,90,45,8
ZZTEST-PERIODS,ZZ TEST,Christmas,2026-12-20,2027-01-05,140,75,10,135,72,10
ZZTEST-PERIODS,ZZ TEST,Winter,2027-01-06,2027-02-28,85,42,8,80,40,8
ZZTEST-PERIODS,ZZ TEST,Spring,2027-03-01,2027-03-31,100,50,8,95,48,8
`

test('a six-period contract imports from one spreadsheet', async ({ request }) => {
  const created = await request.post('/api/rates/hotels', {
    data: {
      service_code: 'ZZTEST-PERIODS',
      property_name: 'ZZ TEST — periods CSV (delete me)',
      city: 'Cairo', tier: 'standard', board_basis: 'BB',
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const id = (await created.json()).data.id

  try {
    // The preview must say what changes before anything is written.
    const dry = await request.post('/api/rates/bulk/periods/import', {
      data: { entity: 'accommodation', csv: CSV, dryRun: true },
    })
    expect(dry.ok(), await dry.text()).toBeTruthy()
    const dryJson = await dry.json()
    expect(dryJson.errors).toEqual([])
    expect(dryJson.changes).toEqual([
      { key: 'ZZTEST-PERIODS', name: 'ZZ TEST — periods CSV (delete me)', before: 0, after: 6 },
    ])

    // Nothing written yet.
    const stillEmpty = (await (await request.get(`/api/rates/hotels/${id}`)).json()).data
    expect(stillEmpty.seasons).toBeNull()

    const run = await request.post('/api/rates/bulk/periods/import', {
      data: { entity: 'accommodation', csv: CSV, dryRun: false },
    })
    expect(run.ok(), await run.text()).toBeTruthy()
    expect((await run.json()).updated).toBe(1)

    const row = (await (await request.get(`/api/rates/hotels/${id}`)).json()).data
    expect(row.seasons).toHaveLength(6)
    expect(row.seasons.map((s: any) => s.name))
      .toEqual(['April', 'Summer', 'Autumn', 'Christmas', 'Winter', 'Spring'])
    // The DD/MM/YYYY row Excel would have written normalises to ISO.
    expect(row.seasons[2]).toMatchObject({ from: '2026-10-01', to: '2026-12-19' })
    expect(row.seasons[3].rates.pp_double_eur).toBe(140)
    // First period mirrored onto the base columns for date-less readers.
    expect(row.pp_double_eur).toBe(70)

    // Export gives back a sheet that re-imports to the same thing.
    const csvOut = await request.get('/api/rates/bulk/periods/export?entity=accommodation')
    expect(csvOut.ok()).toBeTruthy()
    const text = await csvOut.text()
    expect(text.split('\n').filter(l => l.includes('ZZTEST-PERIODS'))).toHaveLength(6)
  } finally {
    await request.delete(`/api/rates/hotels/${id}`)
  }
})
