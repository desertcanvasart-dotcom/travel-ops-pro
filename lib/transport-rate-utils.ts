// ============================================
// TRANSPORT RATE UTILITIES
// Shared helper for tiered vehicle rate selection
// from restructured transportation_rates table
// ============================================

export type VehicleTier = 'sedan' | 'minivan' | 'van' | 'minibus' | 'bus'

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
  // Tiered vehicle rates
  sedan_rate_eur: number | null
  sedan_rate_non_eur: number | null
  sedan_capacity_min: number
  sedan_capacity_max: number
  minivan_rate_eur: number | null
  minivan_rate_non_eur: number | null
  minivan_capacity_min: number
  minivan_capacity_max: number
  van_rate_eur: number | null
  van_rate_non_eur: number | null
  van_capacity_min: number
  van_capacity_max: number
  minibus_rate_eur: number | null
  minibus_rate_non_eur: number | null
  minibus_capacity_min: number
  minibus_capacity_max: number
  bus_rate_eur: number | null
  bus_rate_non_eur: number | null
  bus_capacity_min: number
  bus_capacity_max: number
  // Deprecated (kept for backward compat during migration)
  vehicle_type?: string | null
  base_rate_eur?: number | null
  base_rate_non_eur?: number | null
  capacity_min?: number | null
  capacity_max?: number | null
}

export interface VehicleRateResult {
  vehicleType: string
  rateEur: number
  rateNonEur: number
  capacityMin: number
  capacityMax: number
  tier: VehicleTier
}

// Vehicle tiers in order from smallest to largest
const VEHICLE_TIERS: VehicleTier[] = ['sedan', 'minivan', 'van', 'minibus', 'bus']

/**
 * Get the appropriate vehicle rate for a given pax count.
 * Finds the smallest vehicle that fits, falls back to next larger if unavailable.
 */
export function getTransportRateForPax(
  rate: TransportRateRecord | any,
  pax: number,
  preferEur: boolean = true
): VehicleRateResult | null {
  // Build available tiers
  const tiers: { tier: VehicleTier; rateEur: number; rateNonEur: number; min: number; max: number }[] = []

  for (const tier of VEHICLE_TIERS) {
    const rateEur = rate[`${tier}_rate_eur`]
    const rateNonEur = rate[`${tier}_rate_non_eur`]
    const min = rate[`${tier}_capacity_min`] ?? getDefaultCapacity(tier).min
    const max = rate[`${tier}_capacity_max`] ?? getDefaultCapacity(tier).max

    if (rateEur != null && rateEur > 0) {
      tiers.push({ tier, rateEur, rateNonEur: rateNonEur ?? rateEur, min, max })
    }
  }

  if (tiers.length === 0) {
    // Backward compat: use old base_rate fields if tiered rates not populated yet
    if (rate.base_rate_eur != null && rate.base_rate_eur > 0) {
      return {
        vehicleType: rate.vehicle_type || 'Vehicle',
        rateEur: rate.base_rate_eur,
        rateNonEur: rate.base_rate_non_eur ?? rate.base_rate_eur,
        capacityMin: rate.capacity_min ?? 1,
        capacityMax: rate.capacity_max ?? 45,
        tier: 'sedan'
      }
    }
    return null
  }

  // Find exact fit (pax falls within capacity range)
  const exactFit = tiers.find(t => pax >= t.min && pax <= t.max)
  if (exactFit) {
    return {
      vehicleType: capitalize(exactFit.tier),
      rateEur: exactFit.rateEur,
      rateNonEur: exactFit.rateNonEur,
      capacityMin: exactFit.min,
      capacityMax: exactFit.max,
      tier: exactFit.tier
    }
  }

  // No exact fit — find smallest vehicle that can still fit
  const largerFit = tiers.find(t => t.max >= pax)
  if (largerFit) {
    return {
      vehicleType: capitalize(largerFit.tier),
      rateEur: largerFit.rateEur,
      rateNonEur: largerFit.rateNonEur,
      capacityMin: largerFit.min,
      capacityMax: largerFit.max,
      tier: largerFit.tier
    }
  }

  // Pax exceeds all tiers — return the largest available
  const largest = tiers[tiers.length - 1]
  return {
    vehicleType: capitalize(largest.tier),
    rateEur: largest.rateEur,
    rateNonEur: largest.rateNonEur,
    capacityMin: largest.min,
    capacityMax: largest.max,
    tier: largest.tier
  }
}

/**
 * Get all available vehicle tiers from a rate record (for UI display)
 */
export function getAllVehicleTiers(rate: TransportRateRecord | any): VehicleRateResult[] {
  const results: VehicleRateResult[] = []

  for (const tier of VEHICLE_TIERS) {
    const rateEur = rate[`${tier}_rate_eur`]
    const rateNonEur = rate[`${tier}_rate_non_eur`]
    const min = rate[`${tier}_capacity_min`] ?? getDefaultCapacity(tier).min
    const max = rate[`${tier}_capacity_max`] ?? getDefaultCapacity(tier).max

    if (rateEur != null && rateEur > 0) {
      results.push({
        vehicleType: capitalize(tier),
        rateEur,
        rateNonEur: rateNonEur ?? rateEur,
        capacityMin: min,
        capacityMax: max,
        tier
      })
    }
  }

  return results
}

function getDefaultCapacity(tier: VehicleTier): { min: number; max: number } {
  switch (tier) {
    case 'sedan': return { min: 1, max: 2 }
    case 'minivan': return { min: 3, max: 7 }
    case 'van': return { min: 8, max: 12 }
    case 'minibus': return { min: 13, max: 20 }
    case 'bus': return { min: 21, max: 45 }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
