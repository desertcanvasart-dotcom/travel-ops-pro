// ============================================
// TRANSPORT RATE UTILITIES
// Shared helper for tiered vehicle rate selection
// from restructured transportation_rates table
// ============================================

import { parseVehicles, vehicleBands, vehicleKeyLabel, vehicleRateForPax, type VehicleBandRate } from '@/lib/rates/vehicle-bands'

/** A vehicle KEY from Settings → Vocabulary → Vehicle types — one of the
 *  five presets, or one the agency added ('4x4'). Open since 20261005; see
 *  lib/rates/vehicle-bands.ts. */
export type VehicleTier = string

export interface TransportRateRecord {
  id: string
  service_code: string
  service_type: string
  city: string
  origin_city?: string | null
  destination_city?: string | null
  duration?: string | null
  area?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  includes?: string | null
  notes?: string | null
  is_active: boolean
  /** The vehicles list (20261005) — every vehicle the row prices. */
  vehicles?: unknown
  // Deprecated (kept for backward compat during migration)
  vehicle_type?: string | null
  base_rate_eur?: number | null
  base_rate_non_eur?: number | null
  capacity_min?: number | null
  capacity_max?: number | null
}

export interface VehicleRateResult {
  vehicleType: string
  /** How many of the vehicle the group needs — 1 unless the group is bigger
   *  than every vehicle the row offers. rateEur/rateNonEur are for all of them. */
  vehicleCount?: number
  rateEur: number
  rateNonEur: number
  capacityMin: number
  capacityMax: number
  tier: VehicleTier
}

// The vehicles a row offers come from lib/rates/vehicle-bands.ts — the
// `vehicles` list (20261005). The two functions below are the shape their
// five call sites expect; the selection
// rule is lib/vocabulary's vehicleFleetForPax: exact band, else the smallest
// vehicle whose maximum covers the group, else as many of the largest offered
// as seat the group (it used to be one of the largest, silently).

function toResult(band: VehicleBandRate & { count?: number }): VehicleRateResult {
  const count = band.count ?? 1
  return {
    // A group bigger than every vehicle rides in several of the largest
    // (vehicleRateForPax); the rates below are already the whole fleet's.
    vehicleType: count > 1 ? `${count} × ${vehicleKeyLabel(band.key)}` : vehicleKeyLabel(band.key),
    vehicleCount: count,
    rateEur: band.rate_eur,
    rateNonEur: band.rate_non_eur ?? band.rate_eur,
    capacityMin: band.capacity_min,
    capacityMax: band.capacity_max,
    tier: band.key,
  }
}

/** A row that prices no vehicle, on the oldest shape: one base_rate for one
 *  vehicle_type. Kept exactly as it answered before the list existed
 *  (the word as typed, 'sedan' as the tier) — none in production, some in
 *  fixtures and possibly the sibling install. */
function legacyBaseRate(rate: Record<string, unknown>): VehicleRateResult | null {
  const base = rate.base_rate_eur
  if (typeof base === 'number' && base > 0) {
    const nonEur = rate.base_rate_non_eur
    return {
      vehicleType: typeof rate.vehicle_type === 'string' && rate.vehicle_type ? rate.vehicle_type : 'Vehicle',
      rateEur: base,
      rateNonEur: typeof nonEur === 'number' ? nonEur : base,
      capacityMin: typeof rate.capacity_min === 'number' ? rate.capacity_min : 1,
      capacityMax: typeof rate.capacity_max === 'number' ? rate.capacity_max : 45,
      tier: 'sedan',
    }
  }
  return null
}

/** Whether the row carries a vehicles list (as opposed to the single
 *  base_rate shape). An empty list is a list — "offers nothing". */
function hasVehicleBands(rate: Record<string, unknown>): boolean {
  return parseVehicles(rate.vehicles) !== null
}

/**
 * Get the appropriate vehicle rate for a given pax count.
 * Finds the smallest vehicle that fits, falls back to next larger if unavailable.
 */
export function getTransportRateForPax(
  rate: TransportRateRecord | any,
  pax: number,
  preferEur: boolean = true
): VehicleRateResult | null {
  void preferEur // both rates are returned; the caller picks by passport
  if (!hasVehicleBands(rate)) return legacyBaseRate(rate)
  const band = vehicleRateForPax(rate, pax)
  return band ? toResult(band) : null
}

/**
 * Get all available vehicle tiers from a rate record (for UI display)
 */
export function getAllVehicleTiers(rate: TransportRateRecord | any): VehicleRateResult[] {
  if (!hasVehicleBands(rate)) return []
  return vehicleBands(rate).map(toResult)
}

