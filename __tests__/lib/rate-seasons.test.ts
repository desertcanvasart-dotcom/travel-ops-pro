import { describe, it, expect } from 'vitest'
import {
  sanitizeSeasons,
  seasonForTravelDate,
  seasonsForRow,
  ratesForTravelDate,
  overlappingSeasons,
  seasonGaps,
  type RateSeason,
} from '@/lib/rates/rate-seasons'

// Hotels and cruises used to carry exactly three price levels across four date
// windows. Contracts run to six or more dated periods, each with its own rates,
// and how many there are depends on the property. These lock in the two things
// that decide what a client is charged: which period a travel date lands in,
// and what happens to rows that predate the migration.

const rates = (n: number) => ({
  pp_double_eur: n, single_supp_eur: n / 2, triple_red_eur: 5,
  pp_double_non_eur: n - 5, single_supp_non_eur: n / 2 - 2, triple_red_non_eur: 5,
})

const period = (name: string, from: string, to: string, n: number): RateSeason =>
  ({ name, from, to, rates: rates(n) })

describe('sanitizeSeasons', () => {
  it('keeps six periods — the shape the old three-season model could not hold', () => {
    const input = [
      { name: 'April', from: '2026-04-01', to: '2026-04-30', rates: rates(70) },
      { name: 'Summer', from: '2026-05-01', to: '2026-09-30', rates: rates(55) },
      { name: 'Autumn', from: '2026-10-01', to: '2026-12-19', rates: rates(95) },
      { name: 'Christmas', from: '2026-12-20', to: '2027-01-05', rates: rates(140) },
      { name: 'Winter', from: '2027-01-06', to: '2027-02-28', rates: rates(85) },
      { name: 'Spring', from: '2027-03-01', to: '2027-03-31', rates: rates(100) },
    ]
    const out = sanitizeSeasons(input, 'accommodation')
    expect(out).toHaveLength(6)
    expect(out!.map(s => s.name)).toEqual(
      ['April', 'Summer', 'Autumn', 'Christmas', 'Winter', 'Spring']
    )
  })

  it('sorts by start date, so the editor order never decides pricing', () => {
    const out = sanitizeSeasons([
      { name: 'B', from: '2026-10-01', to: '2026-12-19', rates: rates(95) },
      { name: 'A', from: '2026-04-01', to: '2026-04-30', rates: rates(70) },
    ], 'accommodation')
    expect(out!.map(s => s.name)).toEqual(['A', 'B'])
  })

  it('drops a half-filled row instead of failing the whole save', () => {
    const out = sanitizeSeasons([
      { name: 'Real', from: '2026-04-01', to: '2026-04-30', rates: rates(70) },
      { name: 'Half typed', from: '2026-05-01', to: '', rates: rates(55) },
    ], 'accommodation')
    expect(out).toHaveLength(1)
    expect(out![0].name).toBe('Real')
  })

  it('refuses a backwards window rather than storing a period that matches nothing', () => {
    expect(sanitizeSeasons(
      [{ name: 'Backwards', from: '2026-09-30', to: '2026-05-01', rates: rates(55) }],
      'accommodation'
    )).toBeNull()
  })

  it('reads as "no periods" for absent or unusable input, never throwing', () => {
    expect(sanitizeSeasons(null, 'accommodation')).toBeNull()
    expect(sanitizeSeasons([], 'accommodation')).toBeNull()
    expect(sanitizeSeasons('nonsense', 'accommodation')).toBeNull()
    expect(sanitizeSeasons([{ from: 'not-a-date', to: 'nope' }], 'accommodation')).toBeNull()
  })

  it('fills every rate field for the entity, blank reading as 0', () => {
    const out = sanitizeSeasons(
      [{ name: 'Sparse', from: '2026-04-01', to: '2026-04-30', rates: { single_eur: 120 } }],
      'cruise'
    )
    expect(out![0].rates).toEqual({
      single_eur: 120, double_eur: 0, triple_eur: 0, suite_eur: 0,
      single_non_eur: 0, double_non_eur: 0, triple_non_eur: 0, suite_non_eur: 0,
    })
  })
})

describe('seasonForTravelDate', () => {
  const six = [
    period('April', '2026-04-01', '2026-04-30', 70),
    period('Summer', '2026-05-01', '2026-09-30', 55),
    period('Autumn', '2026-10-01', '2026-12-19', 95),
    period('Christmas', '2026-12-20', '2027-01-05', 140),
    period('Winter', '2027-01-06', '2027-02-28', 85),
    period('Spring', '2027-03-01', '2027-03-31', 100),
  ]

  it('picks the period containing the date', () => {
    expect(seasonForTravelDate(six, '2026-07-15')!.name).toBe('Summer')
    expect(seasonForTravelDate(six, '2026-12-25')!.name).toBe('Christmas')
    expect(seasonForTravelDate(six, '2027-02-01')!.name).toBe('Winter')
  })

  it('includes both boundary days', () => {
    expect(seasonForTravelDate(six, '2026-10-01')!.name).toBe('Autumn')
    expect(seasonForTravelDate(six, '2026-12-19')!.name).toBe('Autumn')
    expect(seasonForTravelDate(six, '2026-12-20')!.name).toBe('Christmas')
  })

  it('does not shift a boundary date by timezone', () => {
    // The old cruise resolver went through Date and read local-time getters,
    // which moved boundary dates a day west of UTC. String comparison cannot.
    expect(seasonForTravelDate(six, '2026-05-01')!.name).toBe('Summer')
    expect(seasonForTravelDate(six, '2026-04-30')!.name).toBe('April')
  })

  it('accepts a full timestamp, reading the date part', () => {
    expect(seasonForTravelDate(six, '2026-07-15T22:00:00.000Z')!.name).toBe('Summer')
  })

  it('respects the contract year — a 2027 date does not match a 2026 window', () => {
    // detectCruiseSeason compared month-day only, so every window silently
    // repeated for ever. Contracts are re-issued annually with moved dates.
    const oneYear = [period('Summer 2026', '2026-05-01', '2026-09-30', 55)]
    expect(seasonForTravelDate(oneYear, '2026-07-15')!.name).toBe('Summer 2026')
    expect(seasonForTravelDate(oneYear, '2027-07-15')).toBeNull()
  })

  it('returns null for a date no period covers, rather than guessing', () => {
    expect(seasonForTravelDate(six, '2026-03-15')).toBeNull()
    expect(seasonForTravelDate(six, '2027-06-01')).toBeNull()
  })

  it('gives the shortest window when periods overlap', () => {
    // How the backfilled data looks: the old peak window sat inside the broad
    // high-season one, and the old resolver checked peak first.
    const overlapping = [
      period('High', '2026-10-01', '2027-04-30', 90),
      period('Christmas', '2026-12-20', '2027-01-05', 140),
    ]
    expect(seasonForTravelDate(overlapping, '2026-12-25')!.name).toBe('Christmas')
    expect(seasonForTravelDate(overlapping, '2026-11-10')!.name).toBe('High')
  })

  it('is null for empty or missing input', () => {
    expect(seasonForTravelDate([], '2026-07-15')).toBeNull()
    expect(seasonForTravelDate(six, null)).toBeNull()
    expect(seasonForTravelDate(null, '2026-07-15')).toBeNull()
  })
})

describe('legacy rows', () => {
  const legacyHotel = {
    low_season_from: '2026-05-01', low_season_to: '2026-09-30',
    pp_double_eur: 60, single_supp_eur: 30, triple_red_eur: 5,
    pp_double_non_eur: 55, single_supp_non_eur: 28, triple_red_non_eur: 5,
    high_season_from: '2026-10-01', high_season_to: '2027-04-30',
    high_pp_double_eur: 90, high_single_supp_eur: 45, high_triple_red_eur: 8,
    high_pp_double_non_eur: 85, high_single_supp_non_eur: 42, high_triple_red_non_eur: 8,
    peak_season_from: '2026-12-20', peak_season_to: '2027-01-05',
    peak_season_2_from: '2027-03-20', peak_season_2_to: '2027-03-28',
    peak_pp_double_eur: 130, peak_single_supp_eur: 70, peak_triple_red_eur: 10,
    peak_pp_double_non_eur: 125, peak_single_supp_non_eur: 68, peak_triple_red_non_eur: 10,
    seasons: null,
  }

  it('derives periods from the old columns when seasons is unset', () => {
    // The bulk CSV importer still writes the fixed columns, so this path stays
    // live after the migration.
    const derived = seasonsForRow(legacyHotel, 'accommodation')
    expect(derived.map(s => s.name)).toEqual(
      ['Low Season', 'High Season', 'Peak Season', 'Peak Season 2']
    )
    expect(ratesForTravelDate(legacyHotel, 'accommodation', '2026-07-15')!.rates.pp_double_eur).toBe(60)
  })

  it('reproduces the old peak-beats-high precedence on a legacy row', () => {
    expect(ratesForTravelDate(legacyHotel, 'accommodation', '2026-12-25')!.rates.pp_double_eur).toBe(130)
    expect(ratesForTravelDate(legacyHotel, 'accommodation', '2026-11-10')!.rates.pp_double_eur).toBe(90)
    expect(ratesForTravelDate(legacyHotel, 'accommodation', '2027-03-22')!.rates.pp_double_eur).toBe(130)
  })

  it('prefers edited periods over the legacy columns', () => {
    const migrated = {
      ...legacyHotel,
      seasons: [{ name: 'One Rate All Year', from: '2026-01-01', to: '2026-12-31', rates: rates(42) }],
    }
    const hit = ratesForTravelDate(migrated, 'accommodation', '2026-12-25')!
    expect(hit.season.name).toBe('One Rate All Year')
    expect(hit.rates.pp_double_eur).toBe(42)
  })

  it('tolerates jsonb arriving as a string', () => {
    const asString = {
      seasons: JSON.stringify([
        { name: 'Stringified', from: '2026-01-01', to: '2026-12-31', rates: rates(42) },
      ]),
    }
    expect(seasonsForRow(asString, 'accommodation')[0].name).toBe('Stringified')
  })

  it('derives cruise periods from the old rate_low_/rate_high_/rate_peak_ sets', () => {
    const legacyCruise = {
      low_season_start: '2026-05-01', low_season_end: '2026-09-30',
      rate_low_single_eur: 120, rate_low_double_eur: 95,
      rate_low_triple_eur: 85, rate_low_suite_eur: 180,
      rate_low_single_non_eur: 115, rate_low_double_non_eur: 90,
      rate_low_triple_non_eur: 80, rate_low_suite_non_eur: 175,
      high_season_start: '2026-10-01', high_season_end: '2027-04-30',
      rate_high_double_eur: 130,
      peak_season_1_start: '2026-12-20', peak_season_1_end: '2027-01-05',
      rate_peak_double_eur: 185,
      seasons: null,
    }
    expect(ratesForTravelDate(legacyCruise, 'cruise', '2026-07-15')!.rates.double_eur).toBe(95)
    expect(ratesForTravelDate(legacyCruise, 'cruise', '2026-11-10')!.rates.double_eur).toBe(130)
    expect(ratesForTravelDate(legacyCruise, 'cruise', '2026-12-25')!.rates.double_eur).toBe(185)
  })

  it('has no periods at all when neither seasons nor dates are set', () => {
    expect(seasonsForRow({ pp_double_eur: 60 }, 'accommodation')).toEqual([])
    expect(ratesForTravelDate({ pp_double_eur: 60 }, 'accommodation', '2026-07-15')).toBeNull()
  })
})

describe('editor warnings', () => {
  it('reports overlapping windows', () => {
    const seasons = [
      period('High', '2026-10-01', '2027-04-30', 90),
      period('Christmas', '2026-12-20', '2027-01-05', 140),
    ]
    expect(overlappingSeasons(seasons)).toEqual([[0, 1]])
  })

  it('reports none when windows are adjacent but do not overlap', () => {
    const seasons = [
      period('Autumn', '2026-10-01', '2026-12-19', 95),
      period('Christmas', '2026-12-20', '2027-01-05', 140),
    ]
    expect(overlappingSeasons(seasons)).toEqual([])
  })

  it('reports an uncovered gap between periods', () => {
    const seasons = [
      period('Summer', '2026-05-01', '2026-09-30', 55),
      period('Winter', '2026-12-01', '2027-02-28', 85),
    ]
    expect(seasonGaps(seasons)).toEqual([{ from: '2026-10-01', to: '2026-11-30' }])
  })

  it('reports no gap for back-to-back periods', () => {
    const seasons = [
      period('Autumn', '2026-10-01', '2026-12-19', 95),
      period('Christmas', '2026-12-20', '2027-01-05', 140),
    ]
    expect(seasonGaps(seasons)).toEqual([])
  })
})
