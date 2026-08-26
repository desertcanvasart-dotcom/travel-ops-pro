import { describe, it, expect } from 'vitest'

// A spreadsheet import writes the low_/high_/peak_ columns. Hotels and cruises
// that have a dated period list price from THAT list, so importing prices onto
// such a rate succeeds and changes nothing about what gets quoted.
//
// It is not destructive — the upsert only writes the columns present in the
// file, so the periods survive — it is SILENT, which is worse: the operator
// believes a rate rise has been applied. These pin the two halves of the
// contract the import route relies on.

import { seasonsForRow, ratesForTravelDate } from '@/lib/rates/rate-seasons'

const PERIODS = [
  { name: 'Summer', from: '2026-05-01', to: '2026-09-30',
    rates: { pp_double_eur: 55, single_supp_eur: 28, triple_red_eur: 5,
             pp_double_non_eur: 50, single_supp_non_eur: 25, triple_red_non_eur: 5 } },
  { name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
    rates: { pp_double_eur: 140, single_supp_eur: 75, triple_red_eur: 10,
             pp_double_non_eur: 135, single_supp_non_eur: 72, triple_red_non_eur: 10 } },
]

describe('a CSV price update on a rate that has periods', () => {
  it('does not reach pricing — the periods win', () => {
    // What the row looks like after an import raised the legacy columns.
    const afterImport = {
      seasons: PERIODS,
      pp_double_eur: 999,          // the number in the spreadsheet
      pp_double_non_eur: 999,
      low_season_from: '2026-05-01',
      low_season_to: '2026-09-30',
    }
    // A July departure still prices from the Summer period, not the 999.
    expect(ratesForTravelDate(afterImport, 'accommodation', '2026-07-15')!.rates.pp_double_eur)
      .toBe(55)
    // This is exactly why the import warns instead of staying quiet.
  })

  it('does reach pricing when the rate has no periods', () => {
    // The ordinary case: a rate that has never been given periods still
    // resolves through its legacy columns, so imports work as they always did.
    const legacyOnly = {
      seasons: null,
      low_season_from: '2026-05-01', low_season_to: '2026-09-30',
      pp_double_eur: 999, pp_double_non_eur: 999,
    }
    expect(ratesForTravelDate(legacyOnly, 'accommodation', '2026-07-15')!.rates.pp_double_eur)
      .toBe(999)
  })

  it('leaves the periods intact — the import is silent, not destructive', () => {
    // The upsert writes only the columns present in the file; `seasons` is not
    // one of them, so the period list is still there afterwards.
    const afterImport = { seasons: PERIODS, pp_double_eur: 999 }
    expect(seasonsForRow(afterImport, 'accommodation')).toHaveLength(2)
    expect(seasonsForRow(afterImport, 'accommodation').map(s => s.name))
      .toEqual(['Summer', 'Christmas'])
  })

  it('counts periods the way the warning message reports them', () => {
    // The route counts Array.isArray(seasons) ? length : 0 and warns above 0.
    expect(seasonsForRow({ seasons: PERIODS }, 'accommodation')).toHaveLength(2)
    expect(seasonsForRow({ seasons: [] }, 'accommodation')).toHaveLength(0)
    expect(seasonsForRow({ seasons: null }, 'accommodation')).toHaveLength(0)
  })
})
