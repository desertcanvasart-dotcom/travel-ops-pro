// ============================================
// The one number a hotel row shows in an overview
// ============================================
// A hotel's price is per person in a double, and it lives on the row's rate
// PERIODS (the `seasons` list — lib/rates/rate-seasons.ts). The rates hub
// used to read the base_rate_eur/base_rate_non_eur columns, which the
// current editor never writes — every hotel showed no price while the hotels
// rate page showed the same rows priced.
//
// Today's period wins; with no period covering today, the first period — the
// same choice legacyColumnMirror makes for date-less readers. 0 stays 0: an
// unpriced hole, not a price (see unpriced-rates handling repo-wide).

import { ratesForTravelDate, seasonsForRow } from '@/lib/rates/rate-seasons'
import { todayLocal } from '@/lib/today'

export function hotelPpDouble(row: object): { eur: number; nonEur: number } {
  const rates =
    ratesForTravelDate(row, 'accommodation', todayLocal())?.rates ??
    seasonsForRow(row, 'accommodation')[0]?.rates
  if (rates) return { eur: rates.pp_double_eur || 0, nonEur: rates.pp_double_non_eur || 0 }
  const r = row as Record<string, unknown>
  return {
    eur: Number(r.pp_double_eur ?? r.base_rate_eur ?? 0) || 0,
    nonEur: Number(r.pp_double_non_eur ?? r.base_rate_non_eur ?? 0) || 0,
  }
}

// ── Low / High for the hotels list ───────────────────────────────────────
// The hotels rate page shows a "Low PP Dbl" and a "High PP Dbl" per row. They
// used to read pp_double_eur and high_pp_double_eur — the fixed low/high/peak
// columns of the retired three-season model. legacyColumnMirror still writes
// the FIRST period into the low column, but nothing has written the high one
// since periods became an unlimited dated list, so every hotel showed a High
// of $0.00 beside a real Low (operator, 2026-09-06).
//
// Low and High are now the cheapest and dearest priced period. Unpriced
// periods (0 = a hole, not a price) are skipped, so a half-entered contract
// cannot report a Low of 0; a row with one period reads the same on both.
export interface HotelPpDoubleRange {
  low: { eur: number; nonEur: number }
  high: { eur: number; nonEur: number }
  /** How many periods the row carries — 0 when it still lives on columns. */
  periods: number
}

export function hotelPpDoubleRange(row: object): HotelPpDoubleRange {
  const seasons = seasonsForRow(row, 'accommodation')
  if (seasons.length === 0) {
    const one = hotelPpDouble(row)
    return { low: one, high: one, periods: 0 }
  }
  const pick = (key: 'pp_double_eur' | 'pp_double_non_eur') => {
    const priced = seasons.map((s) => Number(s.rates[key]) || 0).filter((n) => n > 0)
    if (priced.length === 0) return { low: 0, high: 0 }
    return { low: Math.min(...priced), high: Math.max(...priced) }
  }
  const eur = pick('pp_double_eur')
  const nonEur = pick('pp_double_non_eur')
  return {
    low: { eur: eur.low, nonEur: nonEur.low },
    high: { eur: eur.high, nonEur: nonEur.high },
    periods: seasons.length,
  }
}
