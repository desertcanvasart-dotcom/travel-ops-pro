// ============================================
// The one number a hotel row shows in an overview
// ============================================
// A hotel's price is per person in a double, and it lives on the row's rate
// PERIODS (the `seasons` list — lib/rates/rate-seasons.ts). The rates hub
// used to read the base_rate_eur/base_rate_non_eur columns, which the
// current editor never writes — every hotel showed no price while the hotels
// rate page showed the same rows priced.
//
// The FIRST period, always — the one entered first by date. It used to be
// "today's period, else the first", so the same hotel showed a different
// number depending on the day it was opened (operator, 2026-09-16: the
// default period is confusing). The hotels list shows every period. 0 stays
// 0: an unpriced hole, not a price.

import { seasonsForRow } from '@/lib/rates/rate-seasons'

export function hotelPpDouble(row: object): { eur: number; nonEur: number } {
  const rates = seasonsForRow(row, 'accommodation')[0]?.rates
  if (rates) return { eur: rates.pp_double_eur || 0, nonEur: rates.pp_double_non_eur || 0 }
  const r = row as Record<string, unknown>
  return {
    eur: Number(r.pp_double_eur ?? r.base_rate_eur ?? 0) || 0,
    nonEur: Number(r.pp_double_non_eur ?? r.base_rate_non_eur ?? 0) || 0,
  }
}
