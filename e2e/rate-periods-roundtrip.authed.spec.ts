import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// Proves the save path end to end against the real database: six dated periods
// go in as JSONB, the first period is mirrored onto the base columns that
// date-less readers use, and it all reads back. Creates one clearly-named row
// and removes it in a finally, so a failed assertion still cleans up.

test.use({ storageState: STORAGE_STATE })

const PERIODS = [
  ['April', '2026-04-01', '2026-04-30', 70],
  ['Summer', '2026-05-01', '2026-09-30', 55],
  ['Autumn', '2026-10-01', '2026-12-19', 95],
  ['Christmas', '2026-12-20', '2027-01-05', 140],
  ['Winter', '2027-01-06', '2027-02-28', 85],
  ['Spring', '2027-03-01', '2027-03-31', 100],
] as const

test('six dated rate periods survive a save and read back', async ({ request }) => {
  const seasons = PERIODS.map(([name, from, to, rate]) => ({
    name, from, to,
    rates: {
      pp_double_eur: rate, single_supp_eur: rate / 2, triple_red_eur: 5,
      pp_double_non_eur: rate - 5, single_supp_non_eur: rate / 2 - 2, triple_red_non_eur: 5,
    },
  }))

  const created = await request.post('/api/rates/hotels', {
    data: {
      property_name: 'ZZ TEST — rate periods (delete me)',
      city: 'Cairo',
      tier: 'standard',
      board_basis: 'BB',
      seasons,
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const id = (await created.json()).data.id
  expect(id).toBeTruthy()

  try {
    const read = await request.get(`/api/rates/hotels/${id}`)
    expect(read.ok()).toBeTruthy()
    const row = (await read.json()).data

    // All six periods stored, in date order.
    expect(row.seasons).toHaveLength(6)
    expect(row.seasons.map((s: any) => s.name)).toEqual(
      ['April', 'Summer', 'Autumn', 'Christmas', 'Winter', 'Spring']
    )
    expect(row.seasons[3]).toMatchObject({
      name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
    })
    expect(row.seasons[3].rates.pp_double_eur).toBe(140)
    expect(row.seasons[3].rates.pp_double_non_eur).toBe(135)

    // The first period is mirrored onto the base columns, so the pricing grid,
    // both B2B calculators and the tour builder still see a real rate.
    expect(row.pp_double_eur).toBe(70)
    expect(row.single_supp_eur).toBe(35)
    expect(row.pp_double_non_eur).toBe(65)
    expect(row.low_season_from).toBe('2026-04-01')
    expect(row.low_season_to).toBe('2026-04-30')

    // A PUT that edits one period leaves the rest alone and re-mirrors.
    const edited = seasons.map((s, i) =>
      i === 0 ? { ...s, rates: { ...s.rates, pp_double_eur: 77 } } : s
    )
    const put = await request.put(`/api/rates/hotels/${id}`, {
      data: { property_name: row.property_name, city: row.city, tier: row.tier, seasons: edited },
    })
    expect(put.ok(), await put.text()).toBeTruthy()

    const reread = (await (await request.get(`/api/rates/hotels/${id}`)).json()).data
    expect(reread.seasons).toHaveLength(6)
    expect(reread.seasons[0].rates.pp_double_eur).toBe(77)
    expect(reread.pp_double_eur).toBe(77)

    // A malformed payload reads as "no periods" rather than 500ing the save.
    const junk = await request.put(`/api/rates/hotels/${id}`, {
      data: { property_name: row.property_name, city: row.city, tier: row.tier, seasons: 'nonsense' },
    })
    expect(junk.ok(), await junk.text()).toBeTruthy()
    expect((await (await request.get(`/api/rates/hotels/${id}`)).json()).data.seasons).toBeNull()
  } finally {
    const del = await request.delete(`/api/rates/hotels/${id}`)
    console.log('cleanup delete ->', del.status())
  }
})
