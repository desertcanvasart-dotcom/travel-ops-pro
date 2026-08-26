import { vi, describe, it, expect, beforeAll } from 'vitest'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { resolveHotelRatesForDate, resolveCruiseRatesForDate } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

// Seasonal hotel rates were enterable from Rates → Hotels and then read by
// nothing: every consumer took the base pp_double_/single_supp_ columns and no
// lookup accepted a travel date, so a hotel priced at its cheapest season
// whichever week the client actually travelled. The cruise path in this engine
// had the same hole, plus it always read the EUR columns.
//
// These cover the fix at the level that decides the money: given a catalog row
// and a night, what does that night cost.

const hotelRow = {
  property_name: 'Steigenberger',
  // Six dated periods, which the old three-season model could not express.
  seasons: [
    { name: 'April', from: '2026-04-01', to: '2026-04-30',
      rates: { pp_double_eur: 70, single_supp_eur: 35, triple_red_eur: 5,
               pp_double_non_eur: 65, single_supp_non_eur: 32, triple_red_non_eur: 5 } },
    { name: 'Summer', from: '2026-05-01', to: '2026-09-30',
      rates: { pp_double_eur: 55, single_supp_eur: 28, triple_red_eur: 5,
               pp_double_non_eur: 50, single_supp_non_eur: 25, triple_red_non_eur: 5 } },
    { name: 'Autumn', from: '2026-10-01', to: '2026-12-19',
      rates: { pp_double_eur: 95, single_supp_eur: 48, triple_red_eur: 8,
               pp_double_non_eur: 90, single_supp_non_eur: 45, triple_red_non_eur: 8 } },
    { name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
      rates: { pp_double_eur: 140, single_supp_eur: 75, triple_red_eur: 10,
               pp_double_non_eur: 135, single_supp_non_eur: 72, triple_red_non_eur: 10 } },
    { name: 'Winter', from: '2027-01-06', to: '2027-02-28',
      rates: { pp_double_eur: 85, single_supp_eur: 42, triple_red_eur: 8,
               pp_double_non_eur: 80, single_supp_non_eur: 40, triple_red_non_eur: 8 } },
    { name: 'Spring', from: '2027-03-01', to: '2027-03-31',
      rates: { pp_double_eur: 100, single_supp_eur: 50, triple_red_eur: 8,
               pp_double_non_eur: 95, single_supp_non_eur: 48, triple_red_non_eur: 8 } },
  ],
  // Base columns mirror the first period, as the API writes them on save.
  pp_double_eur: 70, single_supp_eur: 35,
  pp_double_non_eur: 65, single_supp_non_eur: 32,
}

describe('resolveHotelRatesForDate', () => {
  it('prices each night at the period it falls in', () => {
    expect(resolveHotelRatesForDate(hotelRow, true, '2026-07-15').ppdNight).toBe(55)
    expect(resolveHotelRatesForDate(hotelRow, true, '2026-11-10').ppdNight).toBe(95)
    expect(resolveHotelRatesForDate(hotelRow, true, '2026-12-25').ppdNight).toBe(140)
    expect(resolveHotelRatesForDate(hotelRow, true, '2027-02-14').ppdNight).toBe(85)
  })

  it('moves the single supplement with the period too', () => {
    expect(resolveHotelRatesForDate(hotelRow, true, '2026-07-15').singleSuppNight).toBe(28)
    expect(resolveHotelRatesForDate(hotelRow, true, '2026-12-25').singleSuppNight).toBe(75)
  })

  it('names the period it used, for the service line', () => {
    expect(resolveHotelRatesForDate(hotelRow, true, '2026-12-25').seasonName).toBe('Christmas')
  })

  it('reads the non-EUR column set for a non-EUR passport', () => {
    expect(resolveHotelRatesForDate(hotelRow, false, '2026-12-25').ppdNight).toBe(135)
    expect(resolveHotelRatesForDate(hotelRow, false, '2026-12-25').singleSuppNight).toBe(72)
  })

  it('falls back to the base columns with no travel date', () => {
    // A template priced with no departure has no period to resolve against.
    const out = resolveHotelRatesForDate(hotelRow, true, null)
    expect(out.ppdNight).toBe(70)
    expect(out.seasonName).toBeNull()
  })

  it('falls back to the base columns for a date outside every period', () => {
    const out = resolveHotelRatesForDate(hotelRow, true, '2027-09-01')
    expect(out.ppdNight).toBe(70)
    expect(out.seasonName).toBeNull()
  })

  it('prices a pre-migration row off its old low/high/peak windows', () => {
    const legacy = {
      low_season_from: '2026-05-01', low_season_to: '2026-09-30',
      pp_double_eur: 60, single_supp_eur: 30,
      high_season_from: '2026-10-01', high_season_to: '2027-04-30',
      high_pp_double_eur: 90, high_single_supp_eur: 45,
      peak_season_from: '2026-12-20', peak_season_to: '2027-01-05',
      peak_pp_double_eur: 130, peak_single_supp_eur: 70,
    }
    expect(resolveHotelRatesForDate(legacy, true, '2026-07-15').ppdNight).toBe(60)
    expect(resolveHotelRatesForDate(legacy, true, '2026-11-10').ppdNight).toBe(90)
    // Peak sits inside high; the shorter window wins, which is what the old
    // peak-then-high check order did.
    expect(resolveHotelRatesForDate(legacy, true, '2026-12-25').ppdNight).toBe(130)
  })

  it('never returns a negative single supplement', () => {
    const slip = { pp_double_eur: 60, single_supp_eur: -20 }
    expect(resolveHotelRatesForDate(slip, true, null).singleSuppNight).toBe(0)
  })
})

const cruiseRow = {
  ship_name: 'MS Sonesta',
  seasons: [
    { name: 'Summer', from: '2026-05-01', to: '2026-09-30',
      rates: { single_eur: 120, double_eur: 95, triple_eur: 85, suite_eur: 180,
               single_non_eur: 115, double_non_eur: 90, triple_non_eur: 80, suite_non_eur: 175 } },
    { name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
      rates: { single_eur: 220, double_eur: 185, triple_eur: 165, suite_eur: 320,
               single_non_eur: 215, double_non_eur: 180, triple_non_eur: 160, suite_non_eur: 315 } },
  ],
  rate_low_double_eur: 95, rate_low_single_eur: 120,
  rate_low_double_non_eur: 90, rate_low_single_non_eur: 115,
  rate_double_eur: 95, rate_single_eur: 120,
}

describe('resolveCruiseRatesForDate', () => {
  it('prices each night at the period it falls in', () => {
    expect(resolveCruiseRatesForDate(cruiseRow, true, '2026-07-15').ppdNight).toBe(95)
    expect(resolveCruiseRatesForDate(cruiseRow, true, '2026-12-25').ppdNight).toBe(185)
  })

  it('derives the single supplement from the cabin rate gap', () => {
    // Cruises price by cabin type and carry no supplement column.
    expect(resolveCruiseRatesForDate(cruiseRow, true, '2026-07-15').singleSuppNight).toBe(25)
    expect(resolveCruiseRatesForDate(cruiseRow, true, '2026-12-25').singleSuppNight).toBe(35)
  })

  it('reads the non-EUR column set for a non-EUR passport', () => {
    // This engine's cruise path used to read rate_double_eur for everyone,
    // so a Japanese passport was quoted the EUR rate.
    expect(resolveCruiseRatesForDate(cruiseRow, false, '2026-07-15').ppdNight).toBe(90)
  })

  it('falls back to the seasonal low columns before the flat EUR ones', () => {
    const legacy = {
      rate_low_double_eur: 95, rate_low_single_eur: 120,
      rate_low_double_non_eur: 90, rate_low_single_non_eur: 115,
      rate_double_eur: 999, rate_single_eur: 999,
    }
    expect(resolveCruiseRatesForDate(legacy, true, null).ppdNight).toBe(95)
    expect(resolveCruiseRatesForDate(legacy, false, null).ppdNight).toBe(90)
  })

  it('uses the flat EUR columns only when nothing else is set', () => {
    const oldest = { rate_double_eur: 88, rate_single_eur: 110 }
    expect(resolveCruiseRatesForDate(oldest, true, null).ppdNight).toBe(88)
    // A non-EUR passport has no rate here at all — a hole the caller flags,
    // not the EUR number quietly reused.
    expect(resolveCruiseRatesForDate(oldest, false, null).ppdNight).toBe(0)
  })
})
