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
