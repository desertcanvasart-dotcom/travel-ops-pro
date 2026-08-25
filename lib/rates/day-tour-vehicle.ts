// ============================================
// Day-tour vehicle pricing for the B2B quote routes
// ============================================
// calculate-price and quote-from-itinerary used to price generic
// transportation lines from the `vehicles` table — which is the FLEET/dispatch
// list (used by the calendar), not a rate table. Every vehicle in production
// has daily_rate NULL, so one route priced transport at 0 and the other always
// fell through. The operator's real catalog is transportation_rates
// (/rates/transportation): per-service rows with per-vehicle rates and
// OPERATOR-SET capacity bands.
//
// This helper prices from that catalog using the same primitives the main
// auto-pricing engine uses (buildTransportCache + findTransportRate →
// getTransportRateForPax), so the vehicle chosen for a pax count follows the
// bands the operator configured — never a hardcoded sedan/minivan split.
//
// The cache is built lazily ONCE per finder (i.e. once per request), not per
// service line.

import { buildTransportCache, findTransportRate } from '@/lib/auto-pricing-service'
import { usableRate } from '@/lib/pricing/usable-rate'

export interface DayTourVehicle {
  rate: number
  vehicle: string
}

export type DayTourVehicleFinder = (
  city: string | null | undefined,
  pax: number,
  isEurPassport: boolean
) => Promise<DayTourVehicle | null>

/**
 * Create a per-request finder for day-tour vehicle rates.
 *
 * Returns null when the catalog has no usable rate for the city/pax — the
 * caller must then keep whatever cost the line already had (never 0).
 */
export function makeDayTourVehicleFinder(): DayTourVehicleFinder {
  let cachePromise: ReturnType<typeof buildTransportCache> | null = null

  return async (city, pax, isEurPassport) => {
    cachePromise ??= buildTransportCache()
    const cache = await cachePromise

    const record = findTransportRate(cache, {
      serviceType: 'day_tour',
      city: city || '',
      duration: 'full_day',
      area: null,
      pax,
    })
    if (!record) return null

    // findTransportRate returns the row with base_rate_eur/non_eur set to the
    // matched vehicle band's rate. A blank band is an unpriced hole, not €0.
    const rate = isEurPassport
      ? usableRate(record.base_rate_eur)
      : usableRate(record.base_rate_non_eur) ?? usableRate(record.base_rate_eur)
    if (rate === null) return null

    return { rate, vehicle: record.vehicle_type || 'Vehicle' }
  }
}
