// ============================================
// CRUISE RATE LOOKUP (with cabin allocation)
// Extracted from generate-itinerary/route.ts
// ============================================

import { type ServiceTier, toNumber } from './parsing-utils'

export interface CabinAllocation {
  type: 'single' | 'double' | 'triple' | 'suite'
  count: number
  pax: number  // total people in this cabin type
  ratePerPersonPerNight: number
  costPerNight: number  // rate × pax
}

export interface CruiseRate {
  found: boolean
  shipName: string
  supplierId: string | null
  season: string
  cabinAllocation: CabinAllocation[]
  totalPerNight: number       // supplier cost for all cabins per night
  totalSupplierCost: number   // totalPerNight × nights
  nights: number
}

/**
 * Detect which season a date falls in for a given cruise ship record
 */
export function detectCruiseSeason(ship: any, startDate: string): string {
  const date = new Date(startDate)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const mmdd = month * 100 + day  // e.g., March 20 = 320

  const toMmdd = (dateStr: string | null): number => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    return (d.getMonth() + 1) * 100 + d.getDate()
  }

  // Check peak season first (2 possible periods)
  if (ship.peak_season_1_start && ship.peak_season_1_end) {
    const start = toMmdd(ship.peak_season_1_start)
    const end = toMmdd(ship.peak_season_1_end)
    if (start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)) return 'peak'
  }
  if (ship.peak_season_2_start && ship.peak_season_2_end) {
    const start = toMmdd(ship.peak_season_2_start)
    const end = toMmdd(ship.peak_season_2_end)
    if (start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)) return 'peak'
  }

  // Check high season
  if (ship.high_season_start && ship.high_season_end) {
    const start = toMmdd(ship.high_season_start)
    const end = toMmdd(ship.high_season_end)
    if (start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)) return 'high'
  }

  // Default to low season
  return 'low'
}

/**
 * Get per-person-per-night rates for a given season and passport type
 */
export function getCruiseSeasonRates(ship: any, season: string, isEuro: boolean): {
  single: number; double: number; triple: number; suite: number
} {
  const suffix = isEuro ? 'eur' : 'non_eur'
  return {
    single: toNumber(ship[`rate_${season}_single_${suffix}`], 0),
    double: toNumber(ship[`rate_${season}_double_${suffix}`], 0),
    triple: toNumber(ship[`rate_${season}_triple_${suffix}`], 0),
    suite:  toNumber(ship[`rate_${season}_suite_${suffix}`], 0),
  }
}

/**
 * Calculate all valid cabin allocations for a given number of passengers
 * Returns them sorted by total cost (cheapest first)
 */
export function calculateCabinAllocations(
  totalPax: number,
  rates: { single: number; double: number; triple: number; suite: number }
): CabinAllocation[][] {
  const allocations: CabinAllocation[][] = []

  // Generate combinations of double, triple, single that sum to totalPax
  // Max cabins of each type
  const maxTriples = Math.floor(totalPax / 3)
  const maxDoubles = Math.floor(totalPax / 2)

  for (let triples = 0; triples <= maxTriples; triples++) {
    const remaining = totalPax - (triples * 3)
    for (let doubles = 0; doubles <= Math.floor(remaining / 2); doubles++) {
      const singles = remaining - (doubles * 2)

      const allocation: CabinAllocation[] = []
      let totalPerNight = 0

      if (doubles > 0 && rates.double > 0) {
        const cost = rates.double * 2 * doubles
        allocation.push({ type: 'double', count: doubles, pax: doubles * 2, ratePerPersonPerNight: rates.double, costPerNight: cost })
        totalPerNight += cost
      }
      if (triples > 0 && rates.triple > 0) {
        const cost = rates.triple * 3 * triples
        allocation.push({ type: 'triple', count: triples, pax: triples * 3, ratePerPersonPerNight: rates.triple, costPerNight: cost })
        totalPerNight += cost
      }
      if (singles > 0 && rates.single > 0) {
        const cost = rates.single * 1 * singles
        allocation.push({ type: 'single', count: singles, pax: singles, ratePerPersonPerNight: rates.single, costPerNight: cost })
        totalPerNight += cost
      }

      // Only include if all passengers are accounted for
      const allocatedPax = allocation.reduce((sum, a) => sum + a.pax, 0)
      if (allocatedPax === totalPax && allocation.length > 0) {
        allocations.push(allocation)
      }
    }
  }

  // Fallback: no exact cabin combination summed to totalPax — usually an odd
  // passenger with no configured single rate, or only one cabin type priced.
  // Returning [] here made getCruiseRate price the WHOLE cruise at €0 (the
  // agency silently ate the cabin cost). Instead price every passenger at the
  // best available per-person rate, charging any solo passenger the single
  // supplement (a full double cabin) so the cabin is never free.
  if (allocations.length === 0 && totalPax > 0) {
    const ppn = rates.double > 0 ? rates.double : rates.triple > 0 ? rates.triple : rates.single
    if (ppn > 0) {
      const doubles = Math.floor(totalPax / 2)
      const leftover = totalPax - doubles * 2
      const fallback: CabinAllocation[] = []
      if (doubles > 0) {
        fallback.push({ type: 'double', count: doubles, pax: doubles * 2, ratePerPersonPerNight: ppn, costPerNight: ppn * 2 * doubles })
      }
      if (leftover > 0) {
        fallback.push({ type: 'single', count: leftover, pax: leftover, ratePerPersonPerNight: ppn * 2, costPerNight: ppn * 2 * leftover })
      }
      console.warn(`⚠️ Cruise cabin allocation fallback for ${totalPax} pax (rates pppn: single=${rates.single}, double=${rates.double}, triple=${rates.triple}) — priced at best available rate to avoid a €0 cruise.`)
      allocations.push(fallback)
    }
  }

  // Sort by total cost per night (cheapest first)
  allocations.sort((a, b) => {
    const costA = a.reduce((sum, cabin) => sum + cabin.costPerNight, 0)
    const costB = b.reduce((sum, cabin) => sum + cabin.costPerNight, 0)
    return costA - costB
  })

  return allocations
}

/**
 * Main cruise rate function: finds ship, detects season, calculates optimal cabin allocation
 */
export async function getCruiseRate(
  params: {
    tier: ServiceTier
    recommendedSuppliers: string[]
    supabase: any
    totalPax: number
    nights: number
    startDate: string
    isEuroPassport: boolean
  }
): Promise<CruiseRate> {
  const { tier, recommendedSuppliers, supabase, totalPax, nights, startDate, isEuroPassport } = params

  const noRate: CruiseRate = {
    found: false,
    shipName: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Nile Cruise`,
    supplierId: null,
    season: 'high',
    cabinAllocation: [],
    totalPerNight: 0,
    totalSupplierCost: 0,
    nights
  }

  try {
    let ship: any = null

    // Try recommended suppliers first
    if (recommendedSuppliers && recommendedSuppliers.length > 0) {
      const { data } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .in('ship_name', recommendedSuppliers)
        .limit(1)
      if (data?.length) ship = data[0]
    }

    // Fallback: tier match
    if (!ship) {
      const { data } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .order('is_preferred', { ascending: false })
        .limit(1)
      if (data?.length) ship = data[0]
    }

    // Final fallback: any active cruise
    if (!ship) {
      const { data } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .limit(1)
      if (data?.length) ship = data[0]
    }

    if (!ship) return noRate

    // Detect season
    const season = detectCruiseSeason(ship, startDate)
    const rates = getCruiseSeasonRates(ship, season, isEuroPassport)

    console.log(`🚢 Cruise: ${ship.ship_name} | Season: ${season} | Passport: ${isEuroPassport ? 'EUR' : 'non-EUR'}`)
    console.log(`💰 Rates (pppn): single=${rates.single}, double=${rates.double}, triple=${rates.triple}, suite=${rates.suite}`)

    // Calculate optimal cabin allocation (cheapest first)
    const allocations = calculateCabinAllocations(totalPax, rates)

    if (allocations.length === 0) return noRate

    // Use cheapest allocation
    const bestAllocation = allocations[0]
    const totalPerNight = bestAllocation.reduce((sum, a) => sum + a.costPerNight, 0)

    console.log(`🛏️ Cabin allocation (${totalPax} pax): ${bestAllocation.map(a => `${a.count}×${a.type}`).join(' + ')} = ${totalPerNight}/night`)

    return {
      found: true,
      shipName: ship.ship_name,
      supplierId: ship.supplier_id || ship.id,
      season,
      cabinAllocation: bestAllocation,
      totalPerNight,
      totalSupplierCost: totalPerNight * nights,
      nights
    }

  } catch (err) {
    console.error('⚠️ Error fetching cruise rate:', err)
    return noRate
  }
}
