// ============================================
// SERVICE CREATION: Rate fetching & day services
// Extracted from generate-itinerary/route.ts
// ============================================

import { type ServiceTier, toNumber } from '@/lib/ai/parsing-utils'
import { type CabinAllocation, getCruiseRate } from '@/lib/ai/cruise-pricing'
import {
  fetchCruiseTransportPricingRules,
  findCruiseTransportRule,
  getCruiseTransportRate
} from '@/lib/auto-pricing-service'
import { fetchExchangeRates, convertCurrency, isUsingFallbackRates, getExchangeRate, persistExchangeRate, type ExchangeRates } from '@/lib/currency-service'
import { getFixedDailyCosts } from '@/lib/fixed-costs'
import {
  getItemizedTippingRates,
  determineTipRolesForDay,
  formatTipServiceName,
  formatTipNotes,
  type ItemizedTippingRates,
} from '@/lib/tipping-utils'

// Normalize attraction names from AI output to canonical database names
function normalizeAttractionForMatch(name: string): string {
  const normalized = name.toLowerCase().replace(/^the /, '').trim()
  const nameMap: Record<string, string> = {
    'grand egyptian museum': 'Grand Egyptian Museum',
    'gem': 'Grand Egyptian Museum',
    'giza museum': 'Grand Egyptian Museum',
    'new grand egyptian museum': 'Grand Egyptian Museum',
    'egyptian museum': 'Egyptian Museum',
    'cairo museum': 'Egyptian Museum',
    'pyramids of giza': 'Giza Plateau',
    'pyramids': 'Giza Plateau',
    'pyramid': 'Giza Plateau',
    'great pyramids': 'Giza Plateau',
    'giza pyramids': 'Giza Plateau',
    'giza plateau': 'Giza Plateau',
    'sphinx': 'Giza Plateau',
    'great sphinx': 'Giza Plateau',
    'karnak': 'Karnak Temple',
    'karnak temple': 'Karnak Temple',
    'luxor temple': 'Luxor Temple',
    'valley of kings': 'Valley of the Kings',
    'valley of the kings': 'Valley of the Kings',
    'hatshepsut': 'Hatshepsut Temple',
    'hatshepsut temple': 'Hatshepsut Temple',
    'colossi of memnon': 'Colossi of Memnon',
    'edfu': 'Edfu Temple',
    'edfu temple': 'Edfu Temple',
    'kom ombo': 'Kom Ombo Temple',
    'kom ombo temple': 'Kom Ombo Temple',
    'philae': 'Philae Temple',
    'philae temple': 'Philae Temple',
    'high dam': 'Aswan High Dam',
    'aswan high dam': 'Aswan High Dam',
    'aswan dam': 'Aswan High Dam',
    'unfinished obelisk': 'Unfinished Obelisk',
    'abu simbel': 'Abu Simbel',
    'citadel': 'Saladin Citadel',
    'saladin citadel': 'Saladin Citadel',
    'khan el khalili': 'Khan El Khalili',
    'khan el-khalili': 'Khan El Khalili',
    "pompey's pillar": "Pompey's Pillar",
    'qaitbay': 'Qaitbay Citadel',
    'qaitbay citadel': 'Qaitbay Citadel',
    'nubian village': 'Nubian Village',
  }
  return nameMap[normalized] || name
}

// ============================================
// PRICING RATES (fetched from DB)
// ============================================

export interface MealRateRecord {
  id: string
  restaurant_name: string
  meal_type?: string
  city?: string
  base_rate_eur: number
  base_rate_non_eur: number
  supplier_name?: string
  service_code?: string
  tier?: string
  is_preferred?: boolean
}

export interface PricingRates {
  vehiclePerDay: number
  vehicleTypeName: string
  vehicleServiceCode: string
  vehicleSupplierName: string | null
  transferRate: number
  transferServiceCode: string
  transferSupplierName: string | null
  guidePerDay: number
  selectedGuide: any
  allEntranceFees: any[]
  allActivityRates: any[]
  lunchRate: number       // Fallback flat rate (kept for backward compat)
  dinnerRate: number      // Fallback flat rate (kept for backward compat)
  allMealRates: MealRateRecord[]  // All active meal rates for per-city lookup
  airportServiceRate: number
  hotelServiceRate: number
  hotelRate: number
  hotelName: string | null
  selectedHotel: any
  tippingRates: ItemizedTippingRates
}

export async function fetchAllPricingRates(
  supabase: any,
  params: {
    tier: ServiceTier
    effectiveCity: string
    totalPax: number
    isEuroPassport: boolean
    language: string
    hotelName: string | null
    includeAccommodation: boolean
  }
): Promise<PricingRates> {
  const { tier, effectiveCity, totalPax, isEuroPassport, language, hotelName, includeAccommodation } = params

  // Transportation: query transportation_rates (tiered vehicle structure)
  const { data: transportRates } = await supabase
    .from('transportation_rates')
    .select('*')
    .eq('is_active', true)
    .eq('service_type', 'day_tour')
    .ilike('city', effectiveCity)
    .limit(1)

  const { getTransportRateForPax } = await import('@/lib/transport-rate-utils')
  const transportResult = transportRates?.length ? getTransportRateForPax(transportRates[0], totalPax, isEuroPassport) : null
  if (!transportResult) {
    console.warn(`⚠️ No transportation rate found for ${effectiveCity}, ${totalPax} pax — transport will be €0`)
  }
  const vehiclePerDay = transportResult ? (isEuroPassport ? transportResult.rateEur : transportResult.rateNonEur) : 0
  const vehicleTypeName = transportResult ? transportResult.vehicleType : 'Vehicle'
  const vehicleServiceCode = transportRates?.[0]?.id || 'TRANS'
  const vehicleSupplierName = transportRates?.[0]?.supplier_name || null

  // Transfer rate: query transportation_rates for airport_transfer service type
  const { data: transferRates } = await supabase
    .from('transportation_rates')
    .select('*')
    .eq('is_active', true)
    .eq('service_type', 'airport_transfer')
    .ilike('city', effectiveCity)
    .limit(1)
  const transferResult = transferRates?.length ? getTransportRateForPax(transferRates[0], totalPax, isEuroPassport) : null
  const transferRate = transferResult ? (isEuroPassport ? transferResult.rateEur : transferResult.rateNonEur) : 0
  if (!transferResult) {
    console.warn(`⚠️ No airport transfer rate found for ${effectiveCity}, ${totalPax} pax — transfer will be €0`)
  }

  // Guides — check guide_rates table first (where rates are managed via UI),
  // then fall back to guides table (supplier contacts with daily_rate)
  let guidePerDay = 0
  let selectedGuide: any = null

  // PRIORITY 1: Check guide_rates table (managed via Rates > Tour Guides UI)
  const { data: guideRates } = await supabase
    .from('guide_rates')
    .select('*')
    .eq('is_active', true)
    .eq('guide_language', language)
    .limit(1)

  if (guideRates?.length) {
    guidePerDay = toNumber(guideRates[0].base_rate_eur, 0)
    selectedGuide = { name: guideRates[0].guide_name || `${language} Speaking Guide`, id: guideRates[0].id }
    console.log(`✅ Guide rate from guide_rates: €${guidePerDay}/day (${language})`)
  }

  // PRIORITY 2: Fall back to guides table (supplier contacts)
  if (!guidePerDay) {
    const { data: guides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [language]).limit(5)
    selectedGuide = guides?.[0]
    if (!selectedGuide) {
      const { data: fallbackGuides } = await supabase.from('guides').select('*').eq('is_active', true).contains('languages', [language]).limit(1)
      selectedGuide = fallbackGuides?.[0]
    }
    if (!selectedGuide) {
      const { data: anyTierGuides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).limit(1)
      selectedGuide = anyTierGuides?.[0]
      if (selectedGuide) console.warn(`⚠️ No ${language}-speaking guide found — using ${selectedGuide.name || 'generic'} guide rate`)
    }
    if (!selectedGuide) {
      const { data: anyGuides } = await supabase.from('guides').select('*').eq('is_active', true).limit(1)
      selectedGuide = anyGuides?.[0]
      if (selectedGuide) console.warn(`⚠️ No guide found for ${language}/${tier} — using ${selectedGuide.name || 'generic'} as last resort`)
    }
    guidePerDay = selectedGuide ? toNumber(selectedGuide.daily_rate, 0) : 0
  }

  if (!guidePerDay) console.warn(`⚠️ No guide rate found at all — guide will be €0`)

  // Entrance fees + activity rates (sea trips, boat rides, etc.)
  const [{ data: allEntranceFees }, { data: allActivityRates }] = await Promise.all([
    supabase.from('entrance_fees').select('*').eq('is_active', true),
    supabase.from('activity_rates').select('*').eq('is_active', true)
  ])

  // Meal rates — fetch ALL active rates for per-city lookup
  const { data: allMealRates } = await supabase.from('meal_rates').select('*').eq('is_active', true)
  const lunchRates = (allMealRates || []).filter((r: any) => r.meal_type?.toLowerCase() === 'lunch')
  const dinnerRates = (allMealRates || []).filter((r: any) => r.meal_type?.toLowerCase() === 'dinner')
  // Flat fallback rate: average of all lunch/dinner rates, or hardcoded if none
  const lunchRate = lunchRates.length > 0
    ? lunchRates.reduce((sum: number, r: any) => sum + toNumber(r.base_rate_eur, 0), 0) / lunchRates.length
    : 0
  const dinnerRate = dinnerRates.length > 0
    ? dinnerRates.reduce((sum: number, r: any) => sum + toNumber(r.base_rate_eur, 0), 0) / dinnerRates.length
    : 0
  if (!allMealRates?.length) console.warn('⚠️ No meal rates found in meal_rates table')

  // Airport services (airport_staff_rates table — managed via Rates > Airport Services UI)
  const { data: airportServicesData } = await supabase.from('airport_staff_rates').select('*').eq('is_active', true)
  const airportServiceRate = airportServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 0
  if (!airportServiceRate) console.warn('⚠️ No airport service rates found in airport_staff_rates — airport service will be €0')

  // Hotel services (hotel_staff_rates table — managed via Rates > Hotel Services UI)
  const { data: hotelServicesData } = await supabase.from('hotel_staff_rates').select('*').eq('is_active', true)
  const hotelServiceRate = hotelServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 0
  if (!hotelServiceRate) console.warn('⚠️ No hotel service rates found in hotel_staff_rates — hotel service will be €0')

  // Accommodation
  let hotelRate = 0
  let hotelName_final = hotelName || null
  let selectedHotel: any = null

  if (includeAccommodation) {
    // PRIORITY 1: Try to match the specific hotel name from the parsed input — WITH tier filter
    if (hotelName) {
      // First: try name + tier match (correct behavior: respect the selected tier)
      const { data: namedHotelsTier } = await supabase
        .from('accommodation_rates')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .ilike('property_name', `%${hotelName}%`)
        .limit(3)

      if (namedHotelsTier?.length) {
        selectedHotel = namedHotelsTier[0]
        hotelRate = isEuroPassport
          ? toNumber(selectedHotel.pp_double_eur, 0)
          : toNumber(selectedHotel.pp_double_non_eur, 0)
        hotelName_final = selectedHotel.property_name
        console.log(`🏨 Matched hotel "${hotelName}" in ${tier} tier → ${selectedHotel.property_name} (rate: ${hotelRate})`)
      } else {
        // Fallback: name match ignoring tier — but log a warning about tier mismatch
        const { data: namedHotelsAny } = await supabase
          .from('accommodation_rates')
          .select('*')
          .eq('is_active', true)
          .ilike('property_name', `%${hotelName}%`)
          .limit(3)

        if (namedHotelsAny?.length) {
          const actualTier = namedHotelsAny[0].tier || 'unknown'
          console.warn(`⚠️ Hotel "${hotelName}" found but in "${actualTier}" tier (requested: "${tier}") — ignoring name match, will use tier-appropriate hotel instead`)
          // DO NOT select this hotel — fall through to Priority 2 (city + tier search)
        } else {
          console.log(`⚠️ Parsed hotel "${hotelName}" not found in accommodation_rates — falling back to tier search`)
        }
      }
    }

    // PRIORITY 2: Fall back to city + tier search if no hotel matched by name
    if (!selectedHotel) {
      const { data: hotels } = await supabase
        .from('accommodation_rates')
        .select('*')
        .ilike('city', effectiveCity)
        .eq('is_active', true)
        .eq('tier', tier)
        .order('created_at', { ascending: false })
        .limit(5)

      if (hotels?.length) {
        selectedHotel = hotels[0]
        hotelRate = isEuroPassport
          ? toNumber(selectedHotel.pp_double_eur, 0)
          : toNumber(selectedHotel.pp_double_non_eur, 0)
        hotelName_final = selectedHotel.property_name
      }
    }

    if (!hotelRate) {
      console.warn(`⚠️ No hotel rate found for ${effectiveCity}/${tier} — accommodation will be €0`)
    }
  }

  // Tipping rates (from tipping_rates table, tier-adjusted, per-role)
  const tippingRates = await getItemizedTippingRates(supabase, tier)

  return {
    vehiclePerDay,
    vehicleTypeName,
    vehicleServiceCode,
    vehicleSupplierName,
    transferRate,
    transferServiceCode: transferRates?.[0]?.id || vehicleServiceCode,
    transferSupplierName: transferRates?.[0]?.supplier_name || vehicleSupplierName,
    guidePerDay,
    selectedGuide,
    allEntranceFees: allEntranceFees || [],
    allActivityRates: allActivityRates || [],
    lunchRate,
    dinnerRate,
    allMealRates: (allMealRates || []) as MealRateRecord[],
    airportServiceRate,
    hotelServiceRate,
    hotelRate,
    hotelName: hotelName_final,
    selectedHotel,
    tippingRates,
  }
}

// ============================================
// CREATE LAND/STRUCTURED DAY SERVICES
// ============================================

export interface CreateDayServicesResult {
  dayId: string
  title: string
  description: string
  city: string
  overnightCity: string | null
}

export interface MealSelection {
  city: string
  mealType: 'lunch' | 'dinner'
  restaurantName: string
}

export async function createLandItineraryServices(
  supabase: any,
  params: {
    itineraryId: string
    itineraryData: any
    rates: PricingRates
    startDateObj: Date
    durationDays: number
    effectivePackageType: string
    effectiveCity: string
    totalPax: number
    isEuroPassport: boolean
    tier: ServiceTier
    language: string
    includeLunch: boolean
    includeDinner: boolean
    includeAccommodation: boolean
    includeGuide?: boolean  // Global guide override: true=always include, false=never include, undefined=per-day AI decision
    skipPricing: boolean
    marginPercent: number
    startDate: string
    currency?: string  // Target currency for client-facing prices (default: EUR)
  }
): Promise<{
  createdDays: CreateDayServicesResult[]
  totalSupplierCost: number
  totalClientPrice: number
  mealSelections: MealSelection[]
  warnings: string[]
}> {
  const {
    itineraryId, itineraryData, rates, startDateObj, durationDays,
    effectivePackageType, effectiveCity, totalPax, isEuroPassport,
    tier, language, includeLunch, includeDinner, includeAccommodation,
    includeGuide, skipPricing, marginPercent, startDate, currency = 'EUR',
  } = params

  // Fetch exchange rates for currency conversion
  let exchangeRates: ExchangeRates | null = null
  const needsConversion = currency !== 'EUR'
  let eurToTargetRate: number | null = null
  if (needsConversion) {
    try {
      exchangeRates = await fetchExchangeRates('EUR')
      eurToTargetRate = getExchangeRate('EUR', currency, exchangeRates)
      if (isUsingFallbackRates()) {
        console.warn(`⚠️ [Service Creation] Using FALLBACK exchange rates! EUR → ${currency} = ${eurToTargetRate || 'N/A'}. Live API unavailable.`)
      } else {
        console.log(`[Service Creation] Currency conversion: EUR → ${currency}, rate: ${eurToTargetRate || 'N/A'} (live)`)
      }
      // Persist the exchange rate snapshot for audit trail
      if (eurToTargetRate) {
        await persistExchangeRate(
          supabase, 'EUR', currency, eurToTargetRate,
          isUsingFallbackRates() ? 'fallback' : 'frankfurter'
        )
      }
    } catch (e) {
      console.warn('[Service Creation] Failed to fetch exchange rates, prices will remain in EUR:', e)
    }
  }

  // Convert EUR amount to target currency
  const toTargetCurrency = (eurAmount: number): number => {
    if (!needsConversion || !exchangeRates) return eurAmount
    return Math.round(convertCurrency(eurAmount, 'EUR', currency, exchangeRates) * 100) / 100
  }

  // Fetch configurable fixed daily costs (water, tips)
  const fixedCosts = await getFixedDailyCosts()
  const waterRatePerPerson = fixedCosts.waterPerPersonPerDay

  const marginMultiplier = 1 + (marginPercent / 100)
  const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

  // Helper: find best meal rate for a city + meal type, respecting tier
  // STRICT CITY FILTERING: Only returns restaurants in the requested city.
  // Never falls back to restaurants in other cities — uses a generic flat rate instead.
  // Within each matching step, preferred restaurants (is_preferred=true) are picked first.
  const findMealRate = (city: string, mealType: 'lunch' | 'dinner'): { rate: number; name: string; code: string; supplierName: string | null; warning: string | null } => {
    const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1)
    const allMeals = rates.allMealRates || []
    const typeMatches = allMeals.filter(r => r.meal_type?.toLowerCase() === mealType)

    // Helper: from a list of candidates, pick preferred first, then any
    const pickBest = (candidates: MealRateRecord[]): MealRateRecord | undefined => {
      const valid = candidates.filter(r => r.base_rate_eur > 0)
      return valid.find(r => r.is_preferred) || valid[0]
    }

    const formatResult = (match: MealRateRecord) => ({
      rate: match.base_rate_eur,
      name: `${mealLabel} - ${match.restaurant_name || city}`,
      code: match.service_code || mealType.toUpperCase(),
      supplierName: match.supplier_name || match.restaurant_name || null,
      warning: null
    })

    // --- CITY-SCOPED LOOKUP ONLY ---

    // 1. Best: city + meal_type + tier (prefer preferred)
    const cityTierCandidates = typeMatches.filter(r =>
      r.city?.toLowerCase() === city.toLowerCase() && r.tier?.toLowerCase() === tier
    )
    const cityTierMatch = pickBest(cityTierCandidates)
    if (cityTierMatch) return formatResult(cityTierMatch)

    // 2. City + meal_type, any tier (prefer preferred)
    const cityCandidates = typeMatches.filter(r => r.city?.toLowerCase() === city.toLowerCase())
    const cityMatch = pickBest(cityCandidates)
    if (cityMatch) return formatResult(cityMatch)

    // 3. NO cross-city fallback — use generic flat rate and warn
    const fallback = mealType === 'lunch' ? rates.lunchRate : rates.dinnerRate
    return {
      rate: fallback,
      name: `${mealLabel} - ${city}`,
      code: mealType.toUpperCase(),
      supplierName: null,
      warning: `No ${mealType} restaurant found for ${city} (${tier} tier) — using generic rate €${fallback}`
    }
  }

  let totalSupplierCost = 0
  let totalClientPrice = 0
  let landCruiseTransportAdded = false
  const createdDays: CreateDayServicesResult[] = []
  const mealSelections: MealSelection[] = []
  const warnings: string[] = []
  let previousDayData: any = null // Track previous day for intercity detection

  // ============================================
  // RATE VALIDATION — warn on missing/zero rates
  // ============================================
  if (!rates.vehiclePerDay && effectivePackageType !== 'cruise-package') {
    warnings.push(`No day tour transport rate found for ${effectiveCity} (${totalPax} pax) — transport will be €0`)
  }
  if (!rates.transferRate && effectivePackageType !== 'cruise-package') {
    warnings.push(`No airport transfer rate found for ${effectiveCity} (${totalPax} pax) — transfers will be €0`)
  }
  if (!rates.guidePerDay) {
    warnings.push(`No guide rate found for ${language} (${tier} tier) — guide services will be €0`)
  }
  if (includeAccommodation && !rates.hotelRate && effectivePackageType !== 'cruise-package') {
    warnings.push(`No hotel rate found for ${effectiveCity} (${tier} tier) — accommodation will be €0`)
  }
  if (!rates.airportServiceRate && effectivePackageType !== 'cruise-package') {
    warnings.push('No airport service rates found in airport_staff_rates — airport services will be €0')
  }
  if (!rates.hotelServiceRate && effectivePackageType !== 'cruise-package') {
    warnings.push('No hotel service rates found in hotel_staff_rates — hotel services will be €0')
  }
  if (!rates.allEntranceFees?.length) {
    warnings.push('No entrance fees found — all entrance fees will be €0')
  }
  if (!rates.allMealRates?.length && (includeLunch || includeDinner)) {
    warnings.push('No meal rates found in meal_rates table — all meals will use €0 fallback rate')
  }
  if (rates.tippingRates.allRates.length === 0) {
    warnings.push('No tipping rates found — tips will be €0')
  }

  const allDays = itineraryData.days || []
  for (let dayIndex = 0; dayIndex < allDays.length; dayIndex++) {
    const dayData = allDays[dayIndex]
    const dayNumber = dayData.day_number || 1
    const dayDate = new Date(startDateObj)
    dayDate.setDate(startDateObj.getDate() + dayNumber - 1)

    const isLastDay = dayNumber === durationDays
    const isTransferOnly = dayData.is_transfer_only || false
    const isSailingDay = dayData.is_sailing_day || false
    const isFreeDay = dayData.is_free_day || isSailingDay || false
    // Cruise day detection: trust AI output OR force based on package type
    const isCruiseDay = dayData.is_cruise_day || dayData.accommodation_type === 'cruise'
      || (effectivePackageType === 'cruise-package' && !isLastDay && !isTransferOnly)
    const dayNeedsGuide = includeGuide !== undefined
      ? (includeGuide && !isTransferOnly && !isFreeDay)  // Global override from user
      : (dayData.guide_required !== false && !isTransferOnly && !isFreeDay)  // Per-day AI decision
    // Cruise days: all meals included in cruise rate (Full Board) — no separate meal services
    const dayIncludesLunch = (isFreeDay || isCruiseDay) ? false : (dayData.includes_lunch ?? includeLunch)
    const dayIncludesDinner = isCruiseDay ? false : (dayData.includes_dinner ?? includeDinner)
    const includesHotelForDay = !isLastDay && includeAccommodation && !isCruiseDay && (dayData.includes_hotel !== false)

    // Airport & flight detection helpers
    // Primary: AI sets transport_type=flight and flight_info
    // Fallback: detect domestic flight from activities/description (e.g., "flight to Aswan", "domestic flight")
    // HYBRID PATTERN: A day can have BOTH a domestic flight AND international departure
    //   e.g., Day 9: HRG→CAI domestic flight + sightseeing + international departure MS955@23:20
    //   This needs 3 airport services: 1 at HRG (domestic departure), 2 at CAI (domestic arrival + international departure)
    const hasExplicitFlightInfo = !!dayData.flight_info && dayData.transport_type === 'flight'
    const hasDomesticFlightSignals = (
      // Check activities array for flight mentions
      (dayData.activities || []).some((a: string) =>
        /\b(flight|fly|domestic\s*flight)\b/i.test(a)
      )
      // Check description for flight mentions between Egyptian cities
      || /\b(domestic\s*flight|fly\s+to|flight\s+to\s+(aswan|luxor|cairo|hurghada|sharm))\b/i.test(dayData.description || '')
      // Check title for flight mentions
      || /\b(flight|fly)\b/i.test(dayData.title || '')
      // Check if transport_type mentions flight even without flight_info
      || dayData.transport_type === 'flight'
    )
    // Pure domestic flight (no international arrival/departure on same day)
    const isDomesticFlight = !dayData.is_arrival && !dayData.is_departure
      && (hasExplicitFlightInfo || hasDomesticFlightSignals)
    // Hybrid: domestic flight + international departure on same day
    // e.g., HRG→CAI by flight, sightseeing in Cairo, then international departure
    const isHybridDomesticDeparture = dayData.is_departure && !dayData.is_arrival
      && (hasExplicitFlightInfo || hasDomesticFlightSignals)
    // Hybrid: international arrival + domestic flight on same day
    const isHybridDomesticArrival = dayData.is_arrival && !dayData.is_departure
      && (hasExplicitFlightInfo || hasDomesticFlightSignals)
    const hasDomesticFlightOnThisDay = isDomesticFlight || isHybridDomesticDeparture || isHybridDomesticArrival
    if (hasDomesticFlightOnThisDay && !hasExplicitFlightInfo) {
      console.warn(`⚠️ Day ${dayNumber}: Detected domestic flight from activities/description but AI didn't set transport_type=flight`)
    }
    const hasAirportOnThisDay = dayData.is_arrival || dayData.is_departure || hasDomesticFlightOnThisDay
    const hasSightseeingOnThisDay = !isTransferOnly && !isFreeDay
      && ((dayData.attractions?.length > 0) || dayData.guide_required !== false)

    // Intercity transfer detection: city changed from previous day by road (not flight)
    // Includes cruise-to-land transitions (e.g., cruise checkout in Luxor → drive to Hurghada)
    // For day trips (cities_visited but same overnight city), the previous day's overnight_city
    // should be the base city — not the visited city. If overnight_city is null/empty, prefer
    // effectiveCity over the visited city to avoid false intercity detection.
    const prevCitiesVisited = previousDayData?.cities_visited || []
    const previousWasDayTrip = prevCitiesVisited.length > 1
    const previousOvernightCity = previousDayData?.overnight_city
      || (previousWasDayTrip ? effectiveCity : previousDayData?.city)
    const currentCity = dayData.city || effectiveCity
    const previousWasCruise = previousDayData?.accommodation_type === 'cruise' || previousDayData?.is_cruise_day
    const isIntercityTransfer = previousDayData
      && previousOvernightCity
      && previousOvernightCity.toLowerCase() !== currentCity.toLowerCase()
      && !hasDomesticFlightOnThisDay  // Any domestic flight means city change is by air, not road
      && !isCruiseDay  // Current day is NOT a cruise day (previous CAN be cruise — this handles checkout + drive)
      && !dayData.is_arrival  // International arrivals are not intercity

    // Generate appropriate title for free/sailing days
    let dayTitle = dayData.title || `Day ${dayNumber}`
    if (isSailingDay && !dayTitle.toLowerCase().includes('sailing')) {
      dayTitle = `Day ${dayNumber}: Sailing Day on the Nile`
    } else if (isFreeDay && !isSailingDay && !dayTitle.toLowerCase().includes('free') && !dayTitle.toLowerCase().includes('leisure')) {
      dayTitle = `Day ${dayNumber}: Day at Leisure`
    }

    // Create day record - for tours-only/day-trips, no overnight city
    const overnightCityValue = (effectivePackageType === 'tours-only' || effectivePackageType === 'day-trips')
      ? null
      : (dayData.overnight_city || dayData.city || effectiveCity)

    const { data: day, error: dayError } = await supabase
      .from('itinerary_days')
      .insert({
        itinerary_id: itineraryId,
        day_number: dayNumber,
        date: dayDate.toISOString().split('T')[0],
        title: dayTitle,
        description: dayData.description || '',
        city: dayData.city || effectiveCity,
        overnight_city: overnightCityValue,
        attractions: dayData.attractions || [],
        guide_required: dayNeedsGuide,
        lunch_included: dayIncludesLunch,
        dinner_included: dayIncludesDinner,
        hotel_included: includesHotelForDay,
        is_cruise_day: isCruiseDay
      })
      .select()
      .single()

    if (dayError) {
      console.error(`❌ Error creating day ${dayNumber}:`, dayError)
      continue
    }

    createdDays.push({
      dayId: day.id,
      title: dayTitle,
      description: dayData.description || '',
      city: dayData.city || effectiveCity,
      overnightCity: overnightCityValue,
    })

    if (skipPricing) continue

    // Handle departure day - transfer + airport/hotel services
    // On cruise days, the bundled cruise transport covers transfers + airport staff + check-out
    if (dayData.is_departure && isTransferOnly && !isCruiseDay) {
      const departureServices: any[] = []

      // Airport service (international departure)
      departureServices.push({
        service_type: 'airport_service',
        service_code: 'AIRPORT',
        service_name: 'Airport Meet & Assist (International)',
        quantity: 1,
        rate_eur: rates.airportServiceRate,
        rate_non_eur: rates.airportServiceRate,
        total_cost: rates.airportServiceRate,
        client_price: withMargin(rates.airportServiceRate),
        notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
      })
      totalSupplierCost += rates.airportServiceRate
      totalClientPrice += withMargin(rates.airportServiceRate)

      // Hotel service (check-out assistance)
      const isCruiseCheckout = dayData.accommodation_type === 'cruise' || dayData.is_cruise_day
      departureServices.push({
        service_type: 'hotel_service',
        service_code: 'HOTEL-SVC',
        service_name: isCruiseCheckout ? 'Cruise Disembarkation Assistance' : 'Hotel Porterage & Assistance',
        quantity: 1,
        rate_eur: rates.hotelServiceRate,
        rate_non_eur: rates.hotelServiceRate,
        total_cost: rates.hotelServiceRate,
        client_price: withMargin(rates.hotelServiceRate),
        notes: isCruiseCheckout ? 'Cruise disembarkation assistance' : 'Hotel check-out assistance'
      })
      totalSupplierCost += rates.hotelServiceRate
      totalClientPrice += withMargin(rates.hotelServiceRate)

      // Transfer to airport
      departureServices.push({
        service_type: 'transportation',
        service_code: rates.transferServiceCode,
        service_name: 'Airport Transfer',
        supplier_name: rates.transferSupplierName,
        quantity: 1,
        rate_eur: rates.transferRate,
        rate_non_eur: rates.transferRate,
        total_cost: rates.transferRate,
        client_price: withMargin(rates.transferRate),
        notes: 'Transfer to airport'
      })
      totalSupplierCost += rates.transferRate
      totalClientPrice += withMargin(rates.transferRate)

      // Departure day tips (porter at airport + driver for transfer)
      const departureTipRoles = determineTipRolesForDay({
        hasGuide: false,
        hasDriver: true,
        hasAirportService: true,
        airportServiceCount: 1,
        hasHotelNight: false,
        isCruiseDay: false,
        isTransferOnly: true,
        isFreeDay: false,
      })
      for (const tipRole of departureTipRoles) {
        const tipRate = rates.tippingRates.getRate(tipRole.role, tipRole.context)
        if (tipRate > 0) {
          const totalTipCost = tipRate * tipRole.quantity
          departureServices.push({
            service_type: 'tips',
            service_code: `TIPS-${tipRole.role.toUpperCase()}`,
            service_name: formatTipServiceName(tipRole.role, tipRole.context),
            quantity: tipRole.quantity,
            rate_eur: tipRate,
            rate_non_eur: tipRate,
            total_cost: totalTipCost,
            client_price: withMargin(totalTipCost),
            notes: formatTipNotes(tipRole.role, tipRole.context, tipRole.quantity)
          })
          totalSupplierCost += totalTipCost
          totalClientPrice += withMargin(totalTipCost)
        }
      }

      // Insert all departure services (with multi-currency tracking)
      for (const svc of departureServices) {
        await supabase.from('itinerary_services').insert({
          itinerary_day_id: day.id,
          ...svc,
          // Multi-currency: all rates are EUR-based; store original cost + exchange rate
          supplier_currency: 'EUR',
          supplier_cost_original: svc.total_cost,
          exchange_rate_used: eurToTargetRate || 1,
          // Convert client-facing prices to target currency
          total_cost: toTargetCurrency(svc.total_cost),
          client_price: toTargetCurrency(svc.client_price),
        })
      }
      continue
    }

    // Services array
    const services: any[] = []

    // Airport Services (for arrivals/departures/domestic flights)
    // Skip on cruise days — bundled cruise transport covers airport staff + transfers
    if (!isCruiseDay && (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info || hasDomesticFlightOnThisDay)) {
      if (isDomesticFlight || isHybridDomesticDeparture || isHybridDomesticArrival) {
        // Domestic flight: airport services at BOTH departure and arrival airports
        services.push({
          service_type: 'airport_service',
          service_code: 'AIRPORT',
          service_name: 'Airport Meet & Assist - Departure (Domestic)',
          quantity: 1,
          rate_eur: rates.airportServiceRate,
          rate_non_eur: rates.airportServiceRate,
          total_cost: rates.airportServiceRate,
          client_price: withMargin(rates.airportServiceRate),
          notes: `Domestic flight departure: ${dayData.flight_info || ''}`
        })
        totalSupplierCost += rates.airportServiceRate
        totalClientPrice += withMargin(rates.airportServiceRate)

        services.push({
          service_type: 'airport_service',
          service_code: 'AIRPORT',
          service_name: 'Airport Meet & Assist - Arrival (Domestic)',
          quantity: 1,
          rate_eur: rates.airportServiceRate,
          rate_non_eur: rates.airportServiceRate,
          total_cost: rates.airportServiceRate,
          client_price: withMargin(rates.airportServiceRate),
          notes: `Domestic flight arrival at ${dayData.city || 'destination'}`
        })
        totalSupplierCost += rates.airportServiceRate
        totalClientPrice += withMargin(rates.airportServiceRate)

        // HYBRID: If this day also has an international departure/arrival, add a 3rd airport service
        if (isHybridDomesticDeparture) {
          services.push({
            service_type: 'airport_service',
            service_code: 'AIRPORT',
            service_name: 'Airport Meet & Assist (International Departure)',
            quantity: 1,
            rate_eur: rates.airportServiceRate,
            rate_non_eur: rates.airportServiceRate,
            total_cost: rates.airportServiceRate,
            client_price: withMargin(rates.airportServiceRate),
            notes: `International departure: ${dayData.departure_flight_info || dayData.flight_info || ''}`
          })
          totalSupplierCost += rates.airportServiceRate
          totalClientPrice += withMargin(rates.airportServiceRate)
        }
        if (isHybridDomesticArrival) {
          services.push({
            service_type: 'airport_service',
            service_code: 'AIRPORT',
            service_name: 'Airport Meet & Assist (International Arrival)',
            quantity: 1,
            rate_eur: rates.airportServiceRate,
            rate_non_eur: rates.airportServiceRate,
            total_cost: rates.airportServiceRate,
            client_price: withMargin(rates.airportServiceRate),
            notes: `International arrival: ${dayData.arrival_flight_info || dayData.flight_info || ''}`
          })
          totalSupplierCost += rates.airportServiceRate
          totalClientPrice += withMargin(rates.airportServiceRate)
        }

        // Domestic flight needs TWO airport transfers (hotel→airport + airport→destination)
        services.push({
          service_type: 'transportation',
          service_code: rates.transferServiceCode,
          service_name: 'Airport Transfer - Departure City',
          supplier_name: rates.transferSupplierName,
          quantity: 1,
          rate_eur: rates.transferRate,
          rate_non_eur: rates.transferRate,
          total_cost: rates.transferRate,
          client_price: withMargin(rates.transferRate),
          notes: 'Transfer to departure airport'
        })
        totalSupplierCost += rates.transferRate
        totalClientPrice += withMargin(rates.transferRate)

        services.push({
          service_type: 'transportation',
          service_code: rates.transferServiceCode,
          service_name: 'Airport Transfer - Arrival City',
          supplier_name: rates.transferSupplierName,
          quantity: 1,
          rate_eur: rates.transferRate,
          rate_non_eur: rates.transferRate,
          total_cost: rates.transferRate,
          client_price: withMargin(rates.transferRate),
          notes: `Transfer from ${dayData.city || 'destination'} airport`
        })
        totalSupplierCost += rates.transferRate
        totalClientPrice += withMargin(rates.transferRate)

        // HYBRID departure: also need transfer to final international departure airport
        if (isHybridDomesticDeparture) {
          services.push({
            service_type: 'transportation',
            service_code: rates.transferServiceCode,
            service_name: 'Airport Transfer - International Departure',
            supplier_name: rates.transferSupplierName,
            quantity: 1,
            rate_eur: rates.transferRate,
            rate_non_eur: rates.transferRate,
            total_cost: rates.transferRate,
            client_price: withMargin(rates.transferRate),
            notes: 'Transfer to international departure airport'
          })
          totalSupplierCost += rates.transferRate
          totalClientPrice += withMargin(rates.transferRate)
        }
      } else {
        // International arrival/departure OR explicit needs_airport_service
        const isInternational = dayData.is_arrival || dayData.is_departure
        const serviceDesc = isInternational ? 'Airport Meet & Assist (International)' : 'Airport Meet & Assist (Domestic)'

        services.push({
          service_type: 'airport_service',
          service_code: 'AIRPORT',
          service_name: serviceDesc,
          quantity: 1,
          rate_eur: rates.airportServiceRate,
          rate_non_eur: rates.airportServiceRate,
          total_cost: rates.airportServiceRate,
          client_price: withMargin(rates.airportServiceRate),
          notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
        })
        totalSupplierCost += rates.airportServiceRate
        totalClientPrice += withMargin(rates.airportServiceRate)
      }
    }

    // Hotel Services (for check-in/check-out — hotels only, not cruise)
    // On cruise days, check-in/check-out assistance is included in the bundled cruise transport
    if (!isCruiseDay && (dayData.needs_hotel_service || dayData.is_arrival || dayData.is_departure) && !isFreeDay) {
      const isCruiseService = dayData.accommodation_type === 'cruise' || dayData.is_cruise_day
      services.push({
        service_type: 'hotel_service',
        service_code: 'HOTEL-SVC',
        service_name: isCruiseService ? 'Cruise Boarding Assistance' : 'Hotel Porterage & Assistance',
        quantity: 1,
        rate_eur: rates.hotelServiceRate,
        rate_non_eur: rates.hotelServiceRate,
        total_cost: rates.hotelServiceRate,
        client_price: withMargin(rates.hotelServiceRate),
        notes: isCruiseService ? 'Cruise embarkation/disembarkation assistance' : 'Hotel check-in/out assistance'
      })
      totalSupplierCost += rates.hotelServiceRate
      totalClientPrice += withMargin(rates.hotelServiceRate)
    }

    // Intercity Transfer (road transfer between cities, e.g., Aswan→Luxor, Luxor→Hurghada)
    // Detected when the day's city differs from the previous day's overnight city
    // This is SEPARATE from the local sightseeing vehicle at the destination
    if (isIntercityTransfer) {
      const originCity = previousOvernightCity || effectiveCity
      const destCity = currentCity

      // Try to fetch route-specific intercity rate from transportation_rates
      const { getTransportRateForPax: getIntercityRate } = await import('@/lib/transport-rate-utils')
      const { data: intercityRates } = await supabase
        .from('transportation_rates')
        .select('*')
        .eq('is_active', true)
        .eq('service_type', 'intercity_transfer')
        .ilike('origin_city', originCity)
        .ilike('destination_city', destCity)
        .limit(1)

      let intercityRate = 0
      let intercityVehicle = 'Vehicle'
      let intercityServiceCode = 'INTERCITY'
      let intercitySupplier: string | null = null

      if (intercityRates?.length) {
        const result = getIntercityRate(intercityRates[0], totalPax, isEuroPassport)
        if (result) {
          intercityRate = isEuroPassport ? result.rateEur : result.rateNonEur
          intercityVehicle = result.vehicleType
          intercityServiceCode = intercityRates[0].id || 'INTERCITY'
          intercitySupplier = intercityRates[0].supplier_name || null
        }
      }

      // Fallback: if no route-specific rate, use the day-tour vehicle rate as approximation
      if (!intercityRate) {
        console.warn(`⚠️ No intercity rate found for ${originCity}→${destCity} — using day-tour rate as fallback`)
        intercityRate = rates.vehiclePerDay
        intercityVehicle = rates.vehicleTypeName
        intercityServiceCode = rates.vehicleServiceCode
        intercitySupplier = rates.vehicleSupplierName
      }

      services.push({
        service_type: 'transportation',
        service_code: intercityServiceCode,
        service_name: `Intercity Transfer (${originCity} → ${destCity})`,
        supplier_name: intercitySupplier,
        quantity: 1,
        rate_eur: intercityRate,
        rate_non_eur: intercityRate,
        total_cost: intercityRate,
        client_price: withMargin(intercityRate),
        notes: `${intercityVehicle} transfer from ${originCity} to ${destCity}`
      })
      totalSupplierCost += intercityRate
      totalClientPrice += withMargin(intercityRate)

      // Check-out at origin city (hotel or cruise disembarkation)
      if (!dayData.is_departure && !dayData.is_arrival) {
        const checkoutServiceName = previousWasCruise
          ? 'Cruise Disembarkation Assistance'
          : 'Hotel Check-out Assistance'
        const checkoutNotes = previousWasCruise
          ? `Cruise disembarkation in ${originCity}`
          : `Hotel check-out in ${originCity}`
        services.push({
          service_type: 'hotel_service',
          service_code: 'HOTEL-SVC',
          service_name: checkoutServiceName,
          quantity: 1,
          rate_eur: rates.hotelServiceRate,
          rate_non_eur: rates.hotelServiceRate,
          total_cost: rates.hotelServiceRate,
          client_price: withMargin(rates.hotelServiceRate),
          notes: checkoutNotes
        })
        totalSupplierCost += rates.hotelServiceRate
        totalClientPrice += withMargin(rates.hotelServiceRate)

        // Hotel check-in at destination (if staying overnight, not last day)
        if (!isLastDay && includeAccommodation) {
          services.push({
            service_type: 'hotel_service',
            service_code: 'HOTEL-SVC',
            service_name: 'Hotel Check-in Assistance',
            quantity: 1,
            rate_eur: rates.hotelServiceRate,
            rate_non_eur: rates.hotelServiceRate,
            total_cost: rates.hotelServiceRate,
            client_price: withMargin(rates.hotelServiceRate),
            notes: `Hotel check-in in ${destCity}`
          })
          totalSupplierCost += rates.hotelServiceRate
          totalClientPrice += withMargin(rates.hotelServiceRate)
        }
      }
    }

    // Airport Transfer (separate from sightseeing vehicle)
    // When a day has BOTH an international arrival/departure AND sightseeing,
    // the airport transfer is a separate service from the day-tour vehicle.
    // Domestic flights already have their transfers added above.
    if (hasAirportOnThisDay && hasSightseeingOnThisDay && !isDomesticFlight) {
      services.push({
        service_type: 'transportation',
        service_code: rates.transferServiceCode,
        service_name: 'Airport Transfer',
        supplier_name: rates.transferSupplierName,
        quantity: 1,
        rate_eur: rates.transferRate,
        rate_non_eur: rates.transferRate,
        total_cost: rates.transferRate,
        client_price: withMargin(rates.transferRate),
        notes: dayData.is_arrival
          ? 'Airport to hotel/first stop transfer'
          : 'Hotel to airport transfer'
      })
      totalSupplierCost += rates.transferRate
      totalClientPrice += withMargin(rates.transferRate)
    }

    // Day-trip intercity transport: when cities_visited includes a different city but
    // overnight_city is the base city (round trip pattern, e.g., Cairo→Alexandria→Cairo)
    // This adds the intercity round-trip vehicle SEPARATE from the local sightseeing sedan
    const citiesVisited = dayData.cities_visited || []
    const overnightCity = (dayData.overnight_city || dayData.city || effectiveCity).toLowerCase()
    const dayTripCity = citiesVisited.find((c: string) =>
      c.toLowerCase() !== overnightCity && c.toLowerCase() !== effectiveCity.toLowerCase()
    )
    const isDayTrip = !!dayTripCity && !isIntercityTransfer && !isCruiseDay

    if (isDayTrip) {
      // Fetch round-trip intercity rate for the day trip (e.g., Cairo→Alexandria round trip)
      const { getTransportRateForPax: getDayTripRate } = await import('@/lib/transport-rate-utils')
      const { data: dayTripRates } = await supabase
        .from('transportation_rates')
        .select('*')
        .eq('is_active', true)
        .eq('service_type', 'intercity_transfer')
        .ilike('origin_city', overnightCity.charAt(0).toUpperCase() + overnightCity.slice(1))
        .ilike('destination_city', dayTripCity)
        .limit(1)

      let dayTripRate = 0
      let dayTripVehicle = 'Vehicle'
      let dayTripCode = 'DAY-TRIP-TRANSPORT'
      let dayTripSupplier: string | null = null

      if (dayTripRates?.length) {
        const result = getDayTripRate(dayTripRates[0], totalPax, isEuroPassport)
        if (result) {
          dayTripRate = isEuroPassport ? result.rateEur : result.rateNonEur
          dayTripVehicle = result.vehicleType
          dayTripCode = dayTripRates[0].id || 'DAY-TRIP-TRANSPORT'
          dayTripSupplier = dayTripRates[0].supplier_name || null
        }
      }

      if (dayTripRate > 0) {
        services.push({
          service_type: 'transportation',
          service_code: dayTripCode,
          service_name: `${dayTripVehicle} Day Trip Transfer (${overnightCity.charAt(0).toUpperCase() + overnightCity.slice(1)} → ${dayTripCity} → ${overnightCity.charAt(0).toUpperCase() + overnightCity.slice(1)})`,
          supplier_name: dayTripSupplier,
          quantity: 1,
          rate_eur: dayTripRate,
          rate_non_eur: dayTripRate,
          total_cost: dayTripRate,
          client_price: withMargin(dayTripRate),
          notes: `Round-trip intercity transfer for ${dayTripCity} day trip`
        })
        totalSupplierCost += dayTripRate
        totalClientPrice += withMargin(dayTripRate)
        console.log(`🚌 Day ${dayNumber}: Added day-trip intercity transfer ${overnightCity}→${dayTripCity} (€${dayTripRate})`)
      } else {
        console.warn(`⚠️ Day ${dayNumber}: No intercity rate found for day trip to ${dayTripCity}`)
      }
    }

    // Transportation (skip for cruise days — bundled transport added separately)
    // Skip for domestic flight days — their transfers are already added above
    // For intercity days: skip if transfer-only (intercity vehicle is already the transport),
    // but ADD local sightseeing vehicle if there are attractions at the destination
    const skipRegularTransport = hasDomesticFlightOnThisDay || (isIntercityTransfer && isTransferOnly)
    if (!isFreeDay && !isCruiseDay && !skipRegularTransport) {
      // --- Per-day transport rate lookup ---
      // If the day is in a different city, fetch transport rate for THAT city
      // For day trips: use the destination city for the local sightseeing vehicle
      const dayCity = isDayTrip && dayTripCity ? dayTripCity : (dayData.city || effectiveCity)
      let dayTransportRate = rates.vehiclePerDay
      let dayTransportName = rates.vehicleTypeName
      let dayTransportCode = rates.vehicleServiceCode
      let dayTransportSupplier = rates.vehicleSupplierName
      let dayTransferRate = rates.transferRate
      let dayTransferCode = rates.transferServiceCode
      let dayTransferSupplier = rates.transferSupplierName

      if (dayCity.toLowerCase() !== effectiveCity.toLowerCase()) {
        // Fetch city-specific transport rates
        const { getTransportRateForPax: getCityTransportRate } = await import('@/lib/transport-rate-utils')
        const { data: cityDayTourRates } = await supabase
          .from('transportation_rates')
          .select('*')
          .eq('is_active', true)
          .eq('service_type', 'day_tour')
          .ilike('city', dayCity)
          .limit(1)

        if (cityDayTourRates?.length) {
          const result = getCityTransportRate(cityDayTourRates[0], totalPax, isEuroPassport)
          if (result) {
            dayTransportRate = isEuroPassport ? result.rateEur : result.rateNonEur
            dayTransportName = result.vehicleType
            dayTransportCode = cityDayTourRates[0].id || rates.vehicleServiceCode
            dayTransportSupplier = cityDayTourRates[0].supplier_name || null
            console.log(`🚗 Day ${dayNumber} (${dayCity}): Using city-specific transport rate €${dayTransportRate}`)
          }
        } else {
          console.warn(`⚠️ Day ${dayNumber}: No transport rate found for ${dayCity} — using ${effectiveCity} rate €${dayTransportRate}`)
        }

        // Also fetch city-specific transfer rate
        const { data: cityTransferRates } = await supabase
          .from('transportation_rates')
          .select('*')
          .eq('is_active', true)
          .eq('service_type', 'airport_transfer')
          .ilike('city', dayCity)
          .limit(1)

        if (cityTransferRates?.length) {
          const result = getCityTransportRate(cityTransferRates[0], totalPax, isEuroPassport)
          if (result) {
            dayTransferRate = isEuroPassport ? result.rateEur : result.rateNonEur
            dayTransferCode = cityTransferRates[0].id || rates.transferServiceCode
            dayTransferSupplier = cityTransferRates[0].supplier_name || null
          }
        }
      }

      const transportRate = (isTransferOnly && !isIntercityTransfer) ? dayTransferRate : dayTransportRate
      const transportName = (isTransferOnly && !isIntercityTransfer)
        ? 'Airport/Hotel Transfer'
        : isDayTrip && dayTripCity
          ? `${dayTransportName} Sightseeing Transportation (${dayTripCity})`
          : isIntercityTransfer && hasSightseeingOnThisDay
            ? `${dayTransportName} Sightseeing Transportation (${currentCity})`
            : `${dayTransportName} Transportation`
      services.push({
        service_type: 'transportation',
        service_code: (isTransferOnly && !isIntercityTransfer) ? dayTransferCode : dayTransportCode,
        service_name: transportName,
        supplier_name: (isTransferOnly && !isIntercityTransfer) ? dayTransferSupplier : dayTransportSupplier,
        quantity: 1,
        rate_eur: transportRate,
        rate_non_eur: transportRate,
        total_cost: transportRate,
        client_price: withMargin(transportRate),
        notes: isDayTrip && dayTripCity
          ? `Local sightseeing vehicle in ${dayTripCity}`
          : isIntercityTransfer
            ? `Local sightseeing vehicle in ${currentCity}`
            : `From ${dayData.city || effectiveCity}`
      })
      totalSupplierCost += transportRate
      totalClientPrice += withMargin(transportRate)
    }

    // Domestic flight + sightseeing: add the day-tour vehicle (transfers already added above)
    if (hasDomesticFlightOnThisDay && hasSightseeingOnThisDay && !isCruiseDay) {
      services.push({
        service_type: 'transportation',
        service_code: rates.vehicleServiceCode,
        service_name: `${rates.vehicleTypeName} Sightseeing Transportation`,
        supplier_name: rates.vehicleSupplierName,
        quantity: 1,
        rate_eur: rates.vehiclePerDay,
        rate_non_eur: rates.vehiclePerDay,
        total_cost: rates.vehiclePerDay,
        client_price: withMargin(rates.vehiclePerDay),
        notes: `Sightseeing in ${dayData.city || effectiveCity}`
      })
      totalSupplierCost += rates.vehiclePerDay
      totalClientPrice += withMargin(rates.vehiclePerDay)
    }

    // Guide (only if required for this day)
    if (dayNeedsGuide) {
      services.push({
        service_type: 'guide',
        service_code: rates.selectedGuide?.id || 'GUIDE',
        service_name: `${language} Speaking Guide`,
        supplier_name: rates.selectedGuide?.name || null,
        quantity: 1,
        rate_eur: rates.guidePerDay,
        rate_non_eur: rates.guidePerDay,
        total_cost: rates.guidePerDay,
        client_price: withMargin(rates.guidePerDay),
        notes: `Professional ${language} guide`
      })
      totalSupplierCost += rates.guidePerDay
      totalClientPrice += withMargin(rates.guidePerDay)
    }

    // Context-aware tips — roles determined by what services are on this day
    const dayTipRoles = determineTipRolesForDay({
      hasGuide: dayNeedsGuide,
      hasDriver: !isFreeDay && !isCruiseDay,
      hasAirportService: hasAirportOnThisDay,
      airportServiceCount: isHybridDomesticDeparture ? 3 : (hasDomesticFlightOnThisDay ? 2 : (hasAirportOnThisDay ? 1 : 0)),
      hasHotelNight: includesHotelForDay,
      isCruiseDay,
      isTransferOnly,
      isFreeDay,
    })
    for (const tipRole of dayTipRoles) {
      const tipRate = rates.tippingRates.getRate(tipRole.role, tipRole.context)
      if (tipRate > 0) {
        const totalTipCost = tipRate * tipRole.quantity
        services.push({
          service_type: 'tips',
          service_code: `TIPS-${tipRole.role.toUpperCase()}`,
          service_name: formatTipServiceName(tipRole.role, tipRole.context),
          quantity: tipRole.quantity,
          rate_eur: tipRate,
          rate_non_eur: tipRate,
          total_cost: totalTipCost,
          client_price: withMargin(totalTipCost),
          notes: formatTipNotes(tipRole.role, tipRole.context, tipRole.quantity)
        })
        totalSupplierCost += totalTipCost
        totalClientPrice += withMargin(totalTipCost)
      }
    }

    // Entrance fees — all attractions get fees by default, except photo_stops (outside only)
    const entranceAttractions = dayData.attractions || []
    const photoStops = dayData.photo_stops || []

    if (entranceAttractions.length > 0 && !isTransferOnly && !isFreeDay) {
      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []

      for (const attr of entranceAttractions) {
        // Skip if this attraction is in photo_stops (outside viewing only, no fee)
        if (photoStops.some((ps: string) => ps.toLowerCase() === attr.toLowerCase())) {
          continue
        }

        // Normalize attraction name for better matching
        const normalizedAttr = normalizeAttractionForMatch(attr)

        // Find best match: prefer exact match, then STRICT partial match only
        let fee = rates.allEntranceFees.find((ef: any) =>
          ef.attraction_name.toLowerCase() === normalizedAttr.toLowerCase()
        )
        let matchType = 'exact'
        if (!fee) {
          // STRICT partial match — require substantial name overlap to prevent
          // false matches like "Solar Boat Museum" → "Egyptian Museum"
          const sortedFees = [...(rates.allEntranceFees || [])].sort(
            (a: any, b: any) => (b.attraction_name?.length || 0) - (a.attraction_name?.length || 0)
          )
          fee = sortedFees.find((ef: any) => {
            const dbName = ef.attraction_name.toLowerCase()
            const searchName = normalizedAttr.toLowerCase()
            // Require at least 50% name overlap ratio to prevent false matches
            const overlapRatio = Math.min(dbName.length, searchName.length) / Math.max(dbName.length, searchName.length)
            return overlapRatio > 0.5 && (dbName.includes(searchName) || searchName.includes(dbName))
          })
          if (fee) {
            matchType = 'partial'
            const dbName = fee.attraction_name.toLowerCase()
            const searchName = normalizedAttr.toLowerCase()
            const ratio = Math.min(dbName.length, searchName.length) / Math.max(dbName.length, searchName.length)
            console.warn(`⚠️ Day ${dayNumber}: Partial entrance fee match: "${attr}" → "${fee.attraction_name}" (overlap: ${(ratio * 100).toFixed(0)}%)`)
          }
        }

        if (fee) {
          // Check if it's an add-on (should be excluded from automatic pricing)
          if (fee.is_addon) continue

          const feePerPerson = isEuroPassport
            ? toNumber(fee.eur_rate, 0)
            : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
          dayEntranceTotal += feePerPerson * totalPax
          matchedAttractions.push(fee.attraction_name)
          if (matchType === 'exact') {
            console.log(`✅ Day ${dayNumber}: Entrance fee matched: "${attr}" → "${fee.attraction_name}" = €${feePerPerson}/person`)
          }
        } else {
          // Fallback: check activity_rates (sea trips, boat rides, etc.)
          const activityMatch = (rates.allActivityRates || []).find((ar: any) =>
            ar.activity_name?.toLowerCase() === normalizedAttr.toLowerCase()
            || ar.activity_name?.toLowerCase().includes(normalizedAttr.toLowerCase())
            || normalizedAttr.toLowerCase().includes(ar.activity_name?.toLowerCase() || '')
          )
          if (activityMatch) {
            const activityRate = isEuroPassport
              ? toNumber(activityMatch.base_rate_eur || activityMatch.eur_rate, 0)
              : toNumber(activityMatch.base_rate_non_eur || activityMatch.non_eur_rate, activityMatch.base_rate_eur || activityMatch.eur_rate || 0)
            dayEntranceTotal += activityRate * totalPax
            matchedAttractions.push(activityMatch.activity_name || attr)
            console.log(`✅ Day ${dayNumber}: Activity rate matched: "${attr}" → "${activityMatch.activity_name}" = €${activityRate}/person`)
          } else {
            console.warn(`❌ Day ${dayNumber}: No entrance fee or activity rate found for "${attr}" (normalized: "${normalizedAttr}") — skipping`)
            warnings.push(`Day ${dayNumber}: No entrance fee or activity rate found for "${attr}" — skipping`)
          }
        }
      }

      if (dayEntranceTotal > 0) {
        const notesText = photoStops.length > 0
          ? `Entrance: ${matchedAttractions.join(', ')} | Photo stops: ${photoStops.join(', ')}`
          : `Sites: ${matchedAttractions.join(', ')}`

        services.push({
          service_type: 'entrance',
          service_code: 'ENTRANCE',
          service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
          quantity: totalPax,
          rate_eur: dayEntranceTotal / totalPax,
          rate_non_eur: dayEntranceTotal / totalPax,
          total_cost: dayEntranceTotal,
          client_price: withMargin(dayEntranceTotal),
          notes: notesText
        })
        totalSupplierCost += dayEntranceTotal
        totalClientPrice += withMargin(dayEntranceTotal)
      }
    }

    // Lunch (only if included for this day) — strict city-scoped lookup
    if (dayIncludesLunch) {
      const lunch = findMealRate(currentCity, 'lunch')
      if (lunch.warning) warnings.push(`Day ${dayNumber}: ${lunch.warning}`)
      const lunchCost = lunch.rate * totalPax
      const lunchRestaurant = lunch.supplierName || null
      services.push({
        service_type: 'meal',
        service_code: lunch.code,
        service_name: lunch.name,
        quantity: totalPax,
        rate_eur: lunch.rate,
        rate_non_eur: lunch.rate,
        total_cost: lunchCost,
        client_price: withMargin(lunchCost),
        notes: lunchRestaurant ? `Lunch at ${lunchRestaurant}` : 'Lunch at local restaurant'
      })
      if (lunchRestaurant) {
        mealSelections.push({ city: currentCity, mealType: 'lunch', restaurantName: lunchRestaurant })
      }
      totalSupplierCost += lunchCost
      totalClientPrice += withMargin(lunchCost)
    }

    // Dinner (only if included for this day) — strict city-scoped lookup
    if (dayIncludesDinner) {
      const dinner = findMealRate(currentCity, 'dinner')
      if (dinner.warning) warnings.push(`Day ${dayNumber}: ${dinner.warning}`)
      const dinnerCost = dinner.rate * totalPax
      const dinnerRestaurant = dinner.supplierName || null
      services.push({
        service_type: 'meal',
        service_code: dinner.code,
        service_name: dinner.name,
        quantity: totalPax,
        rate_eur: dinner.rate,
        rate_non_eur: dinner.rate,
        total_cost: dinnerCost,
        client_price: withMargin(dinnerCost),
        notes: dinnerRestaurant ? `Dinner at ${dinnerRestaurant}` : 'Dinner'
      })
      if (dinnerRestaurant) {
        mealSelections.push({ city: currentCity, mealType: 'dinner', restaurantName: dinnerRestaurant })
      }
      totalSupplierCost += dinnerCost
      totalClientPrice += withMargin(dinnerCost)
    }

    // Water (for touring days only, not on cruise — included on board)
    if (!isTransferOnly && !isFreeDay && !isCruiseDay) {
      const waterCost = waterRatePerPerson * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterRatePerPerson,
        rate_non_eur: waterRatePerPerson,
        total_cost: waterCost,
        client_price: withMargin(waterCost),
        notes: 'Bottled water'
      })
      totalSupplierCost += waterCost
      totalClientPrice += withMargin(waterCost)
    }

    // Hotel (only if included and not last day and not cruise day) — per-person pricing
    if (includesHotelForDay && rates.hotelRate > 0) {
      const hotelCost = rates.hotelRate * totalPax
      services.push({
        service_type: 'accommodation',
        service_code: rates.selectedHotel?.id || 'HOTEL',
        service_name: `${rates.hotelName} (${totalPax} ${totalPax > 1 ? 'persons' : 'person'})`,
        supplier_name: rates.hotelName,
        quantity: totalPax,
        rate_eur: rates.hotelRate,
        rate_non_eur: rates.hotelRate,
        total_cost: hotelCost,
        client_price: withMargin(hotelCost),
        notes: `Overnight at ${rates.hotelName}`
      })
      totalSupplierCost += hotelCost
      totalClientPrice += withMargin(hotelCost)
    }

    // Cruise accommodation + bundled transport (for cruise days in cruise-land packages)
    if (isCruiseDay && !isLastDay) {
      // Count cruise nights for this itinerary
      const cruiseNightsInPackage = (itineraryData.days || []).filter(
        (d: any) => (d.is_cruise_day || d.accommodation_type === 'cruise') && d.day_number !== durationDays
      ).length

      const landCruiseRate = await getCruiseRate({
        tier,
        recommendedSuppliers: [],
        supabase,
        totalPax,
        nights: cruiseNightsInPackage,
        startDate,
        isEuroPassport
      })

      if (landCruiseRate.found) {
        const nightCost = landCruiseRate.totalPerNight
        const cabinDesc = landCruiseRate.cabinAllocation.map((a: CabinAllocation) => `${a.count}×${a.type}`).join(' + ')

        services.push({
          service_type: 'cruise',
          service_code: landCruiseRate.supplierId || 'CRUISE',
          service_name: `${landCruiseRate.shipName} - Full Board (${cabinDesc})`,
          supplier_name: landCruiseRate.shipName,
          quantity: totalPax,
          rate_eur: landCruiseRate.totalPerNight / totalPax,
          rate_non_eur: landCruiseRate.totalPerNight / totalPax,
          total_cost: nightCost,
          client_price: withMargin(nightCost),
          notes: `Night ${dayNumber}: On board | ${landCruiseRate.season} season | ${cabinDesc}`
        })
        totalSupplierCost += nightCost
        totalClientPrice += withMargin(nightCost)

        // Store cabin allocation on itinerary (once)
        if (dayNumber === (itineraryData.days || []).find((d: any) => d.is_cruise_day || d.accommodation_type === 'cruise')?.day_number) {
          await supabase.from('itineraries').update({
            cabin_allocation: landCruiseRate.cabinAllocation
          }).eq('id', itineraryId)
        }
      }
    }

    // Bundled cruise transport (added once on first cruise day)
    if (isCruiseDay && !landCruiseTransportAdded) {
      const cruiseDaysCount = (itineraryData.days || []).filter(
        (d: any) => d.is_cruise_day || d.accommodation_type === 'cruise'
      ).length

      const landCruiseTransportRules = await fetchCruiseTransportPricingRules()
      const landCruiseTransportRule = findCruiseTransportRule(landCruiseTransportRules, cruiseDaysCount)
      if (landCruiseTransportRule) {
        const transport = getCruiseTransportRate(landCruiseTransportRule, totalPax)
        services.push({
          service_type: 'transportation',
          service_code: landCruiseTransportRule.id || 'CRUISE-TRANSPORT',
          service_name: `Cruise Transport Package (${transport.vehicleType})`,
          supplier_name: null,
          quantity: 1,
          rate_eur: transport.rate,
          rate_non_eur: transport.rate,
          total_cost: transport.rate,
          client_price: withMargin(transport.rate),
          notes: `Bundled transport for ${cruiseDaysCount}D cruise: transfers + sightseeing (${transport.vehicleType})`
        })
        totalSupplierCost += transport.rate
        totalClientPrice += withMargin(transport.rate)
      }
      landCruiseTransportAdded = true
    }

    // Insert all services (with multi-currency tracking + currency conversion)
    for (const svc of services) {
      await supabase.from('itinerary_services').insert({
        itinerary_day_id: day.id,
        ...svc,
        // Multi-currency: all rates are EUR-based; store original cost + exchange rate
        supplier_currency: 'EUR',
        supplier_cost_original: svc.total_cost,
        exchange_rate_used: eurToTargetRate || 1,
        // Convert client-facing prices to target currency; rate_eur/rate_non_eur stay in EUR
        total_cost: toTargetCurrency(svc.total_cost),
        client_price: toTargetCurrency(svc.client_price),
      })
    }

    // Track for next iteration (intercity detection)
    previousDayData = dayData
  }

  // Log any warnings
  if (warnings.length > 0) {
    console.warn(`⚠️ ${warnings.length} pricing warning(s):`)
    warnings.forEach(w => console.warn(`  • ${w}`))
  }

  // Convert totals to target currency
  return {
    createdDays,
    totalSupplierCost: toTargetCurrency(totalSupplierCost),
    totalClientPrice: toTargetCurrency(totalClientPrice),
    mealSelections,
    warnings,
  }
}

// ============================================
// MULTI-CITY HOTEL LOOKUP (for inclusions)
// ============================================

export async function fetchHotelsForCities(
  supabase: any,
  params: {
    cities: string[]
    tier: ServiceTier
    primaryCity: string
    primaryHotelName: string | null
  }
): Promise<Map<string, string>> {
  const { cities, tier, primaryCity, primaryHotelName } = params
  const hotelMap = new Map<string, string>()

  // Primary city hotel is already known from fetchAllPricingRates
  if (primaryHotelName) {
    hotelMap.set(primaryCity.toLowerCase(), primaryHotelName)
  }

  // Fetch hotels for additional cities in parallel
  const additionalCities = cities.filter(
    c => c.toLowerCase() !== primaryCity.toLowerCase() && !hotelMap.has(c.toLowerCase())
  )

  if (additionalCities.length > 0) {
    const lookups = additionalCities.map(async (city) => {
      const { data: hotels } = await supabase
        .from('accommodation_rates')
        .select('property_name')
        .ilike('city', city)
        .eq('is_active', true)
        .eq('tier', tier)
        .order('created_at', { ascending: false })
        .limit(1)

      if (hotels?.length) {
        return { city: city.toLowerCase(), hotelName: hotels[0].property_name }
      }
      return null
    })

    const results = await Promise.all(lookups)
    for (const result of results) {
      if (result) {
        hotelMap.set(result.city, result.hotelName)
      }
    }
  }

  return hotelMap
}
