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
import { sortByItineraryFlow } from '@/lib/pricing/breakdown-order'
import { periodRatesFor, plainPeriodName as seasonNameOf } from '@/lib/rates/rate-seasons'
import { cruiseCandidates, hotelCandidates, propertyById } from '@/lib/pricing/property-candidates'
import { choicesForTier, sanitizePropertyChoice } from '@/lib/pricing/property-choice'
import { guideLanguageWord, sameGuideLanguage } from '@/lib/guides/guide-language'
import { isRoadTransferType, planRoadTrips, rateDeparture, rateTripShape, roadRouteKey, sanitizeTripShape, type RoadPlanEntry, type TripShape } from '@/lib/pricing/road-trips'
import { durationFor, isRoadTransfer, isSightseeing, sanitizeTransportLines, type TransportLine } from '@/lib/pricing/transport-lines'
import { getAirportCode, legAssistance, routeAirportCode, sanitizeLegAssist, sanitizeLegPlace, type LegAssist } from '@/lib/pricing/flight-leg'
import { resolveSupplementsForDate, sanitizeSupplementKeys } from '@/lib/rates/supplements'
import { createRateNormalizer, type RateNormalizer } from '@/lib/rates/rate-currency'
import { tripAccommodationCost, type NightRates } from '@/lib/pricing/rooming'
import { resolveAttractions, buildAliasMap } from '@/lib/pricing/attractions'
import { PRESET_TIERS, presetTierFor } from '@/lib/vocabulary'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// TYPES
// ============================================

/** A tier KEY from Settings → Vocabulary → Service tiers — one of the four
 *  presets or one the agency added ("5_star"). The same open type as
 *  lib/ai/parsing-utils. Rate lookups match the key exactly; position logic
 *  (getTierCategory) maps it onto the preset ladder with presetTierFor. */
export type ServiceTier = string
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

/** How a transport line reads to the operator when it has to be listed without a row to name it. */
export function transportServiceLabel(serviceType: string): string {
  const labels: Record<string, string> = {
    airport_transfer: 'Airport transfer',
    airport_with_sightseeing: 'Airport transfer with sightseeing',
    city_transfer: 'City transfer',
    city_tour: 'City tour vehicle',
    intercity: 'Road transfer',
    intercity_with_sightseeing: 'Road transfer with sightseeing',
    half_day: 'Half-day vehicle',
    day_tour: 'Full-day vehicle',
    extended_day_tour: 'Extended-day vehicle',
    sound_light: 'Sound & light transfer',
    dinner_transfer: 'Dinner transfer',
  }
  return labels[serviceType] ?? 'Transport'
}

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
  /** entrance_fees ids picked from the fee table — exact tickets for the
   *  day; the wording above is then documentation only (lib/pricing/attractions). */
  attraction_ids?: string[]
  services: {
    airport_arrival: boolean
    airport_departure: boolean
    hotel_checkin: boolean
    hotel_checkout: boolean
    guide_required: boolean
    /** Assistance boarding the ship. Derived by parseItinerary when the day
     *  does not say: the first night aboard after a night ashore (or none). */
    cruise_embark?: boolean
    /** Assistance leaving the ship: the first day ashore after a night aboard. */
    cruise_disembark?: boolean
  }
  /**
   * Road alongside the day's travel. On a flight or train day: the transfers
   * to and from the airport or station. On any other day: the day's road
   * vehicle at all. Absent = the historical default for the mode — on for road
   * and flight days, off for day and sleeping trains (operator, 2026-09-04: a
   * train ticket alone is the day's transport). A flight day with road ON is
   * the ticket AND both airport transfers — "flight and road", which is what
   * the operator asked the picker to show (2026-09-16).
   */
  road_transfers?: boolean
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
  /** tier key → the accommodation_rates id (hotel night) or nile_cruises id
   *  (night aboard) chosen for this stay. Absent for a tier = the automatic
   *  pick. One hotel per city, one ship per sailing (lib/pricing/property-choice). */
  property_by_tier?: Record<string, string>
  /** The operator's own transport for the day (lib/pricing/transport-lines).
   *  Present = exactly these lines, the rules below stay out of the day;
   *  absent = the rules decide. */
  transport_lines?: TransportLine[]
  /** The whole day is spent travelling to or from the destination (an
   *  overnight flight): no bed, no transfer, no assistance, no guide. */
  in_transit?: boolean

  // B3 (2026-06-23): per-day transport rule flags.

  // Arrival-day pattern. false (default) = airport -> hotel -> tour
  // (two transport line items). true = airport -> tour -> hotel (one
  // bundled `airport_with_sightseeing` line item).
  skip_arrival_checkin?: boolean

  // For city-change days: 'flight' means TWO airport transfers on the same
  // day (one in the departure city, one in the arrival city). 'ground'
  // (default) means a single `intercity` / `intercity_with_sightseeing`
  // line. Pre-existing data without this field is treated as 'ground'.
  // 'train' prices the leg per person from train_rates; 'sleeping_train'
  // from sleeping_train_rates, with the night aboard replacing the hotel
  // bed (leg-pricing project, operator decisions 2026-09-04).
  transport_type?: 'flight' | 'ground' | 'train' | 'sleeping_train'
  /** The exact ticket row this day rides (train_rates / sleeping_train_rates
   *  / flight_rates id). Several trains serve one route at different prices,
   *  and the operator picks THE train — the engine only auto-resolves a
   *  route served by exactly one row; more than one without a pick is a
   *  hole, never a guess. */
  transport_rate_id?: string
  /** The leg's own route when it is not "yesterday's city → today's" — a
   *  connection on the arrival day (Cairo → Luxor after the overnight flight),
   *  or a day filed under a non-city like "Nile Cruise" (lib/pricing/flight-leg). */
  leg_from?: string
  leg_to?: string
  /** Airport assistance at each end of a flight leg; absent = the default for
   *  the day (on for an arrival-day connection, off otherwise). */
  leg_assist?: LegAssist

  // Additive transport line items independent of the day's primary, e.g.
  // ['sound_light'] for an evening Sound & Light show transfer at Karnak
  // even on a cruise day. Each entry emits one line item looked up at
  // `day.city`.
  extras?: TransportServiceType[]
  /** The supplements this night is sold with — vocabulary KEYS from the
   *  agency's Hotel supplements (a hotel night) or Cruise supplements (a
   *  cruise day) list, priced per person per night at the resolved
   *  property's rate for that night (lib/rates/supplements). A property
   *  with no price for one is a HOLE, never free. Included in the price. */
  supplements?: string[]
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
  /** See PricingParams.guideGrade / guideMode. Wrappers MUST forward these —
   *  a dropped option here is the travelDate incident again (2026-09-03). */
  guideGrade?: GuideGrade
  guideMode?: 'spot' | 'throughout'
  /** Group size, used ONLY for the throughout-guide meal rule (3 or fewer pax
   *  pay for the guide's meals; 4+ eat him free). Never sizes anything else —
   *  the pax sheet below stays the authority on per-pax math. */
  numPax?: number
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
  /** No usable rate. Listed IN ITS PLACE at 0 rather than dropped, so the
   *  operator sees the gap on the day it belongs to (operator, 2026-09-16).
   *  The same gap is recorded in `holes`, so the price is not complete. */
  unpriced?: boolean
  /** Already paid for inside another line — breakfast in the hotel rate,
   *  meals aboard the cruise. Shown so the day reads whole; costs nothing. */
  included?: boolean
  /** The operator-facing reason for an unpriced, included or unmatched line. */
  issue?: string
  /** The hotel or ship a night line is for — carried onto the itinerary's
   *  service row as supplier_name so the itinerary, PDF and share page can
   *  name the overnight (lib/itineraries/overnight-property). */
  propertyName?: string
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
  /** Each night's contract figures, for the rooming rule (lib/pricing/rooming.ts). */
  accommodationNights: NightRates[]
  
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
  /** one_way / same_day_return / overnight_return (lib/pricing/road-trips). */
  trip_shape?: string | null
  base_rate_eur: number
  base_rate_non_eur: number
  capacity_min: number | null
  capacity_max: number | null
  is_active: boolean
  /** The vehicles list (20261005) — every vehicle the row prices, read
   *  through lib/rates/vehicle-bands.ts. */
  vehicles?: unknown
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

// There used to be a city → vehicle table here ('edfu' → 'Horse Carriage').
// It was a LABEL override only — the rate chosen never depended on it — and
// it was Egypt written into a white-label engine. A vehicle a city needs is
// now simply priced on that city's rate rows (transportation_rates.vehicles,
// keyed by the agency's own vehicle types); the label is the chosen band's.

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
  void city // no city has a built-in vehicle any more; the rate rows decide
  
  if (totalPax <= 2) return 'Sedan'
  if (totalPax <= 7) return 'Minivan'
  if (totalPax <= 14) return 'Van'
  if (totalPax <= 20) return 'Minibus'
  return 'Bus'
}

/**
 * Get airport code from city name
 */
// The airport map lives in lib/pricing/flight-leg (client-safe); re-exported here.
export { getAirportCode }

/**
 * Map tier to hotel category for hotel_staff_rates
 */
export function getTierCategory(tier: ServiceTier, ladder: readonly string[] = PRESET_TIERS): string {
  // By rung, not by name: an agency-added top tier ("5_star") is a luxury
  // category, not the 'standard' it would fall to on a string comparison.
  const preset = presetTierFor(ladder, tier)
  if (preset === 'budget') return 'budget'
  if (preset === 'luxury') return 'luxury'
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
  /** Road transfers only: the shape of trip the rate must be (lib/pricing/road-trips). */
  tripShape?: TripShape
  /** A drive back already paid inside this earlier day's overnight return:
   *  listed at 0, never priced. */
  returnIncludedFromDay?: number
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
  nextDay: ItineraryDay | null,
  /** The trip's road plan for THIS day (lib/pricing/road-trips planRoadTrips).
   *  Given = the plan decides the day's road transfer: its route and shape,
   *  or that today's drive back is inside an earlier overnight return. Absent
   *  = the old one-way rule (callers that plan nothing). */
  ctx?: { road: RoadPlanEntry | null }
): TransportNeed[] {
  // Explicit per-day transport override wins (admin pinned a specific
  // service_type for this day). Returns one line; extras still get added.
  const lines: TransportNeed[] = []

  // The operator's own list for the day, as the day editor showed and they
  // changed it: exactly these lines, nothing derived added behind it.
  if (day.transport_lines) {
    return day.transport_lines.map(line => ({
      serviceType: line.service_type,
      duration: durationFor(line.service_type),
      area: isSightseeing(line.service_type) && day.attractions?.length ? detectAreaFromAttractions(day.attractions) : null,
      useSpecialVehicle: false,
      ...(line.city ? { city: line.city } : {}),
      ...(isRoadTransfer(line.service_type)
        ? {
            originCity: line.from || (ctx?.road?.kind === 'leg' ? ctx.road.from : previousDay?.city),
            destinationCity: line.to || day.city,
            tripShape: line.shape ?? (ctx?.road?.kind === 'leg' ? ctx.road.shape : 'one_way'),
          }
        : {}),
    }))
  }

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

  // A special vehicle comes only from the day's own transport override above
  // (day.transport.vehicle_type — the agency's template data), never from the
  // city: the rate rows carry whatever a city needs.
  const cityLower = day.city.toLowerCase()
  const hasAttractions = !!(day.attractions && day.attractions.length > 0)
  const attractionCount = day.attractions?.length || 0
  // City change = cities differ AND it's not pure in-cruise movement (the ship
  // moving Aswan → Kom Ombo → Edfu → Luxor across consecutive cruise days is
  // not a transfer). Cruise *boundaries* (hotel → cruise on a boarding day,
  // cruise → hotel on a disembarkation day) ARE city changes and need their
  // own transport line.
  // The party arrived this morning on a sleeping train: the journey is the
  // ticket priced on the boarding day. This day used to count as a city change
  // and priced a full road intercity for the same journey on top of it.
  const arrivedBySleeper = previousDay?.transport_type === 'sleeping_train'
  const isCityChange = !!(previousDay &&
    previousDay.city.toLowerCase() !== cityLower &&
    !arrivedBySleeper &&
    !(day.accommodation_type === 'cruise' && previousDay.accommodation_type === 'cruise'))
  // On a disembarkation flight day, the cruise → airport transfer is bundled
  // in the cruise package — suppress the departure-side leg.
  const isCruiseDisembarkFlight = previousDay?.accommodation_type === 'cruise'
  const isFlightDay = day.transport_type === 'flight'
  // A marked train leg rides a ticket, not a vehicle — and the operator
  // decided (2026-09-04) the ticket alone is the day's transport: no
  // station transfers are emitted.
  const isTicketLeg = day.transport_type === 'train' || day.transport_type === 'sleeping_train'
  const isCruise = day.is_cruise_day === true
  const transportArea = hasAttractions ? detectAreaFromAttractions(day.attractions) : null

  // Road alongside the day's travel (see ItineraryDay.road_transfers). Off on
  // a day with no train ticket means no road vehicle that day at all — only
  // the explicit extras. On a train day it only adds or removes the station
  // transfers; the day's own sightseeing vehicle is unaffected.
  const roadOn = day.road_transfers ?? !isTicketLeg
  // Today's drive back is inside an earlier day's overnight return: listed so
  // the day reads whole, never charged twice (operator, 2026-09-17).
  if (ctx?.road?.kind === 'return_included') {
    lines.push({
      serviceType: 'intercity',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false,
      originCity: ctx.road.from,
      destinationCity: ctx.road.to,
      returnIncludedFromDay: ctx.road.outDay,
    })
  }
  if (!roadOn && !isTicketLeg) {
    appendExtras(lines, day)
    return lines
  }
  const stationTransfer = (city?: string): TransportNeed => ({
    serviceType: 'city_transfer',
    duration: 'one_way',
    area: null,
    useSpecialVehicle: false,
    ...(city ? { city } : {}),
  })

  // Off the sleeping train and into town — only when the boarding day asked
  // for its transfers.
  if (arrivedBySleeper && previousDay?.road_transfers === true) {
    lines.push(stationTransfer())
  }

  // The first and last day IN THE DESTINATION: no neighbour, or a neighbour
  // spent in the air. An overnight flight from Japan used to leave day 2 with
  // its Meet & Greet but no airport transfer (operator, 2026-09-17).
  const firstInDestination = !previousDay || previousDay.in_transit === true
  const lastInDestination = !nextDay || nextDay.in_transit === true

  // Arrival day with a connecting flight: landed internationally at the leg's
  // origin and flies on, airside, to its destination — the transfer is at the
  // FINAL airport, and there is no departure-side transfer. On a cruise-
  // package day the ship's package carries the sightseeing, so it is a plain
  // airport transfer.
  if (day.services.airport_arrival && firstInDestination && isFlightDay) {
    lines.push({
      serviceType: hasAttractions && !isCruise ? 'airport_with_sightseeing' : 'airport_transfer',
      duration: 'one_way',
      area: hasAttractions && !isCruise ? transportArea : null,
      useSpecialVehicle: false,
      ...(day.leg_to ? { city: day.leg_to } : {}),
    })
  }
  // First day (arrival).
  else if (day.services.airport_arrival && firstInDestination) {
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
          useSpecialVehicle: false,
        })
      }
    }
  }
  // Last day (departure).
  else if (day.services.airport_departure && lastInDestination) {
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
  else if ((isCityChange || day.leg_from || day.leg_to) && isFlightDay) {
    const departureCity = day.leg_from || previousDay?.city
    if (!isCruiseDisembarkFlight && departureCity) {
      lines.push({
        serviceType: 'airport_transfer',
        duration: 'one_way',
        area: null,
        useSpecialVehicle: false,
        city: departureCity, // departure-side: the leg's origin airport
      })
    }
    // Arrival-side leg — upgrade to airport_with_sightseeing when attractions,
    // except on a cruise-package day, whose package carries the sightseeing.
    lines.push({
      serviceType: hasAttractions && !isCruise ? 'airport_with_sightseeing' : 'airport_transfer',
      duration: 'one_way',
      area: hasAttractions && !isCruise ? transportArea : null,
      useSpecialVehicle: false,
      ...(day.leg_to ? { city: day.leg_to } : {}),
    })
  }
  // Cruise day (non-flight): primary ground excursion transport is bundled
  // in the cruise package — emit nothing here. Extras still fire below.
  else if (isCruise) {
    // intentional no-op
  }
  // Ground intercity day (city change, no flight): same-day round-trip with
  // sightseeing → intercity_with_sightseeing; otherwise one-way intercity.
  // A marked train leg suppresses the road line — its ticket is priced in
  // the ticket-leg step, per person.
  else if (ctx ? ctx.road?.kind === 'leg' : (isCityChange && !isTicketLeg)) {
    // The route and shape come from the trip's road plan: From is where the
    // party woke up (a ship's end port after a cruise), and a leg that sleeps
    // back at its start is a same-day return, one that comes back by road
    // tomorrow an overnight return.
    const planned = ctx?.road?.kind === 'leg' ? ctx.road : null
    lines.push({
      serviceType: hasAttractions ? 'intercity_with_sightseeing' : 'intercity',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false,
      originCity: planned ? planned.from : previousDay?.city,
      destinationCity: planned ? planned.to : day.city,
      tripShape: planned ? planned.shape : 'one_way',
    })
  }
  // Day train with its station transfers asked for: to the station in the
  // previous city (unless leaving the ship, where the cruise package covers
  // it, the same rule as a disembarkation flight), and from the station here.
  else if (isCityChange && day.transport_type === 'train' && roadOn) {
    if (!isCruiseDisembarkFlight && previousDay) lines.push(stationTransfer(previousDay.city))
    lines.push(stationTransfer())
    if (hasAttractions) {
      lines.push({
        serviceType: sightseeingServiceType(attractionCount),
        duration: sightseeingDuration(attractionCount),
        area: transportArea,
        useSpecialVehicle: false,
      })
    }
  }
  // Same-city sightseeing day: tier by attraction count.
  else if (hasAttractions) {
    lines.push({
      serviceType: sightseeingServiceType(attractionCount),
      duration: sightseeingDuration(attractionCount),
      area: transportArea,
      useSpecialVehicle: false,
    })
  }

  // Boarding a sleeping train tonight with its transfers asked for: to the
  // station in this city, after the day's own sightseeing.
  if (day.transport_type === 'sleeping_train' && roadOn) {
    lines.push(stationTransfer())
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
    // Ticked meals from the list format, resolved to included/external once
    // the day's bed is known (below) — whether a lunch costs anything depends
    // on whether the party is aboard the ship or on a board basis.
    let tickedMeals: Set<string> | null = null

    if (day.meals) {
      if (Array.isArray(day.meals)) {
        // The list format — ["breakfast", "lunch", "dinner"] — is the ONLY
        // one the calculator writes, and every template day in production
        // uses it. It used to map every tick to 'included', while the engine
        // only ever charges 'external': so every lunch and dinner an operator
        // ticked priced at nothing, with no hole and no warning.
        tickedMeals = new Set(day.meals.map((m: string) => String(m).toLowerCase()))
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

    // Where the party sleeps. The programme's overnight_kind is the office's
    // own word for it and wins over the imported accommodation_type: a night
    // "in flight" books no bed, and the last day never has one (the trip
    // ends that day). Before this, NMS803-CR-ABS slept in a Cairo hotel on
    // the overnight flight from Japan AND on departure day — two nights the
    // customer would never be sold.
    const overnightKind = String(day.overnight_kind ?? '').toLowerCase()
    // A night aboard the sleeping train: the ticket IS the bed, so no hotel
    // is booked — and the office's overnight_kind 'train' marks the leg even
    // on days that never went through the editor.
    const sleepingAboard = overnightKind === 'train' || String(day.transport_type ?? '') === 'sleeping_train'
    const noBed = NO_BED_KINDS.has(overnightKind) || isLastDay || sleepingAboard
    // A day spent entirely in the air, with no city and nothing to see, is
    // outside the destination: no arrival transfer, no hotel assistance.
    // `in_transit: true` is the operator SAYING so in the day editor ("In the
    // air — overnight flight"): it wins whatever the day's city or leftover
    // attractions, because the imported marker this rule reads was lost from
    // some programmes and could not be restored from the UI (NMS803 day 1,
    // operator 2026-09-17).
    const inTransit = day.in_transit === true ||
      (NO_BED_KINDS.has(overnightKind) && !day.city && attractions.length === 0)
    const accommodationType: AccommodationType = noBed ? 'none' : (day.accommodation_type || inferAccommodationType(day, itineraryData))
    const supplementKeys = sanitizeSupplementKeys(day.supplements)
    if (tickedMeals) {
      meals = mealsFromTicks(tickedMeals, { aboard: accommodationType === 'cruise', supplements: supplementKeys ?? [] })
    }

    return {
      day: day.day || index + 1,
      title: day.title || `Day ${index + 1}`,
      description: day.description || '',
      city: day.city || inferCityFromTitle(day.title || '', opts?.defaultCity),
      overnight_city: day.overnight_city || undefined,
      accommodation_type: accommodationType,
      in_transit: inTransit || undefined,
      meals,
      attractions,
      attraction_ids: Array.isArray(day.attraction_ids) ? day.attraction_ids.filter(Boolean).map(String) : undefined,
      services,
      // Parse transport overrides if present
      transport: day.transport || undefined,
      transport_type: sleepingAboard ? 'sleeping_train' : (day.transport_type || undefined),
      transport_rate_id: day.transport_rate_id ? String(day.transport_rate_id) : undefined,
      leg_from: sanitizeLegPlace(day.leg_from),
      leg_to: sanitizeLegPlace(day.leg_to),
      leg_assist: sanitizeLegAssist(day.leg_assist),
      road_transfers: typeof day.road_transfers === 'boolean' ? day.road_transfers : undefined,
      // The supplements the night is sold with (vocabulary keys).
      supplements: supplementKeys,
      // The hotel or ship chosen for this stay, per tier (property-choice).
      property_by_tier: sanitizePropertyChoice(day.property_by_tier),
      // The operator's own transport list, when they changed the day's.
      transport_lines: sanitizeTransportLines(day.transport_lines),
      // Nile Cruise package flag - uses bundled transport instead of individual vehicle costs
      is_cruise_day: day.is_cruise_day || false
    }
  })

  // Cruise boarding and leaving. A day that says so explicitly wins; otherwise
  // the boundary decides: the first night aboard after a night ashore (or no
  // bed) is embarkation, and the first day ashore after a night aboard is
  // disembarkation. Neither was modelled here, so an embarkation day priced no
  // assistance and recorded nothing (operator, NMS803 day 2, 2026-09-16) —
  // although the itinerary generator has always sold both.
  parsed.forEach((d: any, i: number) => {
    const aboard = d.accommodation_type === 'cruise'
    const prevAboard = i > 0 && parsed[i - 1].accommodation_type === 'cruise'
    if (typeof d.services.cruise_embark !== 'boolean') d.services.cruise_embark = aboard && !prevAboard
    if (typeof d.services.cruise_disembark !== 'boolean') d.services.cruise_disembark = !aboard && prevAboard
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
/** overnight_kind values that mean "no bed tonight" (mirrors
 *  lib/itineraries/template-days.ts NO_BED). */
const NO_BED_KINDS = new Set(['none', 'flight', 'in_flight', 'airport'])

/** Hotel board supplements (vocabulary keys) and the meals each one covers. */
const BOARD_MEALS: Record<string, ReadonlyArray<'lunch' | 'dinner'>> = {
  half_board: ['dinner'],
  full_board: ['lunch', 'dinner'],
  all_inclusive: ['lunch', 'dinner'],
  ultra_all_inclusive: ['lunch', 'dinner'],
}

/**
 * Which ticked meals the operator has to BUY, and which are already paid for.
 *
 * - Breakfast is in the hotel or cabin rate: always included.
 * - A day aboard the ship is full board: every meal is in the cabin rate.
 * - A hotel night sold with a board supplement covers the meals that board
 *   includes (half board = dinner; full board and all-inclusive = both).
 * - Any other ticked lunch or dinner is eaten out and costs a meal rate.
 */
export function mealsFromTicks(
  ticked: ReadonlySet<string>,
  ctx: { aboard: boolean; supplements: readonly string[] }
): ItineraryDay['meals'] {
  const boarded = new Set(ctx.supplements.flatMap(k => BOARD_MEALS[k] ?? []))
  const status = (meal: 'breakfast' | 'lunch' | 'dinner'): MealStatus => {
    if (!ticked.has(meal)) return 'none'
    if (meal === 'breakfast' || ctx.aboard) return 'included'
    return boarded.has(meal) ? 'included' : 'external'
  }
  return { breakfast: status('breakfast'), lunch: status('lunch'), dinner: status('dinner') }
}

/**
 * The bed for a day that does not say. Only EXPLICIT wording decides.
 *
 * This used to fall back on the whole programme: if ANY day anywhere mentioned
 * "cruise", every unmarked night — the Cairo hotel after disembarking
 * included — became a cruise night, billed at the ship's rate with no hotel
 * line and no hole. A guess that silently moves a night onto the wrong rate is
 * worse than a hotel night with no rate, which is at least listed and visible.
 */
export function inferAccommodationType(day: any, _allDays?: any[]): AccommodationType {
  if (day.accommodation_type) {
    return day.accommodation_type
  }

  const title = (day.title || '').toLowerCase()
  const description = (day.description || '').toLowerCase()
  const combined = title + ' ' + description

  // Leaving the ship ("disembark" contains "embark") sleeps ashore.
  if (combined.includes('disembark')) {
    return 'hotel'
  }

  // The day itself says it is aboard.
  if (combined.includes('cruise') || combined.includes('cruiser') ||
      combined.includes('sail') || combined.includes('aboard') ||
      combined.includes('on board') || combined.includes('embark')) {
    return 'cruise'
  }

  // The day itself says the trip is leaving.
  if (combined.includes('departure') || combined.includes('fly out') ||
      combined.includes('transfer to airport')) {
    return 'none'
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
// No date prices at the FIRST period. A date outside every period has NO
// rate — `outsidePeriods` comes back true and the caller lists the night as
// an unpriced hole naming the date (lib/rates/rate-seasons periodRatesFor).
// Only a row with no periods at all reads its base columns.

/** Per-person-per-night double rate and single supplement for one night. */
export function resolveHotelRatesForDate(
  row: HotelOrCruiseRow,
  isEurPassport: boolean,
  travelDate?: string | null
): { ppdNight: number; singleSuppNight: number; tripleRedNight: number; seasonName: string | null; outsidePeriods: boolean } {
  const suffix = isEurPassport ? 'eur' : 'non_eur'
  const hit = periodRatesFor(row, 'accommodation', travelDate)
  const ppd = hit ? hit.rates[`pp_double_${suffix}`] : (row[`pp_double_${suffix}`] || 0)
  const supp = hit ? hit.rates[`single_supp_${suffix}`] : (row[`single_supp_${suffix}`] || 0)
  const red = hit ? hit.rates[`triple_red_${suffix}`] : (row[`triple_red_${suffix}`] || 0)
  return {
    ppdNight: Number(ppd) || 0,
    // A negative supplement is a data-entry slip, never a discount.
    singleSuppNight: Math.max(0, Number(supp) || 0),
    // Reduction per person in a triple (lib/pricing/rooming.ts).
    tripleRedNight: Math.max(0, Number(red) || 0),
    seasonName: hit?.season ? seasonNameOf(hit.season) : null,
    outsidePeriods: hit?.outside ?? false,
  }
}

/** The property's special per-night bed rate for a throughout guide ("+1")
 *  on this night's period. Hotels and cruises grant these as concessions, so
 *  the number lives ONLY on the dated periods (rate-seasons `guide_rate`) —
 *  there is no base column to fall back to, and a night no period covers
 *  reads 0, which the caller prices as a HOLE, never a free bed. */
export function resolveGuideBedRateForDate(
  row: HotelOrCruiseRow,
  entity: 'accommodation' | 'cruise',
  travelDate?: string | null
): number {
  const hit = periodRatesFor(row, entity, travelDate)
  return Number(hit?.rates.guide_rate) || 0
}

/** Per-person-per-night double rate and single supplement for one cruise night.
 *  The single supplement is the gap between the single and double cabin rates —
 *  cruises price by cabin type rather than carrying a supplement column. */
export function resolveCruiseRatesForDate(
  row: HotelOrCruiseRow,
  isEurPassport: boolean,
  travelDate?: string | null
): { ppdNight: number; singleSuppNight: number; tripleRedNight: number; seasonName: string | null; outsidePeriods: boolean } {
  const suffix = isEurPassport ? 'eur' : 'non_eur'
  const hit = periodRatesFor(row, 'cruise', travelDate)
  // The legacy flat columns are EUR-only, so a non-EUR passport on a row with
  // no periods falls back to the seasonal low columns before the flat ones.
  const double = hit
    ? hit.rates[`double_${suffix}`]
    : (row[`rate_low_double_${suffix}`] || (isEurPassport ? row.rate_double_eur : 0) || 0)
  const single = hit
    ? hit.rates[`single_${suffix}`]
    : (row[`rate_low_single_${suffix}`] || (isEurPassport ? row.rate_single_eur : 0) || 0)
  const triple = hit
    ? hit.rates[`triple_${suffix}`]
    : (row[`rate_low_triple_${suffix}`] || (isEurPassport ? row.rate_triple_eur : 0) || 0)
  const dbl = Number(double) || 0
  return {
    ppdNight: dbl,
    singleSuppNight: Math.max(0, (Number(single) || 0) - dbl),
    // The triple cabin rate is per person; the reduction is what it saves
    // against the double. A triple rate of 0 means "no triple cabin" — no
    // reduction, not a free cabin.
    tripleRedNight: (Number(triple) || 0) > 0 ? Math.max(0, dbl - (Number(triple) || 0)) : 0,
    seasonName: hit?.season ? seasonNameOf(hit.season) : null,
    outsidePeriods: hit?.outside ?? false,
  }
}

// ============================================
// Ticket legs — flights, day trains, sleeping trains (2026-09-04)
// ============================================
// A marked day rides a per-person ticket instead of a road vehicle. The
// catalogues (flight_rates / train_rates / sleeping_train_rates) were ready
// long before the engine read them; this is the reader. Operator decisions:
// flights always price the economy cabin; a route served by several rows is
// a HOLE unless the day names THE train (transport_rate_id) — exactly-one
// auto-resolves, more is never guessed; the throughout guide ("+1") rides
// at the row's guide_rate, else the customer fare, and sleeps in a SINGLE
// cabin on the sleeping train; no station transfers are emitted.

export interface TicketLeg {
  day: number
  mode: 'flight' | 'train' | 'sleeping_train'
  from: string
  to: string
  rateId?: string
}

/** Cairo's sleeper leaves from Giza station — one city for route matching. */
const STATION_CITY_ALIAS: Record<string, string> = { giza: 'cairo' }
const cityKey = (c: string | null | undefined): string => {
  const k = String(c ?? '').trim().toLowerCase()
  return STATION_CITY_ALIAS[k] ?? k
}

/** The ticket legs an itinerary actually rides, in day order. */
export function collectTicketLegs(itinerary: Array<{ day: number; city: string; transport_type?: string; transport_rate_id?: string; leg_from?: string; leg_to?: string }>): TicketLeg[] {
  const legs: TicketLeg[] = []
  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const mode = day.transport_type
    if (mode === 'flight' || mode === 'train') {
      // The day's own route wins (lib/pricing/flight-leg); else yesterday → today.
      const from = day.leg_from || itinerary[i - 1]?.city
      const to = day.leg_to || day.city
      if (from && to && cityKey(from) !== cityKey(to)) {
        legs.push({ day: day.day, mode, from, to, rateId: day.transport_rate_id })
      }
    } else if (mode === 'sleeping_train') {
      // Board tonight, wake up in the next day's city.
      const from = day.leg_from || day.city
      const to = day.leg_to || itinerary[i + 1]?.city
      if (from && to && cityKey(from) !== cityKey(to)) {
        legs.push({ day: day.day, mode, from, to, rateId: day.transport_rate_id })
      }
    }
  }
  return legs
}

type TicketRow = Record<string, any>
export interface TicketRates { flights: TicketRow[]; trains: TicketRow[]; sleepers: TicketRow[] }

/** Active rows of the catalogues the legs need, currency-normalized. */
async function fetchTicketRates(legs: TicketLeg[], normalizer?: RateNormalizer): Promise<TicketRates> {
  const need = new Set(legs.map(l => l.mode))
  const pull = async (table: 'flight_rates' | 'train_rates' | 'sleeping_train_rates') => {
    const { data } = await supabaseAdmin.from(table).select('*').eq('is_active', true)
    const rows = (data ?? []) as TicketRow[]
    return normalizer ? ((await normalizer.normalize(table, rows)) as TicketRow[]) : rows
  }
  const [flights, trains, sleepers] = await Promise.all([
    need.has('flight') ? pull('flight_rates') : Promise.resolve([]),
    need.has('train') ? pull('train_rates') : Promise.resolve([]),
    need.has('sleeping_train') ? pull('sleeping_train_rates') : Promise.resolve([]),
  ])
  return { flights, trains, sleepers }
}

const routeMatches = (row: TicketRow, leg: TicketLeg, fromCol: string, toCol: string): boolean =>
  cityKey(row[fromCol]) === cityKey(leg.from) && cityKey(row[toCol]) === cityKey(leg.to)

/** The row a leg rides: the named row, else the only candidate, else nothing
 *  — with the candidates handed back so the hole can name them. */
export function resolveTicketRow(
  candidates: TicketRow[],
  rateId: string | undefined
): { row: TicketRow | null; ambiguous: TicketRow[]; namedMissing: boolean } {
  if (rateId) {
    const named = candidates.find(r => String(r.id) === rateId)
    return { row: named ?? null, ambiguous: [], namedMissing: !named }
  }
  if (candidates.length === 1) return { row: candidates[0], ambiguous: [], namedMissing: false }
  return { row: null, ambiguous: candidates, namedMissing: false }
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
export type CruiseStayRates = {
  shipName: string
  ppdNight: number
  singleSuppNight: number
  durationNights: number
  seasonName: string | null
  row: HotelOrCruiseRow
  /** The operator chose this ship on the programme days (lib/pricing/property-choice). */
  chosen: boolean
}

/** Why a CHOSEN property could not be used — the engine names it in the
 *  hole instead of quietly pricing another property. */
export type ChosenPropertyProblem = 'gone' | 'inactive' | 'bad_nights' | 'wrong_tier' | 'wrong_city'

/** A chosen row must still fit the stay it prices: the tier being priced and,
 *  for a hotel, the city it sleeps in — the same match the candidate list
 *  uses. A stay whose city was edited after the choice, or a row re-tiered
 *  since, is a hole asking to choose again, never another city's hotel
 *  priced as "chosen" (Greptile on #453). */
export function chosenRowMismatch(row: Record<string, unknown>, tier: string, city?: string): ChosenPropertyProblem | undefined {
  if (String(row.tier ?? '') !== tier) return 'wrong_tier'
  if (city !== undefined && !String(row.city ?? '').toLowerCase().includes(city.trim().toLowerCase())) return 'wrong_city'
  return undefined
}

export async function getCruiseRates(
  tier: ServiceTier,
  embarkCity?: string,
  isEurPassport: boolean = true,
  travelDate?: string | null,
  /** Converts a row entered in another currency — see lib/rates/rate-currency. */
  normalizer?: RateNormalizer,
  /** A nile_cruises id chosen on the programme days; wins over the automatic pick. */
  chosenId?: string
): Promise<CruiseStayRates | null> {
  return (await resolveCruiseStay(tier, embarkCity, isEurPassport, travelDate, normalizer, chosenId)).rates
}

/** getCruiseRates, saying why a chosen ship could not be used. */
export async function resolveCruiseStay(
  tier: ServiceTier,
  embarkCity?: string,
  isEurPassport: boolean = true,
  travelDate?: string | null,
  normalizer?: RateNormalizer,
  chosenId?: string,
  /** The programme's nights aboard: a sailing that long is preferred. */
  nights?: number
): Promise<{ rates: CruiseStayRates | null; problem?: ChosenPropertyProblem }> {
  try {
    let raw: HotelOrCruiseRow | null
    if (chosenId) {
      const found = await propertyById(supabaseAdmin, 'nile_cruises', chosenId)
      if (!found.row) return { rates: null, problem: found.inactive ? 'inactive' : 'gone' }
      const mismatch = chosenRowMismatch(found.row, tier)
      if (mismatch) return { rates: null, problem: mismatch }
      raw = found.row
    } else {
      // The starred ship first, then newest; a port that matches nothing
      // falls back to every ship at the tier — lib/pricing/property-candidates,
      // the same list the day editor offers.
      raw = (await cruiseCandidates(supabaseAdmin, tier, embarkCity, nights))[0] ?? null
    }
    const cruise = (raw && normalizer
      ? (await normalizer.normalize('nile_cruises', [raw]))?.[0]
      : raw) as Record<string, any> | null | undefined

    if (!cruise) {
      debugLog(`⚠️ No cruise rate for tier ${tier} — flagging hole (no fabrication)`)
      return { rates: null }
    }

    // Rates are per-person PER-NIGHT (double occupancy). Do NOT divide by
    // duration_nights — callers already multiply by the itinerary's cruise
    // nights.
    const safeNights = cruise.duration_nights && cruise.duration_nights > 0
      ? cruise.duration_nights
      : null
    if (!safeNights) {
      console.warn(`⚠️ Cruise ${cruise.ship_name} has invalid duration_nights (${cruise.duration_nights}) — flagging hole (no fabrication)`)
      return { rates: null, problem: chosenId ? 'bad_nights' : undefined }
    }
    const resolved = resolveCruiseRatesForDate(cruise, isEurPassport, travelDate)

    debugLog(`✅ Cruise: ${cruise.ship_name} | Period: ${resolved.seasonName ?? 'base rate'} | PPD/night: ${resolved.ppdNight.toFixed(2)} | SingleSupp/night: ${resolved.singleSuppNight.toFixed(2)}`)

    return {
      rates: {
        shipName: cruise.ship_name,
        ppdNight: resolved.ppdNight,
        singleSuppNight: resolved.singleSuppNight,
        durationNights: safeNights,
        seasonName: resolved.seasonName,
        row: cruise,
        chosen: Boolean(chosenId),
      },
    }
  } catch (err) {
    console.error('Error fetching cruise rates:', err)
    return { rates: null }
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
 * 20260826_rate_seasons); a date no period covers has no rate
 * (periodRatesFor). A hotel CHOSEN on the programme days wins over the
 * automatic pick (lib/pricing/property-choice).
 *
 * `row` comes back with the result so a caller pricing several nights can
 * re-resolve each night's own date against the same catalog row (see
 * resolveHotelRatesForDate) instead of re-querying per night.
 */
export type HotelStayRates = {
  hotelName: string
  ppdNight: number
  singleSuppNight: number
  seasonName: string | null
  row: HotelOrCruiseRow
  /** The operator chose this hotel on the programme days. */
  chosen: boolean
}

/** "Chosen · Summer 2026 · EU passport · per person in a double, per night" */
export function rateSourceNote(src: { chosen: boolean; period: string | null; isEurPassport: boolean; basis: string }): string {
  return [
    src.chosen ? 'Chosen on the day' : 'Automatic pick',
    src.period ? `period "${src.period}"` : 'no dated period (base rate)',
    src.isEurPassport ? 'EU passport' : 'non-EU passport',
    src.basis,
  ].join(' · ')
}

/** The hole message for a chosen hotel or ship that cannot be used. The
 *  engine never swaps in another property for one the operator chose. */
export function chosenPropertyMessage(kind: 'hotel' | 'cruise', problem: ChosenPropertyProblem, city?: string): string {
  const what = kind === 'hotel' ? `The hotel chosen for ${city ?? 'this stay'}` : 'The ship chosen for this sailing'
  const where = kind === 'hotel' ? 'Rates → Hotels' : 'Rates → Cruises'
  if (problem === 'inactive') return `${what} is switched off in ${where}. Switch it back on, or choose another on the day.`
  if (problem === 'bad_nights') return `${what} has no valid number of nights in ${where}. Fix it, or choose another ship on the day.`
  if (problem === 'wrong_tier') return `${what} is not at the tier being priced. Choose again on the day for this tier.`
  if (problem === 'wrong_city') return `${what} is in another city — the stay's city was changed after it was chosen. Choose again on the day.`
  return `${what} is no longer in ${where}. Choose another on the day.`
}

export async function getHotelRates(
  city: string,
  tier: ServiceTier,
  isEurPassport: boolean = true,
  travelDate?: string | null,
  /** Converts a row entered in another currency — see lib/rates/rate-currency. */
  normalizer?: RateNormalizer,
  /** An accommodation_rates id chosen for this city; wins over the automatic pick. */
  chosenId?: string
): Promise<HotelStayRates | null> {
  return (await resolveHotelStay(city, tier, isEurPassport, travelDate, normalizer, chosenId)).rates
}

/** getHotelRates, saying why a chosen hotel could not be used. */
export async function resolveHotelStay(
  city: string,
  tier: ServiceTier,
  isEurPassport: boolean = true,
  travelDate?: string | null,
  normalizer?: RateNormalizer,
  chosenId?: string
): Promise<{ rates: HotelStayRates | null; problem?: ChosenPropertyProblem }> {
  try {
    let raw: HotelOrCruiseRow | null
    if (chosenId) {
      const found = await propertyById(supabaseAdmin, 'accommodation_rates', chosenId)
      if (!found.row) return { rates: null, problem: found.inactive ? 'inactive' : 'gone' }
      const mismatch = chosenRowMismatch(found.row, tier, city)
      if (mismatch) return { rates: null, problem: mismatch }
      raw = found.row
    } else {
      // Newest active hotel in the city at the tier — the same list the day
      // editor offers (lib/pricing/property-candidates). Per the harness
      // policy no adjacent tier and no hardcoded default: a missing exact
      // city+tier rate is a hole the caller flags.
      raw = (await hotelCandidates(supabaseAdmin, city, tier))[0] ?? null
    }
    const hotel = (raw && normalizer
      ? (await normalizer.normalize('accommodation_rates', [raw]))?.[0]
      : raw) as Record<string, any> | null | undefined

    if (!hotel) {
      debugLog(`⚠️ No ${tier} hotel rate for ${city} — flagging hole (no fabrication)`)
      return { rates: null }
    }

    const resolved = resolveHotelRatesForDate(hotel, isEurPassport, travelDate)

    debugLog(`✅ Hotel: ${hotel.property_name} | Period: ${resolved.seasonName ?? 'base rate'} | PPD/night: ${resolved.ppdNight.toFixed(2)} | SingleSupp/night: ${resolved.singleSuppNight.toFixed(2)} (${isEurPassport ? 'EUR' : 'non-EUR'})`)

    return {
      rates: {
        hotelName: hotel.property_name,
        ppdNight: resolved.ppdNight,
        singleSuppNight: resolved.singleSuppNight,
        seasonName: resolved.seasonName,
        row: hotel,
        chosen: Boolean(chosenId),
      },
    }
  } catch (err) {
    console.error('Error fetching hotel rates:', err)
    return { rates: null }
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
    const { data: matched, error } = await supabaseAdmin
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)
    let fees = matched
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

/** The two guide grades the operator sells (2026-09-04): a licensed
 *  Egyptologist, and a senior one at a higher daily rate. Rows are told apart
 *  by guide_rates.guide_type. */
export type GuideGrade = 'egyptologist' | 'senior'

/**
 * Get guide rate.
 *
 * `grade` picks the guide_rates row by guide_type; `duration` by
 * tour_duration — 'full_day' is the ordinary guiding day, 'meet_greet' the
 * cheaper meet/assist-only day a throughout guide bills on arrival and
 * departure days with no sightseeing. For the DEFAULT grade + duration the
 * old any-row-of-this-language behaviour survives as a fallback, so installs
 * whose rows predate grades (guide_type 'licensed', blank durations) price
 * exactly as before; a non-default ask ('senior', 'meet_greet') must match a
 * real row — a hole, never a guess.
 */
export async function getGuideRate(
  language: string,
  tier: ServiceTier,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer,
  opts?: { grade?: GuideGrade; duration?: 'full_day' | 'meet_greet' }
): Promise<{ id: string; name: string; dailyRate: number } | null> {
  const grade = opts?.grade ?? 'egyptologist'
  const duration = opts?.duration ?? 'full_day'
  try {
    // The language is matched EXACTLY, by vocabulary key, in memory: rows
    // hold the word ("Japanese") or the key ("japanese") and callers ask by
    // either (lib/guides/guide-language). It was an ilike substring, so any
    // language whose name contained the one asked for could price the guide.
    const { data: activeRows } = await supabaseAdmin
      .from('guide_rates')
      .select('*')
      .eq('is_active', true)
    const ofLanguage = ((activeRows ?? []) as Record<string, any>[]).filter(r => sameGuideLanguage(r.guide_language, language))

    // 1. Exact grade + duration in guide_rates.
    let rawGuideRate: Record<string, any> | null =
      ofLanguage.find(r => r.guide_type === grade && r.tour_duration === duration) ?? null

    // 2. Default ask only: the pre-grades behaviour (first active row of the
    //    language, any type/duration) so nothing priced yesterday holes today.
    if (!rawGuideRate && grade === 'egyptologist' && duration === 'full_day') {
      rawGuideRate = ofLanguage[0] ?? null
    }
    const guideRate = normalizer && rawGuideRate
      ? (await normalizer.normalize('guide_rates', [rawGuideRate]))?.[0]
      : rawGuideRate

    if (guideRate) {
      const dailyRate = guideRate.base_rate_eur || guideRate.rate_eur || 0
      if (dailyRate > 0) {
        debugLog(`✅ Guide (guide_rates): ${language} | €${dailyRate}/day`)
        return {
          id: guideRate.id,
          name: `${guideLanguageWord(language)} Speaking Guide`,
          dailyRate
        }
      }
    }

    // 3. Legacy fallback to the guides supplier view — default ask only: a
    //    'senior' or 'meet_greet' ask must never be silently priced from a
    //    supplier's generic daily_rate.
    if (grade !== 'egyptologist' || duration !== 'full_day') {
      console.warn(`⚠️ No guide rate for ${language} ${grade}/${duration} — flagging hole (no fabrication)`)
      return null
    }
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
  serviceType: 'checkin_assist' | 'checkout_assist' | 'porter' | 'full_service',
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

    // Road transfers by ROUTE and SHAPE — the only way they are found
    // (lib/pricing/road-trips). Departure is `city` (what the form saves) or
    // `origin_city` when a sheet filled it.
    if (isRoadTransferType(rate.service_type) && rateDeparture(rate) && rate.destination_city) {
      const key = roadRouteKey(rate.service_type, rateDeparture(rate), rate.destination_city, rateTripShape(rate))
      if (!cache.has(key)) cache.set(key, rate)
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
    /** Road transfers: the shape the rate must be; absent = one way. */
    tripShape?: TripShape
  }
): TransportRate | null {
  const { serviceType, city, duration, area, pax, vehicleType, originCity, destinationCity } = params
  const cityLower = city.toLowerCase()

  let record: TransportRate | undefined

  // A road transfer is found by its route and shape ONLY. The city-only keys
  // below matched any road transfer leaving (or arriving in) a city — an
  // Aswan → Luxor day could price Aswan's Hurghada run — or nothing at all,
  // because they looked in the destination (2026-09-17).
  if (isRoadTransferType(serviceType)) {
    if (!originCity || !destinationCity) return null
    record = cache.get(roadRouteKey(serviceType, originCity, destinationCity, params.tripShape ?? 'one_way'))
    if (!record) {
      debugLog(`❌ No road transfer rate: ${serviceType} ${originCity} → ${destinationCity} (${params.tripShape ?? 'one_way'})`)
      return null
    }
    const band = getTransportRateForPax(record, pax)
    return band
      ? { ...record, base_rate_eur: band.rateEur, base_rate_non_eur: band.rateNonEur, vehicle_type: vehicleType || band.vehicleType, capacity_min: band.capacityMin, capacity_max: band.capacityMax }
      : record
  }

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

  // There is deliberately NO "nearby city" fallback. One used to sit here: a
  // missing Aswan → Cairo leg was priced from whichever of Luxor, Aswan,
  // Cairo, Alexandria or Hurghada had any row of the same service type — a
  // 700 km road leg billed as a short hop in another city, with no hole and
  // no warning. A wrong price that looks right is worse than a missing one;
  // a missing one is listed and marks the price incomplete (2026-09-16).

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
    marginPercent = 25,
    guideGrade = 'egyptologist',
    guideMode = 'spot'
  } = params

  debugLog('🚀 Starting day-based pricing calculation (v4):', { templateId, tier, isEurPassport, guideGrade, guideMode })

  const warnings: string[] = []
  const services: PricedService[] = []
  // Holes = rate gaps that make the price non-deliverable. Never auto-filled.
  const holes: PricingHole[] = []
  const addHole = (h: Omit<PricingHole, 'tier'>) => holes.push({ ...h, tier })

  // A service the day needs but the rates cannot price is LISTED, at 0, on
  // its own day — never silently dropped. It adds nothing to any running
  // total (those are separate accumulators below), so the arithmetic is
  // untouched; the hole beside it is what marks the price incomplete.
  type LineShape = Pick<PricedService, 'id' | 'dayNumber' | 'serviceType' | 'serviceName' | 'isPerPax'>
  const zeroLine = (line: LineShape, extra: Pick<PricedService, 'unpriced' | 'included' | 'issue'>): PricedService => ({
    ...line,
    quantity: 1,
    quantityMode: line.isPerPax ? 'per_pax' : 'fixed',
    unitCost: 0,
    lineTotal: 0,
    rateSource: 'none',
    isOptional: false,
    ...extra,
  })
  /** Record the hole AND list the service in its place. */
  const listUnpriced = (line: LineShape, hole: Omit<PricingHole, 'tier'>) => {
    addHole(hole)
    services.push(zeroLine(line, { unpriced: true, issue: hole.message }))
  }
  /** List the service in its place for a hole already recorded once for the trip. */
  const listUnpricedLine = (line: LineShape, message: string) => {
    services.push(zeroLine(line, { unpriced: true, issue: message }))
  }

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
      accommodationNights: [],
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
  // The hotel chosen for each city and the ship chosen for the sailing, at
  // the tier being priced. None = the automatic pick.
  const propertyChoices = choicesForTier(itinerary, tier)

  // Rows entered in another currency (rate_currency, per-rate currency work)
  // are converted into this run's currency at the fetch boundary, so every
  // number downstream is in ONE currency exactly as before. With no such rows
  // this is a no-op that makes no FX call.
  const rateNormalizer = createRateNormalizer(params.rateCurrency ?? DEFAULT_RATE_CURRENCY)

  // The ticket legs this itinerary rides (marked days), before the batch so
  // the catalogues are only queried when a leg needs them.
  const ticketLegs = collectTicketLegs(itinerary)

  const [
    transportCache,
    cruiseTransportPricingRules,
    cruiseStay,
    hotelStays,
    ticketRates,
    guideRate,
    mealRates,
    tippingRates,
    fixedDailyCosts,
    entranceFeeCache,
    airportStaffRows,
    hotelStaffRows,
    attractionAliases,
  ] = await Promise.all([
    buildTransportCache(rateNormalizer),
    // Fetch cruise transport packages from b2b_transport_packages
    fetchCruiseTransportPricingRules(rateNormalizer),
    // Cruise rates only apply when the itinerary has cruise nights
    cruiseNights > 0
      ? resolveCruiseStay(tier, firstCruiseDay?.city, isEurPassport, dateForDay(firstCruiseDay?.day), rateNormalizer, propertyChoices.cruiseId, cruiseNights)
      : Promise.resolve({ rates: null } as Awaited<ReturnType<typeof resolveCruiseStay>>),
    Promise.all(hotelCities.map(city => resolveHotelStay(city, tier, isEurPassport, params.travelDate, rateNormalizer, propertyChoices.hotelByCity.get(city.toLowerCase())))),
    fetchTicketRates(ticketLegs, rateNormalizer),
    getGuideRate(language, tier, rateNormalizer, { grade: guideGrade }),
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
    // Wording the office has taught the alias table (Japanese programme
    // sentences → canonical fee names); see lib/pricing/attractions.ts
    supabaseAdmin
      .from('attraction_aliases')
      .select('alias, canonical_name')
      .eq('is_active', true)
      .then(({ data }) => buildAliasMap(data as { alias: string; canonical_name: string }[] | null)),
  ])

  // A rate whose currency could not be backed by an FX rate was neutralised
  // into the ordinary missing-rate machinery above; say why here so the
  // operator sees "no FX rate", not just "no rate".
  for (const miss of rateNormalizer.misses) {
    warnings.push(`Rate ${miss.id ?? ''} in ${miss.table} is entered in ${miss.currency} and no exchange rate was available — treated as missing`)
  }

  const cruiseRates = cruiseStay.rates
  if (cruiseNights > 0 && !cruiseRates) {
    addHole({
      kind: 'cruise',
      reason: 'missing',
      city: firstCruiseDay?.city,
      lookupAttempted: propertyChoices.cruiseId
        ? `nile_cruises id=${propertyChoices.cruiseId} (chosen)`
        : `nile_cruises tier=${tier} embark~${firstCruiseDay?.city ?? 'any'}`,
      message: cruiseStay.problem
        ? chosenPropertyMessage('cruise', cruiseStay.problem)
        : `No ${tier} cruise rate found. Add it in Rates → Cruises.`,
    })
  }

  const hotelRatesMap = new Map<string, HotelStayRates>()
  // Why a city's CHOSEN hotel could not be used, for its nights' holes.
  const hotelChoiceProblem = new Map<string, ChosenPropertyProblem>()
  hotelCities.forEach((city, idx) => {
    const stay = hotelStays[idx]
    if (stay.rates) hotelRatesMap.set(city, stay.rates)
    else if (stay.problem) hotelChoiceProblem.set(city, stay.problem)
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
  //
  // Check-out has its own type since 2026-09-03 (checkout_assist, entered
  // beside check-in on the Hotel Assistants page); a porter row still
  // covers a check-out day for offices that filed it that way.
  const resolveHotelServiceRate = (
    serviceType: 'checkin_assist' | 'checkout_assist' | 'porter' | 'full_service'
  ): { rate: number | null; rowExists: boolean; via: 'dedicated' | 'porter' | 'full_service' } => {
    const category = getTierCategory(tier)
    const matches = (type: string) =>
      hotelStaffRows.find(
        (r: any) =>
          r.service_type === type &&
          (r.hotel_category === category || r.hotel_category === 'all')
      )
    const dedicated = matches(serviceType)
    if (dedicated) return { rate: usableRate(dedicated.rate_eur), rowExists: true, via: 'dedicated' }
    if (serviceType === 'checkout_assist') {
      const porter = matches('porter')
      if (porter) return { rate: usableRate(porter.rate_eur), rowExists: true, via: 'porter' }
    }
    if (serviceType !== 'full_service') {
      const full = matches('full_service')
      if (full) return { rate: usableRate(full.rate_eur), rowExists: true, via: 'full_service' }
    }
    return { rate: null, rowExists: false, via: 'dedicated' }
  }

  // Throughout mode ("+1"): the guide is with the group every day, so the
  // meet/assist-day rate is fetched too — arrival and departure days with no
  // sightseeing bill at it, not at the full guiding day (operator, 2026-09-04).
  const hasSightseeingDay = (d: (typeof itinerary)[number]) => d.services.guide_required || d.attractions.length > 0
  const meetGreetGuideRate = guideMode === 'throughout'
    ? await getGuideRate(language, tier, rateNormalizer, { grade: guideGrade, duration: 'meet_greet' })
    : null

  // Flag missing rates that the itinerary actually needs (no fabrication).
  const needsGuide = guideMode === 'throughout' || itinerary.some(hasSightseeingDay)
  const noGuideRateMessage = `No ${language} guide rate (${tier}). Add it in Rates → Guides.`
  const noMeetGreetRateMessage = `No ${language} meet/assist-day guide rate (${guideGrade}). A throughout guide bills arrival and departure days at it — add a Guides rate with duration "Meet & Assist day".`
  if (needsGuide && !guideRate) {
    addHole({
      kind: 'guide',
      reason: 'missing',
      lookupAttempted: `guide_rates language~${language} guide_type=${guideGrade} tier=${tier}`,
      message: noGuideRateMessage,
    })
  }
  if (guideMode === 'throughout' && !meetGreetGuideRate && itinerary.some(d => !hasSightseeingDay(d))) {
    addHole({
      kind: 'guide',
      reason: 'missing',
      lookupAttempted: `guide_rates language~${language} guide_type=${guideGrade} tour_duration=meet_greet`,
      message: noMeetGreetRateMessage,
    })
  }
  // One hole per meal TYPE the trip needs and cannot price — a tier with
  // lunch rates but no dinner rate used to price every dinner at 0 with no
  // hole at all (rateFor returns 0, and only a both-zero result was null).
  const needsMeal = (meal: 'lunch' | 'dinner') => itinerary.some(d => d.meals[meal] === 'external')
  const mealRateFor = (meal: 'lunch' | 'dinner'): number => usableRate(mealRates?.[meal]) ?? 0
  const noMealRateMessage = (meal: 'lunch' | 'dinner') =>
    `No ${tier} ${meal} rate. Add one in Rates → Meals.`
  for (const meal of ['lunch', 'dinner'] as const) {
    if (needsMeal(meal) && mealRateFor(meal) <= 0) {
      addHole({
        kind: 'meal',
        reason: mealRates ? 'unpriced' : 'missing',
        lookupAttempted: `meal_rates meal_type=${meal} tier=${tier}`,
        message: noMealRateMessage(meal),
      })
    }
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
    if (guideMode === 'throughout') {
      // The "+1" travels day one to the end: a full guiding fee on
      // sightseeing days, the meet/assist rate on every other day (arrival,
      // departure, transit — he escorts either way).
      if (hasSightseeing && guideRate) {
        fixedCosts += guideRate.dailyRate
        services.push({
          id: `day${day.day}-guide`,
          dayNumber: day.day,
          serviceType: 'guide',
          serviceName: `Throughout Guide — ${language}`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: guideRate.dailyRate,
          lineTotal: guideRate.dailyRate,
          rateSource: 'guides',
          isPerPax: false,
          isOptional: false
        })
      } else if (!hasSightseeing && meetGreetGuideRate) {
        fixedCosts += meetGreetGuideRate.dailyRate
        services.push({
          id: `day${day.day}-guide`,
          dayNumber: day.day,
          serviceType: 'guide',
          serviceName: `Throughout Guide — ${language} (meet/assist day)`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: meetGreetGuideRate.dailyRate,
          lineTotal: meetGreetGuideRate.dailyRate,
          rateSource: 'guides',
          isPerPax: false,
          isOptional: false
        })
      } else if (hasSightseeing) {
        listUnpricedLine({ id: `day${day.day}-guide`, dayNumber: day.day, serviceType: 'guide', serviceName: `Throughout Guide — ${language}`, isPerPax: false }, noGuideRateMessage)
      } else {
        listUnpricedLine({ id: `day${day.day}-guide`, dayNumber: day.day, serviceType: 'guide', serviceName: `Throughout Guide — ${language} (meet/assist day)`, isPerPax: false }, noMeetGreetRateMessage)
      }
    } else if (hasSightseeing && !guideRate) {
      listUnpricedLine({ id: `day${day.day}-guide`, dayNumber: day.day, serviceType: 'guide', serviceName: `${language} Speaking Guide`, isPerPax: false }, noGuideRateMessage)
    } else if (hasSightseeing && guideRate) {
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
        // No driver on a day in the air.
      hasDriver: !day.is_cruise_day && !day.in_transit,
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
    // A flight leg's two ends (lib/pricing/flight-leg). On the arrival day
    // the party is met where the international flight lands — the leg's
    // origin — and, by default, again at the connection's destination.
    const flightLeg = ticketLegs.find(l => l.day === day.day && l.mode === 'flight')
    // The first day on the ground — exactly what the day editor shows as the
    // arrival day, so its ticked assistance is what prices (Greptile on #458).
    const firstGroundedIndex = itinerary.findIndex(d => d.in_transit !== true)
    const isArrivalDay = i === firstGroundedIndex
    const legAssist = flightLeg ? legAssistance(day.leg_assist, isArrivalDay) : { from: false, to: false }
    // On an arrival-day flight the origin-end assistance IS the Meet & Greet
    // where the international flight lands: the checkbox decides it. Every
    // other day keeps the airport_arrival flag.
    const connectionArrival = Boolean(flightLeg && isArrivalDay)
    const meetOnArrival = connectionArrival ? legAssist.from : day.services.airport_arrival
    const assistLine = (place: string, direction: 'arrival' | 'departure', id: string, name: (code: string) => string) => {
      const code = routeAirportCode(place)
      if (!code) {
        listUnpriced({ id, dayNumber: day.day, serviceType: 'airport_service', serviceName: name(place), isPerPax: false }, {
          kind: 'airport_service',
          reason: 'missing',
          dayNumber: day.day,
          city: place,
          lookupAttempted: `airport code for "${place}"`,
          message: `No airport on file for "${place}". Use a city with an airport (Cairo, Luxor, Aswan…) or its three-letter code in the day's route.`,
        })
        return
      }
      const found = resolveAirportServiceRate(code, direction)
      if (found.rate != null) {
        fixedCosts += found.rate
        services.push({
          id, dayNumber: day.day, serviceType: 'airport_service', serviceName: name(code),
          quantity: 1, quantityMode: 'fixed', unitCost: found.rate, lineTotal: found.rate,
          rateSource: 'airport_staff_rates', isPerPax: false, isOptional: false,
        })
      } else {
        listUnpriced({ id, dayNumber: day.day, serviceType: 'airport_service', serviceName: name(code), isPerPax: false }, {
          kind: 'airport_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `airport_staff_rates ${code}/${direction}`,
          message: found.rowExists
            ? `The airport service rate for ${code} (${direction}) has no price. Open it in Rates → Airport Services and set one.`
            : `No airport service rate for ${code} (${direction}). Add it in Rates → Airport Services.`,
        })
      }
    }
    if (flightLeg && legAssist.from && !isArrivalDay) {
      assistLine(flightLeg.from, 'departure', `day${day.day}-airport-leg-from`, code => `Airport Departure Assistance (${code}) — ${flightLeg.from} → ${flightLeg.to}`)
    }
    if (flightLeg && legAssist.to) {
      assistLine(flightLeg.to, 'arrival', `day${day.day}-airport-leg-to`, code => `Airport Arrival Assistance (${code}) — ${flightLeg.from} → ${flightLeg.to}`)
    }
    if (connectionArrival && flightLeg && meetOnArrival && !routeAirportCode(flightLeg.from)) {
      // Landed at a place with no airport on file: a hole naming it, not Cairo.
      assistLine(flightLeg.from, 'arrival', `day${day.day}-airport-arrival`, code => `Airport Meet & Greet (${code})`)
    }

    if (meetOnArrival && !(connectionArrival && flightLeg && !routeAirportCode(flightLeg.from))) {
      // Where the party lands: the connection's origin, else the day's city.
      const airportCode = connectionArrival && flightLeg ? routeAirportCode(flightLeg.from)! : getAirportCode(day.city)
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
        listUnpriced({ id: `day${day.day}-airport-arrival`, dayNumber: day.day, serviceType: 'airport_service', serviceName: `Airport Meet & Greet (${airportCode})`, isPerPax: false }, {
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
        listUnpriced({ id: `day${day.day}-airport-departure`, dayNumber: day.day, serviceType: 'airport_service', serviceName: `Airport Departure Assist (${airportCode})`, isPerPax: false }, {
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
    // The first and last days are FORCED to hotel check-in and check-out
    // (parseItinerary). When the first night is aboard, that "check-in" is the
    // embarkation; when the day follows a night aboard, that "check-out" is the
    // disembarkation. Charging both prices one event twice at the same rate
    // (review of #447). Leaving the ship and then checking INTO a hotel the same
    // day are two real events, and both still charge.
    const checkinIsEmbarkation = Boolean(day.services.cruise_embark) && day.accommodation_type === 'cruise'
    const checkoutIsDisembarkation = Boolean(day.services.cruise_disembark) && previousDay?.accommodation_type === 'cruise'
    if (day.services.hotel_checkin && !checkinIsEmbarkation) {
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
        listUnpriced({ id: `day${day.day}-hotel-checkin`, dayNumber: day.day, serviceType: 'hotel_service', serviceName: 'Hotel Check-in Assistance', isPerPax: false }, {
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

    if (day.services.hotel_checkout && !checkoutIsDisembarkation) {
      const found = resolveHotelServiceRate('checkout_assist')
      const rate = found.rate
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-hotel-checkout`,
          dayNumber: day.day,
          serviceType: 'hotel_service',
          serviceName:
            found.via === 'full_service' ? 'Hotel Assistance — check-out (full service)'
            : found.via === 'porter' ? 'Hotel Check-out & Porter'
            : 'Hotel Check-out Assistance',
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'hotel_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        listUnpriced({ id: `day${day.day}-hotel-checkout`, dayNumber: day.day, serviceType: 'hotel_service', serviceName: 'Hotel Check-out Assistance', isPerPax: false }, {
          kind: 'hotel_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `hotel_staff_rates checkout_assist|porter tier=${tier}`,
          message: found.rowExists
            ? `The hotel check-out assistance rate (${tier}) has no price. Open it in Rates → Hotel Assistants and set one.`
            : `No hotel check-out assistance rate (${tier}). Add it in Rates → Hotel Assistants.`,
        })
      }
    }

    // ----- CRUISE BOARDING / LEAVING ASSISTANCE (fixed per service) -----
    // Priced from the hotel assistance rates — check-in for boarding,
    // check-out (or porter, or full service) for leaving — the same source the
    // itinerary generator has always used for these lines
    // (lib/ai/service-creation). No separate rate type exists yet.
    for (const event of ['embark', 'disembark'] as const) {
      if (!(event === 'embark' ? day.services.cruise_embark : day.services.cruise_disembark)) continue
      const found = resolveHotelServiceRate(event === 'embark' ? 'checkin_assist' : 'checkout_assist')
      const serviceName = event === 'embark' ? 'Cruise Embarkation Assistance' : 'Cruise Disembarkation Assistance'
      const line = { id: `day${day.day}-cruise-${event}`, dayNumber: day.day, serviceType: 'hotel_service', serviceName, isPerPax: false }
      if (found.rate != null) {
        fixedCosts += found.rate
        services.push({
          ...line,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: found.rate,
          lineTotal: found.rate,
          rateSource: 'hotel_staff_rates',
          isOptional: false,
          notes: event === 'embark' ? 'Priced at the hotel check-in assistance rate' : 'Priced at the hotel check-out assistance rate',
        })
      } else {
        const what = event === 'embark' ? 'check-in' : 'check-out'
        listUnpriced(line, {
          kind: 'hotel_service',
          reason: found.rowExists ? 'unpriced' : 'missing',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `hotel_staff_rates ${event === 'embark' ? 'checkin_assist' : 'checkout_assist|porter'} tier=${tier} (cruise ${event})`,
          message: found.rowExists
            ? `Cruise ${event}ation assistance is priced at the hotel ${what} assistance rate (${tier}), which has no price. Set it in Rates → Hotel Assistants.`
            : `Cruise ${event}ation assistance is priced at the hotel ${what} assistance rate, and there is none (${tier}). Add it in Rates → Hotel Assistants.`,
        })
      }
    }
  }

  // ============================================
  // STEP 7: Calculate PER-PAX costs (base rates)
  // ============================================

  let accommodationPPD = 0
  // Supplements the days ask for — per person per night, on top of the
  // room, outside the rooming rule (a view costs the same in a single).
  let supplementsPerPax = 0
  // Every night's three contract figures, for the rooming rule below
  // (lib/pricing/rooming.ts): a solo traveller pays the supplement, a triple
  // takes the reduction. The per-person lines stay per-person-in-double.
  const accommodationNights: NightRates[] = []

  // A night that none of a hotel's or ship's dated periods covers has NO
  // rate: it is listed as unpriced, naming the date. It used to price from
  // the base columns (a copy of the first period) with only a warning — the
  // Al Farida's only period ended 31 Oct and a 3 Nov sailing priced silently
  // from it (2026-09-03). There is no default period (operator, 2026-09-16).
  // One guide-bed hole per property, not one per night.
  const guideBedHoleNamed = new Set<string>()

  // Hotel PPD — use overnight_city for day trips (e.g., Alexandria day trip sleeps in Cairo)
  for (const day of hotelDays) {
    const hotelCity = day.overnight_city || day.city
    const hotelRate = hotelRatesMap.get(hotelCity)
    if (hotelRate) {
      // This night's own period, not the stay's first night — see dateForDay.
      const nightly = resolveHotelRatesForDate(
        hotelRate.row, isEurPassport, dateForDay(day.day)
      )
      if (nightly.ppdNight > 0) {
        accommodationNights.push({ ppd: nightly.ppdNight, singleSupp: nightly.singleSuppNight, tripleRed: nightly.tripleRedNight })
        accommodationPPD += nightly.ppdNight
        services.push({
          id: `day${day.day}-hotel`,
          dayNumber: day.day,
          serviceType: 'accommodation',
          serviceName: `Hotel - ${hotelRate.hotelName} (${hotelCity})`,
          propertyName: hotelRate.hotelName,
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: nightly.ppdNight,
          lineTotal: nightly.ppdNight,
          rateSource: 'accommodation_rates',
          isPerPax: true,
          isOptional: false,
          // Where the number came from, so the operator can check it against
          // the contract: the property, chosen or automatic, the period and
          // the passport group (operator, 2026-09-16).
          notes: rateSourceNote({
            chosen: hotelRate.chosen,
            period: nightly.seasonName,
            isEurPassport,
            basis: 'per person in a double, per night',
          })
        })
      } else {
        // The row exists and its per-person-double for this night is blank.
        // This used to price the night at 0.00 with no hole — the one bed
        // path that never went through the "blank is not a price" rule the
        // guide and assistance rates already follow.
        listUnpriced({ id: `day${day.day}-hotel`, dayNumber: day.day, serviceType: 'accommodation', serviceName: `Hotel - ${hotelRate.hotelName} (${hotelCity})`, isPerPax: true }, {
          kind: 'hotel',
          reason: 'unpriced',
          dayNumber: day.day,
          city: hotelCity,
          lookupAttempted: `accommodation_rates ${hotelRate.hotelName} pp_double ${dateForDay(day.day) ?? 'base'}`,
          message: nightly.outsidePeriods
            ? `None of ${hotelRate.hotelName}'s rate periods covers ${dateForDay(day.day)}. Add a period for that date in Rates → Hotels.`
            : `${hotelRate.hotelName} has no per-person double rate for ${dateForDay(day.day) ?? 'this night'}. Fill it in Rates → Hotels.`,
        })
      }

      // The supplements this night is sold with — a view, a floor, a meal
      // plan from the agency's own list — each at the hotel's per-person
      // price for this night's period. Included in the price. One the hotel
      // does not price is a hole: the customer asked for it, so it is never
      // quietly dropped or quietly free.
      for (const supp of resolveSupplementsForDate(hotelRate.row, 'accommodation', isEurPassport, dateForDay(day.day), day.supplements ?? [])) {
        if (supp.night > 0) {
          accommodationPPD += supp.night
          supplementsPerPax += supp.night
          services.push({
            id: `day${day.day}-hotel-supp-${supp.key}`,
            dayNumber: day.day,
            serviceType: 'accommodation',
            serviceName: `Hotel supplement - ${supp.name} (${hotelRate.hotelName})`,
            quantity: 1,
            quantityMode: 'per_pax',
            unitCost: supp.night,
            lineTotal: supp.night,
            rateSource: 'accommodation_rates',
            isPerPax: true,
            isOptional: false,
            notes: nightly.seasonName ? `Per person per night — ${nightly.seasonName}` : 'Per person per night'
          })
        } else {
          listUnpriced({ id: `day${day.day}-hotel-supp-${supp.key}`, dayNumber: day.day, serviceType: 'accommodation', serviceName: `Hotel supplement - ${supp.name} (${hotelRate.hotelName})`, isPerPax: true }, {
            kind: 'hotel',
            reason: supp.carried ? 'unpriced' : 'missing',
            dayNumber: day.day,
            city: hotelCity,
            lookupAttempted: `accommodation_rates ${hotelRate.hotelName} supplement=${supp.key}`,
            message: supp.carried
              ? `${hotelRate.hotelName} has no price for the "${supp.name}" supplement on the period covering ${dateForDay(day.day) ?? 'this night'}. Fill it on the hotel's rate periods in Rates → Hotels.`
              : `${hotelRate.hotelName} does not carry the "${supp.name}" supplement this day asks for. Add it to the hotel in Rates → Hotels, or take it off the day.`,
          })
        }
      }

      // The "+1" guide sleeps where the group sleeps, at the hotel's special
      // guide rate for this night's period. Blank = hole, never a free bed.
      if (guideMode === 'throughout') {
        const guideBed = resolveGuideBedRateForDate(hotelRate.row, 'accommodation', dateForDay(day.day))
        if (guideBed > 0) {
          fixedCosts += guideBed
          services.push({
            id: `day${day.day}-guide-bed`,
            dayNumber: day.day,
            serviceType: 'accommodation',
            serviceName: `Throughout Guide — bed (${hotelRate.hotelName})`,
            quantity: 1,
            quantityMode: 'fixed',
            unitCost: guideBed,
            lineTotal: guideBed,
            rateSource: 'accommodation_rates',
            isPerPax: false,
            isOptional: false
          })
        } else {
          const guideBedMessage = `${hotelRate.hotelName} has no throughout-guide bed rate on the period covering this stay. Open the hotel in Rates → Hotels and fill "Guide bed / night" on its rate periods.`
          const guideBedLine = { id: `day${day.day}-guide-bed`, dayNumber: day.day, serviceType: 'accommodation', serviceName: `Throughout Guide — bed (${hotelRate.hotelName})`, isPerPax: false }
          // One hole per property, but every night it affects is listed.
          if (!guideBedHoleNamed.has(hotelRate.hotelName)) {
            guideBedHoleNamed.add(hotelRate.hotelName)
            listUnpriced(guideBedLine, {
              kind: 'guide',
              reason: 'unpriced',
              dayNumber: day.day,
              city: hotelCity,
              lookupAttempted: `accommodation_rates ${hotelRate.hotelName} period guide_rate`,
              message: guideBedMessage,
            })
          } else {
            listUnpricedLine(guideBedLine, guideBedMessage)
          }
        }
      }
    } else {
      const problem = hotelChoiceProblem.get(hotelCity)
      listUnpriced({ id: `day${day.day}-hotel`, dayNumber: day.day, serviceType: 'accommodation', serviceName: `Hotel (${hotelCity})`, isPerPax: true }, {
        kind: 'hotel',
        reason: 'missing',
        dayNumber: day.day,
        city: hotelCity,
        lookupAttempted: problem
          ? `accommodation_rates id=${propertyChoices.hotelByCity.get(hotelCity.toLowerCase())} (chosen)`
          : `accommodation_rates city~${hotelCity} tier=${tier}`,
        message: problem
          ? chosenPropertyMessage('hotel', problem, hotelCity)
          : `No ${tier} hotel rate for "${hotelCity}". Add it in Rates → Hotels.`,
      })
    }
  }

  // Cruise PPD — each night at its own period's rate, so a sailing that crosses
  // into peak is not billed at the rate of the night it embarked.
  if (cruiseRates && cruiseNights > 0) {
    const nightly = cruiseDays.map(day => {
      return resolveCruiseRatesForDate(cruiseRates.row, isEurPassport, dateForDay(day.day))
    })
    // One line per night, each on its own day. This was a single line for the
    // whole sailing parked on the first cruise day, so a four-night cruise
    // read as nothing on days three to five and the day-by-day breakdown had
    // three nights with no bed (operator, 2026-09-16). The total is the same
    // sum. A night the ship has no double rate for is LISTED at 0 — it used to
    // add a silent 0.00 into that single line.
    let cruiseNightHoleAdded = false
    cruiseDays.forEach((day, k) => {
      const n = nightly[k]
      const line = {
        id: `day${day.day}-cruise`,
        dayNumber: day.day,
        serviceType: 'cruise',
        serviceName: `Nile Cruise - ${cruiseRates.shipName} (night ${k + 1} of ${cruiseNights})`,
        isPerPax: true,
        propertyName: cruiseRates.shipName,
      }
      if (n.ppdNight > 0) {
        accommodationNights.push({ ppd: n.ppdNight, singleSupp: n.singleSuppNight, tripleRed: n.tripleRedNight })
        accommodationPPD += n.ppdNight
        services.push({
          ...line,
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: n.ppdNight,
          lineTotal: n.ppdNight,
          rateSource: 'nile_cruises',
          isOptional: false,
          // No currency symbol: the result carries the org's rate currency.
          notes: rateSourceNote({
            chosen: cruiseRates.chosen,
            period: n.seasonName,
            isEurPassport,
            basis: 'per person in a double cabin, per night',
          }),
        })
        return
      }
      const message = n.outsidePeriods
        ? `None of ${cruiseRates.shipName}'s rate periods covers ${dateForDay(day.day)}. Add a period for that date in Rates → Cruises.`
        : `${cruiseRates.shipName} has no per-person double cabin rate for ${dateForDay(day.day) ?? 'this night'}. Fill it in Rates → Cruises.`
      if (!cruiseNightHoleAdded) {
        cruiseNightHoleAdded = true
        listUnpriced(line, {
          kind: 'cruise',
          reason: 'unpriced',
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `nile_cruises ${cruiseRates.shipName} double ${dateForDay(day.day) ?? 'base'}`,
          message,
        })
      } else {
        listUnpricedLine(line, message)
      }
    })

    // The supplements the sailing is sold with — a deck, a balcony from the
    // agency's own list — each night at that night's period price, one line
    // per supplement for the sailing. Included in the price. A night the
    // ship does not price is a hole for the whole sailing, never free.
    const cruiseSuppKeys = [...new Set(cruiseDays.flatMap(day => day.supplements ?? []))]
    for (const key of cruiseSuppKeys) {
      const perNightSupp = cruiseDays
        .filter(day => (day.supplements ?? []).includes(key))
        .map(day => resolveSupplementsForDate(cruiseRates.row, 'cruise', isEurPassport, dateForDay(day.day), [key])[0])
      const nightsAsked = perNightSupp.length
      const carried = perNightSupp.some(n => n.carried)
      const name = perNightSupp.find(n => n.carried)?.name ?? key
      if (carried && perNightSupp.every(n => n.night > 0)) {
        const total = perNightSupp.reduce((sum, n) => sum + n.night, 0)
        accommodationPPD += total
        supplementsPerPax += total
        services.push({
          id: `cruise-supp-${key}`,
          dayNumber: cruiseDays[0]?.day || 1,
          serviceType: 'cruise',
          serviceName: `Cruise supplement - ${name}, ${cruiseRates.shipName} (${nightsAsked} nights)`,
          quantity: nightsAsked,
          quantityMode: 'per_pax',
          unitCost: total / nightsAsked,
          lineTotal: total,
          rateSource: 'nile_cruises',
          isPerPax: true,
          isOptional: false,
          notes: `Per person per night × ${nightsAsked} nights`
        })
      } else {
        listUnpriced({ id: `day${cruiseDays[0]?.day || 1}-cruise-supp-${key}`, dayNumber: cruiseDays[0]?.day || 1, serviceType: 'cruise', serviceName: `Cruise supplement - ${name}, ${cruiseRates.shipName}`, isPerPax: true }, {
          kind: 'cruise',
          reason: carried ? 'unpriced' : 'missing',
          dayNumber: cruiseDays[0]?.day || 1,
          city: cruiseDays[0]?.city || '',
          lookupAttempted: `nile_cruises ${cruiseRates.shipName} supplement=${key}`,
          message: carried
            ? `${cruiseRates.shipName} has no price for the "${name}" supplement on a period this sailing covers. Fill it on the ship's rate periods in Rates → Cruises.`
            : `${cruiseRates.shipName} does not carry the "${name}" supplement the sailing asks for. Add it to the ship in Rates → Cruises, or take it off the days.`,
        })
      }
    }

    // The "+1" guide's cabin, each night at that night's period guide_rate.
    // Any night without one is a hole for the whole sailing — never free.
    if (guideMode === 'throughout') {
      const guideNights = cruiseDays.map(day =>
        resolveGuideBedRateForDate(cruiseRates.row, 'cruise', dateForDay(day.day)))
      if (guideNights.every(n => n > 0)) {
        const guideCabinTotal = guideNights.reduce((s, n) => s + n, 0)
        fixedCosts += guideCabinTotal
        services.push({
          id: `cruise-guide-cabin`,
          dayNumber: cruiseDays[0]?.day || 1,
          serviceType: 'cruise',
          serviceName: `Throughout Guide — cabin, ${cruiseRates.shipName} (${cruiseNights} nights)`,
          quantity: cruiseNights,
          quantityMode: 'fixed',
          unitCost: guideCabinTotal / cruiseNights,
          lineTotal: guideCabinTotal,
          rateSource: 'nile_cruises',
          isPerPax: false,
          isOptional: false
        })
      } else {
        listUnpriced({ id: `day${cruiseDays[0]?.day || 1}-guide-cabin`, dayNumber: cruiseDays[0]?.day || 1, serviceType: 'cruise', serviceName: `Throughout Guide — cabin, ${cruiseRates.shipName} (${cruiseNights} nights)`, isPerPax: false }, {
          kind: 'guide',
          reason: 'unpriced',
          dayNumber: cruiseDays[0]?.day,
          lookupAttempted: `nile_cruises ${cruiseRates.shipName} period guide_rate`,
          message: `${cruiseRates.shipName} has no throughout-guide cabin rate on every night of this sailing. Open the ship in Rates → Cruises and fill "Guide bed / night" on its rate periods.`,
        })
      }
    }
  } else if (cruiseNights > 0) {
    // No ship at all for this tier: the hole was recorded once above; every
    // night aboard is still listed on its own day.
    cruiseDays.forEach((day, k) => listUnpricedLine(
      { id: `day${day.day}-cruise`, dayNumber: day.day, serviceType: 'cruise', serviceName: `Nile Cruise (night ${k + 1} of ${cruiseNights})`, isPerPax: true },
      `No ${tier} cruise rate found. Add it in Rates → Cruises.`,
    ))
  }

  // ----- Ticket legs: flights, day trains, sleeping trains (per pax) -----
  // Marked days ride a per-person ticket (operator decisions 2026-09-04):
  // flights price the economy cabin always; a route served by several rows
  // needs the day to name THE train — exactly one auto-resolves, more is a
  // hole; the sleeping-train ticket IS that night's bed (the night joins
  // accommodationNights so the solo traveller pays the Single-cabin gap);
  // the throughout guide rides every leg at the row's guide_rate, else the
  // customer fare, and takes a SINGLE cabin on the sleeper.
  let ticketsPerPax = 0
  const money = (v: unknown): number => Number(v) || 0
  const flightFare = (r: Record<string, any>): number =>
    (isEurPassport ? money(r.base_rate_eur) : money(r.base_rate_non_eur) || money(r.base_rate_eur)) +
    (isEurPassport ? money(r.tax_eur) : money(r.tax_non_eur) || money(r.tax_eur))

  for (const leg of ticketLegs) {
    const routeLabel = `${leg.from} → ${leg.to}`

    if (leg.mode === 'flight') {
      const candidates = ticketRates.flights.filter(r =>
        cityKey(r.route_from) === cityKey(leg.from) && cityKey(r.route_to) === cityKey(leg.to) &&
        /econom/i.test(String(r.cabin_class ?? 'economy')))
      const pick = resolveTicketRow(candidates, leg.rateId)
      if (pick.row) {
        const fare = flightFare(pick.row)
        ticketsPerPax += fare
        services.push({
          id: `day${leg.day}-ticket-flight`, dayNumber: leg.day, serviceType: 'flight',
          serviceName: `Domestic Flight ${routeLabel} (${pick.row.airline ?? 'economy'})`,
          quantity: 1, quantityMode: 'per_pax', unitCost: fare, lineTotal: fare,
          rateSource: 'flight_rates', isPerPax: true, isOptional: false,
          notes: money(pick.row.tax_eur) > 0 ? 'Fare incl. tax, per person' : 'Per person',
        })
        if (guideMode === 'throughout') {
          const gFare = pick.row.guide_rate != null ? money(pick.row.guide_rate) : flightFare(pick.row)
          fixedCosts += gFare
          services.push({
            id: `day${leg.day}-guide-ticket`, dayNumber: leg.day, serviceType: 'flight',
            serviceName: `Throughout Guide — flight ${routeLabel}`,
            quantity: 1, quantityMode: 'fixed', unitCost: gFare, lineTotal: gFare,
            rateSource: 'flight_rates', isPerPax: false, isOptional: false,
            notes: pick.row.guide_rate != null ? 'Guide fare' : 'Customer fare (no guide fare entered)',
          })
        }
      } else {
        listUnpriced({ id: `day${leg.day}-ticket-flight`, dayNumber: leg.day, serviceType: 'flight', serviceName: `Domestic Flight ${routeLabel}`, isPerPax: true }, {
          kind: 'transport', reason: pick.ambiguous.length ? 'fuzzy' : 'missing',
          dayNumber: leg.day, city: leg.to,
          lookupAttempted: `flight_rates ${routeLabel} economy${leg.rateId ? ` id=${leg.rateId}` : ''}`,
          message: pick.namedMissing
            ? `The flight picked for day ${leg.day} (${routeLabel}) is no longer in Rates → Flights. Pick it again on the day.`
            : pick.ambiguous.length
              ? `${pick.ambiguous.length} flights serve ${routeLabel} (${[...new Set(pick.ambiguous.map(r => r.airline))].join(', ')}). Pick the exact flight on the day.`
              : `No economy flight rate for ${routeLabel}. Add it in Rates → Flights.`,
        })
      }
      continue
    }

    if (leg.mode === 'train') {
      const candidates = ticketRates.trains.filter(r =>
        cityKey(r.origin_city) === cityKey(leg.from) && cityKey(r.destination_city) === cityKey(leg.to))
      const pick = resolveTicketRow(candidates, leg.rateId)
      if (pick.row) {
        const fare = money(pick.row.rate_eur)
        ticketsPerPax += fare
        services.push({
          id: `day${leg.day}-ticket-train`, dayNumber: leg.day, serviceType: 'transportation',
          serviceName: `Train ${routeLabel}${pick.row.class_type ? ` (${pick.row.class_type})` : ''}`,
          quantity: 1, quantityMode: 'per_pax', unitCost: fare, lineTotal: fare,
          rateSource: 'train_rates', isPerPax: true, isOptional: false,
          notes: pick.row.operator_name ? `Per person — ${pick.row.operator_name}` : 'Per person',
        })
        if (guideMode === 'throughout') {
          const gFare = pick.row.guide_rate != null ? money(pick.row.guide_rate) : fare
          fixedCosts += gFare
          services.push({
            id: `day${leg.day}-guide-ticket`, dayNumber: leg.day, serviceType: 'transportation',
            serviceName: `Throughout Guide — train ${routeLabel}`,
            quantity: 1, quantityMode: 'fixed', unitCost: gFare, lineTotal: gFare,
            rateSource: 'train_rates', isPerPax: false, isOptional: false,
            notes: pick.row.guide_rate != null ? 'Guide fare' : 'Customer fare (no guide fare entered)',
          })
        }
      } else {
        listUnpriced({ id: `day${leg.day}-ticket-train`, dayNumber: leg.day, serviceType: 'transportation', serviceName: `Train ${routeLabel}`, isPerPax: true }, {
          kind: 'transport', reason: pick.ambiguous.length ? 'fuzzy' : 'missing',
          dayNumber: leg.day, city: leg.to,
          lookupAttempted: `train_rates ${routeLabel}${leg.rateId ? ` id=${leg.rateId}` : ''}`,
          message: pick.namedMissing
            ? `The train picked for day ${leg.day} (${routeLabel}) is no longer in Rates → Trains. Pick it again on the day.`
            : pick.ambiguous.length
              ? `${pick.ambiguous.length} trains serve ${routeLabel} (${[...new Set(pick.ambiguous.map(r => r.operator_name || r.class_type || r.service_code))].join(', ')}). Pick the exact train on the day.`
              : `No train rate for ${routeLabel}. Add it in Rates → Trains.`,
        })
      }
      continue
    }

    // Sleeping train. One TRAIN is a pair of cabin rows (Half Twin + Single)
    // sharing route, supplier and validity; the group of two pax shares Half
    // Twins, a solo traveller takes a Single (the rooming rule, via
    // accommodationNights), and the guide sleeps in a Single.
    const routeRows = ticketRates.sleepers.filter(r =>
      cityKey(r.origin_city) === cityKey(leg.from) && cityKey(r.destination_city) === cityKey(leg.to))
    const trainKey = (r: Record<string, any>) => `${r.supplier_id ?? r.operator_name ?? ''}|${r.rate_valid_from ?? ''}`
    let chosenKey: string | null = null
    let namedMissing = false
    if (leg.rateId) {
      const named = routeRows.find(r => String(r.id) === leg.rateId)
      if (named) chosenKey = trainKey(named)
      else namedMissing = true
    } else {
      const keys = [...new Set(routeRows.map(trainKey))]
      if (keys.length === 1) chosenKey = keys[0]
    }
    const trainRows = chosenKey !== null ? routeRows.filter(r => trainKey(r) === chosenKey) : []
    const halfTwin = trainRows.find(r => /half/i.test(String(r.cabin_type ?? '')))
    const single = trainRows.find(r => /single/i.test(String(r.cabin_type ?? '')))
    if (halfTwin) {
      const htFare = money(halfTwin.rate_oneway_eur)
      const sgFare = single ? money(single.rate_oneway_eur) : 0
      // The night aboard: the ticket is the bed, so it joins the rooming
      // nights (solo pays the Single gap) instead of ticketsPerPax.
      accommodationNights.push({ ppd: htFare, singleSupp: Math.max(0, sgFare - htFare), tripleRed: 0 })
      accommodationPPD += htFare
      singleSupplement += Math.max(0, sgFare - htFare)
      services.push({
        id: `day${leg.day}-ticket-sleeper`, dayNumber: leg.day, serviceType: 'transportation',
        serviceName: `Sleeping Train ${routeLabel} (Half Twin)`,
        quantity: 1, quantityMode: 'per_pax', unitCost: htFare, lineTotal: htFare,
        rateSource: 'sleeping_train_rates', isPerPax: true, isOptional: false,
        notes: 'Per person sharing — the ticket is the night\'s bed',
      })
      if (!single) warnings.push(`No Single-cabin rate for the sleeping train ${routeLabel} — solo supplement (and the guide's cabin) priced from Half Twin.`)
      if (guideMode === 'throughout') {
        const guideRow = single ?? halfTwin
        const gFare = guideRow.guide_rate != null ? money(guideRow.guide_rate) : money(guideRow.rate_oneway_eur)
        fixedCosts += gFare
        services.push({
          id: `day${leg.day}-guide-ticket`, dayNumber: leg.day, serviceType: 'transportation',
          serviceName: `Throughout Guide — sleeping train ${routeLabel} (Single)`,
          quantity: 1, quantityMode: 'fixed', unitCost: gFare, lineTotal: gFare,
          rateSource: 'sleeping_train_rates', isPerPax: false, isOptional: false,
          notes: guideRow.guide_rate != null ? 'Guide fare' : 'Customer fare (no guide fare entered)',
        })
      }
    } else {
      const trainNames = [...new Set(routeRows.map(r => r.operator_name || r.service_code))]
      listUnpriced({ id: `day${leg.day}-ticket-sleeper`, dayNumber: leg.day, serviceType: 'transportation', serviceName: `Sleeping Train ${routeLabel}`, isPerPax: true }, {
        kind: 'transport', reason: chosenKey === null && routeRows.length > 0 && !namedMissing ? 'fuzzy' : 'missing',
        dayNumber: leg.day, city: leg.to,
        lookupAttempted: `sleeping_train_rates ${routeLabel}${leg.rateId ? ` id=${leg.rateId}` : ''}`,
        message: namedMissing
          ? `The sleeping train picked for day ${leg.day} (${routeLabel}) is no longer in Rates → Sleeping Trains. Pick it again on the day.`
          : chosenKey === null && routeRows.length > 0
            ? `${[...new Set(routeRows.map(trainKey))].length} sleeping trains serve ${routeLabel} (${trainNames.join(', ')}). Pick the exact train on the day.`
            : `No Half Twin sleeping-train rate for ${routeLabel}. Add it in Rates → Sleeping Trains.`,
      })
    }
  }

  // A day marked flight, train or sleeping train that yields no leg — the day
  // before (the day after, for a sleeper) has no city or the same city — used
  // to price nothing and record nothing: a free flight. List it on its day so
  // the missing route is visible.
  const legDays = new Set(ticketLegs.map(l => l.day))
  for (const day of itinerary) {
    const mode = day.transport_type
    if (mode !== 'flight' && mode !== 'train' && mode !== 'sleeping_train') continue
    if (legDays.has(day.day)) continue
    const slug = mode === 'sleeping_train' ? 'sleeper' : mode
    const label = mode === 'flight' ? 'Domestic Flight' : mode === 'train' ? 'Train' : 'Sleeping Train'
    listUnpriced({ id: `day${day.day}-ticket-${slug}`, dayNumber: day.day, serviceType: mode === 'flight' ? 'flight' : 'transportation', serviceName: `${label} (route not set)`, isPerPax: true }, {
      kind: 'transport',
      reason: 'missing',
      dayNumber: day.day,
      city: day.city,
      lookupAttempted: `ticket leg day ${day.day} (${mode}) — no distinct origin and destination`,
      message: mode === 'sleeping_train'
        ? `Day ${day.day} is marked sleeping train, but the next day has no city or the same one, so there is no route to price. Set the city on both days.`
        : `Day ${day.day} is marked ${mode}, but the day before has no city or the same one, so there is no route to price. Set the city on both days.`,
    })
  }

  // ----- Entrance Fees (per pax) -----
  let entranceFeesPerPax = 0
  const processedAttractions = new Set<string>()

  // entranceFeeCache was fetched ONCE in the Step 4 parallel batch above;
  // attractions are matched in memory here — was a per-attraction query
  // (+ full-table scan on each miss) inside the loop below.

  const resolved = resolveAttractions(itinerary, entranceFeeCache, attractionAliases, isEurPassport)
  for (const fee of resolved.tickets) {
    processedAttractions.add(fee.name.toLowerCase())
    // A free site (rate 0, e.g. Colossi of Memnon) is a resolved visit with
    // nothing to charge — not a missing rate. Listed so the day reads whole.
    if (fee.rate <= 0) {
      services.push(zeroLine(
        { id: `entrance-${fee.id}`, dayNumber: fee.day, serviceType: 'entrance', serviceName: fee.name, isPerPax: true },
        { included: true, issue: 'Free entry' },
      ))
      continue
    }
    entranceFeesPerPax += fee.rate
    services.push({
      id: `entrance-${fee.id}`,
      dayNumber: fee.day,
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
  }
  // A sight the programme names that matched no fee. It may be free (a photo
  // stop), or a ticket nobody has taught the alias table yet — the engine
  // cannot tell, so it is a note on its day, not a hole. It used to live only
  // in the warnings list, away from the day it belongs to.
  resolved.unresolved.forEach((miss, i) => {
    warnings.push(`No entrance fee found for "${miss.text}"`)
    services.push(zeroLine(
      { id: `day${miss.day}-entrance-unmatched-${i}`, dayNumber: miss.day, serviceType: 'entrance', serviceName: miss.text, isPerPax: true },
      { issue: 'No entrance fee matched. Pick the ticket on the day if one is needed.' },
    ))
  })
  resolved.missingIds.forEach((miss, i) => {
    warnings.push(`Day ${miss.day}: picked attraction ${miss.id} is no longer in the entrance fees table`)
    services.push(zeroLine(
      { id: `day${miss.day}-entrance-missing-${i}`, dayNumber: miss.day, serviceType: 'entrance', serviceName: 'Picked ticket', isPerPax: true },
      { issue: 'The ticket picked for this day is no longer in Rates → Entrance Fees. Pick it again on the day.' },
    ))
  })

  // ----- External Meals (per pax) -----
  let externalMealsPerPax = 0

  const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' } as const
  const includedMealReason = (day: ItineraryDay, meal: 'breakfast' | 'lunch' | 'dinner'): string => {
    if (day.accommodation_type === 'cruise') return 'Included aboard the cruise'
    if (meal === 'breakfast') return 'Included in the hotel rate'
    return 'Included in the hotel board'
  }

  for (const day of itinerary) {
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      const status = day.meals[meal]
      const line = { id: `day${day.day}-${meal}`, dayNumber: day.day, serviceType: 'meal', serviceName: MEAL_LABEL[meal], isPerPax: true }
      if (status === 'included') {
        services.push(zeroLine(line, { included: true, issue: includedMealReason(day, meal) }))
        continue
      }
      // There is no breakfast rate to buy: an "external" breakfast has never
      // priced, and still does not.
      if (status !== 'external' || meal === 'breakfast') continue
      const rate = mealRateFor(meal)
      if (rate > 0) {
        externalMealsPerPax += rate
        services.push({
          ...line,
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'meal_rates',
          isOptional: false,
        })
      } else {
        // The hole was recorded once per meal type above.
        listUnpricedLine(line, noMealRateMessage(meal))
      }
    }
  }

  // ----- Throughout guide's meals (fixed) -----
  // Restaurants feed the guide free from 4 paying pax; at 3 or fewer his
  // plate is charged like a customer's (operator rule, 2026-09-04). Priced at
  // the REQUESTED group size — the multi-pax sheet below keeps this fixed
  // line at every pax count, a known approximation the quote's own pax never
  // suffers from.
  if (guideMode === 'throughout' && (params.numPax ?? 2) <= 3 && mealRates) {
    for (const day of itinerary) {
      for (const meal of ['lunch', 'dinner'] as const) {
        if (day.meals[meal] !== 'external') continue
        const rate = mealRateFor(meal)
        // No rate for this meal: the customer's own line already shows it.
        if (rate <= 0) continue
        fixedCosts += rate
        services.push({
          id: `day${day.day}-guide-${meal}`,
          dayNumber: day.day,
          serviceType: 'meal',
          serviceName: `Throughout Guide — ${meal}`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'meal_rates',
          isPerPax: false,
          isOptional: false,
          notes: 'Group of 3 or fewer — the guide\'s meal is charged'
        })
      }
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

  // Accommodation is NOT in the per-person line any more: it goes through
  // the rooming rule per party size (accommodationAt below). Everything
  // else still scales linearly with pax.
  const perPaxCosts = entranceFeesPerPax + externalMealsPerPax + waterPerPax + ticketsPerPax + supplementsPerPax
  const accommodationAt = (pax: number) => tripAccommodationCost(pax, accommodationNights)

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
  // Road transfers between cities, with the trip shape each needs — the day
  // after a cruise starts from the ship's disembarkation port.
  const roadPlan = planRoadTrips(itinerary, cruiseRates?.row ? String((cruiseRates.row as Record<string, unknown>).disembark_city ?? '') || null : null)

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
    const needsList = determineTransportNeeds(day, previousDay, nextDay, { road: roadPlan.get(i) ?? null })

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
    const idSuffixEarly = info.legIndex > 0 ? `-${info.legIndex + 1}` : ''

    // The drive back of an earlier overnight return: listed, never charged.
    if (needs.returnIncludedFromDay) {
      services.push(zeroLine({
        id: `day${info.day}-transport${idSuffixEarly}`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: `Road transfer back — ${needs.originCity} → ${needs.destinationCity}`,
        isPerPax: false,
      }, { included: true, issue: `Included in the overnight return priced on day ${needs.returnIncludedFromDay}` }))
      continue
    }

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
      destinationCity: info.needs.destinationCity || info.city,
      tripShape: needs.tripShape,
    })

    // Disambiguate ID when a day has more than one transport leg (B3 flight days).
    // Single-leg days keep the original `day${N}-transport` shape to avoid
    // churn in callers that may key on the existing id format.
    const idSuffix = info.legIndex > 0 ? `-${info.legIndex + 1}` : ''
    // A matched row whose vehicle band for this group has no price used to
    // come back "as-is" and add undefined/0 into the total silently.
    const usable = rate ? usableRate(rate.base_rate_eur) : null
    if (rate && usable != null) {
      baseTransportCost += usable
      services.push({
        id: `day${info.day}-transport${idSuffix}`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: rate.route_name || `${rate.vehicle_type || baseVehicleType} - ${info.city}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: usable,
        lineTotal: usable,
        rateSource: 'transportation_rates',
        isPerPax: false,
        isOptional: false,
        notes: `${needs.serviceType} | ${needs.duration}${needs.area ? ` | ${needs.area}` : ''}`
      })
    } else {
      const origin = info.needs.originCity || itinerary[info.day - 2]?.city
      const destination = info.needs.destinationCity || info.city
      const road = isRoadTransferType(needs.serviceType)
      const shapeWord = road ? ({ one_way: 'one-way', same_day_return: 'same-day return', overnight_return: 'overnight return' } as const)[needs.tripShape ?? 'one_way'] : ''
      const where = road && origin && destination && cityKey(origin) !== cityKey(destination)
        ? `${origin} → ${destination}${shapeWord ? ` (${shapeWord})` : ''}`
        : info.city
      listUnpriced({
        id: `day${info.day}-transport${idSuffix}`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: `${transportServiceLabel(needs.serviceType)} — ${where}`,
        isPerPax: false,
      }, {
        kind: 'transport',
        reason: rate ? 'unpriced' : 'missing',
        dayNumber: info.day,
        city: info.city,
        lookupAttempted: `transportation_rates ${needs.serviceType}/${needs.duration}@${where}`,
        message: rate
          ? `The ${transportServiceLabel(needs.serviceType).toLowerCase()} rate for ${where} has no price for a group of 2. Fill its vehicles in Rates → Transportation.`
          : `No ${transportServiceLabel(needs.serviceType).toLowerCase()} rate for ${where}. Add it in Rates → Transportation.`,
      })
      warnings.push(`No transport rate in ${where} (${needs.serviceType}/${needs.duration})`)
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
      listUnpriced({ id: 'cruise-transport-package', dayNumber: cruisePackageDays[0]?.day || 1, serviceType: 'transportation', serviceName: `Cruise transport package (${cruisePackageDays.length} days)`, isPerPax: false }, {
        kind: 'transport',
        reason: 'missing',
        dayNumber: cruisePackageDays[0]?.day,
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
        tripShape: needs.tripShape,
      })
      if (needs.returnIncludedFromDay) continue
      total += usableRate(rate?.base_rate_eur) ?? 0
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
    // A throughout guide is one more body in the vehicle: size transport at
    // pax+1, the same treatment the tour-leader variant already gets inside
    // priceAcrossPax (both riding = both counted).
    transportAt: guideMode === 'throughout' ? (pax: number) => transportAtPax(pax + 1) : transportAtPax,
    // The leader rides the ticket legs at customer fare, like everything else he consumes.
    tourLeaderCost: accommodationPPD + singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax + ticketsPerPax,
    accommodationAt,
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
    accommodationNights,
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
  /** Which guide_rates.guide_type prices the guiding. Default 'egyptologist'. */
  guideGrade?: GuideGrade
  /** 'spot' (default): a per-city guide on sightseeing days only — the
   *  historical model, output unchanged. 'throughout': ONE guide travels with
   *  the group day one to the end (the operator's "+1", 2026-09-04) — a fee
   *  every day (full-day rate on sightseeing days, the meet/assist rate
   *  otherwise), his bed each night at the property's special guide_rate
   *  period field (blank = hole, never a free bed), his meals at group meal
   *  rates when the group is 3 or fewer (4+ eat him free), and one extra seat
   *  in the vehicle sizing. Distinct from tourLeaderIncluded, which prices a
   *  leader at full customer rates. */
  guideMode?: 'spot' | 'throughout'
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
  /** Each night's contract figures, for the rooming adjustment line (lib/pricing/rooming.ts). */
  accommodationNights?: NightRates[]
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
    rateCurrency: params.rateCurrency,
    // The travel date decides which rate period each night prices at; the
    // wrappers dropped it, so every dated period was ignored (2026-09-03).
    travelDate: params.travelDate,
    // Same trap, same fix: guide options must survive the wrapper.
    guideGrade: params.guideGrade,
    guideMode: params.guideMode,
    numPax: params.numPax
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
    // Day by day, each day in the order it runs (lib/pricing/breakdown-order).
    // This sorted every fixed cost ahead of every per-person cost, so a day
    // read guide, tips, transfer, then hotel, fees, meals — a shuffled list
    // an operator could not check against the programme.
    services: sortByItineraryFlow(
      dayResult.services.filter(s => !s.notes?.includes('optional')),
      s => ({ id: s.id, category: s.serviceType, dayNumber: s.dayNumber }),
    ),
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
    accommodationNights: dayResult.accommodationNights,
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
  isEurPassport: boolean = true,
  /** The agency's tier ladder (tierLadderForCurrentOrg); the presets by default. */
  tiers: readonly string[] = PRESET_TIERS
): Promise<{ minPrice: number; maxPrice: number; tier: ServiceTier } | null> {
  const results = await calculateMultiTierPricing(
    templateId,
    [...tiers],
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
  currency: string = DEFAULT_RATE_CURRENCY,
  /** A throughout guide's seat on the same flights ("+1", 2026-09-04). His
   *  fare may differ from the customer's — null fare = he pays the customer
   *  fare. Omitted entirely = no guide flying. */
  guideFlight?: { seats: number; farePerSeat: number | null }
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
  const guideFlightTotal = guideFlight
    ? guideFlight.seats * (guideFlight.farePerSeat ?? flightCostPerPerson)
    : 0
  const flightTotal = flightCostPerPerson * totalPassengers + guideFlightTotal

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

  if (flightCostPerPerson * totalPassengers > 0) {
    breakdown.push({
      category: 'Flights',
      count: totalPassengers,
      rate: Math.round(flightCostPerPerson * 100) / 100,
      subtotal: Math.round(flightCostPerPerson * totalPassengers * 100) / 100,
      note: 'Per person'
    })
  }
  if (guideFlightTotal > 0) {
    breakdown.push({
      category: 'Throughout Guide — flights',
      count: guideFlight!.seats,
      rate: Math.round((guideFlight!.farePerSeat ?? flightCostPerPerson) * 100) / 100,
      subtotal: Math.round(guideFlightTotal * 100) / 100,
      note: guideFlight!.farePerSeat != null ? 'Guide fare' : 'Customer fare (no guide fare entered)'
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
  currency: string = DEFAULT_RATE_CURRENCY,
  guideFlight?: { seats: number; farePerSeat: number | null }
): ComposedAgeBasedPricing {
  const refPax = paxRow.numPax || 2
  // PRE-margin per-person cost from the reference pax row (no leader).
  const baseAdultCost = paxRow.withoutLeader.totalCost / refPax
  const ageBasedPricing = calculateAgeBasedPricing(baseAdultCost, passengers, marginPercent, flightCostPerPerson, currency, guideFlight)

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
  params: PricingParams & { passengers: PassengerBreakdown; flightCostPerPerson?: number; guideFlightCostPerPerson?: number }
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
    rateCurrency: params.rateCurrency,
    // The travel date decides which rate period each night prices at; the
    // wrappers dropped it, so every dated period was ignored (2026-09-03).
    travelDate: params.travelDate,
    // Same trap, same fix: guide options must survive the wrapper.
    guideGrade: params.guideGrade,
    guideMode: params.guideMode,
    numPax: params.numPax
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
    dayResult.currency,
    // A throughout guide flies with the group: one more seat, at his own fare
    // when given, else the customer fare (a ticket always has a public price).
    params.guideMode === 'throughout' && flightCostPerPerson > 0
      ? { seats: 1, farePerSeat: params.guideFlightCostPerPerson ?? null }
      : undefined
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
    accommodationNights: dayResult.accommodationNights,
    ageBasedPricing,
    complete: dayResult.complete,
    holes: dayResult.holes
  }
}