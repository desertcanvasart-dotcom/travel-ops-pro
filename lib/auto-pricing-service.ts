// ============================================
// AUTO-PRICING SERVICE - v4 (Smart Transport)
// File: lib/auto-pricing-service.ts
//
// Holistic B2B pricing engine that processes
// tour_templates.itinerary JSONB day-by-day
//
// Features:
// - PPD (Per Person Double) + Single Supplement model
// - Mixed itineraries (Hotel + Cruise)
// - Tour Leader (+0/+1) support
// - Multi-pax calculation (1-40)
// - Smart transportation selection (duration, area)
// - All service types (accommodation, meals, entrances, transport, guide, airport, hotel services)
//
// v4 Changes:
// - Smart transport type detection (airport, intercity, day_tour)
// - Duration detection (full_day, half_day)
// - Area-based transport matching (east_bank, west_bank, etc.)
// - Special vehicle handling (Horse Carriage for Edfu)
// - Itinerary-level transport overrides
//
// BACKWARD COMPATIBLE:
// - Exports calculateAutoPricing() with same interface as v2/v3
// - New: calculateDayBasedPricing() returns full pricing table
// ============================================

import { createClient } from '@supabase/supabase-js'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'
import { roundToCurrency } from '@/lib/currency-totals'
import { DEFAULT_RATE_CURRENCY } from '@/lib/org-rate-currency'
import {
  seasonForDate,
  type SeasonMatch,
  computeUplift,
  type SeasonWindow,
  type UpliftBreakdown,
} from '@/lib/pricing/season-uplift'
import { debugLog } from '@/lib/debug-log'
import { getTransportRateForPax } from '@/lib/transport-rate-utils'
import { applyB2BDayRules } from '@/lib/ai/day-rules-engine'
import type { PricingHole } from '@/lib/pricing-types'
import { priceAcrossPax } from '@/lib/pricing/pax-range'
import { usableRate } from '@/lib/pricing/usable-rate'
import { ratesForTravelDate } from '@/lib/rates/rate-seasons'
import { createRateNormalizer, type RateNormalizer } from '@/lib/rates/rate-currency'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// TYPES
// ============================================

export type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type AccommodationType = 'hotel' | 'cruise' | 'none'
export type MealStatus = 'included' | 'external' | 'none'

// Transport service types — canonical 11-value taxonomy (locked-in 2026-06-23).
// See ~/.claude/.../memory/transportation-types.md for the full spec and the
// per-day derivation rules implemented in determineTransportNeeds().
export type TransportServiceType =
  | 'airport_transfer'
  | 'airport_with_sightseeing'
  | 'city_transfer'
  | 'city_tour'
  | 'intercity'
  | 'intercity_with_sightseeing'
  | 'half_day'
  | 'day_tour'
  | 'extended_day_tour'
  | 'sound_light'
  | 'dinner_transfer'

export type TransportDuration = 'full_day' | 'half_day' | 'one_way'

export type TransportArea = 
  | 'east_bank'
  | 'west_bank'
  | 'pyramids'
  | 'islamic_cairo'
  | 'old_cairo'
  | 'temple_visit'
  | 'nubian_village'
  | null

// Cruise package type
export type CruisePackageType = 'cruise_only' | 'cruise_plus_hotels' | null

// Enhanced Itinerary Day Structure
export interface ItineraryDay {
  day: number
  title: string
  description?: string
  city: string
  overnight_city?: string  // Where the traveler sleeps — may differ from city on day trips
  accommodation_type: AccommodationType
  meals: {
    breakfast: MealStatus
    lunch: MealStatus
    dinner: MealStatus
  }
  attractions: string[]
  services: {
    airport_arrival: boolean
    airport_departure: boolean
    hotel_checkin: boolean
    hotel_checkout: boolean
    guide_required: boolean
  }
  // NEW: Transport overrides (optional)
  transport?: {
    service_type?: TransportServiceType
    duration?: TransportDuration
    area?: TransportArea
    vehicle_type?: string // e.g., 'Horse Carriage' for Edfu
  }
  // NEW: Nile Cruise package flag - when true, uses bundled transport package
  // instead of calculating individual transport costs for this day
  is_cruise_day?: boolean

  // B3 (2026-06-23): per-day transport rule flags.

  // Arrival-day pattern. false (default) = airport -> hotel -> tour
  // (two transport line items). true = airport -> tour -> hotel (one
  // bundled `airport_with_sightseeing` line item).
  skip_arrival_checkin?: boolean

  // For city-change days: 'flight' means TWO airport transfers on the same
  // day (one in the departure city, one in the arrival city). 'ground'
  // (default) means a single `intercity` / `intercity_with_sightseeing`
  // line. Pre-existing data without this field is treated as 'ground'.
  transport_type?: 'flight' | 'ground'

  // Additive transport line items independent of the day's primary, e.g.
  // ['sound_light'] for an evening Sound & Light show transfer at Karnak
  // even on a cruise day. Each entry emits one line item looked up at
  // `day.city`.
  extras?: TransportServiceType[]
}

// Pricing parameters
export interface DayPricingParams {
  templateId: string
  /** See PricingParams.packageType — same plumbing, per-day engine. */
  packageType?: string
  tier: ServiceTier
  isEurPassport: boolean
  language?: string
  travelDate?: string
  /** Whose season calendar to read. Omitted, no premium is applied — the engine
   *  is otherwise org-blind and must not guess whose dates these are. */
  orgId?: string
  marginPercent?: number
  /** Currency the rate tables are entered in (organizations.rate_currency).
   *  The engine only adds numbers; this is the label it puts on the result.
   *  Omitted → EUR, the historical base. */
  rateCurrency?: string
}

// Single pax calculation result
export interface PaxPricingResult {
  numPax: number
  withoutLeader: {
    totalCost: number
    marginAmount: number
    sellingPrice: number
    pricePerPerson: number
  }
  withLeader: {
    totalCost: number
    tourLeaderCost: number
    marginAmount: number
    sellingPrice: number
    pricePerPerson: number
  }
}

// Service line item
export interface PricedService {
  id: string
  dayNumber: number
  serviceType: string
  serviceName: string
  quantity: number
  quantityMode: 'fixed' | 'per_pax' | 'per_room' | 'per_day'
  unitCost: number
  lineTotal: number
  rateSource: string
  isPerPax: boolean  // true = scales with pax, false = fixed cost
  isOptional: boolean  // true = optional add-on service
  notes?: string
}

// Complete pricing result
export interface DayPricingResult {
  success: boolean
  templateId: string
  templateName: string
  tier: ServiceTier
  totalDays: number
  
  // Accommodation breakdown
  hotelNights: number
  cruiseNights: number
  
  // Single supplement (one number for whole tour)
  singleSupplement: number
  
  // Services detail (for 2 pax reference)
  services: PricedService[]
  
  // Multi-pax pricing table
  paxPricing: PaxPricingResult[]
  
  // Metadata
  currency: string
  marginPercent: number
  warnings: string[]

  // Correctness harness (Phase 1): a price is deliverable only when complete.
  // A missing/uncertain rate is recorded as a hole — never fabricated.
  complete: boolean
  holes: PricingHole[]
}

// Transport rate from database
interface TransportRate {
  id: string
  service_code: string
  service_type: string
  vehicle_type: string | null
  city: string | null
  origin_city: string | null
  destination_city: string | null
  duration: string | null
  area: string | null
  route_name: string | null
  base_rate_eur: number
  base_rate_non_eur: number
  capacity_min: number | null
  capacity_max: number | null
  is_active: boolean
  // Tiered vehicle rates (from restructured table)
  sedan_rate_eur?: number | null
  sedan_rate_non_eur?: number | null
  minivan_rate_eur?: number | null
  minivan_rate_non_eur?: number | null
  van_rate_eur?: number | null
  van_rate_non_eur?: number | null
  minibus_rate_eur?: number | null
  minibus_rate_non_eur?: number | null
  bus_rate_eur?: number | null
  bus_rate_non_eur?: number | null
  sedan_capacity_min?: number
  sedan_capacity_max?: number
  minivan_capacity_min?: number
  minivan_capacity_max?: number
  van_capacity_min?: number
  van_capacity_max?: number
  minibus_capacity_min?: number
  minibus_capacity_max?: number
  bus_capacity_min?: number
  bus_capacity_max?: number
}

// Cruise transport pricing rule from b2b_pricing_rules
// Cruise transport packages live in `b2b_transport_packages` — the SHARED
// source of truth for cruise transport pricing (despite the "b2b_" prefix it
// serves BOTH the B2C and B2B/"Guide" shapes; markup is a manual per-itinerary
// operator input applied downstream, not a shape-branched calculation here).
// This is the same table + extraction the calculate-price and pricing-grid
// paths read. The engine previously (incorrectly) read b2b_pricing_rules
// WHERE service_category='cruise_transport', which is permanently empty and
// not even creatable from the UI — that dead read is removed.
interface CruiseTransportPackage {
  id: string
  package_name: string
  package_type: string | null
  origin_city: string | null
  destination_city: string | null
  duration_days: number | null
  sedan_rate: number | null
  sedan_capacity: number | null
  minivan_rate: number | null
  minivan_capacity: number | null
  van_rate: number | null
  van_capacity: number | null
  minibus_rate: number | null
  minibus_capacity: number | null
  bus_rate: number | null
  bus_capacity: number | null
  includes: string | null
  notes: string | null
  is_active: boolean
}

// Cruise package pricing info (used during calculation)
export interface CruisePackageInfo {
  packageFound: boolean
  packageName: string
  durationDays: number
  packageRate: number
  vehicleType: VehicleType
  includes: string | null
}

// ============================================
// CONSTANTS
// ============================================

// Generate pax counts 1-40 (supports solo travelers through large groups)
export const PAX_COUNTS = Array.from({ length: 40 }, (_, i) => i + 1)

// The vehicles this system knows how to name.
//
// CAPACITY IS NOT HERE. It belongs to the rate row — each transportation rate
// carries its own `<tier>_capacity_min/max`, editable on the rates screen —
// because the bands are the agency's own: one that never runs a sedan starts
// its minivan at 1 pax. There used to be a capacity map at this spot claiming
// Van 8-14 and Minibus 15-20, disagreeing with the defaults in
// lib/transport-rate-utils.ts that actually select the vehicle. It selected
// nothing and was believed by nobody, which is the worst state for a constant.
export const VEHICLE_TYPES = [
  'Sedan', 'Minivan', 'Van', 'Minibus', 'Bus',
  'Horse Carriage',  // Special for Edfu
] as const

export type VehicleType = (typeof VEHICLE_TYPES)[number]

// Area to attractions mapping (for auto-detection)
const AREA_ATTRACTIONS: Record<string, string[]> = {
  'east_bank': [
    'karnak', 'karnak temple', 'luxor temple'
  ],
  'west_bank': [
    'valley of the kings', 'valley of kings', 'hatshepsut', 'hatshepsut temple',
    'colossi of memnon', 'medinet habu', 'valley of the queens',
    'deir el-medina', 'ramesseum'
  ],
  'pyramids': [
    'pyramids', 'pyramid', 'giza', 'sphinx', 'great sphinx',
    'solar boat', 'khufu', 'khafre', 'menkaure'
  ],
  'islamic_cairo': [
    'citadel', 'saladin citadel', 'khan el khalili', 'khan el-khalili',
    'al-azhar', 'hussein mosque', 'old cairo bazaar'
  ],
  'old_cairo': [
    'coptic cairo', 'hanging church', 'ben ezra', 'coptic museum',
    'st. sergius', 'church of st. george'
  ],
  'temple_visit': [
    'edfu', 'edfu temple', 'kom ombo', 'kom ombo temple',
    'horus temple', 'sobek temple'
  ],
  'nubian_village': [
    'nubian', 'nubian village', 'elephantine', 'elephantine island'
  ]
}

// Cities that use special vehicles
const SPECIAL_VEHICLE_CITIES: Record<string, VehicleType> = {
  'edfu': 'Horse Carriage'
}

// NOTE: DEFAULT_RATES (hardcoded per-tier fallback prices) was REMOVED by the
// pricing correctness harness (Phase 1). A missing DB rate is now recorded as a
// PricingHole and the result is marked `complete: false` — the engine NEVER
// fabricates or substitutes a guessed/default rate. See PRICING-HARNESS-PLAN.md.

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * A LABEL for a group size — not the vehicle selection rule.
 *
 * What actually gets booked comes from the rate row: getTransportRateForPax
 * considers only vehicles this route has priced, within the capacity bands the
 * operator set. This function knows neither, so it must never decide a price.
 * It survives as the fallback text when a rate row has no vehicle_type.
 */
export function getVehicleTypeByPax(totalPax: number, city?: string): VehicleType {
  // Check for special vehicle cities first
  if (city && SPECIAL_VEHICLE_CITIES[city.toLowerCase()]) {
    return SPECIAL_VEHICLE_CITIES[city.toLowerCase()]
  }
  
  if (totalPax <= 2) return 'Sedan'
  if (totalPax <= 7) return 'Minivan'
  if (totalPax <= 14) return 'Van'
  if (totalPax <= 20) return 'Minibus'
  return 'Bus'
}

/**
 * Get airport code from city name
 */
export function getAirportCode(city: string): string {
  const cityMap: Record<string, string> = {
    'cairo': 'CAI',
    'luxor': 'LXR',
    'aswan': 'ASW',
    'hurghada': 'HRG',
    'sharm el-sheikh': 'SSH',
    'sharm': 'SSH',
    'alexandria': 'ALY',
    'abu simbel': 'ABS'
  }
  return cityMap[city.toLowerCase()] || 'CAI'
}

/**
 * Map tier to hotel category for hotel_staff_rates
 */
export function getTierCategory(tier: ServiceTier): string {
  if (tier === 'budget') return 'budget'
  if (tier === 'luxury') return 'luxury'
  return 'standard'  // standard and deluxe both map to standard
}

/**
 * Detect area from attractions list
 */
export function detectAreaFromAttractions(attractions: string[]): TransportArea {
  if (!attractions || attractions.length === 0) return null
  
  const attractionsLower = attractions.map(a => a.toLowerCase())
  
  for (const [area, keywords] of Object.entries(AREA_ATTRACTIONS)) {
    for (const keyword of keywords) {
      for (const attraction of attractionsLower) {
        if (attraction.includes(keyword)) {
          return area as TransportArea
        }
      }
    }
  }
  
  return null
}

/**
 * Detect duration from number of attractions
 * Business rules:
 *   0 attractions → null (no sightseeing transport needed)
 *   1 attraction  → half_day
 *   2+ attractions → full_day
 */
export function detectDurationFromAttractions(attractions: string[]): TransportDuration | null {
  if (!attractions || attractions.length === 0) return null
  if (attractions.length === 1) return 'half_day'
  return 'full_day'
}

/**
 * One transport line item required by a day. A day may need zero, one, or
 * many of these — e.g. a mid-trip flight day needs TWO airport transfers
 * (one in the departure city, one in the arrival city). The per-day rule
 * engine (`determineTransportNeeds`) returns a list of these.
 */
export interface TransportNeed {
  serviceType: TransportServiceType
  duration: TransportDuration
  area: TransportArea
  useSpecialVehicle: boolean
  specialVehicleType?: VehicleType
  // Optional city override for rate lookup. Used when this leg's rate should
  // be priced in a different city than day.city — e.g. the departure-side
  // leg of a mid-trip flight (hotel→airport happens in the PREVIOUS city,
  // not the arrival city). When undefined, day.city is used.
  city?: string
  // For intercity legs, the rate lookup may need an origin→destination pair.
  // When undefined, the caller uses (previousDay.city, day.city) for intercity.
  originCity?: string
  destinationCity?: string
}

/**
 * Determine transport requirements for a day.
 *
 * Returns a list of TransportNeed entries (zero, one, or many). This structural
 * shape — list rather than a single-decision-or-null — is what lets a day
 * carry multiple transport line items (B3 will use it for flight-day
 * multi-transfers; today each branch still produces at most one entry, so
 * behavior is unchanged from the previous single-need version).
 */
export function determineTransportNeeds(
  day: ItineraryDay,
  previousDay: ItineraryDay | null,
  nextDay: ItineraryDay | null
): TransportNeed[] {
  // Explicit per-day transport override wins (admin pinned a specific
  // service_type for this day). Returns one line; extras still get added.
  const lines: TransportNeed[] = []

  if (day.transport?.service_type) {
    lines.push({
      serviceType: day.transport.service_type,
      duration: day.transport.duration || 'full_day',
      area: day.transport.area || null,
      useSpecialVehicle: !!day.transport.vehicle_type,
      specialVehicleType: day.transport.vehicle_type as VehicleType,
    })
    appendExtras(lines, day)
    return lines
  }

  const cityLower = day.city.toLowerCase()
  const useSpecialVehicle = !!SPECIAL_VEHICLE_CITIES[cityLower]
  const specialVehicleType = SPECIAL_VEHICLE_CITIES[cityLower]
  const hasAttractions = !!(day.attractions && day.attractions.length > 0)
  const attractionCount = day.attractions?.length || 0
  // City change = cities differ AND it's not pure in-cruise movement (the ship
  // moving Aswan → Kom Ombo → Edfu → Luxor across consecutive cruise days is
  // not a transfer). Cruise *boundaries* (hotel → cruise on a boarding day,
  // cruise → hotel on a disembarkation day) ARE city changes and need their
  // own transport line.
  const isCityChange = !!(previousDay &&
    previousDay.city.toLowerCase() !== cityLower &&
    !(day.accommodation_type === 'cruise' && previousDay.accommodation_type === 'cruise'))
  // On a disembarkation flight day, the cruise → airport transfer is bundled
  // in the cruise package — suppress the departure-side leg.
  const isCruiseDisembarkFlight = previousDay?.accommodation_type === 'cruise'
  const isFlightDay = day.transport_type === 'flight'
  const isCruise = day.is_cruise_day === true
  const transportArea = hasAttractions ? detectAreaFromAttractions(day.attractions) : null

  // First day (arrival).
  if (day.services.airport_arrival && !previousDay) {
    if (day.skip_arrival_checkin && hasAttractions) {
      // One bundled line: airport → sites → hotel.
      lines.push({
        serviceType: 'airport_with_sightseeing',
        duration: 'one_way',
        area: transportArea,
        useSpecialVehicle: false,
      })
    } else {
      // Two lines: airport_transfer + sightseeing tour (if attractions).
      lines.push({
        serviceType: 'airport_transfer',
        duration: 'one_way',
        area: null,
        useSpecialVehicle: false,
      })
      if (hasAttractions) {
        lines.push({
          serviceType: sightseeingServiceType(attractionCount),
          duration: sightseeingDuration(attractionCount),
          area: transportArea,
          useSpecialVehicle,
          specialVehicleType,
        })
      }
    }
  }
  // Last day (departure).
  else if (day.services.airport_departure && !nextDay) {
    lines.push({
      serviceType: 'airport_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false,
    })
  }
  // Mid-trip flight day (city change, transport_type='flight').
  // Two airport transfers — one in the departure city, one in the arrival
  // city. On a DISEMBARKATION flight day (previous day on cruise), the cruise
  // package covers cruise → airport, so the departure-side leg is suppressed
  // and only the arrival-side leg is emitted. On a boarding day (previous
  // day NOT on cruise) both legs are emitted normally.
  else if (isCityChange && isFlightDay) {
    if (!isCruiseDisembarkFlight && previousDay) {
      lines.push({
        serviceType: 'airport_transfer',
        duration: 'one_way',
        area: null,
        useSpecialVehicle: false,
        city: previousDay.city, // departure-side: previous city's airport
      })
    }
    // Arrival-side leg — upgrade to airport_with_sightseeing when attractions.
    lines.push({
      serviceType: hasAttractions ? 'airport_with_sightseeing' : 'airport_transfer',
      duration: 'one_way',
      area: transportArea,
      useSpecialVehicle: false,
    })
  }
  // Cruise day (non-flight): primary ground excursion transport is bundled
  // in the cruise package — emit nothing here. Extras still fire below.
  else if (isCruise) {
    // intentional no-op
  }
  // Ground intercity day (city change, no flight): same-day round-trip with
  // sightseeing → intercity_with_sightseeing; otherwise one-way intercity.
  else if (isCityChange) {
    lines.push({
      serviceType: hasAttractions ? 'intercity_with_sightseeing' : 'intercity',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false,
      originCity: previousDay?.city,
      destinationCity: day.city,
    })
  }
  // Same-city sightseeing day: tier by attraction count.
  else if (hasAttractions) {
    lines.push({
      serviceType: sightseeingServiceType(attractionCount),
      duration: sightseeingDuration(attractionCount),
      area: transportArea,
      useSpecialVehicle,
      specialVehicleType,
    })
  }

  // Extras are always additive — even on cruise days (e.g. Day 4 sound &
  // light at Karnak from the worked itinerary).
  appendExtras(lines, day)

  return lines
}

/**
 * Map attraction count to the sightseeing tier per the locked-in rule:
 *   1 attraction   → half_day      (~4h)
 *   2–3 attractions → day_tour     (~8h)
 *   4+ attractions  → extended_day_tour (~12h)
 */
function sightseeingServiceType(attractionCount: number): TransportServiceType {
  if (attractionCount === 1) return 'half_day'
  if (attractionCount <= 3) return 'day_tour'
  return 'extended_day_tour'
}

function sightseeingDuration(attractionCount: number): TransportDuration {
  return attractionCount === 1 ? 'half_day' : 'full_day'
}

/**
 * Append each entry in day.extras as its own transport line. Used in every
 * branch above (including cruise days) so a sound_light / dinner_transfer /
 * city_transfer add-on always emits its own pricing row.
 */
function appendExtras(lines: TransportNeed[], day: ItineraryDay): void {
  if (!day.extras || day.extras.length === 0) return
  for (const extra of day.extras) {
    lines.push({
      serviceType: extra,
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false,
    })
  }
}

/**
 * Parse itinerary JSONB - handles both old and new formats
 */
export function parseItinerary(itineraryData: any, opts?: {
  /** Where a day with no recognisable city lands. The Egypt keyword table in
   *  inferCityFromTitle still runs first (harmless for other destinations —
   *  their titles simply won't contain Egyptian names); this only replaces
   *  the last-resort hardcoded 'Cairo' (multi-destination plan, Phase 2). */
  defaultCity?: string
  /** What the customer is buying. Gates the DEFAULT service flags below the
   *  same way the grid's completeness mask does (lib/package-types.ts):
   *  a product with no airport transfers must not default them onto days,
   *  and a product with no accommodation has no hotel check-ins to price.
   *  EXPLICIT day.services always win — same precedence as the grid.
   *  Omitted = full-package, the engine's historical assumption. */
  packageType?: string
}): ItineraryDay[] {
  if (!itineraryData || !Array.isArray(itineraryData)) {
    return []
  }

  const parsed = itineraryData.map((day: any, index: number) => {
    // Handle old format (simple meals array)
    let meals = {
      breakfast: 'none' as MealStatus,
      lunch: 'none' as MealStatus,
      dinner: 'none' as MealStatus
    }

    if (day.meals) {
      if (Array.isArray(day.meals)) {
        // Old format: ["Breakfast", "Lunch", "Dinner"]
        const mealArray = day.meals.map((m: string) => m.toLowerCase())
        meals.breakfast = mealArray.includes('breakfast') ? 'included' : 'none'
        meals.lunch = mealArray.includes('lunch') ? 'included' : 'none'
        meals.dinner = mealArray.includes('dinner') ? 'included' : 'none'
      } else {
        // New format: { breakfast: 'included', lunch: 'external', dinner: 'none' }
        meals = {
          breakfast: day.meals.breakfast || 'none',
          lunch: day.meals.lunch || 'none',
          dinner: day.meals.dinner || 'none'
        }
      }
    }

    // Handle services - default based on day position
    const isFirstDay = index === 0
    const isLastDay = index === itineraryData.length - 1
    const hasAttractions = (day.attractions && day.attractions.length > 0) ||
                          (day.title && /temple|pyramid|museum|valley|tomb/i.test(day.title))

    // Build services with defaults, then ENFORCE first/last day rules.
    //
    // The defaults and the enforcement describe a FULL PACKAGE, so both are
    // gated on what the product actually includes. Two latent bugs lived
    // here (taxonomy review): a SINGLE-day template with no explicit
    // services defaulted airport arrival AND departure AND hotel check-in
    // AND check-out onto its one day — a day tour priced like a whole
    // package — and no product ever escaped the full-package assumption.
    // Explicit day.services still win over everything, same precedence as
    // the pricing grid's package mask.
    const pkgIncludes = PACKAGE_TYPE_CONFIGS.find(
      p => p.slug === (opts?.packageType ?? 'full-package')
    )?.includes ?? PACKAGE_TYPE_CONFIGS.find(p => p.slug === 'full-package')!.includes
    const isSingleDay = itineraryData.length === 1

    const baseServices = day.services || {
      airport_arrival: pkgIncludes.airportTransfers && isFirstDay,
      airport_departure: pkgIncludes.airportTransfers && isLastDay,
      // A single-day trip has no overnight, so there is no hotel to check
      // into whatever the package says — day-use is an explicit flag, not a
      // default.
      hotel_checkin: pkgIncludes.accommodation && !isSingleDay && isFirstDay,
      hotel_checkout: pkgIncludes.accommodation && !isSingleDay && isLastDay,
      guide_required: hasAttractions
    }

    // RULE ENFORCEMENT: ensure arrival/departure flags on first/last days of
    // a multi-day tour — when the package sells those services at all.
    const services = {
      ...baseServices,
      ...(isFirstDay && itineraryData.length > 1 ? {
        ...(pkgIncludes.airportTransfers ? { airport_arrival: true } : {}),
        ...(pkgIncludes.accommodation ? { hotel_checkin: true } : {}),
      } : {}),
      ...(isLastDay && itineraryData.length > 1 ? {
        ...(pkgIncludes.airportTransfers ? { airport_departure: true } : {}),
        ...(pkgIncludes.accommodation ? { hotel_checkout: true } : {}),
      } : {}),
    }

    // Extract attractions from title if not provided
    let attractions = day.attractions || []
    if (attractions.length === 0 && day.title) {
      attractions = extractAttractionsFromTitle(day.title)
    }

    // Normalize attraction names for consistent DB matching
    // Applies Giza Plateau rules: "Pyramids of Giza", "Sphinx" → "Giza Plateau"
    attractions = normalizeAttractionsList(attractions)

    // RULE: Transfer-only days (first/last with no real sightseeing) shouldn't have attractions
    const title = (day.title || '').toLowerCase()
    const description = (day.description || '').toLowerCase()
    const combined = title + ' ' + description
    const isLikelyTransferOnly = (isFirstDay || isLastDay) &&
      (/arrival|departure|farewell|transfer.*airport|airport.*transfer|check[\s-]?out/i.test(combined)) &&
      !(/visit|explore|tour|discover|excursion|sightseeing|museum|temple|pyramid/i.test(combined))

    if (isLikelyTransferOnly) {
      attractions = []
      services.guide_required = false
    }

    return {
      day: day.day || index + 1,
      title: day.title || `Day ${index + 1}`,
      description: day.description || '',
      city: day.city || inferCityFromTitle(day.title || '', opts?.defaultCity),
      overnight_city: day.overnight_city || undefined,
      accommodation_type: day.accommodation_type || inferAccommodationType(day, itineraryData),
      meals,
      attractions,
      services,
      // Parse transport overrides if present
      transport: day.transport || undefined,
      // Nile Cruise package flag - uses bundled transport instead of individual vehicle costs
      is_cruise_day: day.is_cruise_day || false
    }
  })

  // Apply B2B Day Rules Engine for deterministic enforcement
  // (first/last day flags, transfer-only cleanup, meal venue removal)
  return applyB2BDayRules(parsed, opts?.packageType) as ItineraryDay[]
}

/**
 * Extract attraction names from day title
 *
 * PYRAMID / GIZA RULES:
 *   - "visit the pyramid", "visit Giza", "Giza Plateau", "Plateau", generic "pyramid(s)" → "Giza Plateau"
 *   - Sphinx → included in Giza Plateau, no separate entry
 *   - Specific pyramid name + "(inside)" → add that specific pyramid entrance fee
 *   - Specific pyramid name WITHOUT "(inside)" → ignore (no entrance fee)
 */
function extractAttractionsFromTitle(title: string): string[] {
  const attractions: string[] = []

  // --- PYRAMID / GIZA special handling ---
  const titleLower = title.toLowerCase()

  // Check for specific pyramid names with "(inside)" — add both Giza Plateau + specific pyramid
  const specificPyramidInside = title.match(
    /(?:cheops|khufu|khafre|chephren|menkaure|mycerinus|great pyramid|red pyramid|bent pyramid|step pyramid|djoser)\s*\(inside\)/gi
  )
  if (specificPyramidInside) {
    attractions.push('Giza Plateau')
    for (const match of specificPyramidInside) {
      // Extract the pyramid name without "(inside)"
      const pyramidName = match.replace(/\s*\(inside\)/i, '').trim()
      attractions.push(normalizeAttractionName(pyramidName))
    }
  } else if (
    // Generic pyramid/Giza/Plateau references → just Giza Plateau
    /giza\s*plateau/i.test(title) ||
    /plateau/i.test(title) ||
    /pyramid/i.test(title) ||
    /sphinx/i.test(title) ||
    (/giza/i.test(title) && /visit|tour|explore|excursion|sightseeing/i.test(title))
  ) {
    attractions.push('Giza Plateau')
  }

  // --- Standard pattern matching for other attractions ---
  const patterns = [
    // Cairo (non-pyramid)
    /egyptian museum/i,
    /cairo museum/i,
    /grand egyptian museum/i,
    /\bgem\b/i,
    /citadel/i,
    /khan el[- ]?khalili/i,
    // Luxor
    /karnak/i,
    /luxor temple/i,
    /valley of (the )?kings/i,
    /hatshepsut/i,
    /colossi of memnon/i,
    // Aswan
    /philae/i,
    /high dam/i,
    /aswan dam/i,
    /unfinished obelisk/i,
    // Between Luxor & Aswan
    /edfu/i,
    /kom[- ]?ombo/i,
    /abu simbel/i,
    // Alexandria
    /pompey['']?s?\s*pillar/i,
    /qaitbay/i,
    /catacombs/i,
    /bibliotheca\s*alexandrina/i,
    /alexandria\s*library/i,
    /montazah/i,
    /stanley\s*bridge/i,
  ]

  for (const pattern of patterns) {
    if (pattern.test(title)) {
      const match = title.match(pattern)
      if (match) {
        const normalized = normalizeAttractionName(match[0])
        // Avoid duplicates
        if (!attractions.includes(normalized)) {
          attractions.push(normalized)
        }
      }
    }
  }

  return attractions
}

/**
 * Normalize attraction names for database lookup
 */
function normalizeAttractionName(name: string): string {
  const normalized = name.toLowerCase()
    .replace(/^the /, '')
    .replace(/temple$/i, 'Temple')
    .trim()

  const nameMap: Record<string, string> = {
    'karnak': 'Karnak Temple',
    'luxor temple': 'Luxor Temple',
    'valley of kings': 'Valley of the Kings',
    'valley of the kings': 'Valley of the Kings',
    'hatshepsut': 'Hatshepsut Temple',
    'colossi of memnon': 'Colossi of Memnon',
    'edfu': 'Edfu Temple',
    'kom ombo': 'Kom Ombo Temple',
    'kom-ombo': 'Kom Ombo Temple',
    'komombo': 'Kom Ombo Temple',
    'philae': 'Philae Temple',
    'high dam': 'Aswan High Dam',
    'aswan dam': 'Aswan High Dam',
    'unfinished obelisk': 'Unfinished Obelisk',
    'giza plateau': 'Giza Plateau',
    'pyramid': 'Giza Plateau',
    'pyramids': 'Giza Plateau',
    'pyramids of giza': 'Giza Plateau',
    'sphinx': 'Giza Plateau',
    'great sphinx': 'Giza Plateau',
    // Specific pyramids (only relevant when "(inside)" is specified)
    'cheops': 'Cheops Pyramid (inside)',
    'khufu': 'Cheops Pyramid (inside)',
    'great pyramid': 'Cheops Pyramid (inside)',
    'khafre': 'Khafre Pyramid (inside)',
    'chephren': 'Khafre Pyramid (inside)',
    'menkaure': 'Menkaure Pyramid (inside)',
    'mycerinus': 'Menkaure Pyramid (inside)',
    'egyptian museum': 'Egyptian Museum',
    'cairo museum': 'Egyptian Museum',
    'grand egyptian museum': 'Grand Egyptian Museum',
    'gem': 'Grand Egyptian Museum',
    'citadel': 'Saladin Citadel',
    'khan el khalili': 'Khan El Khalili',
    'khan el-khalili': 'Khan El Khalili',
    'abu simbel': 'Abu Simbel',
    // Alexandria
    "pompey's pillar": "Pompey's Pillar",
    'pompeys pillar': "Pompey's Pillar",
    'qaitbay': 'Qaitbay Citadel',
    'catacombs': 'Catacombs of Kom El Shoqafa',
    'bibliotheca alexandrina': 'Bibliotheca Alexandrina',
    'alexandria library': 'Bibliotheca Alexandrina',
    'montazah': 'Montazah Palace Gardens',
    'stanley bridge': 'Stanley Bridge',
  }

  return nameMap[normalized] || name
}

/**
 * Normalize a list of attractions:
 * - Deduplicate by canonical name
 * - Merge Giza-related entries: "Pyramids of Giza", "Great Sphinx" → single "Giza Plateau"
 * - Remove specific pyramid names that don't have "(inside)" suffix
 */
function normalizeAttractionsList(attractions: string[]): string[] {
  const GIZA_ALIASES = [
    'pyramids of giza', 'pyramid of giza', 'pyramids', 'pyramid',
    'great sphinx', 'sphinx', 'giza plateau', 'giza pyramids'
  ]
  const SPECIFIC_PYRAMID_NAMES = [
    'cheops', 'khufu', 'khafre', 'chephren', 'menkaure', 'mycerinus',
    'great pyramid', 'red pyramid', 'bent pyramid', 'step pyramid', 'djoser'
  ]

  const result: string[] = []
  let hasGizaPlateau = false

  for (const attr of attractions) {
    const lower = attr.toLowerCase().trim()

    // Check if this is a Giza alias → merge into single "Giza Plateau"
    if (GIZA_ALIASES.some(alias => lower.includes(alias))) {
      if (!hasGizaPlateau) {
        result.push('Giza Plateau')
        hasGizaPlateau = true
      }
      continue
    }

    // Check if this is a specific pyramid name
    const isSpecificPyramid = SPECIFIC_PYRAMID_NAMES.some(p => lower.includes(p))
    if (isSpecificPyramid) {
      // Only add if it has "(inside)" suffix
      if (/\(inside\)/i.test(attr)) {
        // Also ensure Giza Plateau is added (you need to enter the plateau to get to the pyramid)
        if (!hasGizaPlateau) {
          result.push('Giza Plateau')
          hasGizaPlateau = true
        }
        // Normalize and add
        const normalized = normalizeAttractionName(attr.replace(/\s*\(inside\)/i, '').trim())
        if (!result.includes(normalized)) {
          result.push(normalized)
        }
      }
      // Without "(inside)" → skip entirely (no entrance fee for just mentioning the name)
      continue
    }

    // Regular attraction — normalize and deduplicate
    const normalized = normalizeAttractionName(attr)
    if (!result.includes(normalized)) {
      result.push(normalized)
    }
  }

  return result
}

/**
 * Infer city from day title
 */
function inferCityFromTitle(title: string, defaultCity: string = 'Cairo'): string {
  const lower = title.toLowerCase()
  
  if (lower.includes('cairo') || lower.includes('pyramid') || lower.includes('sphinx') || lower.includes('giza')) {
    return 'Cairo'
  }
  if (lower.includes('luxor') || lower.includes('karnak') || lower.includes('valley of')) {
    return 'Luxor'
  }
  if (lower.includes('aswan') || lower.includes('philae') || lower.includes('high dam')) {
    return 'Aswan'
  }
  if (lower.includes('edfu')) {
    return 'Edfu'
  }
  if (lower.includes('kom ombo') || lower.includes('komombo')) {
    return 'Kom Ombo'
  }
  if (lower.includes('hurghada')) {
    return 'Hurghada'
  }
  if (lower.includes('sharm')) {
    return 'Sharm El-Sheikh'
  }
  if (lower.includes('alexandria')) {
    return 'Alexandria'
  }
  if (lower.includes('abu simbel')) {
    return 'Abu Simbel'
  }

  return defaultCity  // Last resort — the itinerary's own base city
}

/**
 * Infer accommodation type from day data and context
 */
function inferAccommodationType(day: any, allDays: any[]): AccommodationType {
  if (day.accommodation_type) {
    return day.accommodation_type
  }

  const title = (day.title || '').toLowerCase()
  const description = (day.description || '').toLowerCase()
  const combined = title + ' ' + description

  // Check for cruise indicators
  if (combined.includes('cruise') || combined.includes('cruiser') || 
      combined.includes('sail') || combined.includes('aboard') ||
      combined.includes('on board') || combined.includes('embark')) {
    return 'cruise'
  }

  // Check if it's a departure day (usually last day)
  if (combined.includes('departure') || combined.includes('fly out') ||
      combined.includes('transfer to airport') || combined.includes('end of')) {
    return 'none'
  }

  // Default based on tour theme (check all days for cruise mentions)
  const hasCruiseDays = allDays.some((d: any) => 
    ((d.title || '') + ' ' + (d.description || '')).toLowerCase().includes('cruise')
  )

  if (hasCruiseDays) {
    const isArrival = title.includes('arrival')
    const isDeparture = title.includes('departure')
    if (isDeparture) return 'none'
    return 'cruise'
  }

  return 'hotel'
}

// ============================================
// RATE LOOKUP FUNCTIONS
// ============================================

// ============================================
// Which dated rate period a night falls in
// ============================================
// A catalog row read by column name. The `row` handed back by getHotelRates /
// getCruiseRates so a caller can re-resolve per night without re-querying.
type HotelOrCruiseRow = Record<string, unknown>

// Hotels and cruises carry an unlimited list of dated periods, each with its
// own rates (migration 20260826_rate_seasons). These take a catalog row that
// has already been fetched and answer "what does this cost on this night",
// so an itinerary spanning a season boundary prices each night at its own
// period instead of one rate for the whole stay.
//
// No date, or a date outside every period, falls back to the row's base
// columns — the historical behaviour, and the only behaviour available for
// rows with no periods entered.

/** Per-person-per-night double rate and single supplement for one night. */
export function resolveHotelRatesForDate(
  row: HotelOrCruiseRow,
  isEurPassport: boolean,
  travelDate?: string | null
): { ppdNight: number; singleSuppNight: number; seasonName: string | null } {
  const suffix = isEurPassport ? 'eur' : 'non_eur'
  const hit = ratesForTravelDate(row, 'accommodation', travelDate)
  const ppd = hit ? hit.rates[`pp_double_${suffix}`] : (row[`pp_double_${suffix}`] || 0)
  const supp = hit ? hit.rates[`single_supp_${suffix}`] : (row[`single_supp_${suffix}`] || 0)
  return {
    ppdNight: Number(ppd) || 0,
    // A negative supplement is a data-entry slip, never a discount.
    singleSuppNight: Math.max(0, Number(supp) || 0),
    seasonName: hit?.season.name ?? null,
  }
}

/** Per-person-per-night double rate and single supplement for one cruise night.
 *  The single supplement is the gap between the single and double cabin rates —
 *  cruises price by cabin type rather than carrying a supplement column. */
export function resolveCruiseRatesForDate(
  row: HotelOrCruiseRow,
  isEurPassport: boolean,
  travelDate?: string | null
): { ppdNight: number; singleSuppNight: number; seasonName: string | null } {
  const suffix = isEurPassport ? 'eur' : 'non_eur'
  const hit = ratesForTravelDate(row, 'cruise', travelDate)
  // The legacy flat columns are EUR-only, so a non-EUR passport on a row with
  // no periods falls back to the seasonal low columns before the flat ones.
  const double = hit
    ? hit.rates[`double_${suffix}`]
    : (row[`rate_low_double_${suffix}`] || (isEurPassport ? row.rate_double_eur : 0) || 0)
  const single = hit
    ? hit.rates[`single_${suffix}`]
    : (row[`rate_low_single_${suffix}`] || (isEurPassport ? row.rate_single_eur : 0) || 0)
  return {
    ppdNight: Number(double) || 0,
    singleSuppNight: Math.max(0, (Number(single) || 0) - (Number(double) || 0)),
    seasonName: hit?.season.name ?? null,
  }
}

/**
 * Get cruise rates for a tier.
 *
 * `row` comes back with the result so a caller pricing several nights can
 * re-resolve each night's own date against the same catalog row (see
 * resolveCruiseRatesForDate) instead of re-querying per night. The numbers on
 * the result itself are the ones for `travelDate`, or the row's base columns
 * when no dated period covers it.
 */
export async function getCruiseRates(
  tier: ServiceTier,
  embarkCity?: string,
  isEurPassport: boolean = true,
  travelDate?: string | null,
  /** Converts a row entered in another currency — see lib/rates/rate-currency. */
  normalizer?: RateNormalizer
): Promise<{
  shipName: string
  ppdNight: number
  singleSuppNight: number
  durationNights: number
  seasonName: string | null
  row: HotelOrCruiseRow
} | null> {
  try {
    let query = supabaseAdmin
      .from('nile_cruises')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)

    if (embarkCity) {
      query = query.ilike('embark_city', `%${embarkCity}%`)
    }

    // The operator's preferred ship first — the star on the cruise rates page
    // is how they say which boat a programme sails on. It used to be
    // whichever row PostgREST returned first.
    const { data: rawCruises, error } = await query
      .order('is_preferred', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
    const cruises = normalizer && rawCruises ? await normalizer.normalize('nile_cruises', rawCruises) as typeof rawCruises : rawCruises

    if (error || !cruises || cruises.length === 0) {
      debugLog(`⚠️ No cruise rate for tier ${tier} — flagging hole (no fabrication)`)
      return null
    }

    const cruise = cruises[0]
    // Rates are per-person PER-NIGHT (double occupancy). Do NOT divide by
    // duration_nights — callers already multiply by the itinerary's cruise
    // nights.
    const safeNights = cruise.duration_nights && cruise.duration_nights > 0
      ? cruise.duration_nights
      : null
    if (!safeNights) {
      console.warn(`⚠️ Cruise ${cruise.ship_name} has invalid duration_nights (${cruise.duration_nights}) — flagging hole (no fabrication)`)
      return null
    }
    const resolved = resolveCruiseRatesForDate(cruise, isEurPassport, travelDate)

    debugLog(`✅ Cruise: ${cruise.ship_name} | Period: ${resolved.seasonName ?? 'base rate'} | PPD/night: ${resolved.ppdNight.toFixed(2)} | SingleSupp/night: ${resolved.singleSuppNight.toFixed(2)}`)

    return {
      shipName: cruise.ship_name,
      ppdNight: resolved.ppdNight,
      singleSuppNight: resolved.singleSuppNight,
      durationNights: safeNights,
      seasonName: resolved.seasonName,
      row: cruise,
    }
  } catch (err) {
    console.error('Error fetching cruise rates:', err)
    return null
  }
}

/**
 * Get hotel rates for a city and tier from accommodation_rates table.
 * Per-person, per-night.
 *
 * Seasonality used to be entered on these rows and then ignored: this lookup
 * read the base pp_double_/single_supp_ columns and took no travel date, so a
 * hotel priced at its cheapest season whenever the client actually travelled.
 * It now resolves the dated period covering `travelDate` (migration
 * 20260826_rate_seasons), falling back to the base columns when no period
 * covers it — which is also what a row with no periods entered does, so
 * nothing regresses.
 *
 * `row` comes back with the result so a caller pricing several nights can
 * re-resolve each night's own date against the same catalog row (see
 * resolveHotelRatesForDate) instead of re-querying per night.
 */
export async function getHotelRates(
  city: string,
  tier: ServiceTier,
  isEurPassport: boolean = true,
  travelDate?: string | null,
  /** Converts a row entered in another currency — see lib/rates/rate-currency. */
  normalizer?: RateNormalizer
): Promise<{
  hotelName: string
  ppdNight: number
  singleSuppNight: number
  seasonName: string | null
  row: HotelOrCruiseRow
} | null> {
  try {
    // Query accommodation_rates (the authoritative rates table with per-person pricing)
    const { data: rawHotels, error } = await supabaseAdmin
      .from('accommodation_rates')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      // Preferred hotel first (the star on the hotels page), newest as the tie-break.
      .order('is_preferred', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
    const hotels = normalizer && rawHotels ? await normalizer.normalize('accommodation_rates', rawHotels) as typeof rawHotels : rawHotels

    if (error || !hotels || hotels.length === 0) {
      // Per the harness policy we do NOT substitute an adjacent tier (fuzzy) or a
      // hardcoded default — a missing exact city+tier rate is a hole the caller flags.
      debugLog(`⚠️ No ${tier} hotel rate for ${city} — flagging hole (no fabrication)`)
      return null
    }

    const hotel = hotels[0]
    const resolved = resolveHotelRatesForDate(hotel, isEurPassport, travelDate)

    debugLog(`✅ Hotel: ${hotel.property_name} | Period: ${resolved.seasonName ?? 'base rate'} | PPD/night: ${resolved.ppdNight.toFixed(2)} | SingleSupp/night: ${resolved.singleSuppNight.toFixed(2)} (${isEurPassport ? 'EUR' : 'non-EUR'})`)

    return {
      hotelName: hotel.property_name,
      ppdNight: resolved.ppdNight,
      singleSuppNight: resolved.singleSuppNight,
      seasonName: resolved.seasonName,
      row: hotel,
    }
  } catch (err) {
    console.error('Error fetching hotel rates:', err)
    return null
  }
}

/**
 * Get entrance fee for an attraction
 */
export async function getEntranceFee(
  attractionName: string,
  isEurPassport: boolean,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    let { data: fees, error } = await supabaseAdmin
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)
    if (normalizer && fees) fees = await normalizer.normalize('entrance_fees', fees) as typeof fees

    if (error || !fees || fees.length === 0) {
      // STRICT fallback: Only match if the full attraction name substantially overlaps
      // with a DB entry. Do NOT split into individual keywords — that causes false matches
      // like "Solar Boat Museum" matching "Egyptian Museum" via the keyword "museum".
      let { data: allFees } = await supabaseAdmin
        .from('entrance_fees')
        .select('*')
        .eq('is_active', true)
      if (normalizer && allFees) allFees = await normalizer.normalize('entrance_fees', allFees) as typeof allFees

      if (allFees && allFees.length > 0) {
        const searchName = attractionName.toLowerCase()
        // Sort by name length DESC to prefer longer (more specific) matches
        const sorted = [...allFees].sort((a, b) => (b.attraction_name?.length || 0) - (a.attraction_name?.length || 0))
        const match = sorted.find(ef => {
          const dbName = (ef.attraction_name || '').toLowerCase()
          // Require substantial overlap — at least 50% of the shorter name
          const overlapRatio = Math.min(dbName.length, searchName.length) / Math.max(dbName.length, searchName.length)
          return overlapRatio > 0.5 && (dbName.includes(searchName) || searchName.includes(dbName))
        })
        if (match) {
          fees = [match]
          console.warn(`⚠️ Entrance fee partial match: "${attractionName}" → "${match.attraction_name}"`)
        }
      }
    }

    if (!fees || fees.length === 0) {
      debugLog(`⚠️ No entrance fee found for "${attractionName}"`)
      return null
    }

    const fee = fees[0]
    const rate = isEurPassport 
      ? (fee.eur_rate || 0) 
      : (fee.non_eur_rate || fee.eur_rate || 0)

    debugLog(`✅ Entrance: ${fee.attraction_name} | €${rate} (${isEurPassport ? 'EUR' : 'non-EUR'})`)

    return {
      id: fee.id,
      name: fee.attraction_name,
      rate
    }
  } catch (err) {
    console.error('Error fetching entrance fee:', err)
    return null
  }
}

type EntranceFeeRow = { id: string; attraction_name: string; eur_rate: number | null; non_eur_rate: number | null }

/**
 * Fetch ALL active entrance fees once, for in-memory matching across a whole
 * itinerary. The per-attraction getEntranceFee() above runs 1–2 queries each
 * (and a full-table scan on every miss); building this cache once and matching
 * with findEntranceFeeInList() collapses that N+1 to a single query.
 */
export async function buildEntranceFeeCache(normalizer?: RateNormalizer): Promise<EntranceFeeRow[]> {
  const { data } = await supabaseAdmin
    .from('entrance_fees')
    // select('*') so this deploys safely before the rate_currency migration.
    .select('*')
    .eq('is_active', true)
  const rows = (data as EntranceFeeRow[]) || []
  return normalizer ? ((await normalizer.normalize('entrance_fees', rows)) ?? rows) : rows
}

/**
 * In-memory equivalent of getEntranceFee()'s matching, applied to the cache:
 *   1. primary — a DB row whose name CONTAINS the attraction (the ilike '%x%'),
 *   2. fallback — substantial (>50%) overlap, preferring longer/more specific names.
 * Kept byte-identical in logic so pricing is unchanged (verified by golden master).
 */
export function findEntranceFeeInList(
  allFees: EntranceFeeRow[],
  attractionName: string,
  isEurPassport: boolean
): { id: string; name: string; rate: number } | null {
  const searchName = attractionName.toLowerCase()

  let match: EntranceFeeRow | null =
    allFees.find(ef => (ef.attraction_name || '').toLowerCase().includes(searchName)) || null

  if (!match) {
    const sorted = [...allFees].sort((a, b) => (b.attraction_name?.length || 0) - (a.attraction_name?.length || 0))
    match = sorted.find(ef => {
      const dbName = (ef.attraction_name || '').toLowerCase()
      const overlapRatio = Math.min(dbName.length, searchName.length) / Math.max(dbName.length, searchName.length)
      return overlapRatio > 0.5 && (dbName.includes(searchName) || searchName.includes(dbName))
    }) || null
  }

  if (!match) return null
  const rate = isEurPassport ? (match.eur_rate || 0) : (match.non_eur_rate || match.eur_rate || 0)
  return { id: match.id, name: match.attraction_name, rate }
}

/**
 * Get guide rate
 */
export async function getGuideRate(
  language: string,
  tier: ServiceTier,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<{ id: string; name: string; dailyRate: number } | null> {
  try {
    // 1. Try guide_rates table first (has per-language/type/duration rates)
    const { data: rawGuideRate } = await supabaseAdmin
      .from('guide_rates')
      .select('*')
      .eq('is_active', true)
      .ilike('guide_language', `%${language}%`)
      .limit(1)
      .single()
    const guideRate = normalizer && rawGuideRate
      ? (await normalizer.normalize('guide_rates', [rawGuideRate]))?.[0]
      : rawGuideRate

    if (guideRate) {
      const dailyRate = guideRate.base_rate_eur || guideRate.rate_eur || 0
      if (dailyRate > 0) {
        debugLog(`✅ Guide (guide_rates): ${language} | €${dailyRate}/day`)
        return {
          id: guideRate.id,
          name: `${language} Speaking Guide`,
          dailyRate
        }
      }
    }

    // 2. Fallback to guides table (legacy supplier-based)
    const { data: guides, error } = await supabaseAdmin
      .from('guides')
      .select('id, name, daily_rate, languages, tier')
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })

    if (!error && guides && guides.length > 0) {
      const selected = guides.find(g => g.tier === tier) || guides[0]
      if ((selected.daily_rate ?? 0) > 0) {
        debugLog(`✅ Guide (guides): ${selected.name} | €${selected.daily_rate}/day`)
        return {
          id: selected.id,
          name: selected.name,
          dailyRate: selected.daily_rate
        }
      }
    }

    // No language-matched DB rate. We do NOT fall back to an any-language guide
    // (fuzzy) or a hardcoded default — flag the hole instead.
    console.warn(`⚠️ No guide rate for ${language} (${tier}) — flagging hole (no fabrication)`)
    return null
  } catch (err) {
    console.error('Error fetching guide rate:', err)
    return null
  }
}

/**
 * Get meal rates for the requested tier.
 *
 * Prior implementation looked up ANY active meal_rates row regardless of tier
 * and multiplied it by a hardcoded TIER_MULTIPLIERS table (0.8 budget /
 * 1.0 standard / 1.3 deluxe / 1.6 luxury), synthesising tier-adjusted rates
 * that no actual supplier rate row backed. Same bug class as the
 * TIER_MULTIPLIERS in rate-lookup-service.ts that PR #14 deleted — the
 * audit's no-fabrication promise covered the rate-card path but missed
 * this one in the canonical core.
 *
 * Now: filter by tier, return the actual stored row, return null if no
 * matching row — the caller flags a hole instead of pricing against a
 * synthesised rate.
 */
export async function getMealRates(
  tier: ServiceTier,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<{ lunch: number; dinner: number } | null> {
  try {
    // The meals rates UI (app/rates/meals) writes rows shaped
    // { meal_type, base_rate_eur, tier } — it never populates the legacy
    // lunch_rate_eur/dinner_rate_eur columns, so reading only those priced
    // UI-managed rows at €0 without flagging a hole. Resolve via
    // meal_type/base_rate_eur (same as the land path in lib/ai/service-creation),
    // falling back to the legacy columns for pre-UI rows.
    let { data: mealRows } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
    if (normalizer && mealRows) mealRows = await normalizer.normalize('meal_rates', mealRows) as typeof mealRows

    if (!mealRows || mealRows.length === 0) {
      return null
    }

    const rateFor = (mealType: string): number => {
      const typed = mealRows.filter(
        (r: any) => r.meal_type?.toLowerCase() === mealType && (r.base_rate_eur || 0) > 0
      )
      if (typed.length > 0) {
        return typed.reduce((sum: number, r: any) => sum + (r.base_rate_eur || 0), 0) / typed.length
      }
      // Legacy rows: per-meal columns on a single row
      const legacyCol = mealType === 'lunch' ? 'lunch_rate_eur' : 'dinner_rate_eur'
      const legacy = mealRows.find((r: any) => (r[legacyCol] || 0) > 0)
      return legacy ? legacy[legacyCol] : 0
    }

    const lunch = rateFor('lunch')
    const dinner = rateFor('dinner')

    // No usable rate on any row → hole (caller flags it) instead of silent €0
    if (!lunch && !dinner) {
      return null
    }

    return { lunch, dinner }
  } catch (err) {
    return null
  }
}

/**
 * Get airport service rate
 */
export async function getAirportServiceRate(
  airportCode: string,
  direction: 'arrival' | 'departure',
  tier: ServiceTier,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<number | null> {
  try {
    let { data: rates } = await supabaseAdmin
      .from('airport_staff_rates')
      .select('*')
      .eq('is_active', true)
      .eq('airport_code', airportCode)
      .or(`direction.eq.${direction},direction.eq.both`)
      .limit(1)
    if (normalizer && rates) rates = await normalizer.normalize('airport_staff_rates', rates) as typeof rates

    if (!rates || rates.length === 0) {
      return null
    }

    return usableRate(rates[0].rate_eur)
  } catch (err) {
    return null
  }
}

/**
 * Get hotel service rate
 */
export async function getHotelServiceRate(
  serviceType: 'checkin_assist' | 'porter' | 'full_service',
  tier: ServiceTier,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<number | null> {
  try {
    const category = getTierCategory(tier)

    const lookup = async (type: string) => {
      let { data } = await supabaseAdmin
        .from('hotel_staff_rates')
        .select('*')
        .eq('is_active', true)
        .eq('service_type', type)
        .or(`hotel_category.eq.${category},hotel_category.eq.all`)
        .limit(1)
      if (normalizer && data) data = await normalizer.normalize('hotel_staff_rates', data) as typeof data
      return data && data.length > 0 ? usableRate(data[0].rate_eur) : null
    }

    const dedicated = await lookup(serviceType)
    if (dedicated != null) return dedicated
    // No dedicated row: a full-service assistant covers the event. See the
    // in-memory resolver in calculateAutoPricing for why.
    if (serviceType !== 'full_service') return lookup('full_service')
    return null
  } catch (err) {
    return null
  }
}

/**
 * Get tipping rate per day (flat total — backward compat for simple callers)
 */
export async function getTippingRate(tier: ServiceTier, normalizer?: RateNormalizer): Promise<number> {
  const { getDailyTippingRate } = await import('@/lib/tipping-utils')
  return getDailyTippingRate(supabaseAdmin, tier, normalizer)
}

/**
 * Get itemized tipping rates for context-aware per-role lookups
 */
async function getItemizedTips(tier: ServiceTier, normalizer?: RateNormalizer) {
  const { getItemizedTippingRates } = await import('@/lib/tipping-utils')
  return getItemizedTippingRates(supabaseAdmin, tier, normalizer)
}

// ============================================
// SMART TRANSPORT RATE LOOKUP
// ============================================

/**
 * Build transport cache from database
 * Key format: "service_type|city|duration|area" (one entry per service, all vehicle rates in one row)
 */
export async function buildTransportCache(normalizer?: RateNormalizer): Promise<Map<string, TransportRate>> {
  let { data: allRates } = await supabaseAdmin
    .from('transportation_rates')
    .select('*')
    .eq('is_active', true)
  if (normalizer && allRates) allRates = await normalizer.normalize('transportation_rates', allRates) as typeof allRates

  const cache = new Map<string, TransportRate>()

  if (!allRates) return cache

  for (const rate of allRates) {
    // Use origin_city as fallback for city (some records use origin_city instead)
    const effectiveCity = rate.city || rate.origin_city || ''

    // Build multiple keys for flexible lookup (no vehicle_type — one row has all tiers)
    const baseKey = [
      rate.service_type || '',
      effectiveCity.toLowerCase(),
      rate.duration || '',
      rate.area || ''
    ].join('|')

    cache.set(baseKey, rate)

    // Also cache without area for fallback
    const keyNoArea = [
      rate.service_type || '',
      effectiveCity.toLowerCase(),
      rate.duration || '',
      ''
    ].join('|')

    if (!cache.has(keyNoArea)) {
      cache.set(keyNoArea, rate)
    }

    // Also cache without duration AND area for maximum fallback
    const keyNoDurationNoArea = [
      rate.service_type || '',
      effectiveCity.toLowerCase(),
      '',
      ''
    ].join('|')

    if (!cache.has(keyNoDurationNoArea)) {
      cache.set(keyNoDurationNoArea, rate)
    }

    // For intercity rows (both 'intercity' and 'intercity_with_sightseeing'),
    // also cache by service_type|origin|destination so a flight/ground city
    // change can find the right row even when the lookup doesn't know city.
    if ((rate.service_type === 'intercity' || rate.service_type === 'intercity_with_sightseeing') &&
        rate.origin_city && rate.destination_city) {
      const intercityKey = [
        rate.service_type,
        (rate.origin_city || '').toLowerCase(),
        (rate.destination_city || '').toLowerCase()
      ].join('|')
      cache.set(intercityKey, rate)
    }

    // Also cache by service_code for direct lookups
    if (rate.service_code) {
      cache.set(`code:${rate.service_code.toLowerCase()}`, rate)
    }
  }

  debugLog(`📦 Built transport cache with ${cache.size} entries from ${allRates.length} DB records`)
  // Log cache keys for debugging
  const keys = Array.from(cache.keys()).filter(k => !k.startsWith('code:')).slice(0, 20)
  debugLog('📦 Sample cache keys:', keys)
  return cache
}

/**
 * Smart transport rate lookup with fallbacks.
 * Finds the service record, then resolves the vehicle tier for the given pax count.
 * Returns a TransportRate with base_rate_eur populated from the matched tier.
 */
export function findTransportRate(
  cache: Map<string, TransportRate>,
  params: {
    serviceType: TransportServiceType
    city: string
    duration: TransportDuration
    area: TransportArea
    pax: number
    vehicleType?: VehicleType  // Optional override for special vehicles
    originCity?: string
    destinationCity?: string
  }
): TransportRate | null {
  const { serviceType, city, duration, area, pax, vehicleType, originCity, destinationCity } = params
  const cityLower = city.toLowerCase()

  let record: TransportRate | undefined

  // Priority 1: Exact match (service_type + city + duration + area)
  const exactKey = [serviceType, cityLower, duration, area || ''].join('|')
  if (cache.has(exactKey)) {
    record = cache.get(exactKey)!
    debugLog(`✅ Transport exact match: ${exactKey}`)
  }

  // Priority 2: Match without area
  if (!record) {
    const noAreaKey = [serviceType, cityLower, duration, ''].join('|')
    if (cache.has(noAreaKey)) {
      record = cache.get(noAreaKey)!
      debugLog(`✅ Transport match (no area): ${noAreaKey}`)
    }
  }

  // Priority 3: Match without duration
  if (!record) {
    const noDurationKey = [serviceType, cityLower, '', ''].join('|')
    if (cache.has(noDurationKey)) {
      record = cache.get(noDurationKey)!
      debugLog(`⚠️ Transport fallback (no duration): ${noDurationKey}`)
    }
  }

  // Priority 4: Intercity lookup by origin→destination. Applies to both
  // 'intercity' and 'intercity_with_sightseeing' (the sightseeing variant
  // is the same route physically — just priced higher).
  if (!record && (serviceType === 'intercity' || serviceType === 'intercity_with_sightseeing') &&
      originCity && destinationCity) {
    const intercityKey = [serviceType, originCity.toLowerCase(), destinationCity.toLowerCase()].join('|')
    if (cache.has(intercityKey)) {
      record = cache.get(intercityKey)!
      debugLog(`✅ Transport intercity match: ${intercityKey}`)
    }
  }

  // Priority 5: Fallback to nearby cities
  if (!record) {
    const fallbackCities = ['luxor', 'aswan', 'cairo', 'alexandria', 'hurghada']
    for (const fallbackCity of fallbackCities) {
      if (fallbackCity === cityLower) continue
      const fallbackKey = [serviceType, fallbackCity, duration, ''].join('|')
      if (cache.has(fallbackKey)) {
        record = cache.get(fallbackKey)!
        debugLog(`⚠️ Transport fallback city: ${fallbackCity} for ${city}`)
        break
      }
    }
  }

  if (!record) {
    debugLog(`❌ No transport rate found for: ${serviceType} | ${city} | ${duration} | ${area} | pax=${pax}`)
    return null
  }

  // Resolve the right vehicle tier for the pax count
  const tierResult = getTransportRateForPax(record, pax)

  if (tierResult) {
    // Return a copy with base_rate_eur/non_eur set to the matched tier's rate
    return {
      ...record,
      base_rate_eur: tierResult.rateEur,
      base_rate_non_eur: tierResult.rateNonEur,
      vehicle_type: vehicleType || tierResult.vehicleType,
      capacity_min: tierResult.capacityMin,
      capacity_max: tierResult.capacityMax
    }
  }

  // Fallback: return record as-is (uses old base_rate_eur if still populated)
  return record
}

// ============================================
// CRUISE TRANSPORT PRICING (via b2b_transport_packages — the shared source of truth)
// ============================================

/**
 * Fetch cruise transport packages from b2b_transport_packages (the shared
 * source of truth — see CruiseTransportPackage). Mirrors the read used by
 * app/api/b2b/calculate-price and the pricing-grid paths.
 *
 * NAME IS HISTORICAL: kept as fetchCruiseTransportPricingRules (4 call sites
 * across generate-itinerary / service-creation / cruise-service-creation /
 * the rate-resolution barrel import it) — it now reads b2b_transport_packages,
 * NOT b2b_pricing_rules. The old b2b_pricing_rules.cruise_transport read was
 * removed (table permanently empty, uncreatable from the UI).
 */
export async function fetchCruiseTransportPricingRules(normalizer?: RateNormalizer): Promise<CruiseTransportPackage[]> {
  const { data: rawData, error } = await supabaseAdmin
    .from('b2b_transport_packages')
    .select('*')
    .eq('is_active', true)
  const data = normalizer && rawData ? await normalizer.normalize('b2b_transport_packages', rawData) as typeof rawData : rawData

  if (error) {
    console.error('Error fetching cruise transport packages:', error)
    return []
  }

  debugLog(`📦 Fetched ${data?.length || 0} cruise transport packages`)
  return data || []
}

/**
 * Find the matching cruise transport package by duration. Matches against the
 * `duration_days` int column (b2b_transport_packages), not a name-parse.
 * Name kept as findCruiseTransportRule for call-site compatibility.
 */
export function findCruiseTransportRule(
  packages: CruiseTransportPackage[],
  durationDays: number
): CruiseTransportPackage | null {
  if (packages.length === 0) {
    debugLog(`❌ No cruise transport package found for ${durationDays}D`)
    return null
  }

  // Exact duration match
  const exactMatch = packages.find(p => p.duration_days === durationDays)
  if (exactMatch) {
    debugLog(`✅ Found cruise transport package: ${exactMatch.package_name} (${durationDays}D)`)
    return exactMatch
  }

  // Closest by duration_days (packages with a duration set)
  const withDuration = packages.filter(p => (p.duration_days ?? 0) > 0)
  if (withDuration.length > 0) {
    const sorted = [...withDuration].sort((a, b) =>
      Math.abs((a.duration_days ?? 0) - durationDays) - Math.abs((b.duration_days ?? 0) - durationDays)
    )
    debugLog(`⚠️ Using closest cruise transport package: ${sorted[0].package_name} (${sorted[0].duration_days}D) for ${durationDays}D`)
    return sorted[0]
  }

  // No duration on any package — use the first.
  debugLog(`⚠️ Using first available cruise transport package: ${packages[0].package_name}`)
  return packages[0]
}

/**
 * Select the vehicle + rate from a cruise transport package by group size:
 * smallest vehicle whose capacity fits numPax. Byte-for-byte the same selection
 * as app/api/b2b/calculate-price's selectVehicleFromPackage — so the two paths
 * produce the same cruise-transport cost for the same itinerary/pax.
 */
export function getCruiseTransportRate(
  pkg: CruiseTransportPackage,
  numPax: number
): { vehicleType: VehicleType; rate: number } {
  if (pkg.sedan_capacity != null && numPax <= pkg.sedan_capacity && pkg.sedan_rate) {
    return { vehicleType: 'Sedan', rate: pkg.sedan_rate }
  }
  if (pkg.minivan_capacity != null && numPax <= pkg.minivan_capacity && pkg.minivan_rate) {
    return { vehicleType: 'Minivan', rate: pkg.minivan_rate }
  }
  if (pkg.van_capacity != null && numPax <= pkg.van_capacity && pkg.van_rate) {
    return { vehicleType: 'Van', rate: pkg.van_rate }
  }
  if (pkg.minibus_capacity != null && numPax <= pkg.minibus_capacity && pkg.minibus_rate) {
    return { vehicleType: 'Minibus', rate: pkg.minibus_rate }
  }
  // Overflow: largest PRICED vehicle. A package's blank vehicles are ones the
  // operator does not run — fall through them rather than pricing at 0.
  return {
    vehicleType: 'Bus',
    rate: pkg.bus_rate ?? pkg.minibus_rate ?? pkg.van_rate ?? pkg.minivan_rate ?? pkg.sedan_rate ?? 0,
  }
}

/**
 * Calculate cruise transport info for an itinerary
 * Returns null if no cruise days found
 */
export function calculateCruisePackageInfo(
  itinerary: ItineraryDay[],
  packages: CruiseTransportPackage[],
  numPax: number
): CruisePackageInfo | null {
  // Count cruise days (days marked with is_cruise_day)
  const cruiseDays = itinerary.filter(day => day.is_cruise_day === true)

  if (cruiseDays.length === 0) {
    return null
  }

  debugLog(`🚢 Found ${cruiseDays.length} cruise days in itinerary`)

  // Find the matching cruise transport package (by duration_days)
  const pkg = findCruiseTransportRule(packages, cruiseDays.length)

  if (!pkg) {
    return {
      packageFound: false,
      packageName: 'No cruise transport package found',
      durationDays: cruiseDays.length,
      packageRate: 0,
      vehicleType: 'Minivan',
      includes: null
    }
  }

  const { vehicleType, rate } = getCruiseTransportRate(pkg, numPax)

  return {
    packageFound: true,
    packageName: pkg.package_name,
    durationDays: cruiseDays.length,
    packageRate: rate,
    vehicleType,
    includes: pkg.includes ?? pkg.notes
  }
}

// ============================================
// MAIN PRICING CALCULATION
// ============================================

/**
 * Calculate B2B pricing for a tour template
 * Returns pricing for all pax counts (1-40) with +0 and +1 options
 */
export async function calculateDayBasedPricing(
  params: DayPricingParams
): Promise<DayPricingResult> {
  const {
    templateId,
    tier,
    isEurPassport,
    language = 'English',
    marginPercent = 25
  } = params

  debugLog('🚀 Starting day-based pricing calculation (v4):', { templateId, tier, isEurPassport })

  const warnings: string[] = []
  const services: PricedService[] = []
  // Holes = rate gaps that make the price non-deliverable. Never auto-filled.
  const holes: PricingHole[] = []
  const addHole = (h: Omit<PricingHole, 'tier'>) => holes.push({ ...h, tier })

  // ============================================
  // STEP 1: Fetch template and parse itinerary
  // ============================================

  const { data: template, error: templateError } = await supabaseAdmin
    .from('tour_templates')
    .select(`
      id,
      template_name,
      template_code,
      duration_days,
      tour_type,
      category_id,
      itinerary,
      tour_categories (
        id,
        category_name
      )
    `)
    .eq('id', templateId)
    .single()

  if (templateError || !template) {
    console.error('❌ Template not found:', templateId)
    return {
      success: false,
      templateId,
      templateName: 'Unknown',
      tier,
      totalDays: 0,
      hotelNights: 0,
      cruiseNights: 0,
      singleSupplement: 0,
      services: [],
      paxPricing: [],
      currency: params.rateCurrency ?? DEFAULT_RATE_CURRENCY,
      marginPercent,
      warnings: ['Template not found'],
      complete: false,
      holes: []
    }
  }

  debugLog('📋 Template found:', template.template_name)

  // The template's own tour_type is a package signal the engine always
  // SELECTed and never read: a 'day_tour' (or half_day / stopover) is by
  // definition a day trip — no accommodation, no airport transfers sold —
  // yet it priced full-package shaped. An explicit packageType from the
  // caller still wins; multi_day templates keep the historical full-package
  // assumption until templates carry a real package column.
  const SINGLE_DAY_TOUR_TYPES = ['day_tour', 'half_day', 'stopover']
  const effectivePackageType =
    params.packageType ??
    (SINGLE_DAY_TOUR_TYPES.includes((template as { tour_type?: string }).tour_type ?? '')
      ? 'day-trips'
      : undefined)

  const itinerary = parseItinerary(template.itinerary, { packageType: effectivePackageType })
  const totalDays = itinerary.length || template.duration_days || 1

  if (itinerary.length === 0) {
    warnings.push('No itinerary data found - using defaults')
  }

  debugLog(`📅 Parsed ${itinerary.length} days from itinerary`)

  // A template's days are relative, so day N of a departure is travelDate + N-1.
  // Hotel and cruise rates are dated, and a tour that crosses a season boundary
  // must price each night in its own period rather than the whole stay at the
  // first night's rate. Without a travel date there is nothing to resolve
  // against and every night falls back to the row's base rate.
  const dateForDay = (dayNumber?: number | null): string | null => {
    if (!params.travelDate) return null
    const start = new Date(`${params.travelDate.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(start.getTime())) return null
    start.setUTCDate(start.getUTCDate() + Math.max(0, (dayNumber ?? 1) - 1))
    return start.toISOString().slice(0, 10)
  }

  // ============================================
  // STEP 2: Analyze accommodation types
  // ============================================

  const hotelDays = itinerary.filter(d => d.accommodation_type === 'hotel')
  const cruiseDays = itinerary.filter(d => d.accommodation_type === 'cruise')
  const hotelNights = hotelDays.length
  const cruiseNights = cruiseDays.length

  debugLog(`🏨 Hotel nights: ${hotelNights} | 🚢 Cruise nights: ${cruiseNights}`)

  // ============================================
  // STEP 3: Build transport cache & fetch cruise pricing rules
  // ============================================

  // Count cruise package days (days marked as is_cruise_day for bundled transport)
  const cruisePackageDays = itinerary.filter(d => d.is_cruise_day === true)
  const hasCruisePackage = cruisePackageDays.length > 0

  if (hasCruisePackage) {
    debugLog(`🚢 Found ${cruisePackageDays.length} cruise package days - will use bundled transport pricing`)
  }

  // ============================================
  // STEP 4: Fetch all required rates
  // ============================================
  // All of these lookups are mutually independent, so they run in one
  // parallel batch instead of sequential awaits (I/O scheduling only —
  // results and downstream logic are identical).

  const firstCruiseDay = cruiseDays[0]
  const hotelCities = [...new Set(hotelDays.map(d => d.overnight_city || d.city))]

  // Rows entered in another currency (rate_currency, per-rate currency work)
  // are converted into this run's currency at the fetch boundary, so every
  // number downstream is in ONE currency exactly as before. With no such rows
  // this is a no-op that makes no FX call.
  const rateNormalizer = createRateNormalizer(params.rateCurrency ?? DEFAULT_RATE_CURRENCY)

  const [
    transportCache,
    cruiseTransportPricingRules,
    cruiseRates,
    hotelRatesList,
    guideRate,
    mealRates,
    tippingRates,
    fixedDailyCosts,
    entranceFeeCache,
    airportStaffRows,
    hotelStaffRows,
  ] = await Promise.all([
    buildTransportCache(rateNormalizer),
    // Fetch cruise transport packages from b2b_transport_packages
    fetchCruiseTransportPricingRules(rateNormalizer),
    // Cruise rates only apply when the itinerary has cruise nights
    cruiseNights > 0
      ? getCruiseRates(tier, firstCruiseDay?.city, isEurPassport, dateForDay(firstCruiseDay?.day), rateNormalizer)
      : Promise.resolve(null as Awaited<ReturnType<typeof getCruiseRates>>),
    Promise.all(hotelCities.map(city => getHotelRates(city, tier, isEurPassport, params.travelDate, rateNormalizer))),
    getGuideRate(language, tier, rateNormalizer),
    getMealRates(tier, rateNormalizer),
    getItemizedTips(tier, rateNormalizer),
    // Water cost from DB (fixed_daily_costs table) instead of hardcoding
    import('@/lib/fixed-costs').then(m => m.getFixedDailyCosts(rateNormalizer)),
    // Entrance fees fetched ONCE here, matched in memory later (Step 7)
    buildEntranceFeeCache(rateNormalizer),
    // Tiny tables prefetched whole so the day loop below resolves
    // airport/hotel staff rates in memory instead of one query per day
    supabaseAdmin
      .from('airport_staff_rates')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => rateNormalizer.normalize('airport_staff_rates', data || []))
      .then(rows => rows || []),
    supabaseAdmin
      .from('hotel_staff_rates')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => rateNormalizer.normalize('hotel_staff_rates', data || []))
      .then(rows => rows || []),
  ])

  // A rate whose currency could not be backed by an FX rate was neutralised
  // into the ordinary missing-rate machinery above; say why here so the
  // operator sees "no FX rate", not just "no rate".
  for (const miss of rateNormalizer.misses) {
    warnings.push(`Rate ${miss.id ?? ''} in ${miss.table} is entered in ${miss.currency} and no exchange rate was available — treated as missing`)
  }

  if (cruiseNights > 0 && !cruiseRates) {
    addHole({
      kind: 'cruise',
      reason: 'missing',
      city: firstCruiseDay?.city,
      lookupAttempted: `nile_cruises tier=${tier} embark~${firstCruiseDay?.city ?? 'any'}`,
      message: `No ${tier} cruise rate found. Add it in Rates → Cruises.`,
    })
  }

  const hotelRatesMap = new Map<string, Awaited<ReturnType<typeof getHotelRates>>>()
  hotelCities.forEach((city, idx) => {
    const rates = hotelRatesList[idx]
    if (rates) {
      hotelRatesMap.set(city, rates)
    }
  })

  // In-memory resolvers that replicate getAirportServiceRate/getHotelServiceRate
  // EXACTLY (same filters incl. direction/category "both"/"all" fallbacks, same
  // first-matching-row-in-fetch-order semantics, same rate>0-else-null result).
  // The exported helpers remain for other callers.
  // `rowExists` separates "nobody has entered this service" from "the row is
  // there with a blank or zero price". Both block a definite price, but only
  // the first is fixed by ADDING a rate — see PricingHole.reason.
  const resolveAirportServiceRate = (
    airportCode: string,
    direction: 'arrival' | 'departure'
  ): { rate: number | null; rowExists: boolean } => {
    const row = airportStaffRows.find(
      (r: any) =>
        r.airport_code === airportCode &&
        (r.direction === direction || r.direction === 'both')
    )
    if (!row) return { rate: null, rowExists: false }
    return { rate: usableRate(row.rate_eur), rowExists: true }
  }
  // Hotel assistance is modelled in the rate table as ONE full-service row
  // per category (an assistant who handles both ends of the stay), but the
  // day loop asks for the per-event types — checkin_assist on the first
  // night, porter on the last. Until 2026-08-21 nothing bridged the two, so
  // hotel assistance never priced: every check-in/out day was a hole, and the
  // full-service rows were never read. A full-service row now covers either
  // event when no dedicated row exists. Charged per event, matching how the
  // dedicated rows were always charged.
  const resolveHotelServiceRate = (
    serviceType: 'checkin_assist' | 'porter' | 'full_service'
  ): { rate: number | null; rowExists: boolean; via: 'dedicated' | 'full_service' } => {
    const category = getTierCategory(tier)
    const matches = (type: string) =>
      hotelStaffRows.find(
        (r: any) =>
          r.service_type === type &&
          (r.hotel_category === category || r.hotel_category === 'all')
      )
    const dedicated = matches(serviceType)
    if (dedicated) return { rate: usableRate(dedicated.rate_eur), rowExists: true, via: 'dedicated' }
    if (serviceType !== 'full_service') {
      const full = matches('full_service')
      if (full) return { rate: usableRate(full.rate_eur), rowExists: true, via: 'full_service' }
    }
    return { rate: null, rowExists: false, via: 'dedicated' }
  }

  // Flag missing rates that the itinerary actually needs (no fabrication).
  const needsGuide = itinerary.some(d => d.services.guide_required || d.attractions.length > 0)
  if (needsGuide && !guideRate) {
    addHole({
      kind: 'guide',
      reason: 'missing',
      lookupAttempted: `guide_rates language~${language} tier=${tier}`,
      message: `No ${language} guide rate (${tier}). Add it in Rates → Guides.`,
    })
  }
  const needsMeals = itinerary.some(d => d.meals.lunch === 'external' || d.meals.dinner === 'external')
  if (needsMeals && !mealRates) {
    addHole({
      kind: 'meal',
      reason: 'missing',
      lookupAttempted: 'meal_rates is_active=true',
      message: 'No meal rates found. Add them in Rates → Meals.',
    })
  }

  // Water cost comes from fixedDailyCosts (fetched in the Step 4 batch above)
  const waterCostPerPax = fixedDailyCosts.waterPerPersonPerDay

  // ============================================
  // STEP 5: Calculate Single Supplement (whole tour)
  // ============================================

  let singleSupplement = 0

  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.overnight_city || day.city)
    if (hotelRate) {
      // Each night at its own period's supplement — a stay crossing into peak
      // pays the peak supplement for the nights that land there.
      singleSupplement += resolveHotelRatesForDate(
        hotelRate.row, isEurPassport, dateForDay(day.day)
      ).singleSuppNight
    }
    // Missing hotel rate is flagged once, in the accommodation loop below (no fabrication here).
  }

  if (cruiseRates && cruiseNights > 0) {
    for (const day of cruiseDays) {
      singleSupplement += resolveCruiseRatesForDate(
        cruiseRates.row, isEurPassport, dateForDay(day.day)
      ).singleSuppNight
    }
  }

  debugLog(`💰 Total Single Supplement: €${singleSupplement.toFixed(2)}`)

  // ============================================
  // STEP 6: Calculate FIXED costs (don't scale with pax)
  // ============================================

  let fixedCosts = 0

  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const previousDay = i > 0 ? itinerary[i - 1] : null
    const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null
    const hasSightseeing = day.services.guide_required || day.attractions.length > 0

    // ----- GUIDE (fixed per day) -----
    if (hasSightseeing && guideRate) {
      fixedCosts += guideRate.dailyRate
      services.push({
        id: `day${day.day}-guide`,
        dayNumber: day.day,
        serviceType: 'guide',
        serviceName: `${language} Speaking Guide`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: guideRate.dailyRate,
        lineTotal: guideRate.dailyRate,
        rateSource: 'guides',
        isPerPax: false,
        isOptional: false
      })
    }

    // ----- TIPPING (context-aware per-role) -----
    const { determineTipRolesForDay, formatTipServiceName } = await import('@/lib/tipping-utils')
    const hasAirportToday = day.services.airport_arrival || day.services.airport_departure
    const airportCount = (day.services.airport_arrival ? 1 : 0) + (day.services.airport_departure ? 1 : 0)
    const hasHotelNight = day.accommodation_type === 'hotel'
    const isTransferOnlyDay = !hasSightseeing && hasAirportToday
    const dayTipRoles = determineTipRolesForDay({
      hasGuide: hasSightseeing,
      hasDriver: !day.is_cruise_day,
      hasAirportService: hasAirportToday,
      airportServiceCount: airportCount,
      hasHotelNight,
      isCruiseDay: day.is_cruise_day || false,
      isTransferOnly: isTransferOnlyDay,
      isFreeDay: false,
    })
    for (const tipRole of dayTipRoles) {
      // Tips vary by place: the city picks the rate, falling back to the
      // country-wide row when this city has none of its own.
      const tipRate = tippingRates.getRate(tipRole.role, tipRole.context, day.city)
      if (tipRate > 0) {
        const totalTipCost = tipRate * tipRole.quantity
        fixedCosts += totalTipCost
        services.push({
          id: `day${day.day}-tips-${tipRole.role}`,
          dayNumber: day.day,
          serviceType: 'tips',
          serviceName: formatTipServiceName(tipRole.role, tipRole.context),
          quantity: tipRole.quantity,
          quantityMode: 'fixed',
          unitCost: tipRate,
          lineTotal: totalTipCost,
          rateSource: 'tipping_rates',
          isPerPax: false,
          isOptional: false
        })
      }
    }

    // ----- AIRPORT SERVICES (fixed per service) -----
    if (day.services.airport_arrival) {
      const airportCode = getAirportCode(day.city)
      const found = resolveAirportServiceRate(airportCode, 'arrival')
      const rate = found.rate
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-airport-arrival`,
          dayNumber: day.day,
          serviceType: 'airport_service',
          serviceName: `Airport Meet & Greet (${airportCode})`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'airport_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'airport_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `airport_staff_rates ${airportCode}/arrival`,
          message: found.rowExists
            ? `The airport service rate for ${airportCode} (arrival) has no price. Open it in Rates → Airport Services and set one.`
            : `No airport service rate for ${airportCode} (arrival). Add it in Rates → Airport Services.`,
        })
      }
    }

    if (day.services.airport_departure) {
      const airportCode = getAirportCode(day.city)
      const found = resolveAirportServiceRate(airportCode, 'departure')
      const rate = found.rate
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-airport-departure`,
          dayNumber: day.day,
          serviceType: 'airport_service',
          serviceName: `Airport Departure Assist (${airportCode})`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'airport_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'airport_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `airport_staff_rates ${airportCode}/departure`,
          message: found.rowExists
            ? `The airport service rate for ${airportCode} (departure) has no price. Open it in Rates → Airport Services and set one.`
            : `No airport service rate for ${airportCode} (departure). Add it in Rates → Airport Services.`,
        })
      }
    }

    // ----- HOTEL SERVICES (fixed per service) -----
    if (day.services.hotel_checkin) {
      const found = resolveHotelServiceRate('checkin_assist')
      const rate = found.rate
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-hotel-checkin`,
          dayNumber: day.day,
          serviceType: 'hotel_service',
          serviceName: found.via === 'full_service' ? 'Hotel Assistance — check-in (full service)' : 'Hotel Check-in Assistance',
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'hotel_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'hotel_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `hotel_staff_rates checkin_assist tier=${tier}`,
          message: found.rowExists
            ? `The hotel check-in service rate (${tier}) has no price. Open it in Rates → Hotel Services and set one.`
            : `No hotel check-in service rate (${tier}). Add it in Rates → Hotel Services.`,
        })
      }
    }

    if (day.services.hotel_checkout) {
      const found = resolveHotelServiceRate('porter')
      const rate = found.rate
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-hotel-checkout`,
          dayNumber: day.day,
          serviceType: 'hotel_service',
          serviceName: found.via === 'full_service' ? 'Hotel Assistance — check-out (full service)' : 'Hotel Check-out & Porter',
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'hotel_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'hotel_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `hotel_staff_rates porter tier=${tier}`,
          message: found.rowExists
            ? `The hotel check-out/porter service rate (${tier}) has no price. Open it in Rates → Hotel Services and set one.`
            : `No hotel check-out/porter service rate (${tier}). Add it in Rates → Hotel Services.`,
        })
      }
    }
  }

  // ============================================
  // STEP 7: Calculate PER-PAX costs (base rates)
  // ============================================

  let accommodationPPD = 0

  // Hotel PPD — use overnight_city for day trips (e.g., Alexandria day trip sleeps in Cairo)
  for (const day of hotelDays) {
    const hotelCity = day.overnight_city || day.city
    const hotelRate = hotelRatesMap.get(hotelCity)
    if (hotelRate) {
      // This night's own period, not the stay's first night — see dateForDay.
      const nightly = resolveHotelRatesForDate(
        hotelRate.row, isEurPassport, dateForDay(day.day)
      )
      accommodationPPD += nightly.ppdNight
      services.push({
        id: `day${day.day}-hotel`,
        dayNumber: day.day,
        serviceType: 'accommodation',
        serviceName: `Hotel - ${hotelRate.hotelName} (${hotelCity})`,
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: nightly.ppdNight,
        lineTotal: nightly.ppdNight,
        rateSource: 'accommodation_rates',
        isPerPax: true,
        isOptional: false,
        notes: nightly.seasonName
          ? `PPD (Per Person Double) — ${nightly.seasonName}`
          : 'PPD (Per Person Double)'
      })
    } else {
      addHole({
        kind: 'hotel',
        reason: 'missing',
        dayNumber: day.day,
        city: hotelCity,
        lookupAttempted: `accommodation_rates city~${hotelCity} tier=${tier}`,
        message: `No ${tier} hotel rate for "${hotelCity}". Add it in Rates → Hotels.`,
      })
    }
  }

  // Cruise PPD — each night at its own period's rate, so a sailing that crosses
  // into peak is not billed at the rate of the night it embarked.
  if (cruiseRates && cruiseNights > 0) {
    const nightly = cruiseDays.map(day =>
      resolveCruiseRatesForDate(cruiseRates.row, isEurPassport, dateForDay(day.day))
    )
    const cruiseTotal = nightly.reduce((sum, n) => sum + n.ppdNight, 0)
    const periodsUsed = [...new Set(nightly.map(n => n.seasonName).filter(Boolean))]
    // One line for the sailing, so unitCost is the per-night average whenever
    // the nights did not all price the same.
    const perNight = cruiseNights > 0 ? cruiseTotal / cruiseNights : 0

    accommodationPPD += cruiseTotal
    services.push({
      id: `cruise-accommodation`,
      dayNumber: cruiseDays[0]?.day || 1,
      serviceType: 'cruise',
      serviceName: `Nile Cruise - ${cruiseRates.shipName} (${cruiseNights} nights)`,
      quantity: cruiseNights,
      quantityMode: 'per_pax',
      unitCost: perNight,
      lineTotal: cruiseTotal,
      rateSource: 'nile_cruises',
      isPerPax: true,
      isOptional: false,
      // No currency symbol: rates are kept in the org's rate_currency (USD
      // since 2026-08-22), and the result carries that currency on itself.
      // The '€' this line used to print was a euro assumption on a note the
      // operator reads. lib/auto-pricing-service.ts is outside the scan list
      // of the no-hardcoded-rate-currency guard, so nothing caught it.
      notes: periodsUsed.length > 1
        ? `PPD ${perNight.toFixed(2)}/night avg × ${cruiseNights} nights (${periodsUsed.join(', ')})`
        : `PPD ${perNight.toFixed(2)}/night × ${cruiseNights} nights`
    })
  }

  // ----- Entrance Fees (per pax) -----
  let entranceFeesPerPax = 0
  const processedAttractions = new Set<string>()

  // entranceFeeCache was fetched ONCE in the Step 4 parallel batch above;
  // attractions are matched in memory here — was a per-attraction query
  // (+ full-table scan on each miss) inside the loop below.

  for (const day of itinerary) {
    for (const attraction of day.attractions) {
      if (processedAttractions.has(attraction.toLowerCase())) continue
      processedAttractions.add(attraction.toLowerCase())

      const fee = findEntranceFeeInList(entranceFeeCache, attraction, isEurPassport)
      if (fee && fee.rate > 0) {
        entranceFeesPerPax += fee.rate
        services.push({
          id: `entrance-${fee.id}`,
          dayNumber: day.day,
          serviceType: 'entrance',
          serviceName: fee.name,
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: fee.rate,
          lineTotal: fee.rate,
          rateSource: 'entrance_fees',
          isPerPax: true,
          isOptional: false,
          notes: isEurPassport ? 'EUR rate' : 'non-EUR rate'
        })
      } else {
        warnings.push(`No entrance fee found for "${attraction}"`)
      }
    }
  }

  // ----- External Meals (per pax) -----
  let externalMealsPerPax = 0

  for (const day of itinerary) {
    if (day.meals.lunch === 'external' && mealRates) {
      externalMealsPerPax += mealRates.lunch
      services.push({
        id: `day${day.day}-lunch`,
        dayNumber: day.day,
        serviceType: 'meal',
        serviceName: 'Lunch',
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: mealRates.lunch,
        lineTotal: mealRates.lunch,
        rateSource: 'meal_rates',
        isPerPax: true,
        isOptional: false
      })
    }

    if (day.meals.dinner === 'external' && mealRates) {
      externalMealsPerPax += mealRates.dinner
      services.push({
        id: `day${day.day}-dinner`,
        dayNumber: day.day,
        serviceType: 'meal',
        serviceName: 'Dinner',
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: mealRates.dinner,
        lineTotal: mealRates.dinner,
        rateSource: 'meal_rates',
        isPerPax: true,
        isOptional: false
      })
    }
  }

  // ----- Water (per pax per sightseeing day) — distributed per day -----
  const sightseeingDaysList = itinerary.filter(d => d.services.guide_required || d.attractions.length > 0)
  const sightseeingDays = sightseeingDaysList.length
  const waterPerPax = waterCostPerPax * sightseeingDays

  for (const sDay of sightseeingDaysList) {
    services.push({
      id: `water-day-${sDay.day}`,
      dayNumber: sDay.day,
      serviceType: 'water',
      serviceName: 'Bottled Water',
      quantity: 1,
      quantityMode: 'per_pax',
      unitCost: waterCostPerPax,
      lineTotal: waterCostPerPax,
      rateSource: 'fixed',
      isPerPax: true,
      isOptional: false,
      notes: `Bottled water for sightseeing`
    })
  }

  const perPaxCosts = accommodationPPD + entranceFeesPerPax + externalMealsPerPax + waterPerPax

  debugLog(`📊 Fixed costs: €${fixedCosts.toFixed(2)} | Per-pax costs: €${perPaxCosts.toFixed(2)}`)

  // ============================================
  // STEP 8: Analyze transport needs per day
  // ============================================

  // One entry per transport line item — a day may produce zero, one, or many
  // entries (e.g. a flight day in B3 will produce TWO airport_transfer entries).
  // legIndex disambiguates multiple entries on the same calendar day.
  interface DayTransportInfo {
    day: number
    legIndex: number
    city: string
    needs: TransportNeed
    requiresTransport: boolean
    isCruisePackageDay: boolean // Part of cruise transport package
  }

  const transportInfoByDay: DayTransportInfo[] = []

  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const previousDay = i > 0 ? itinerary[i - 1] : null
    const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null

    // B3: cruise-day handling now lives inside determineTransportNeeds —
    // it returns ONLY the extras and the arrival-side flight leg (when
    // applicable). So every line returned from the function should be
    // priced normally; the cruise transport package itself is added
    // separately below as a single line item per trip.
    const isCruisePackageDay = day.is_cruise_day === true
    const needsList = determineTransportNeeds(day, previousDay, nextDay)

    if (needsList.length === 0) {
      const label = isCruisePackageDay
        ? `🚢 Day ${day.day} (${day.city}): Cruise package day - bundled transport (no extras)`
        : `⏸️ Day ${day.day} (${day.city}): No transport required`
      debugLog(label)
      continue
    }

    needsList.forEach((needs, legIndex) => {
      // Per-leg city override: an entry can pin its own city (e.g. the
      // departure-side leg of a mid-trip flight day uses previousDay.city).
      const legCity = needs.city || day.city
      transportInfoByDay.push({
        day: day.day,
        legIndex,
        city: legCity,
        needs,
        requiresTransport: true,
        isCruisePackageDay,
      })
      const suffix = needsList.length > 1 ? ` leg ${legIndex + 1}/${needsList.length}` : ''
      const cruiseTag = isCruisePackageDay ? ' [cruise day]' : ''
      debugLog(`🚗 Day ${day.day} (${legCity})${suffix}${cruiseTag}: ${needs.serviceType} | ${needs.duration} | area: ${needs.area || 'none'} | special: ${needs.useSpecialVehicle ? needs.specialVehicleType : 'no'}`)
    })
  }

  // ============================================
  // STEP 9: Add transport services (for 2 pax baseline)
  // ============================================

  const baseVehicleType = getVehicleTypeByPax(2)
  let baseTransportCost = 0

  for (const info of transportInfoByDay) {
    if (!info.requiresTransport) continue

    const { needs } = info
    
    // Find transport rate (resolves vehicle tier for 2 pax base)
    const rate = findTransportRate(transportCache, {
      serviceType: needs.serviceType,
      city: info.city,
      duration: needs.duration,
      area: needs.area,
      pax: 2,
      vehicleType: needs.useSpecialVehicle ? needs.specialVehicleType : undefined,
      // Prefer per-leg overrides set by determineTransportNeeds (used for the
      // departure-side flight leg and for intercity origin→destination), then
      // fall back to the previous-day-by-index heuristic for legacy callers.
      originCity: info.needs.originCity || itinerary[info.day - 2]?.city,
      destinationCity: info.needs.destinationCity || info.city
    })

    // Disambiguate ID when a day has more than one transport leg (B3 flight days).
    // Single-leg days keep the original `day${N}-transport` shape to avoid
    // churn in callers that may key on the existing id format.
    const idSuffix = info.legIndex > 0 ? `-${info.legIndex + 1}` : ''
    if (rate) {
      baseTransportCost += rate.base_rate_eur
      services.push({
        id: `day${info.day}-transport${idSuffix}`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: rate.route_name || `${rate.vehicle_type || baseVehicleType} - ${info.city}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate.base_rate_eur,
        lineTotal: rate.base_rate_eur,
        rateSource: 'transportation_rates',
        isPerPax: false,
        isOptional: false,
        notes: `${needs.serviceType} | ${needs.duration}${needs.area ? ` | ${needs.area}` : ''}`
      })
    } else {
      addHole({
        kind: 'transport',
        reason: 'missing',
        dayNumber: info.day,
        city: info.city,
        lookupAttempted: `transportation_rates ${needs.serviceType}/${needs.duration}@${info.city}`,
        message: `No transport rate in ${info.city} (${needs.serviceType}/${needs.duration}). Add it in Rates → Transportation.`,
      })
      warnings.push(`No transport rate in ${info.city} (${needs.serviceType}/${needs.duration})`)
    }
  }

  // Add cruise transport package if applicable (for 2 pax baseline)
  let baseCruisePackageCost = 0
  if (hasCruisePackage) {
    const cruisePackageInfo = calculateCruisePackageInfo(itinerary, cruiseTransportPricingRules, 2)
    if (cruisePackageInfo?.packageFound) {
      baseCruisePackageCost = cruisePackageInfo.packageRate
      services.push({
        id: 'cruise-transport-package',
        dayNumber: cruisePackageDays[0]?.day || 1,
        serviceType: 'transportation',
        serviceName: `🚢 ${cruisePackageInfo.packageName}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: cruisePackageInfo.packageRate,
        lineTotal: cruisePackageInfo.packageRate,
        rateSource: 'b2b_transport_packages',
        isPerPax: false,
        isOptional: false,
        notes: `${cruisePackageInfo.durationDays}D cruise transport package (${cruisePackageInfo.vehicleType}) - includes: ${cruisePackageInfo.includes || 'car, carriage, felucca, motorboat'}`
      })
      debugLog(`🚢 Cruise package cost (2 pax): €${baseCruisePackageCost.toFixed(2)} (${cruisePackageInfo.packageName})`)
    } else {
      addHole({
        kind: 'transport',
        reason: 'missing',
        lookupAttempted: `b2b_transport_packages cruise (${cruisePackageDays.length}D)`,
        message: `No cruise transport package for a ${cruisePackageDays.length}D cruise. Add it in Rates → Transport Packages.`,
      })
      warnings.push(`No cruise transport package found for ${cruisePackageDays.length}D cruise`)
    }
  }

  debugLog(`🚗 Base transport cost (2 pax): €${baseTransportCost.toFixed(2)}${hasCruisePackage ? ` + €${baseCruisePackageCost.toFixed(2)} cruise package` : ''}`)

  // ============================================
  // STEP 10: Calculate for each pax count
  // ============================================

  // Whole-trip transport cost at a given pax count — regular transport (vehicle
  // re-selected by group size via findTransportRate) + cruise package. Missing
  // rates were already flagged as holes in the base loop above; they add nothing
  // here. This is the one non-linear term; the leader variant calls it at pax+1.
  const transportAtPax = (pax: number): number => {
    let total = 0
    for (const info of transportInfoByDay) {
      if (!info.requiresTransport) continue
      const { needs } = info
      const rate = findTransportRate(transportCache, {
        serviceType: needs.serviceType,
        city: info.city,
        duration: needs.duration,
        area: needs.area,
        pax,
        vehicleType: needs.useSpecialVehicle ? needs.specialVehicleType : undefined,
        originCity: info.needs.originCity || itinerary[info.day - 2]?.city,
        destinationCity: info.needs.destinationCity || info.city,
      })
      if (rate) total += rate.base_rate_eur
    }
    if (hasCruisePackage) {
      const cp = calculateCruisePackageInfo(itinerary, cruiseTransportPricingRules, pax)
      if (cp?.packageFound) total += cp.packageRate
    }
    return total
  }

  // Multi-pax rate sheet now comes from the ONE shared core primitive
  // (lib/pricing/pax-range.ts) — the same engine the pricing grid feeds. This is
  // behavior-preserving: identical decomposition (fixedCosts + transport(pax) +
  // perPaxCosts×pax), identical margin/rounding, and the same tour-leader cost
  // (single room + own per-pax costs). The B2B template-day flow keeps its input
  // and endpoint; only the math is unified. Live golden-master verified byte-
  // identical on real templates (CAI-MUL-555/700). See [[grid-multipax-consolidation]].
  const paxPricing: PaxPricingResult[] = priceAcrossPax({
    groupFixed: fixedCosts,
    perPerson: perPaxCosts,
    marginPercent,
    transportAt: transportAtPax,
    tourLeaderCost: accommodationPPD + singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax,
    paxFrom: PAX_COUNTS[0],
    paxTo: PAX_COUNTS[PAX_COUNTS.length - 1],
  })

  // ============================================
  // STEP 11: Return result
  // ============================================

  debugLog('✅ Day-based pricing complete (v4)')
  debugLog(`   Template: ${template.template_name}`)
  debugLog(`   Single Supplement: €${singleSupplement.toFixed(2)}`)
  debugLog(`   Sample (2 pax +0): €${paxPricing[1]?.withoutLeader.pricePerPerson}/person`)
  debugLog(`   Sample (2 pax +1): €${paxPricing[1]?.withLeader.pricePerPerson}/person`)

  const complete = holes.length === 0
  if (!complete) {
    console.warn(`⚠️ Pricing INCOMPLETE — ${holes.length} hole(s): ${holes.map(h => h.kind).join(', ')}`)
  }

  return {
    success: true,
    templateId,
    templateName: template.template_name,
    tier,
    totalDays,
    hotelNights,
    cruiseNights,
    singleSupplement: Math.round(singleSupplement * 100) / 100,
    services,
    paxPricing,
    currency: params.rateCurrency ?? DEFAULT_RATE_CURRENCY,
    marginPercent,
    warnings,
    complete,
    holes
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Calculate pricing for a single pax count (for backward compatibility)
 */
export async function calculateSinglePaxPricing(
  params: DayPricingParams & { numPax: number; tourLeaderIncluded: boolean }
): Promise<{
  success: boolean
  totalCost: number
  tourLeaderCost: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
  singleSupplement: number
  services: PricedService[]
  warnings: string[]
}> {
  const result = await calculateDayBasedPricing(params)

  if (!result.success) {
    return {
      success: false,
      totalCost: 0,
      tourLeaderCost: 0,
      marginAmount: 0,
      sellingPrice: 0,
      pricePerPerson: 0,
      singleSupplement: 0,
      services: [],
      warnings: result.warnings
    }
  }

  const paxResult = result.paxPricing.find(p => p.numPax === params.numPax)
  
  if (!paxResult) {
    const closest = result.paxPricing.reduce((prev, curr) => 
      Math.abs(curr.numPax - params.numPax) < Math.abs(prev.numPax - params.numPax) ? curr : prev
    )

    const pricing = params.tourLeaderIncluded ? closest.withLeader : closest.withoutLeader

    return {
      success: true,
      totalCost: pricing.totalCost,
      tourLeaderCost: params.tourLeaderIncluded ? closest.withLeader.tourLeaderCost : 0,
      marginAmount: pricing.marginAmount,
      sellingPrice: pricing.sellingPrice,
      pricePerPerson: pricing.pricePerPerson,
      singleSupplement: result.singleSupplement,
      services: result.services,
      warnings: [...result.warnings, `Pax count ${params.numPax} not in standard list, using ${closest.numPax}`]
    }
  }

  const pricing = params.tourLeaderIncluded ? paxResult.withLeader : paxResult.withoutLeader

  return {
    success: true,
    totalCost: pricing.totalCost,
    tourLeaderCost: params.tourLeaderIncluded ? paxResult.withLeader.tourLeaderCost : 0,
    marginAmount: pricing.marginAmount,
    sellingPrice: pricing.sellingPrice,
    pricePerPerson: pricing.pricePerPerson,
    singleSupplement: result.singleSupplement,
    services: result.services,
    warnings: result.warnings
  }
}

/**
 * Get pricing table for CSV export
 */
export function formatPricingTable(result: DayPricingResult): string[][] {
  const headers = ['NO OF PAX', '+0 (Per Person DBL)', '+1 (Per Person DBL)', 'SINGLE SUPPLEMENT']
  
  const rows: string[][] = [headers]

  for (const pax of result.paxPricing) {
    rows.push([
      pax.numPax.toString(),
      `€${pax.withoutLeader.pricePerPerson.toFixed(0)}`,
      `€${pax.withLeader.pricePerPerson.toFixed(0)}`,
      pax.numPax === 2 ? `€${result.singleSupplement.toFixed(0)}` : ''
    ])
  }

  return rows
}

// ============================================
// BACKWARD COMPATIBILITY LAYER
// ============================================

export interface PricingParams {
  templateId: string
  /** What the customer is buying (lib/package-types.ts). Templates carry no
   *  package column yet, so callers usually omit this — full-package, the
   *  historical assumption. The plumbing exists so the day a template knows
   *  its product, the engine already listens. */
  packageType?: string
  tier: ServiceTier
  numPax: number
  numAdults?: number
  numChildren?: number  // Ages 4-12: 50% discount
  numInfants?: number   // Ages 0-3: FREE except flights
  isEurPassport: boolean
  language?: string
  travelDate?: string
  /** Whose season calendar to read. Omitted, no premium is applied — the engine
   *  is otherwise org-blind and must not guess whose dates these are. */
  orgId?: string
  marginPercent?: number
  /** Currency the rate tables are entered in — see DayPricingParams.rateCurrency. */
  rateCurrency?: string
  mealPlan?: 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'
  includeAccommodation?: boolean
  tourLeaderIncluded?: boolean
}

// ============================================
// CHILD/INFANT DISCOUNT CONSTANTS
// ============================================
export const CHILD_DISCOUNT_PERCENT = 50  // Children (4-12) get 50% off adult rate
export const INFANT_RATE_PERCENT = 0      // Infants (0-3) are FREE except flights

// Passenger breakdown for pricing
export interface PassengerBreakdown {
  numAdults: number      // Full adult rate
  numChildren: number    // 50% of adult rate (ages 4-12)
  numInfants: number     // FREE except flights (ages 0-3)
}

// Detailed pricing result with age breakdown
export interface AgeBasedPricingResult {
  success: boolean
  // Passenger counts
  numAdults: number
  numChildren: number
  numInfants: number
  totalPassengers: number

  // Per-person rates
  adultRate: number
  childRate: number
  infantRate: number

  // Subtotals by category
  adultsSubtotal: number
  childrenSubtotal: number
  infantsSubtotal: number

  // Flight costs (everyone pays, even infants)
  flightCostPerPerson?: number
  flightTotal?: number

  // Totals
  totalCost: number
  marginAmount: number
  sellingPrice: number

  // Currency
  currency: string

  // Breakdown for display
  breakdown: {
    category: string
    count: number
    rate: number
    subtotal: number
    note: string
  }[]
}

export interface PricingResult {
  success: boolean
  templateId: string
  templateName: string
  tier: ServiceTier
  numPax: number
  numPayingPax: number
  tourLeaderIncluded: boolean
  totalDays: number
  services: PricedService[]
  optionalServices: PricedService[]
  subtotalCost: number
  optionalTotal: number
  totalCost: number
  tourLeaderCost: number
  marginPercent: number
  marginAmount: number
  /** Cost + margin, BEFORE the operator's seasonal premium. Kept so a quote can
   *  show what the trip costs on an ordinary date beside what this date costs. */
  baseSellingPrice: number
  /** Null on an ordinary departure. Named rather than folded into the total, so
   *  a customer reading a quote sees WHY the number is bigger. */
  seasonUplift: UpliftBreakdown | null
  sellingPrice: number
  pricePerPerson: number
  currency: string
  ratesUsed: {
    vehicle?: { type: string; route: string; rate: number }
    guide?: { name: string; rate: number }
    hotel?: { name: string; rate: number }
    cruise?: { name: string; ppdNight: number; singleSuppNight: number }
  }
  warnings: string[]
  paxPricingTable?: PaxPricingResult[]
  singleSupplement?: number
  // Propagated from the hardened day engine (harness Layer 1 + consolidation D):
  // a rate sheet is deliverable only when complete; holes are never fabricated.
  complete: boolean
  holes: PricingHole[]
}

/**
 * BACKWARD COMPATIBLE FUNCTION
 */
/**
 * The operator's season windows that CONTAIN this departure date.
 *
 * Filtered in the query rather than in memory: the answer is at most a couple of
 * rows, and a pricing call should not drag a year of calendar across the wire.
 * An org without a calendar simply gets none, and the premium is zero.
 */
export async function loadSeasonWindows(
  orgId: string | undefined,
  travelDate: string | undefined
): Promise<SeasonWindow[]> {
  if (!orgId || !travelDate) return []
  const on = travelDate.slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('pricing_season_dates')
    .select('season_id, start_date, end_date, pricing_seasons!inner(name, uplift_percent, is_active)')
    .eq('org_id', orgId)
    .lte('start_date', on)
    .gte('end_date', on)
    .eq('pricing_seasons.is_active', true)

  if (error || !data) return []

  return data.map(row => {
    const season = row.pricing_seasons as unknown as { name: string; uplift_percent: number }
    return {
      seasonId: String(row.season_id),
      name: String(season?.name ?? ''),
      upliftPercent: Number(season?.uplift_percent) || 0,
      startDate: String(row.start_date),
      endDate: String(row.end_date),
    }
  })
}

/**
 * The rate sheet, carrying the same premium as the headline price.
 *
 * A partner is sent this table and the operator quotes one line of it; left at
 * the ordinary-date price the two would disagree about the same departure.
 * Cost and margin are untouched — the premium is neither of them.
 */
function paxTableWithSeason(
  rows: PaxPricingResult[],
  args: { season: SeasonMatch | null; currency: string }
): PaxPricingResult[] {
  const season = args.season
  if (!season || season.upliftPercent <= 0) return rows

  const upliftCell = <T extends { sellingPrice: number; pricePerPerson: number }>(
    cell: T,
    numPax: number
  ): T => {
    const { amount } = computeUplift({ sellingPrice: cell.sellingPrice, season })
    const selling = roundToCurrency(cell.sellingPrice + amount, args.currency)
    return {
      ...cell,
      sellingPrice: selling,
      pricePerPerson: numPax > 0 ? roundToCurrency(selling / numPax, args.currency) : cell.pricePerPerson,
    }
  }

  return rows.map(row => ({
    ...row,
    withoutLeader: upliftCell(row.withoutLeader, row.numPax),
    withLeader: upliftCell(row.withLeader, row.numPax),
  }))
}

export async function calculateAutoPricing(params: PricingParams): Promise<PricingResult> {
  const {
    templateId,
    tier,
    numPax,
    isEurPassport,
    language = 'English',
    marginPercent = 25,
    tourLeaderIncluded = false
  } = params

  debugLog('🔄 calculateAutoPricing called (v4 - smart transport)')
  debugLog(`   tourLeaderIncluded: ${tourLeaderIncluded}`)
  debugLog(`   numPax: ${numPax}`)

  const dayResult = await calculateDayBasedPricing({
    templateId,
    packageType: params.packageType,
    tier,
    isEurPassport,
    language,
    marginPercent,
    rateCurrency: params.rateCurrency
  })

  if (!dayResult.success) {
    return {
      success: false,
      templateId,
      templateName: 'Unknown',
      tier,
      numPax,
      numPayingPax: numPax,
      tourLeaderIncluded,
      totalDays: 0,
      services: [],
      optionalServices: [],
      subtotalCost: 0,
      optionalTotal: 0,
      totalCost: 0,
      tourLeaderCost: 0,
      marginPercent,
      marginAmount: 0,
      baseSellingPrice: 0,
      seasonUplift: null,
      sellingPrice: 0,
      pricePerPerson: 0,
      currency: params.rateCurrency ?? DEFAULT_RATE_CURRENCY,
      ratesUsed: {},
      warnings: dayResult.warnings,
      complete: false,
      holes: dayResult.holes
    }
  }

  let paxResult = dayResult.paxPricing.find(p => p.numPax === numPax)

  if (!paxResult) {
    paxResult = dayResult.paxPricing.reduce((prev, curr) =>
      Math.abs(curr.numPax - numPax) < Math.abs(prev.numPax - numPax) ? curr : prev
    )
    dayResult.warnings.push(`Pax count ${numPax} not in standard list, using closest match ${paxResult.numPax}`)
  }

  const pricing = tourLeaderIncluded ? paxResult.withLeader : paxResult.withoutLeader
  
  debugLog(`   Selected pricing: ${tourLeaderIncluded ? '+1 (withLeader)' : '+0 (withoutLeader)'}`)
  debugLog(`   totalCost: €${pricing.totalCost}`)
  debugLog(`   pricePerPerson: €${pricing.pricePerPerson}`)
  if (tourLeaderIncluded) {
    debugLog(`   tourLeaderCost: €${paxResult.withLeader.tourLeaderCost}`)
  }

  const ratesUsed: PricingResult['ratesUsed'] = {}
  
  const vehicleService = dayResult.services.find(s => s.serviceType === 'transportation')
  if (vehicleService) {
    ratesUsed.vehicle = {
      type: vehicleService.serviceName.split(' - ')[0] || 'Vehicle',
      route: vehicleService.serviceName.split(' - ')[1] || '',
      rate: vehicleService.unitCost
    }
  }

  const guideService = dayResult.services.find(s => s.serviceType === 'guide')
  if (guideService) {
    ratesUsed.guide = {
      name: guideService.serviceName,
      rate: guideService.unitCost
    }
  }

  const hotelService = dayResult.services.find(s => s.serviceType === 'accommodation' && s.serviceName.toLowerCase().includes('hotel'))
  if (hotelService) {
    ratesUsed.hotel = {
      name: hotelService.serviceName,
      rate: hotelService.unitCost
    }
  }

  if (dayResult.cruiseNights > 0) {
    const cruiseService = dayResult.services.find(s => s.serviceType === 'cruise')
    ratesUsed.cruise = {
      name: cruiseService?.serviceName || 'Nile Cruise',
      ppdNight: 0,
      singleSuppNight: dayResult.singleSupplement / dayResult.cruiseNights
    }
  }

  // ---------- the operator's seasonal premium ----------
  // AFTER margin, on the selling price, and never on a fixed pass-through. The
  // supplier's own seasonality is already inside totalCost — it moved when the
  // hotel's high-season rate was picked up — so applying this to cost as well
  // would charge the customer twice for the same season.
  const seasonWindows = await loadSeasonWindows(params.orgId, params.travelDate)
  const season = seasonForDate(seasonWindows, params.travelDate ?? null)

  const uplift = computeUplift({ sellingPrice: pricing.sellingPrice, season })
  const upliftAmount = roundToCurrency(uplift.amount, dayResult.currency)
  const sellingWithSeason = roundToCurrency(pricing.sellingPrice + upliftAmount, dayResult.currency)

  return {
    success: true,
    templateId: dayResult.templateId,
    templateName: dayResult.templateName,
    tier: dayResult.tier,
    numPax,
    numPayingPax: numPax,
    tourLeaderIncluded,
    totalDays: dayResult.totalDays,
    services: dayResult.services
      .filter(s => !s.notes?.includes('optional'))
      .sort((a, b) => {
        if (a.isPerPax === b.isPerPax) {
          return a.dayNumber - b.dayNumber
        }
        return a.isPerPax ? 1 : -1
      }),
    optionalServices: dayResult.services.filter(s => s.notes?.includes('optional')),
    subtotalCost: pricing.totalCost - (tourLeaderIncluded ? paxResult.withLeader.tourLeaderCost : 0),
    optionalTotal: 0,
    totalCost: pricing.totalCost,
    tourLeaderCost: tourLeaderIncluded ? paxResult.withLeader.tourLeaderCost : 0,
    marginPercent: dayResult.marginPercent,
    marginAmount: pricing.marginAmount,
    baseSellingPrice: pricing.sellingPrice,
    seasonUplift: season ? { ...uplift, amount: upliftAmount } : null,
    sellingPrice: sellingWithSeason,
    pricePerPerson: numPax > 0
      ? roundToCurrency(sellingWithSeason / numPax, dayResult.currency)
      : pricing.pricePerPerson,
    currency: dayResult.currency,
    ratesUsed,
    warnings: dayResult.warnings,
    paxPricingTable: paxTableWithSeason(dayResult.paxPricing, { season, currency: dayResult.currency }),
    singleSupplement: dayResult.singleSupplement,
    complete: dayResult.complete,
    holes: dayResult.holes
  }
}

/**
 * HELPER: Calculate for multiple tiers (backward compatible)
 */
export async function calculateMultiTierPricing(
  templateId: string,
  tiers: ServiceTier[],
  numPax: number,
  isEurPassport: boolean,
  options?: Partial<PricingParams>
): Promise<Map<ServiceTier, PricingResult>> {
  const results = new Map<ServiceTier, PricingResult>()

  // Tiers are independent calculations — run them in parallel, then insert
  // into the map in the original tier order (I/O scheduling change only).
  const tierResults = await Promise.all(
    tiers.map(tier =>
      calculateAutoPricing({
        templateId,
        tier,
        numPax,
        isEurPassport,
        ...options
      })
    )
  )

  tiers.forEach((tier, idx) => {
    results.set(tier, tierResults[idx])
  })

  return results
}

/**
 * HELPER: Get price range for browse display (backward compatible)
 */
export async function getTemplatePriceRange(
  templateId: string,
  isEurPassport: boolean = true
): Promise<{ minPrice: number; maxPrice: number; tier: ServiceTier } | null> {
  const tiers: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']
  
  const results = await calculateMultiTierPricing(
    templateId,
    tiers,
    2,
    isEurPassport
  )

  let minPrice = Infinity
  let minTier: ServiceTier = 'standard'
  let maxPrice = 0

  for (const [tier, result] of results) {
    if (result.success && result.pricePerPerson > 0) {
      if (result.pricePerPerson < minPrice) {
        minPrice = result.pricePerPerson
        minTier = tier
      }
      if (result.pricePerPerson > maxPrice) {
        maxPrice = result.pricePerPerson
      }
    }
  }

  if (minPrice === Infinity) return null

  return { minPrice, maxPrice, tier: minTier }
}

export type MealPlan = 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'

// ============================================
// AGE-BASED PRICING CALCULATION
// ============================================

/**
 * Calculate pricing with age-based discounts
 * - Adults (13+): Full rate
 * - Children (4-12): 50% of adult rate (except flights = full)
 * - Infants (0-3): FREE (except flights = may apply infant fare)
 *
 * @param baseAdultCost - The full adult per-person COST, BEFORE margin. This must
 *   be a pre-margin cost (e.g. a pax-row `totalCost / pax`), NOT an already-margined
 *   selling price — this function applies `marginPercent` itself, so passing a
 *   post-margin price double-applies the margin and overcharges the customer.
 * @param passengers - Breakdown of adults, children, infants
 * @param marginPercent - Margin percentage (default 25%)
 * @param flightCostPerPerson - Optional flight cost per person (everyone pays full flight cost)
 */
export function calculateAgeBasedPricing(
  baseAdultCost: number,
  passengers: PassengerBreakdown,
  marginPercent: number = 25,
  flightCostPerPerson: number = 0,
  /** Label only — what the rate tables are in. */
  currency: string = DEFAULT_RATE_CURRENCY
): AgeBasedPricingResult {
  const { numAdults, numChildren, numInfants } = passengers
  const totalPassengers = numAdults + numChildren + numInfants

  // Calculate rates
  const adultRate = baseAdultCost
  const childRate = baseAdultCost * (1 - CHILD_DISCOUNT_PERCENT / 100) // 50% discount
  const infantRate = baseAdultCost * (INFANT_RATE_PERCENT / 100)        // FREE (0%)

  // Calculate subtotals (tour costs)
  const adultsSubtotal = adultRate * numAdults
  const childrenSubtotal = childRate * numChildren
  const infantsSubtotal = infantRate * numInfants

  // Flight costs: everyone pays (infants might pay 10% of adult fare in real scenarios)
  // For simplicity, we'll use full fare for all. This can be customized.
  const flightTotal = flightCostPerPerson * totalPassengers

  // Total cost before margin
  const tourSubtotal = adultsSubtotal + childrenSubtotal + infantsSubtotal
  const totalCost = tourSubtotal + flightTotal

  // Apply margin
  const marginAmount = totalCost * (marginPercent / 100)
  const sellingPrice = totalCost + marginAmount

  // Build breakdown for display
  const breakdown: AgeBasedPricingResult['breakdown'] = []

  if (numAdults > 0) {
    breakdown.push({
      category: 'Adults',
      count: numAdults,
      rate: Math.round(adultRate * 100) / 100,
      subtotal: Math.round(adultsSubtotal * 100) / 100,
      note: 'Full rate'
    })
  }

  if (numChildren > 0) {
    breakdown.push({
      category: 'Children (4-12)',
      count: numChildren,
      rate: Math.round(childRate * 100) / 100,
      subtotal: Math.round(childrenSubtotal * 100) / 100,
      note: `${CHILD_DISCOUNT_PERCENT}% discount`
    })
  }

  if (numInfants > 0) {
    breakdown.push({
      category: 'Infants (0-3)',
      count: numInfants,
      rate: 0,
      subtotal: 0,
      note: 'FREE (except flights)'
    })
  }

  if (flightTotal > 0) {
    breakdown.push({
      category: 'Flights',
      count: totalPassengers,
      rate: Math.round(flightCostPerPerson * 100) / 100,
      subtotal: Math.round(flightTotal * 100) / 100,
      note: 'Per person'
    })
  }

  return {
    success: true,
    numAdults,
    numChildren,
    numInfants,
    totalPassengers,
    adultRate: Math.round(adultRate * 100) / 100,
    childRate: Math.round(childRate * 100) / 100,
    infantRate: 0,
    adultsSubtotal: Math.round(adultsSubtotal * 100) / 100,
    childrenSubtotal: Math.round(childrenSubtotal * 100) / 100,
    infantsSubtotal: 0,
    flightCostPerPerson: flightCostPerPerson > 0 ? Math.round(flightCostPerPerson * 100) / 100 : undefined,
    flightTotal: flightTotal > 0 ? Math.round(flightTotal * 100) / 100 : undefined,
    totalCost: Math.round(totalCost * 100) / 100,
    marginAmount: Math.round(marginAmount * 100) / 100,
    sellingPrice: Math.round(sellingPrice * 100) / 100,
    currency,
    breakdown
  }
}

/**
 * Compose age-discounted pricing from a multi-pax rate-sheet row, applying margin
 * EXACTLY ONCE. The row's `totalCost` is the PRE-margin cost, so we derive the
 * per-person cost from it (NOT the already-margined `pricePerPerson`) and let
 * calculateAgeBasedPricing apply the discounts + the single margin.
 *
 * The tour leader, when included, is added ONCE — as the pre-margin cost delta
 * between the +1 and +0 pax tables (their single room + own per-pax costs + the
 * extra-seat transport-tier bump) — and margined once like everything else. The
 * old code instead read `withLeader.pricePerPerson` (which already baked in both
 * the leader cost AND the margin) and then ALSO added the leader again, so the
 * leader was double-counted on top of the double margin.
 *
 * Pure + deterministic (no I/O) so the "effective markup === configured margin"
 * invariant is unit-testable. See __tests__/lib/age-based-pricing.test.ts.
 */
export interface ComposedAgeBasedPricing {
  ageBasedPricing: AgeBasedPricingResult
  tourLeaderCost: number
  subtotalCost: number
  totalCost: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
}

export function composeAgeBasedPricing(
  paxRow: PaxPricingResult,
  passengers: PassengerBreakdown,
  marginPercent: number,
  tourLeaderIncluded: boolean,
  flightCostPerPerson: number = 0,
  /** Label only — what the rate tables are in. */
  currency: string = DEFAULT_RATE_CURRENCY
): ComposedAgeBasedPricing {
  const refPax = paxRow.numPax || 2
  // PRE-margin per-person cost from the reference pax row (no leader).
  const baseAdultCost = paxRow.withoutLeader.totalCost / refPax
  const ageBasedPricing = calculateAgeBasedPricing(baseAdultCost, passengers, marginPercent, flightCostPerPerson, currency)

  const leaderCost = tourLeaderIncluded
    ? Math.max(0, paxRow.withLeader.totalCost - paxRow.withoutLeader.totalCost)
    : 0
  const leaderMargin = leaderCost * (marginPercent / 100)

  const subtotalCost = ageBasedPricing.totalCost
  const totalCost = subtotalCost + leaderCost
  const marginAmount = ageBasedPricing.marginAmount + leaderMargin
  const sellingPrice = ageBasedPricing.sellingPrice + leaderCost + leaderMargin
  const payingPassengers = passengers.numAdults + passengers.numChildren
  const pricePerPerson = payingPassengers > 0 ? sellingPrice / payingPassengers : 0

  return { ageBasedPricing, tourLeaderCost: leaderCost, subtotalCost, totalCost, marginAmount, sellingPrice, pricePerPerson }
}

/**
 * Calculate full tour pricing with age-based discounts
 * Combines the day-based pricing with passenger breakdown
 */
export async function calculatePricingWithPassengerBreakdown(
  params: PricingParams & { passengers: PassengerBreakdown; flightCostPerPerson?: number }
): Promise<PricingResult & { ageBasedPricing?: AgeBasedPricingResult }> {
  const {
    templateId,
    tier,
    passengers,
    isEurPassport,
    language = 'English',
    marginPercent = 25,
    tourLeaderIncluded = false,
    flightCostPerPerson = 0
  } = params

  const totalPax = passengers.numAdults + passengers.numChildren + passengers.numInfants

  debugLog('🧒 Calculating with passenger breakdown:')
  debugLog(`   Adults: ${passengers.numAdults}`)
  debugLog(`   Children (4-12): ${passengers.numChildren}`)
  debugLog(`   Infants (0-3): ${passengers.numInfants}`)
  debugLog(`   Total: ${totalPax}`)

  // First get the day-based pricing to get the base adult rate
  const dayResult = await calculateDayBasedPricing({
    templateId,
    packageType: params.packageType,
    tier,
    isEurPassport,
    language,
    marginPercent,
    rateCurrency: params.rateCurrency
  })

  if (!dayResult.success) {
    return {
      success: false,
      templateId,
      templateName: 'Unknown',
      tier,
      numPax: totalPax,
      numPayingPax: passengers.numAdults + passengers.numChildren, // Infants don't pay
      tourLeaderIncluded,
      totalDays: 0,
      services: [],
      optionalServices: [],
      subtotalCost: 0,
      optionalTotal: 0,
      totalCost: 0,
      tourLeaderCost: 0,
      marginPercent,
      marginAmount: 0,
      baseSellingPrice: 0,
      seasonUplift: null,
      sellingPrice: 0,
      pricePerPerson: 0,
      currency: params.rateCurrency ?? DEFAULT_RATE_CURRENCY,
      ratesUsed: {},
      warnings: dayResult.warnings,
      complete: false,
      holes: dayResult.holes
    }
  }

  // Compose age-discounted pricing from the pax row matching the group's PAYING
  // headcount (adults + children), applying margin EXACTLY ONCE (the previous
  // code fed the already-margined pricePerPerson here and re-applied margin →
  // customers overcharged by ~(1+margin)²). Using the matching row matters:
  // group-fixed costs (guide, vehicle tier, tips) are amortized per pax inside
  // the row, so deriving from a hardcoded 2-pax row billed a 6-adult group's
  // fixed costs ~3× and priced the vehicle at the Sedan tier.
  const payingPax = passengers.numAdults + passengers.numChildren
  const basePaxResult =
    dayResult.paxPricing.find(p => p.numPax === payingPax) ||
    dayResult.paxPricing.reduce((prev, curr) =>
      Math.abs(curr.numPax - payingPax) < Math.abs(prev.numPax - payingPax) ? curr : prev
    )
  const composed = composeAgeBasedPricing(
    basePaxResult,
    passengers,
    marginPercent,
    tourLeaderIncluded,
    flightCostPerPerson,
    dayResult.currency
  )
  const ageBasedPricing = composed.ageBasedPricing
  const tourLeaderCost = composed.tourLeaderCost
  const payingPassengers = passengers.numAdults + passengers.numChildren
  const pricePerPerson = composed.pricePerPerson

  // Prepare ratesUsed
  const ratesUsed: PricingResult['ratesUsed'] = {}

  const vehicleService = dayResult.services.find(s => s.serviceType === 'transportation')
  if (vehicleService) {
    ratesUsed.vehicle = {
      type: vehicleService.serviceName.split(' - ')[0] || 'Vehicle',
      route: vehicleService.serviceName.split(' - ')[1] || '',
      rate: vehicleService.unitCost
    }
  }

  const guideService = dayResult.services.find(s => s.serviceType === 'guide')
  if (guideService) {
    ratesUsed.guide = {
      name: guideService.serviceName,
      rate: guideService.unitCost
    }
  }

  const hotelService = dayResult.services.find(s => s.serviceType === 'accommodation' && s.serviceName.toLowerCase().includes('hotel'))
  if (hotelService) {
    ratesUsed.hotel = {
      name: hotelService.serviceName,
      rate: hotelService.unitCost
    }
  }

  debugLog('✅ Age-based pricing calculated:')
  debugLog(`   Adult rate: €${ageBasedPricing.adultRate}`)
  debugLog(`   Child rate: €${ageBasedPricing.childRate} (${CHILD_DISCOUNT_PERCENT}% off)`)
  debugLog(`   Infant rate: FREE`)
  debugLog(`   Selling price: €${ageBasedPricing.sellingPrice}`)

  // Same premium, same rule, on the age-broken-down path — a family quote and a
  // headcount quote for the same departure must not disagree about what Golden
  // Week costs.
  const seasonWindows = await loadSeasonWindows(params.orgId, params.travelDate)
  const season = seasonForDate(seasonWindows, params.travelDate ?? null)
  const uplift = computeUplift({ sellingPrice: composed.sellingPrice, season })
  const upliftAmount = roundToCurrency(uplift.amount, dayResult.currency)
  const sellingWithSeason = roundToCurrency(composed.sellingPrice + upliftAmount, dayResult.currency)

  return {
    success: true,
    templateId: dayResult.templateId,
    templateName: dayResult.templateName,
    tier: dayResult.tier,
    numPax: totalPax,
    numPayingPax: payingPassengers,
    tourLeaderIncluded,
    totalDays: dayResult.totalDays,
    services: dayResult.services.filter(s => !s.notes?.includes('optional')),
    optionalServices: dayResult.services.filter(s => s.notes?.includes('optional')),
    subtotalCost: composed.subtotalCost,
    optionalTotal: 0,
    totalCost: Math.round(composed.totalCost * 100) / 100,
    tourLeaderCost: Math.round(tourLeaderCost * 100) / 100,
    marginPercent,
    marginAmount: Math.round(composed.marginAmount * 100) / 100,
    baseSellingPrice: Math.round(composed.sellingPrice * 100) / 100,
    seasonUplift: season ? { ...uplift, amount: upliftAmount } : null,
    sellingPrice: sellingWithSeason,
    // Recomputed from the price that includes the premium: leaving the base
    // figure here would show a per-person number that does not multiply back to
    // the total the customer is quoted.
    pricePerPerson: payingPassengers > 0
      ? roundToCurrency(sellingWithSeason / payingPassengers, dayResult.currency)
      : Math.round(pricePerPerson * 100) / 100,
    currency: dayResult.currency,
    ratesUsed,
    warnings: dayResult.warnings,
    paxPricingTable: paxTableWithSeason(dayResult.paxPricing, { season, currency: dayResult.currency }),
    singleSupplement: dayResult.singleSupplement,
    ageBasedPricing,
    complete: dayResult.complete,
    holes: dayResult.holes
  }
}