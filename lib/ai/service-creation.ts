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
import { fetchExchangeRates, convertCurrency, isUsingFallbackRates, type ExchangeRates } from '@/lib/currency-service'

// ============================================
// PRICING RATES (fetched from DB)
// ============================================

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
  lunchRate: number
  dinnerRate: number
  airportServiceRate: number
  hotelServiceRate: number
  hotelRate: number
  hotelName: string | null
  selectedHotel: any
  dailyTips: number
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

  // Guides — 3-tier fallback:
  // 1. Exact match: language + tier
  // 2. Language match: any tier
  // 3. Final fallback: any active guide at same tier (use their rate as baseline)
  const { data: guides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [language]).limit(5)
  let selectedGuide = guides?.[0]
  if (!selectedGuide) {
    // Fallback 2: any active guide for this language (ignore tier)
    const { data: fallbackGuides } = await supabase.from('guides').select('*').eq('is_active', true).contains('languages', [language]).limit(1)
    selectedGuide = fallbackGuides?.[0]
  }
  if (!selectedGuide) {
    // Fallback 3: any active guide at this tier (ignore language) — use their rate as baseline
    // This prevents $0 guide costs when no guide speaks the requested language
    const { data: anyTierGuides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).limit(1)
    selectedGuide = anyTierGuides?.[0]
    if (selectedGuide) {
      console.warn(`⚠️ No ${language}-speaking guide found — using ${selectedGuide.name || 'generic'} guide rate as baseline`)
    }
  }
  if (!selectedGuide) {
    // Last resort: any active guide at all
    const { data: anyGuides } = await supabase.from('guides').select('*').eq('is_active', true).limit(1)
    selectedGuide = anyGuides?.[0]
    if (selectedGuide) {
      console.warn(`⚠️ No guide found for ${language}/${tier} — using ${selectedGuide.name || 'generic'} guide rate as last resort`)
    }
  }
  const guidePerDay = selectedGuide ? toNumber(selectedGuide.daily_rate_eur, 0) : 0
  if (!guidePerDay) console.warn(`⚠️ No guide rate found at all — guide will be €0`)

  // Entrance fees
  const { data: allEntranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)

  // Meal rates
  const { data: mealRates } = await supabase.from('meal_rates').select('*').eq('is_active', true).limit(1)
  const lunchRate = toNumber(mealRates?.[0]?.lunch_rate_eur, 0)
  const dinnerRate = toNumber(mealRates?.[0]?.dinner_rate_eur, 0)
  if (!lunchRate) console.warn('⚠️ No lunch rate found in meal_rates — lunch will be €0')
  if (!dinnerRate) console.warn('⚠️ No dinner rate found in meal_rates — dinner will be €0')

  // Airport services
  const { data: airportServicesData } = await supabase.from('airport_services').select('*').eq('is_active', true)
  const airportServiceRate = airportServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 0
  if (!airportServiceRate) console.warn('⚠️ No airport service rates found — airport service will be €0')

  // Hotel services
  const { data: hotelServicesData } = await supabase.from('hotel_services').select('*').eq('is_active', true)
  const hotelServiceRate = hotelServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 0
  if (!hotelServiceRate) console.warn('⚠️ No hotel service rates found — hotel service will be €0')

  // Accommodation
  let hotelRate = 0
  let hotelName_final = hotelName || null
  let selectedHotel: any = null

  if (includeAccommodation) {
    // PRIORITY 1: Try to match the specific hotel name from the parsed input
    if (hotelName) {
      const { data: namedHotels } = await supabase
        .from('accommodation_rates')
        .select('*')
        .eq('is_active', true)
        .ilike('property_name', `%${hotelName}%`)
        .limit(3)

      if (namedHotels?.length) {
        selectedHotel = namedHotels[0]
        hotelRate = isEuroPassport
          ? toNumber(selectedHotel.pp_double_eur, 0)
          : toNumber(selectedHotel.pp_double_non_eur, 0)
        hotelName_final = selectedHotel.property_name
        console.log(`🏨 Matched parsed hotel name "${hotelName}" → ${selectedHotel.property_name} (rate: ${hotelRate})`)
      } else {
        console.log(`⚠️ Parsed hotel "${hotelName}" not found in accommodation_rates — falling back to tier search`)
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

  // Tipping rates
  const { data: tippingRates } = await supabase.from('tipping_rates').select('*').eq('is_active', true)
  const dailyTips = tippingRates?.reduce((sum: number, t: any) => t.rate_unit === 'per_day' ? sum + toNumber(t.rate_eur, 0) : sum, 0) || 0
  if (!dailyTips) console.warn('⚠️ No tipping rates found — tips will be €0')

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
    lunchRate,
    dinnerRate,
    airportServiceRate,
    hotelServiceRate,
    hotelRate,
    hotelName: hotelName_final,
    selectedHotel,
    dailyTips,
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
    skipPricing: boolean
    marginPercent: number
    startDate: string
    currency?: string  // Target currency for client-facing prices (default: EUR)
  }
): Promise<{
  createdDays: CreateDayServicesResult[]
  totalSupplierCost: number
  totalClientPrice: number
}> {
  const {
    itineraryId, itineraryData, rates, startDateObj, durationDays,
    effectivePackageType, effectiveCity, totalPax, isEuroPassport,
    tier, language, includeLunch, includeDinner, includeAccommodation,
    skipPricing, marginPercent, startDate, currency = 'EUR',
  } = params

  // Fetch exchange rates for currency conversion
  let exchangeRates: ExchangeRates | null = null
  const needsConversion = currency !== 'EUR'
  if (needsConversion) {
    try {
      exchangeRates = await fetchExchangeRates('EUR')
      const rate = exchangeRates.rates[currency]
      if (isUsingFallbackRates()) {
        console.warn(`⚠️ [Service Creation] Using FALLBACK exchange rates! EUR → ${currency} = ${rate || 'N/A'}. Live API unavailable.`)
      } else {
        console.log(`[Service Creation] Currency conversion: EUR → ${currency}, rate: ${rate || 'N/A'} (live)`)
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

  const marginMultiplier = 1 + (marginPercent / 100)
  const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

  let totalSupplierCost = 0
  let totalClientPrice = 0
  let landCruiseTransportAdded = false
  const createdDays: CreateDayServicesResult[] = []
  let previousDayData: any = null // Track previous day for intercity detection

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
    const dayNeedsGuide = dayData.guide_required !== false && !isTransferOnly && !isFreeDay
    const dayIncludesLunch = isFreeDay ? false : (dayData.includes_lunch ?? includeLunch)
    const dayIncludesDinner = dayData.includes_dinner ?? includeDinner
    const includesHotelForDay = !isLastDay && includeAccommodation && !isCruiseDay && (dayData.includes_hotel !== false)

    // Airport & flight detection helpers
    const isDomesticFlight = !dayData.is_arrival && !dayData.is_departure
      && !!dayData.flight_info && dayData.transport_type === 'flight'
    const hasAirportOnThisDay = dayData.is_arrival || dayData.is_departure || isDomesticFlight
    const hasSightseeingOnThisDay = !isTransferOnly && !isFreeDay
      && ((dayData.attractions?.length > 0) || dayData.guide_required !== false)

    // Intercity transfer detection: city changed from previous day by road (not flight, not cruise)
    const previousOvernightCity = previousDayData?.overnight_city || previousDayData?.city
    const currentCity = dayData.city || effectiveCity
    const isIntercityTransfer = previousDayData
      && previousOvernightCity
      && previousOvernightCity.toLowerCase() !== currentCity.toLowerCase()
      && !isDomesticFlight
      && !isCruiseDay
      && previousDayData.accommodation_type !== 'cruise'
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
    if (dayData.is_departure && isTransferOnly) {
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

      // Insert all departure services
      for (const svc of departureServices) {
        await supabase.from('itinerary_services').insert({ itinerary_day_id: day.id, ...svc })
      }
      continue
    }

    // Services array
    const services: any[] = []

    // Airport Services (for arrivals/departures/domestic flights)
    if (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info) {
      if (isDomesticFlight) {
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

        // Domestic flight also needs TWO airport transfers (hotel→airport + airport→hotel)
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

    // Hotel Services (for check-in/check-out)
    if ((dayData.needs_hotel_service || dayData.is_arrival || dayData.is_departure) && !isFreeDay) {
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

      // Hotel check-out at origin city (if not already handled by departure/arrival logic)
      if (!dayData.is_departure && !dayData.is_arrival) {
        services.push({
          service_type: 'hotel_service',
          service_code: 'HOTEL-SVC',
          service_name: 'Hotel Check-out Assistance',
          quantity: 1,
          rate_eur: rates.hotelServiceRate,
          rate_non_eur: rates.hotelServiceRate,
          total_cost: rates.hotelServiceRate,
          client_price: withMargin(rates.hotelServiceRate),
          notes: `Hotel check-out in ${originCity}`
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

    // Transportation (skip for cruise days — bundled transport added separately)
    // Skip for domestic flight days — their transfers are already added above
    // For intercity days: skip if transfer-only (intercity vehicle is already the transport),
    // but ADD local sightseeing vehicle if there are attractions at the destination
    const skipRegularTransport = isDomesticFlight || (isIntercityTransfer && isTransferOnly)
    if (!isFreeDay && !isCruiseDay && !skipRegularTransport) {
      const transportRate = (isTransferOnly && !isIntercityTransfer) ? rates.transferRate : rates.vehiclePerDay
      const transportName = (isTransferOnly && !isIntercityTransfer)
        ? 'Airport/Hotel Transfer'
        : isIntercityTransfer && hasSightseeingOnThisDay
          ? `${rates.vehicleTypeName} Sightseeing Transportation (${currentCity})`
          : `${rates.vehicleTypeName} Transportation`
      services.push({
        service_type: 'transportation',
        service_code: rates.vehicleServiceCode,
        service_name: transportName,
        supplier_name: rates.vehicleSupplierName,
        quantity: 1,
        rate_eur: transportRate,
        rate_non_eur: transportRate,
        total_cost: transportRate,
        client_price: withMargin(transportRate),
        notes: isIntercityTransfer
          ? `Local sightseeing vehicle in ${currentCity}`
          : `From ${dayData.city || effectiveCity}`
      })
      totalSupplierCost += transportRate
      totalClientPrice += withMargin(transportRate)
    }

    // Domestic flight + sightseeing: add the day-tour vehicle (transfers already added above)
    if (isDomesticFlight && hasSightseeingOnThisDay && !isCruiseDay) {
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

      // Tips (only when guide is present)
      services.push({
        service_type: 'tips',
        service_code: 'TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: rates.dailyTips,
        rate_non_eur: rates.dailyTips,
        total_cost: rates.dailyTips,
        client_price: withMargin(rates.dailyTips),
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += rates.dailyTips
      totalClientPrice += withMargin(rates.dailyTips)
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

        const fee = rates.allEntranceFees.find((ef: any) =>
          ef.attraction_name.toLowerCase().includes(attr.toLowerCase()) ||
          attr.toLowerCase().includes(ef.attraction_name.toLowerCase())
        )

        if (fee) {
          // Check if it's an add-on (should be excluded from automatic pricing)
          if (fee.is_addon) continue

          const feePerPerson = isEuroPassport
            ? toNumber(fee.eur_rate, 0)
            : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
          dayEntranceTotal += feePerPerson * totalPax
          matchedAttractions.push(fee.attraction_name)
        } else {
          console.warn(`⚠️ Day ${dayNumber}: No entrance fee found for "${attr}" — skipping`)
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

    // Lunch (only if included for this day)
    if (dayIncludesLunch) {
      const lunchCost = rates.lunchRate * totalPax
      services.push({
        service_type: 'meal',
        service_code: 'LUNCH',
        service_name: 'Lunch',
        quantity: totalPax,
        rate_eur: rates.lunchRate,
        rate_non_eur: rates.lunchRate,
        total_cost: lunchCost,
        client_price: withMargin(lunchCost),
        notes: 'Lunch at local restaurant'
      })
      totalSupplierCost += lunchCost
      totalClientPrice += withMargin(lunchCost)
    }

    // Dinner (only if included for this day)
    if (dayIncludesDinner) {
      const dinnerCost = rates.dinnerRate * totalPax
      services.push({
        service_type: 'meal',
        service_code: 'DINNER',
        service_name: 'Dinner',
        quantity: totalPax,
        rate_eur: rates.dinnerRate,
        rate_non_eur: rates.dinnerRate,
        total_cost: dinnerCost,
        client_price: withMargin(dinnerCost),
        notes: 'Dinner'
      })
      totalSupplierCost += dinnerCost
      totalClientPrice += withMargin(dinnerCost)
    }

    // Water (for touring days only)
    if (!isTransferOnly && !isFreeDay) {
      const waterCost = 2 * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: 2,
        rate_non_eur: 2,
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

    // Insert all services (convert total_cost and client_price to target currency)
    for (const svc of services) {
      await supabase.from('itinerary_services').insert({
        itinerary_day_id: day.id,
        ...svc,
        // Convert client-facing prices to target currency; rate_eur/rate_non_eur stay in EUR
        total_cost: toTargetCurrency(svc.total_cost),
        client_price: toTargetCurrency(svc.client_price),
      })
    }

    // Track for next iteration (intercity detection)
    previousDayData = dayData
  }

  // Convert totals to target currency
  return {
    createdDays,
    totalSupplierCost: toTargetCurrency(totalSupplierCost),
    totalClientPrice: toTargetCurrency(totalClientPrice),
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
