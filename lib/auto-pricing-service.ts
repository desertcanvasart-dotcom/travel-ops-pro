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
import { getTransportRateForPax } from '@/lib/transport-rate-utils'

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

// Transport service types (normalized)
export type TransportServiceType = 
  | 'airport_transfer'
  | 'city_transfer'
  | 'day_tour'
  | 'dinner_transfer'
  | 'intercity_transfer'
  | 'sound_light_transfer'

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
}

// Pricing parameters
export interface DayPricingParams {
  templateId: string
  tier: ServiceTier
  isEurPassport: boolean
  language?: string
  travelDate?: string
  marginPercent?: number
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
interface CruiseTransportPricingRule {
  id: string
  service_name: string
  service_category: string
  pricing_model: string
  unit_type: string | null
  tier1_min_pax: number | null
  tier1_max_pax: number | null
  tier1_rate_eur: number | null
  tier1_label: string | null
  tier2_min_pax: number | null
  tier2_max_pax: number | null
  tier2_rate_eur: number | null
  tier2_label: string | null
  tier3_min_pax: number | null
  tier3_max_pax: number | null
  tier3_rate_eur: number | null
  tier3_label: string | null
  tier4_min_pax: number | null
  tier4_max_pax: number | null
  tier4_rate_eur: number | null
  tier4_label: string | null
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

// Vehicle capacity tiers
export const VEHICLE_CAPACITY = {
  'Sedan': { min: 1, max: 2 },
  'Minivan': { min: 3, max: 7 },
  'Van': { min: 8, max: 14 },
  'Minibus': { min: 15, max: 20 },
  'Bus': { min: 21, max: 45 },
  'Horse Carriage': { min: 1, max: 4 }  // Special for Edfu
} as const

export type VehicleType = keyof typeof VEHICLE_CAPACITY

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

// Default rates (all zeroed out — missing DB rates surface as €0 with console warnings)
const DEFAULT_RATES: Record<ServiceTier, {
  hotelPPD: number
  hotelSingleSupp: number
  cruisePPDNight: number
  cruiseSingleSuppNight: number
  guide: number
  lunch: number
  dinner: number
  tips: number
  airportService: number
  hotelService: number
  vehicle: number
}> = {
  budget: {
    hotelPPD: 0, hotelSingleSupp: 0, cruisePPDNight: 0, cruiseSingleSuppNight: 0,
    guide: 0, lunch: 0, dinner: 0, tips: 0, airportService: 0, hotelService: 0, vehicle: 0
  },
  standard: {
    hotelPPD: 0, hotelSingleSupp: 0, cruisePPDNight: 0, cruiseSingleSuppNight: 0,
    guide: 0, lunch: 0, dinner: 0, tips: 0, airportService: 0, hotelService: 0, vehicle: 0
  },
  deluxe: {
    hotelPPD: 0, hotelSingleSupp: 0, cruisePPDNight: 0, cruiseSingleSuppNight: 0,
    guide: 0, lunch: 0, dinner: 0, tips: 0, airportService: 0, hotelService: 0, vehicle: 0
  },
  luxury: {
    hotelPPD: 0, hotelSingleSupp: 0, cruisePPDNight: 0, cruiseSingleSuppNight: 0,
    guide: 0, lunch: 0, dinner: 0, tips: 0, airportService: 0, hotelService: 0, vehicle: 0
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get vehicle type based on pax count (including tour leader if applicable)
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
 */
export function detectDurationFromAttractions(attractions: string[]): TransportDuration {
  if (!attractions || attractions.length === 0) return 'half_day'
  if (attractions.length >= 3) return 'full_day'
  return 'half_day'
}

/**
 * Determine transport requirements for a day
 */
export function determineTransportNeeds(
  day: ItineraryDay,
  previousDay: ItineraryDay | null,
  nextDay: ItineraryDay | null
): {
  serviceType: TransportServiceType
  duration: TransportDuration
  area: TransportArea
  useSpecialVehicle: boolean
  specialVehicleType?: VehicleType
} {
  // Check for explicit overrides first
  if (day.transport?.service_type) {
    return {
      serviceType: day.transport.service_type,
      duration: day.transport.duration || 'full_day',
      area: day.transport.area || null,
      useSpecialVehicle: !!day.transport.vehicle_type,
      specialVehicleType: day.transport.vehicle_type as VehicleType
    }
  }
  
  const cityLower = day.city.toLowerCase()
  
  // Check for special vehicle cities (e.g., Edfu → Horse Carriage)
  const useSpecialVehicle = !!SPECIAL_VEHICLE_CITIES[cityLower]
  const specialVehicleType = SPECIAL_VEHICLE_CITIES[cityLower]
  
  // Airport arrival
  if (day.services.airport_arrival) {
    return {
      serviceType: 'airport_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false
    }
  }
  
  // Airport departure
  if (day.services.airport_departure) {
    return {
      serviceType: 'airport_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false
    }
  }
  
  // Intercity transfer (city changed from previous day, and not a cruise)
  if (previousDay && 
      previousDay.city.toLowerCase() !== cityLower &&
      day.accommodation_type !== 'cruise' &&
      previousDay.accommodation_type !== 'cruise') {
    return {
      serviceType: 'intercity_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false
    }
  }
  
  // Regular sightseeing day
  const hasAttractions = day.attractions && day.attractions.length > 0
  const guideRequired = day.services.guide_required
  
  if (hasAttractions || guideRequired) {
    const area = detectAreaFromAttractions(day.attractions)
    const duration = detectDurationFromAttractions(day.attractions)
    
    return {
      serviceType: 'day_tour',
      duration,
      area,
      useSpecialVehicle,
      specialVehicleType
    }
  }
  
  // Default: day tour full day
  return {
    serviceType: 'day_tour',
    duration: 'full_day',
    area: null,
    useSpecialVehicle,
    specialVehicleType
  }
}

/**
 * Parse itinerary JSONB - handles both old and new formats
 */
export function parseItinerary(itineraryData: any): ItineraryDay[] {
  if (!itineraryData || !Array.isArray(itineraryData)) {
    return []
  }

  return itineraryData.map((day: any, index: number) => {
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

    // Build services with defaults, then ENFORCE first/last day rules
    const baseServices = day.services || {
      airport_arrival: isFirstDay,
      airport_departure: isLastDay,
      hotel_checkin: isFirstDay,
      hotel_checkout: isLastDay,
      guide_required: hasAttractions
    }

    // RULE ENFORCEMENT: Always ensure arrival/departure flags on first/last days
    // even if the template data didn't include them
    const services = {
      ...baseServices,
      // First day of multi-day tour: always has airport arrival + hotel check-in
      ...(isFirstDay && itineraryData.length > 1 ? {
        airport_arrival: true,
        hotel_checkin: true,
      } : {}),
      // Last day of multi-day tour: always has airport departure + hotel check-out
      ...(isLastDay && itineraryData.length > 1 ? {
        airport_departure: true,
        hotel_checkout: true,
      } : {}),
    }

    // Extract attractions from title if not provided
    let attractions = day.attractions || []
    if (attractions.length === 0 && day.title) {
      attractions = extractAttractionsFromTitle(day.title)
    }

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
      city: day.city || inferCityFromTitle(day.title || ''),
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
}

/**
 * Extract attraction names from day title
 */
function extractAttractionsFromTitle(title: string): string[] {
  const attractions: string[] = []
  const patterns = [
    /karnak/i,
    /luxor temple/i,
    /valley of (the )?kings/i,
    /hatshepsut/i,
    /colossi of memnon/i,
    /edfu/i,
    /kom[- ]?ombo/i,
    /philae/i,
    /high dam/i,
    /aswan dam/i,
    /unfinished obelisk/i,
    /pyramid/i,
    /sphinx/i,
    /egyptian museum/i,
    /cairo museum/i,
    /grand egyptian museum/i,
    /gem/i,
    /citadel/i,
    /khan el[- ]?khalili/i,
    /abu simbel/i
  ]

  for (const pattern of patterns) {
    if (pattern.test(title)) {
      const match = title.match(pattern)
      if (match) {
        attractions.push(normalizeAttractionName(match[0]))
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
    'pyramid': 'Pyramids of Giza',
    'pyramids': 'Pyramids of Giza',
    'sphinx': 'Great Sphinx',
    'egyptian museum': 'Egyptian Museum',
    'cairo museum': 'Egyptian Museum',
    'grand egyptian museum': 'Grand Egyptian Museum',
    'gem': 'Grand Egyptian Museum',
    'citadel': 'Saladin Citadel',
    'khan el khalili': 'Khan El Khalili',
    'khan el-khalili': 'Khan El Khalili',
    'abu simbel': 'Abu Simbel'
  }

  return nameMap[normalized] || name
}

/**
 * Infer city from day title
 */
function inferCityFromTitle(title: string): string {
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

  return 'Cairo'  // Default
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

/**
 * Get cruise rates for a tier
 */
export async function getCruiseRates(
  tier: ServiceTier,
  embarkCity?: string
): Promise<{
  shipName: string
  ppdNight: number
  singleSuppNight: number
  durationNights: number
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

    const { data: cruises, error } = await query.limit(1)

    if (error || !cruises || cruises.length === 0) {
      console.log(`⚠️ No cruise found for tier ${tier}, using defaults`)
      return {
        shipName: 'Default Cruise',
        ppdNight: DEFAULT_RATES[tier].cruisePPDNight,
        singleSuppNight: DEFAULT_RATES[tier].cruiseSingleSuppNight,
        durationNights: 4
      }
    }

    const cruise = cruises[0]
    // rate_double_eur is already per-person (double occupancy)
    const ppdTrip = cruise.rate_double_eur
    const ppdNight = ppdTrip / cruise.duration_nights
    const singleSuppTrip = cruise.rate_single_eur - cruise.rate_double_eur
    const singleSuppNight = singleSuppTrip / cruise.duration_nights

    console.log(`✅ Cruise: ${cruise.ship_name} | PPD/night: €${ppdNight.toFixed(2)} | SingleSupp/night: €${singleSuppNight.toFixed(2)}`)

    return {
      shipName: cruise.ship_name,
      ppdNight,
      singleSuppNight,
      durationNights: cruise.duration_nights
    }
  } catch (err) {
    console.error('Error fetching cruise rates:', err)
    return null
  }
}

/**
 * Get hotel rates for a city and tier
 */
export async function getHotelRates(
  city: string,
  tier: ServiceTier
): Promise<{
  hotelName: string
  ppdNight: number
  singleSuppNight: number
} | null> {
  try {
    const { data: hotels, error } = await supabaseAdmin
      .from('hotel_contacts')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (error || !hotels || hotels.length === 0) {
      const { data: anyHotel } = await supabaseAdmin
        .from('hotel_contacts')
        .select('*')
        .eq('is_active', true)
        .ilike('city', `%${city}%`)
        .order('is_preferred', { ascending: false })
        .limit(1)

      if (!anyHotel || anyHotel.length === 0) {
        console.log(`⚠️ No hotel found for ${city} (${tier}), using defaults`)
        return {
          hotelName: `${city} Hotel`,
          ppdNight: DEFAULT_RATES[tier].hotelPPD,
          singleSuppNight: DEFAULT_RATES[tier].hotelSingleSupp
        }
      }

      const hotel = anyHotel[0]
      // rate_double_eur is already per-person (double occupancy)
      const ppd = hotel.rate_double_eur
      // Use ?? (nullish coalescing) so that rate_single_eur=0 isn't treated as missing
      const singleSupp = (hotel.rate_single_eur ?? hotel.rate_double_eur) - hotel.rate_double_eur

      console.log(`🏨 Hotel (fallback tier): ${hotel.name} | PPD: €${ppd} | Single: €${hotel.rate_single_eur} | Double: €${hotel.rate_double_eur} | Supp: €${singleSupp}`)

      return {
        hotelName: hotel.name,
        ppdNight: ppd,
        singleSuppNight: Math.max(0, singleSupp)
      }
    }

    const hotel = hotels[0]
    // rate_double_eur is already per-person (double occupancy)
    const ppd = hotel.rate_double_eur
    // Use ?? (nullish coalescing) so that rate_single_eur=0 isn't treated as missing
    const singleSupp = (hotel.rate_single_eur ?? hotel.rate_double_eur) - hotel.rate_double_eur

    console.log(`✅ Hotel: ${hotel.name} | PPD/night: €${ppd?.toFixed(2)} | SingleRate: €${hotel.rate_single_eur} | DoubleRate: €${hotel.rate_double_eur} | SingleSupp/night: €${singleSupp.toFixed(2)}`)

    return {
      hotelName: hotel.name,
      ppdNight: ppd,
      singleSuppNight: Math.max(0, singleSupp)
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
  isEurPassport: boolean
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    let { data: fees, error } = await supabaseAdmin
      .from('entrance_fees')
      .select('id, attraction_name, eur_rate, non_eur_rate')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)

    if (error || !fees || fees.length === 0) {
      // STRICT fallback: Only match if the full attraction name substantially overlaps
      // with a DB entry. Do NOT split into individual keywords — that causes false matches
      // like "Solar Boat Museum" matching "Egyptian Museum" via the keyword "museum".
      const { data: allFees } = await supabaseAdmin
        .from('entrance_fees')
        .select('id, attraction_name, eur_rate, non_eur_rate')
        .eq('is_active', true)

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
      console.log(`⚠️ No entrance fee found for "${attractionName}"`)
      return null
    }

    const fee = fees[0]
    const rate = isEurPassport 
      ? (fee.eur_rate || 0) 
      : (fee.non_eur_rate || fee.eur_rate || 0)

    console.log(`✅ Entrance: ${fee.attraction_name} | €${rate} (${isEurPassport ? 'EUR' : 'non-EUR'})`)

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

/**
 * Get guide rate
 */
export async function getGuideRate(
  language: string,
  tier: ServiceTier
): Promise<{ id: string; name: string; dailyRate: number } | null> {
  try {
    const { data: guides, error } = await supabaseAdmin
      .from('guides')
      .select('id, name, daily_rate, languages, tier')
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })

    if (error || !guides || guides.length === 0) {
      const { data: anyGuide } = await supabaseAdmin
        .from('guides')
        .select('id, name, daily_rate')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .limit(1)

      if (!anyGuide || anyGuide.length === 0) {
        return {
          id: 'default',
          name: 'Guide',
          dailyRate: DEFAULT_RATES[tier].guide
        }
      }

      return {
        id: anyGuide[0].id,
        name: anyGuide[0].name,
        dailyRate: anyGuide[0].daily_rate || DEFAULT_RATES[tier].guide
      }
    }

    const selected = guides.find(g => g.tier === tier) || guides[0]

    console.log(`✅ Guide: ${selected.name} | €${selected.daily_rate}/day`)

    return {
      id: selected.id,
      name: selected.name,
      dailyRate: selected.daily_rate || DEFAULT_RATES[tier].guide
    }
  } catch (err) {
    console.error('Error fetching guide rate:', err)
    return {
      id: 'default',
      name: 'Guide',
      dailyRate: DEFAULT_RATES[tier].guide
    }
  }
}

/**
 * Get meal rates
 */
export async function getMealRates(
  tier: ServiceTier
): Promise<{ lunch: number; dinner: number }> {
  try {
    const { data: mealRate } = await supabaseAdmin
      .from('meal_rates')
      .select('lunch_rate_eur, dinner_rate_eur')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!mealRate) {
      return {
        lunch: DEFAULT_RATES[tier].lunch,
        dinner: DEFAULT_RATES[tier].dinner
      }
    }

    const multipliers: Record<ServiceTier, number> = {
      budget: 0.8,
      standard: 1.0,
      deluxe: 1.3,
      luxury: 1.6
    }

    return {
      lunch: Math.round((mealRate.lunch_rate_eur || 0) * multipliers[tier]),
      dinner: Math.round((mealRate.dinner_rate_eur || 0) * multipliers[tier])
    }
  } catch (err) {
    return {
      lunch: DEFAULT_RATES[tier].lunch,
      dinner: DEFAULT_RATES[tier].dinner
    }
  }
}

/**
 * Get airport service rate
 */
export async function getAirportServiceRate(
  airportCode: string,
  direction: 'arrival' | 'departure',
  tier: ServiceTier
): Promise<number> {
  try {
    const { data: rates } = await supabaseAdmin
      .from('airport_staff_rates')
      .select('rate_eur')
      .eq('is_active', true)
      .eq('airport_code', airportCode)
      .or(`direction.eq.${direction},direction.eq.both`)
      .limit(1)

    if (!rates || rates.length === 0) {
      return DEFAULT_RATES[tier].airportService
    }

    return rates[0].rate_eur || DEFAULT_RATES[tier].airportService
  } catch (err) {
    return DEFAULT_RATES[tier].airportService
  }
}

/**
 * Get hotel service rate
 */
export async function getHotelServiceRate(
  serviceType: 'checkin_assist' | 'porter' | 'full_service',
  tier: ServiceTier
): Promise<number> {
  try {
    const category = getTierCategory(tier)
    
    const { data: rates } = await supabaseAdmin
      .from('hotel_staff_rates')
      .select('rate_eur')
      .eq('is_active', true)
      .eq('service_type', serviceType)
      .or(`hotel_category.eq.${category},hotel_category.eq.all`)
      .limit(1)

    if (!rates || rates.length === 0) {
      return DEFAULT_RATES[tier].hotelService
    }

    return rates[0].rate_eur || DEFAULT_RATES[tier].hotelService
  } catch (err) {
    return DEFAULT_RATES[tier].hotelService
  }
}

/**
 * Get tipping rate per day (flat total — backward compat for simple callers)
 */
export async function getTippingRate(tier: ServiceTier): Promise<number> {
  const { getDailyTippingRate } = await import('@/lib/tipping-utils')
  return getDailyTippingRate(supabaseAdmin, tier)
}

/**
 * Get itemized tipping rates for context-aware per-role lookups
 */
async function getItemizedTips(tier: ServiceTier) {
  const { getItemizedTippingRates } = await import('@/lib/tipping-utils')
  return getItemizedTippingRates(supabaseAdmin, tier)
}

// ============================================
// SMART TRANSPORT RATE LOOKUP
// ============================================

/**
 * Build transport cache from database
 * Key format: "service_type|city|duration|area" (one entry per service, all vehicle rates in one row)
 */
export async function buildTransportCache(): Promise<Map<string, TransportRate>> {
  const { data: allRates } = await supabaseAdmin
    .from('transportation_rates')
    .select('*')
    .eq('is_active', true)

  const cache = new Map<string, TransportRate>()

  if (!allRates) return cache

  for (const rate of allRates) {
    // Build multiple keys for flexible lookup (no vehicle_type — one row has all tiers)
    const baseKey = [
      rate.service_type || '',
      (rate.city || '').toLowerCase(),
      rate.duration || '',
      rate.area || ''
    ].join('|')

    cache.set(baseKey, rate)

    // Also cache without area for fallback
    const keyNoArea = [
      rate.service_type || '',
      (rate.city || '').toLowerCase(),
      rate.duration || '',
      ''
    ].join('|')

    if (!cache.has(keyNoArea)) {
      cache.set(keyNoArea, rate)
    }

    // For intercity, also cache by origin-destination
    if (rate.service_type === 'intercity_transfer' && rate.origin_city && rate.destination_city) {
      const intercityKey = [
        'intercity_transfer',
        (rate.origin_city || '').toLowerCase(),
        (rate.destination_city || '').toLowerCase()
      ].join('|')
      cache.set(intercityKey, rate)
    }
  }

  console.log(`📦 Built transport cache with ${cache.size} entries`)
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
    console.log(`✅ Transport exact match: ${exactKey}`)
  }

  // Priority 2: Match without area
  if (!record) {
    const noAreaKey = [serviceType, cityLower, duration, ''].join('|')
    if (cache.has(noAreaKey)) {
      record = cache.get(noAreaKey)!
      console.log(`✅ Transport match (no area): ${noAreaKey}`)
    }
  }

  // Priority 3: Match without duration
  if (!record) {
    const noDurationKey = [serviceType, cityLower, '', ''].join('|')
    if (cache.has(noDurationKey)) {
      record = cache.get(noDurationKey)!
      console.log(`⚠️ Transport fallback (no duration): ${noDurationKey}`)
    }
  }

  // Priority 4: Intercity lookup
  if (!record && serviceType === 'intercity_transfer' && originCity && destinationCity) {
    const intercityKey = ['intercity_transfer', originCity.toLowerCase(), destinationCity.toLowerCase()].join('|')
    if (cache.has(intercityKey)) {
      record = cache.get(intercityKey)!
      console.log(`✅ Transport intercity match: ${intercityKey}`)
    }
  }

  // Priority 5: Fallback to nearby cities
  if (!record) {
    const fallbackCities = ['luxor', 'aswan', 'cairo']
    for (const fallbackCity of fallbackCities) {
      if (fallbackCity === cityLower) continue
      const fallbackKey = [serviceType, fallbackCity, duration, ''].join('|')
      if (cache.has(fallbackKey)) {
        record = cache.get(fallbackKey)!
        console.log(`⚠️ Transport fallback city: ${fallbackCity} for ${city}`)
        break
      }
    }
  }

  if (!record) {
    console.log(`❌ No transport rate found for: ${serviceType} | ${city} | ${duration} | ${area} | pax=${pax}`)
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
// CRUISE TRANSPORT PRICING (via b2b_pricing_rules)
// ============================================

/**
 * Fetch cruise transport pricing rules from b2b_pricing_rules
 * Looks for rules with service_category = 'cruise_transport'
 */
export async function fetchCruiseTransportPricingRules(): Promise<CruiseTransportPricingRule[]> {
  const { data, error } = await supabaseAdmin
    .from('b2b_pricing_rules')
    .select('*')
    .eq('is_active', true)
    .eq('service_category', 'cruise_transport')

  if (error) {
    console.error('Error fetching cruise transport pricing rules:', error)
    return []
  }

  console.log(`📦 Fetched ${data?.length || 0} cruise transport pricing rules`)
  return data || []
}

/**
 * Find matching cruise transport pricing rule based on duration
 * Service names should follow pattern like "Nile Cruise 3D Transport", "Nile Cruise 4D Transport"
 */
export function findCruiseTransportRule(
  rules: CruiseTransportPricingRule[],
  durationDays: number
): CruiseTransportPricingRule | null {
  // Try to find exact match by looking for duration in service name
  const exactMatch = rules.find(
    r => r.service_name.toLowerCase().includes(`${durationDays}d`) ||
         r.service_name.toLowerCase().includes(`${durationDays} day`)
  )

  if (exactMatch) {
    console.log(`✅ Found cruise transport rule: ${exactMatch.service_name} (${durationDays}D)`)
    return exactMatch
  }

  // Fallback: try to find any cruise transport rule and use it
  if (rules.length > 0) {
    // Sort by extracting duration from name if possible, find closest
    const withDuration = rules.map(r => {
      const match = r.service_name.match(/(\d+)d/i) || r.service_name.match(/(\d+)\s*day/i)
      return {
        rule: r,
        duration: match ? parseInt(match[1]) : 0
      }
    }).filter(r => r.duration > 0)

    if (withDuration.length > 0) {
      const sorted = withDuration.sort((a, b) =>
        Math.abs(a.duration - durationDays) - Math.abs(b.duration - durationDays)
      )
      console.log(`⚠️ Using fallback cruise transport rule: ${sorted[0].rule.service_name} for ${durationDays}D`)
      return sorted[0].rule
    }

    // If no duration found in names, just use first rule
    console.log(`⚠️ Using first available cruise transport rule: ${rules[0].service_name}`)
    return rules[0]
  }

  console.log(`❌ No cruise transport rule found for ${durationDays}D`)
  return null
}

/**
 * Get cruise transport rate from pricing rule based on pax count
 * Uses tiered pricing: tier1 (1-2 pax), tier2 (3-7 pax), tier3 (8-14 pax), tier4 (15-20 pax)
 */
export function getCruiseTransportRate(
  rule: CruiseTransportPricingRule,
  numPax: number
): { vehicleType: VehicleType; rate: number } {
  // Check tier 1 (typically Sedan: 1-2 pax)
  if (rule.tier1_min_pax !== null && rule.tier1_max_pax !== null && rule.tier1_rate_eur !== null) {
    if (numPax >= rule.tier1_min_pax && numPax <= rule.tier1_max_pax) {
      return { vehicleType: 'Sedan', rate: rule.tier1_rate_eur }
    }
  }

  // Check tier 2 (typically Minivan: 3-7 pax)
  if (rule.tier2_min_pax !== null && rule.tier2_max_pax !== null && rule.tier2_rate_eur !== null) {
    if (numPax >= rule.tier2_min_pax && numPax <= rule.tier2_max_pax) {
      return { vehicleType: 'Minivan', rate: rule.tier2_rate_eur }
    }
  }

  // Check tier 3 (typically Van: 8-14 pax)
  if (rule.tier3_min_pax !== null && rule.tier3_max_pax !== null && rule.tier3_rate_eur !== null) {
    if (numPax >= rule.tier3_min_pax && numPax <= rule.tier3_max_pax) {
      return { vehicleType: 'Van', rate: rule.tier3_rate_eur }
    }
  }

  // Check tier 4 (typically Minibus: 15-20 pax)
  if (rule.tier4_min_pax !== null && rule.tier4_max_pax !== null && rule.tier4_rate_eur !== null) {
    if (numPax >= rule.tier4_min_pax && numPax <= rule.tier4_max_pax) {
      return { vehicleType: 'Minibus', rate: rule.tier4_rate_eur }
    }
  }

  // Fallback: if pax exceeds all tiers, use highest tier
  if (rule.tier4_rate_eur !== null) {
    return { vehicleType: 'Bus', rate: rule.tier4_rate_eur }
  }
  if (rule.tier3_rate_eur !== null) {
    return { vehicleType: 'Minibus', rate: rule.tier3_rate_eur }
  }
  if (rule.tier2_rate_eur !== null) {
    return { vehicleType: 'Van', rate: rule.tier2_rate_eur }
  }

  // Last fallback
  return { vehicleType: 'Minivan', rate: rule.tier1_rate_eur || 0 }
}

/**
 * Calculate cruise transport info for an itinerary
 * Returns null if no cruise days found
 */
export function calculateCruisePackageInfo(
  itinerary: ItineraryDay[],
  pricingRules: CruiseTransportPricingRule[],
  numPax: number
): CruisePackageInfo | null {
  // Count cruise days (days marked with is_cruise_day)
  const cruiseDays = itinerary.filter(day => day.is_cruise_day === true)

  if (cruiseDays.length === 0) {
    return null
  }

  console.log(`🚢 Found ${cruiseDays.length} cruise days in itinerary`)

  // Find matching pricing rule
  const rule = findCruiseTransportRule(pricingRules, cruiseDays.length)

  if (!rule) {
    return {
      packageFound: false,
      packageName: 'No pricing rule found',
      durationDays: cruiseDays.length,
      packageRate: 0,
      vehicleType: 'Minivan',
      includes: null
    }
  }

  const { vehicleType, rate } = getCruiseTransportRate(rule, numPax)

  return {
    packageFound: true,
    packageName: rule.service_name,
    durationDays: cruiseDays.length,
    packageRate: rate,
    vehicleType,
    includes: rule.notes // Using notes field for includes description
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

  console.log('🚀 Starting day-based pricing calculation (v4):', { templateId, tier, isEurPassport })

  const warnings: string[] = []
  const services: PricedService[] = []

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
      currency: 'EUR',
      marginPercent,
      warnings: ['Template not found']
    }
  }

  console.log('📋 Template found:', template.template_name)

  const itinerary = parseItinerary(template.itinerary)
  const totalDays = itinerary.length || template.duration_days || 1

  if (itinerary.length === 0) {
    warnings.push('No itinerary data found - using defaults')
  }

  console.log(`📅 Parsed ${itinerary.length} days from itinerary`)

  // ============================================
  // STEP 2: Analyze accommodation types
  // ============================================

  const hotelDays = itinerary.filter(d => d.accommodation_type === 'hotel')
  const cruiseDays = itinerary.filter(d => d.accommodation_type === 'cruise')
  const hotelNights = hotelDays.length
  const cruiseNights = cruiseDays.length

  console.log(`🏨 Hotel nights: ${hotelNights} | 🚢 Cruise nights: ${cruiseNights}`)

  // ============================================
  // STEP 3: Build transport cache & fetch cruise pricing rules
  // ============================================

  const transportCache = await buildTransportCache()

  // Fetch cruise transport pricing rules from b2b_pricing_rules
  const cruiseTransportPricingRules = await fetchCruiseTransportPricingRules()

  // Count cruise package days (days marked as is_cruise_day for bundled transport)
  const cruisePackageDays = itinerary.filter(d => d.is_cruise_day === true)
  const hasCruisePackage = cruisePackageDays.length > 0

  if (hasCruisePackage) {
    console.log(`🚢 Found ${cruisePackageDays.length} cruise package days - will use bundled transport pricing`)
  }

  // ============================================
  // STEP 4: Fetch all required rates
  // ============================================

  let cruiseRates: Awaited<ReturnType<typeof getCruiseRates>> = null
  if (cruiseNights > 0) {
    const firstCruiseDay = cruiseDays[0]
    cruiseRates = await getCruiseRates(tier, firstCruiseDay?.city)
  }

  const hotelCities = [...new Set(hotelDays.map(d => d.city))]
  const hotelRatesMap = new Map<string, Awaited<ReturnType<typeof getHotelRates>>>()
  for (const city of hotelCities) {
    const rates = await getHotelRates(city, tier)
    if (rates) {
      hotelRatesMap.set(city, rates)
    }
  }

  const guideRate = await getGuideRate(language, tier)
  const mealRates = await getMealRates(tier)
  const tippingRates = await getItemizedTips(tier)
  const waterCostPerPax = 2

  // ============================================
  // STEP 5: Calculate Single Supplement (whole tour)
  // ============================================

  let singleSupplement = 0

  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.city)
    if (hotelRate) {
      singleSupplement += hotelRate.singleSuppNight
    } else {
      singleSupplement += DEFAULT_RATES[tier].hotelSingleSupp
    }
  }

  if (cruiseRates && cruiseNights > 0) {
    singleSupplement += cruiseRates.singleSuppNight * cruiseNights
  }

  console.log(`💰 Total Single Supplement: €${singleSupplement.toFixed(2)}`)

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
      const tipRate = tippingRates.getRate(tipRole.role, tipRole.context)
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
      const rate = await getAirportServiceRate(airportCode, 'arrival', tier)
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
    }

    if (day.services.airport_departure) {
      const airportCode = getAirportCode(day.city)
      const rate = await getAirportServiceRate(airportCode, 'departure', tier)
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
    }

    // ----- HOTEL SERVICES (fixed per service) -----
    if (day.services.hotel_checkin) {
      const rate = await getHotelServiceRate('checkin_assist', tier)
      fixedCosts += rate
      services.push({
        id: `day${day.day}-hotel-checkin`,
        dayNumber: day.day,
        serviceType: 'hotel_service',
        serviceName: 'Hotel Check-in Assistance',
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate,
        lineTotal: rate,
        rateSource: 'hotel_staff_rates',
        isPerPax: false,
        isOptional: false
      })
    }

    if (day.services.hotel_checkout) {
      const rate = await getHotelServiceRate('porter', tier)
      fixedCosts += rate
      services.push({
        id: `day${day.day}-hotel-checkout`,
        dayNumber: day.day,
        serviceType: 'hotel_service',
        serviceName: 'Hotel Check-out & Porter',
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate,
        lineTotal: rate,
        rateSource: 'hotel_staff_rates',
        isPerPax: false,
        isOptional: false
      })
    }
  }

  // ============================================
  // STEP 7: Calculate PER-PAX costs (base rates)
  // ============================================

  let accommodationPPD = 0

  // Hotel PPD
  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.city)
    if (hotelRate) {
      accommodationPPD += hotelRate.ppdNight
      services.push({
        id: `day${day.day}-hotel`,
        dayNumber: day.day,
        serviceType: 'accommodation',
        serviceName: `Hotel - ${hotelRate.hotelName} (${day.city})`,
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: hotelRate.ppdNight,
        lineTotal: hotelRate.ppdNight,
        rateSource: 'hotel_contacts',
        isPerPax: true,
        isOptional: false,
        notes: 'PPD (Per Person Double)'
      })
    } else {
      accommodationPPD += DEFAULT_RATES[tier].hotelPPD
    }
  }

  // Cruise PPD
  if (cruiseRates && cruiseNights > 0) {
    accommodationPPD += cruiseRates.ppdNight * cruiseNights
    services.push({
      id: `cruise-accommodation`,
      dayNumber: cruiseDays[0]?.day || 1,
      serviceType: 'cruise',
      serviceName: `Nile Cruise - ${cruiseRates.shipName} (${cruiseNights} nights)`,
      quantity: cruiseNights,
      quantityMode: 'per_pax',
      unitCost: cruiseRates.ppdNight,
      lineTotal: cruiseRates.ppdNight * cruiseNights,
      rateSource: 'nile_cruises',
      isPerPax: true,
      isOptional: false,
      notes: `PPD €${cruiseRates.ppdNight.toFixed(2)}/night × ${cruiseNights} nights`
    })
  }

  // ----- Entrance Fees (per pax) -----
  let entranceFeesPerPax = 0
  const processedAttractions = new Set<string>()

  for (const day of itinerary) {
    for (const attraction of day.attractions) {
      if (processedAttractions.has(attraction.toLowerCase())) continue
      processedAttractions.add(attraction.toLowerCase())

      const fee = await getEntranceFee(attraction, isEurPassport)
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
    if (day.meals.lunch === 'external') {
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

    if (day.meals.dinner === 'external') {
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

  // ----- Water (per pax per sightseeing day) -----
  const sightseeingDaysList = itinerary.filter(d => d.services.guide_required || d.attractions.length > 0)
  const sightseeingDays = sightseeingDaysList.length
  const waterPerPax = waterCostPerPax * sightseeingDays

  if (sightseeingDays > 0) {
    services.push({
      id: `water-all-days`,
      dayNumber: 1,
      serviceType: 'water',
      serviceName: `Bottled Water (${sightseeingDays} sightseeing days)`,
      quantity: sightseeingDays,
      quantityMode: 'per_pax',
      unitCost: waterCostPerPax,
      lineTotal: waterPerPax,
      rateSource: 'fixed',
      isPerPax: true,
      isOptional: false,
      notes: `€${waterCostPerPax}/day × ${sightseeingDays} days`
    })
  }

  const perPaxCosts = accommodationPPD + entranceFeesPerPax + externalMealsPerPax + waterPerPax

  console.log(`📊 Fixed costs: €${fixedCosts.toFixed(2)} | Per-pax costs: €${perPaxCosts.toFixed(2)}`)

  // ============================================
  // STEP 8: Analyze transport needs per day
  // ============================================

  interface DayTransportInfo {
    day: number
    city: string
    needs: ReturnType<typeof determineTransportNeeds>
    requiresTransport: boolean
    isCruisePackageDay: boolean // Part of cruise transport package
  }

  const transportInfoByDay: DayTransportInfo[] = []

  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const previousDay = i > 0 ? itinerary[i - 1] : null
    const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null

    const hasSightseeing = day.services.guide_required || day.attractions.length > 0
    const hasAirportService = day.services.airport_arrival || day.services.airport_departure
    const isIntercityDay = previousDay &&
                           previousDay.city.toLowerCase() !== day.city.toLowerCase() &&
                           day.accommodation_type !== 'cruise' &&
                           previousDay.accommodation_type !== 'cruise'

    // Check if this day is part of a cruise transport package
    const isCruisePackageDay = day.is_cruise_day === true

    // Determine if this day requires individual transport (non-cruise package days only)
    const requiresTransport = !isCruisePackageDay && (hasSightseeing || hasAirportService || isIntercityDay)

    if (requiresTransport) {
      const needs = determineTransportNeeds(day, previousDay, nextDay)
      transportInfoByDay.push({
        day: day.day,
        city: day.city,
        needs,
        requiresTransport: true,
        isCruisePackageDay: false
      })

      console.log(`🚗 Day ${day.day} (${day.city}): ${needs.serviceType} | ${needs.duration} | area: ${needs.area || 'none'} | special: ${needs.useSpecialVehicle ? needs.specialVehicleType : 'no'}`)
    } else if (isCruisePackageDay) {
      transportInfoByDay.push({
        day: day.day,
        city: day.city,
        needs: determineTransportNeeds(day, previousDay, nextDay),
        requiresTransport: false,
        isCruisePackageDay: true
      })
      console.log(`🚢 Day ${day.day} (${day.city}): Cruise package day - bundled transport`)
    } else {
      transportInfoByDay.push({
        day: day.day,
        city: day.city,
        needs: determineTransportNeeds(day, previousDay, nextDay),
        requiresTransport: false,
        isCruisePackageDay: false
      })
    }
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
      originCity: itinerary[info.day - 2]?.city, // Previous day city for intercity
      destinationCity: info.city
    })

    if (rate) {
      baseTransportCost += rate.base_rate_eur
      services.push({
        id: `day${info.day}-transport`,
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
      baseTransportCost += DEFAULT_RATES[tier].vehicle
      services.push({
        id: `day${info.day}-transport`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: `${baseVehicleType} - ${info.city}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: DEFAULT_RATES[tier].vehicle,
        lineTotal: DEFAULT_RATES[tier].vehicle,
        rateSource: 'default',
        isPerPax: false,
        isOptional: false,
        notes: `Default rate (no match found)`
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
        rateSource: 'b2b_pricing_rules',
        isPerPax: false,
        isOptional: false,
        notes: `${cruisePackageInfo.durationDays}D cruise transport package (${cruisePackageInfo.vehicleType}) - includes: ${cruisePackageInfo.includes || 'car, carriage, felucca, motorboat'}`
      })
      console.log(`🚢 Cruise package cost (2 pax): €${baseCruisePackageCost.toFixed(2)} (${cruisePackageInfo.packageName})`)
    } else {
      warnings.push(`No cruise transport package found for ${cruisePackageDays.length}D cruise`)
    }
  }

  console.log(`🚗 Base transport cost (2 pax): €${baseTransportCost.toFixed(2)}${hasCruisePackage ? ` + €${baseCruisePackageCost.toFixed(2)} cruise package` : ''}`)

  // ============================================
  // STEP 10: Calculate for each pax count
  // ============================================

  const paxPricing: PaxPricingResult[] = []

  for (const numPax of PAX_COUNTS) {
    // ----- Regular transport cost (varies with vehicle size) -----
    // Only for non-cruise-package days
    let transportCost = 0

    for (const info of transportInfoByDay) {
      if (!info.requiresTransport) continue

      const { needs } = info

      const rate = findTransportRate(transportCache, {
        serviceType: needs.serviceType,
        city: info.city,
        duration: needs.duration,
        area: needs.area,
        pax: numPax,
        vehicleType: needs.useSpecialVehicle ? needs.specialVehicleType : undefined,
        originCity: itinerary[info.day - 2]?.city,
        destinationCity: info.city
      })

      if (rate) {
        transportCost += rate.base_rate_eur
      } else {
        transportCost += DEFAULT_RATES[tier].vehicle
      }
    }

    // ----- Cruise transport package cost (varies with pax count / vehicle) -----
    let cruisePackageCost = 0
    if (hasCruisePackage) {
      const cruisePackageInfo = calculateCruisePackageInfo(itinerary, cruiseTransportPricingRules, numPax)
      if (cruisePackageInfo?.packageFound) {
        cruisePackageCost = cruisePackageInfo.packageRate
      }
    }

    // Total transport = regular transport + cruise package
    const totalTransportCost = transportCost + cruisePackageCost

    // ----- WITHOUT Tour Leader (+0) -----
    const totalCostWithoutLeader = fixedCosts + totalTransportCost + (perPaxCosts * numPax)
    const marginWithoutLeader = totalCostWithoutLeader * (marginPercent / 100)
    const sellingWithoutLeader = totalCostWithoutLeader + marginWithoutLeader
    const perPersonWithoutLeader = sellingWithoutLeader / numPax

    // ----- WITH Tour Leader (+1) -----
    let transportCostWithLeader = 0

    for (const info of transportInfoByDay) {
      if (!info.requiresTransport) continue

      const { needs } = info

      const rate = findTransportRate(transportCache, {
        serviceType: needs.serviceType,
        city: info.city,
        duration: needs.duration,
        area: needs.area,
        pax: numPax + 1,  // +1 for tour leader
        vehicleType: needs.useSpecialVehicle ? needs.specialVehicleType : undefined,
        originCity: itinerary[info.day - 2]?.city,
        destinationCity: info.city
      })

      if (rate) {
        transportCostWithLeader += rate.base_rate_eur
      } else {
        transportCostWithLeader += DEFAULT_RATES[tier].vehicle
      }
    }

    // ----- Cruise transport package cost for +1 (varies with pax count / vehicle) -----
    let cruisePackageCostWithLeader = 0
    if (hasCruisePackage) {
      const cruisePackageInfo = calculateCruisePackageInfo(itinerary, cruiseTransportPricingRules, numPax + 1)
      if (cruisePackageInfo?.packageFound) {
        cruisePackageCostWithLeader = cruisePackageInfo.packageRate
      }
    }

    // Total transport with leader = regular transport + cruise package
    const totalTransportCostWithLeader = transportCostWithLeader + cruisePackageCostWithLeader

    // Tour leader costs: single room (PPD + single supplement) + their own per-pax costs
    const tourLeaderCost = accommodationPPD + singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax

    const totalCostWithLeader = fixedCosts + totalTransportCostWithLeader + (perPaxCosts * numPax) + tourLeaderCost
    const marginWithLeader = totalCostWithLeader * (marginPercent / 100)
    const sellingWithLeader = totalCostWithLeader + marginWithLeader
    const perPersonWithLeader = sellingWithLeader / numPax

    paxPricing.push({
      numPax,
      withoutLeader: {
        totalCost: Math.round(totalCostWithoutLeader * 100) / 100,
        marginAmount: Math.round(marginWithoutLeader * 100) / 100,
        sellingPrice: Math.round(sellingWithoutLeader * 100) / 100,
        pricePerPerson: Math.round(perPersonWithoutLeader * 100) / 100
      },
      withLeader: {
        totalCost: Math.round(totalCostWithLeader * 100) / 100,
        tourLeaderCost: Math.round(tourLeaderCost * 100) / 100,
        marginAmount: Math.round(marginWithLeader * 100) / 100,
        sellingPrice: Math.round(sellingWithLeader * 100) / 100,
        pricePerPerson: Math.round(perPersonWithLeader * 100) / 100
      }
    })
  }

  // ============================================
  // STEP 11: Return result
  // ============================================

  console.log('✅ Day-based pricing complete (v4)')
  console.log(`   Template: ${template.template_name}`)
  console.log(`   Single Supplement: €${singleSupplement.toFixed(2)}`)
  console.log(`   Sample (2 pax +0): €${paxPricing[1]?.withoutLeader.pricePerPerson}/person`)
  console.log(`   Sample (2 pax +1): €${paxPricing[1]?.withLeader.pricePerPerson}/person`)

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
    currency: 'EUR',
    marginPercent,
    warnings
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
  tier: ServiceTier
  numPax: number
  numAdults?: number
  numChildren?: number  // Ages 4-12: 50% discount
  numInfants?: number   // Ages 0-3: FREE except flights
  isEurPassport: boolean
  language?: string
  travelDate?: string
  marginPercent?: number
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
}

/**
 * BACKWARD COMPATIBLE FUNCTION
 */
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

  console.log('🔄 calculateAutoPricing called (v4 - smart transport)')
  console.log(`   tourLeaderIncluded: ${tourLeaderIncluded}`)
  console.log(`   numPax: ${numPax}`)

  const dayResult = await calculateDayBasedPricing({
    templateId,
    tier,
    isEurPassport,
    language,
    marginPercent
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
      sellingPrice: 0,
      pricePerPerson: 0,
      currency: 'EUR',
      ratesUsed: {},
      warnings: dayResult.warnings
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
  
  console.log(`   Selected pricing: ${tourLeaderIncluded ? '+1 (withLeader)' : '+0 (withoutLeader)'}`)
  console.log(`   totalCost: €${pricing.totalCost}`)
  console.log(`   pricePerPerson: €${pricing.pricePerPerson}`)
  if (tourLeaderIncluded) {
    console.log(`   tourLeaderCost: €${paxResult.withLeader.tourLeaderCost}`)
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
    sellingPrice: pricing.sellingPrice,
    pricePerPerson: pricing.pricePerPerson,
    currency: dayResult.currency,
    ratesUsed,
    warnings: dayResult.warnings,
    paxPricingTable: dayResult.paxPricing,
    singleSupplement: dayResult.singleSupplement
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

  for (const tier of tiers) {
    const result = await calculateAutoPricing({
      templateId,
      tier,
      numPax,
      isEurPassport,
      ...options
    })
    results.set(tier, result)
  }

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
 * @param baseAdultRate - The full adult per-person rate (from standard pricing)
 * @param passengers - Breakdown of adults, children, infants
 * @param marginPercent - Margin percentage (default 25%)
 * @param flightCostPerPerson - Optional flight cost per person (everyone pays full flight cost)
 */
export function calculateAgeBasedPricing(
  baseAdultRate: number,
  passengers: PassengerBreakdown,
  marginPercent: number = 25,
  flightCostPerPerson: number = 0
): AgeBasedPricingResult {
  const { numAdults, numChildren, numInfants } = passengers
  const totalPassengers = numAdults + numChildren + numInfants

  // Calculate rates
  const adultRate = baseAdultRate
  const childRate = baseAdultRate * (1 - CHILD_DISCOUNT_PERCENT / 100) // 50% discount
  const infantRate = baseAdultRate * (INFANT_RATE_PERCENT / 100)        // FREE (0%)

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
    currency: 'EUR',
    breakdown
  }
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

  console.log('🧒 Calculating with passenger breakdown:')
  console.log(`   Adults: ${passengers.numAdults}`)
  console.log(`   Children (4-12): ${passengers.numChildren}`)
  console.log(`   Infants (0-3): ${passengers.numInfants}`)
  console.log(`   Total: ${totalPax}`)

  // First get the day-based pricing to get the base adult rate
  const dayResult = await calculateDayBasedPricing({
    templateId,
    tier,
    isEurPassport,
    language,
    marginPercent
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
      sellingPrice: 0,
      pricePerPerson: 0,
      currency: 'EUR',
      ratesUsed: {},
      warnings: dayResult.warnings
    }
  }

  // Get the base adult rate from 2-pax pricing (standard reference)
  const basePaxResult = dayResult.paxPricing.find(p => p.numPax === 2) || dayResult.paxPricing[1]
  const baseAdultRate = tourLeaderIncluded
    ? basePaxResult.withLeader.pricePerPerson
    : basePaxResult.withoutLeader.pricePerPerson

  // Calculate age-based pricing
  const ageBasedPricing = calculateAgeBasedPricing(
    baseAdultRate,
    passengers,
    marginPercent,
    flightCostPerPerson
  )

  // Calculate tour leader cost if included
  let tourLeaderCost = 0
  if (tourLeaderIncluded) {
    // Tour leader gets accommodation + single supplement + their own per-pax costs
    tourLeaderCost = basePaxResult.withLeader.tourLeaderCost
  }

  // Calculate effective price per paying person
  const payingPassengers = passengers.numAdults + passengers.numChildren
  const pricePerPerson = payingPassengers > 0
    ? ageBasedPricing.sellingPrice / payingPassengers
    : 0

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

  console.log('✅ Age-based pricing calculated:')
  console.log(`   Adult rate: €${ageBasedPricing.adultRate}`)
  console.log(`   Child rate: €${ageBasedPricing.childRate} (${CHILD_DISCOUNT_PERCENT}% off)`)
  console.log(`   Infant rate: FREE`)
  console.log(`   Selling price: €${ageBasedPricing.sellingPrice}`)

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
    subtotalCost: ageBasedPricing.totalCost,
    optionalTotal: 0,
    totalCost: ageBasedPricing.totalCost + tourLeaderCost,
    tourLeaderCost,
    marginPercent,
    marginAmount: ageBasedPricing.marginAmount,
    sellingPrice: ageBasedPricing.sellingPrice + (tourLeaderCost * (1 + marginPercent / 100)),
    pricePerPerson: Math.round(pricePerPerson * 100) / 100,
    currency: 'EUR',
    ratesUsed,
    warnings: dayResult.warnings,
    paxPricingTable: dayResult.paxPricing,
    singleSupplement: dayResult.singleSupplement,
    ageBasedPricing
  }
}