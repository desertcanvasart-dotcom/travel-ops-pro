import { SupabaseClient } from '@supabase/supabase-js'

// ============================================
// RATE LOOKUP SERVICE
// Queries real rates from database tables:
// - transportation_rates
// - guides  
// - attractions
// - restaurant_contacts
// - hotel_contacts
// ============================================

export interface RateLookupParams {
  city: string
  pax: number
  language: string
  is_euro_passport: boolean
  duration_days: number
  attractions?: string[]  // Optional: specific attractions to visit
  include_lunch?: boolean
  include_dinner?: boolean
  include_accommodation?: boolean
  hotel_standard?: 'budget' | 'standard' | 'luxury'
}

export interface VehicleRate {
  id: string
  vehicle_type: string
  city: string
  service_type: string
  rate_per_day: number
  capacity_min: number
  capacity_max: number
}

export interface GuideRate {
  id: string
  name: string
  languages: string[]
  daily_rate_eur: number
  city?: string
}

export interface AttractionRate {
  id: string
  name: string
  city: string
  entrance_fee_eur: number
  entrance_fee_non_eur: number
  duration_minutes?: number
}

export interface RestaurantRate {
  id: string
  name: string
  city: string
  lunch_rate_eur: number
  dinner_rate_eur: number
}

export interface HotelRate {
  id: string
  name: string
  city: string
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number
  star_rating?: number
}

export interface RateLookupResult {
  success: boolean
  vehicle: VehicleRate | null
  guide: GuideRate | null
  attractions: AttractionRate[]
  restaurant: RestaurantRate | null
  hotel: HotelRate | null
  daily_totals: {
    transportation: number
    guide: number
    entrances_per_person: number
    lunch_per_person: number
    dinner_per_person: number
    accommodation_per_room: number
  }
  error?: string
}

export async function lookupRates(
  supabase: SupabaseClient,
  params: RateLookupParams
): Promise<RateLookupResult> {
  
  const result: RateLookupResult = {
    success: false,
    vehicle: null,
    guide: null,
    attractions: [],
    restaurant: null,
    hotel: null,
    daily_totals: {
      transportation: 0,
      guide: 0,
      entrances_per_person: 0,
      lunch_per_person: 0,
      dinner_per_person: 0,
      accommodation_per_room: 0
    }
  }

  try {
    // ============================================
    // 1. TRANSPORTATION RATES
    // Find vehicle that fits pax count for this city
    // ============================================
    const { data: vehicles, error: vehicleError } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('city', params.city)
      .eq('is_active', true)
      .order('capacity_min', { ascending: true })

    if (vehicleError) {
      console.error('Error fetching vehicles:', vehicleError)
    } else if (vehicles && vehicles.length > 0) {
      // Find appropriate vehicle for pax count
      const suitableVehicle = vehicles.find(v => 
        params.pax >= (v.capacity_min || 1) && 
        params.pax <= (v.capacity_max || 99)
      ) || vehicles[vehicles.length - 1] // Fall back to largest

      if (suitableVehicle) {
        result.vehicle = {
          id: suitableVehicle.id,
          vehicle_type: suitableVehicle.vehicle_type,
          city: suitableVehicle.city,
          service_type: suitableVehicle.service_type || 'day_tour',
          rate_per_day: suitableVehicle.rate_per_day || suitableVehicle.day_tour_rate || 0,
          capacity_min: suitableVehicle.capacity_min || 1,
          capacity_max: suitableVehicle.capacity_max || 99
        }
        result.daily_totals.transportation = result.vehicle.rate_per_day
      }
    }

    // ============================================
    // 2. GUIDE RATES
    // Find guide who speaks the requested language
    // ============================================
    const { data: guides, error: guideError } = await supabase
      .from('guides')
      .select('*')
      .eq('is_active', true)
      .contains('languages', [params.language])
      .order('daily_rate_eur', { ascending: true })
      .limit(1)

    if (guideError) {
      console.error('Error fetching guides:', guideError)
    } else if (guides && guides.length > 0) {
      const guide = guides[0]
      result.guide = {
        id: guide.id,
        name: guide.name,
        languages: guide.languages || [params.language],
        daily_rate_eur: guide.daily_rate_eur || guide.rate_eur || 0,
        city: guide.city
      }
      result.daily_totals.guide = result.guide.daily_rate_eur
    }

    // ============================================
    // 3. ATTRACTION RATES
    // Get entrance fees for specific attractions or city defaults
    // ============================================
    let attractionQuery = supabase
      .from('attractions')
      .select('*')
      .eq('is_active', true)

    if (params.attractions && params.attractions.length > 0) {
      // Look for specific attractions by name
      attractionQuery = attractionQuery.or(
        params.attractions.map(a => `name.ilike.%${a}%`).join(',')
      )
    } else {
      // Get attractions for the city
      attractionQuery = attractionQuery.eq('city', params.city)
    }

    const { data: attractions, error: attractionError } = await attractionQuery.limit(10)

    if (attractionError) {
      console.error('Error fetching attractions:', attractionError)
    } else if (attractions && attractions.length > 0) {
      result.attractions = attractions.map(a => ({
        id: a.id,
        name: a.name,
        city: a.city,
        entrance_fee_eur: a.entrance_fee_eur || a.fee_eur || 0,
        entrance_fee_non_eur: a.entrance_fee_non_eur || a.fee_non_eur || a.entrance_fee_eur || 0,
        duration_minutes: a.duration_minutes || a.visit_duration || 60
      }))

      // Calculate total entrance fees per person
      result.daily_totals.entrances_per_person = result.attractions.reduce((sum, a) => {
        return sum + (params.is_euro_passport ? a.entrance_fee_eur : a.entrance_fee_non_eur)
      }, 0)
    }

    // ============================================
    // 4. RESTAURANT RATES
    // Get meal rates for the city
    // ============================================
    if (params.include_lunch || params.include_dinner) {
      const { data: restaurants, error: restaurantError } = await supabase
        .from('restaurant_contacts')
        .select('*')
        .eq('city', params.city)
        .eq('is_active', true)
        .order('lunch_rate_eur', { ascending: true })
        .limit(1)

      if (restaurantError) {
        console.error('Error fetching restaurants:', restaurantError)
      } else if (restaurants && restaurants.length > 0) {
        const restaurant = restaurants[0]
        result.restaurant = {
          id: restaurant.id,
          name: restaurant.name,
          city: restaurant.city,
          lunch_rate_eur: restaurant.lunch_rate_eur || restaurant.rate_per_person || 0,
          dinner_rate_eur: restaurant.dinner_rate_eur || restaurant.rate_per_person || 0
        }
        
        if (params.include_lunch) {
          result.daily_totals.lunch_per_person = result.restaurant.lunch_rate_eur
        }
        if (params.include_dinner) {
          result.daily_totals.dinner_per_person = result.restaurant.dinner_rate_eur
        }
      }
    }

    // ============================================
    // 5. HOTEL RATES
    // Get accommodation rates for the city
    // ============================================
    if (params.include_accommodation) {
      let hotelQuery = supabase
        .from('hotel_contacts')
        .select('*')
        .eq('city', params.city)
        .eq('is_active', true)

      // Filter by standard if specified
      if (params.hotel_standard === 'luxury') {
        hotelQuery = hotelQuery.gte('star_rating', 5)
      } else if (params.hotel_standard === 'budget') {
        hotelQuery = hotelQuery.lte('star_rating', 3)
      }

      const { data: hotels, error: hotelError } = await hotelQuery
        .order('rate_double_eur', { ascending: true })
        .limit(1)

      if (hotelError) {
        console.error('Error fetching hotels:', hotelError)
      } else if (hotels && hotels.length > 0) {
        const hotel = hotels[0]
        result.hotel = {
          id: hotel.id,
          name: hotel.name,
          city: hotel.city,
          rate_single_eur: hotel.rate_single_eur || hotel.single_rate || 0,
          rate_double_eur: hotel.rate_double_eur || hotel.double_rate || 0,
          rate_triple_eur: hotel.rate_triple_eur || hotel.triple_rate || 0,
          star_rating: hotel.star_rating || hotel.stars
        }
        result.daily_totals.accommodation_per_room = result.hotel.rate_double_eur
      }
    }

    result.success = true
    return result

  } catch (error: any) {
    console.error('Error in lookupRates:', error)
    result.error = error.message
    return result
  }
}

// ============================================
// CALCULATE TOTAL PRICING
// Combines rate lookup with pax calculations
// ============================================

export interface PricingCalculation {
  success: boolean
  total_cost: number
  per_person_cost: number
  breakdown: {
    transportation: { total: number; per_day: number; vehicle_type: string }
    guide: { total: number; per_day: number; language: string }
    entrances: { total: number; per_person: number; count: number; passport_type: string }
    meals: { 
      lunch_total: number; 
      dinner_total: number; 
      per_person_lunch: number;
      per_person_dinner: number;
    }
    accommodation: { total: number; per_night: number; rooms: number }
    tips: { total: number; per_day: number }
    water: { total: number; per_person: number }
  }
  rates_used: RateLookupResult
  error?: string
}

export async function calculatePricingFromRates(
  supabase: SupabaseClient,
  params: RateLookupParams & {
    num_adults: number
    num_children: number
    include_tips?: boolean
    include_water?: boolean
    tip_per_day?: number
    water_per_person?: number
  }
): Promise<PricingCalculation> {
  
  const totalPax = params.num_adults + params.num_children
  const { duration_days } = params

  // Get rates from database
  const rates = await lookupRates(supabase, {
    ...params,
    pax: totalPax
  })

  const result: PricingCalculation = {
    success: false,
    total_cost: 0,
    per_person_cost: 0,
    breakdown: {
      transportation: { total: 0, per_day: 0, vehicle_type: 'Unknown' },
      guide: { total: 0, per_day: 0, language: params.language },
      entrances: { total: 0, per_person: 0, count: 0, passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR' },
      meals: { lunch_total: 0, dinner_total: 0, per_person_lunch: 0, per_person_dinner: 0 },
      accommodation: { total: 0, per_night: 0, rooms: 0 },
      tips: { total: 0, per_day: 0 },
      water: { total: 0, per_person: 0 }
    },
    rates_used: rates
  }

  if (!rates.success) {
    result.error = rates.error || 'Failed to lookup rates'
    return result
  }

  // ============================================
  // CALCULATE TOTALS
  // ============================================

  // Transportation (per vehicle, not per person)
  const transportTotal = rates.daily_totals.transportation * duration_days
  result.breakdown.transportation = {
    total: transportTotal,
    per_day: rates.daily_totals.transportation,
    vehicle_type: rates.vehicle?.vehicle_type || 'Standard Vehicle'
  }

  // Guide (per day, not per person)
  const guideTotal = rates.daily_totals.guide * duration_days
  result.breakdown.guide = {
    total: guideTotal,
    per_day: rates.daily_totals.guide,
    language: params.language
  }

  // Entrances (per person per day)
  const entranceTotal = rates.daily_totals.entrances_per_person * totalPax * duration_days
  result.breakdown.entrances = {
    total: entranceTotal,
    per_person: rates.daily_totals.entrances_per_person * duration_days,
    count: rates.attractions.length,
    passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR'
  }

  // Meals (per person per day)
  const lunchTotal = params.include_lunch 
    ? rates.daily_totals.lunch_per_person * totalPax * duration_days 
    : 0
  const dinnerTotal = params.include_dinner 
    ? rates.daily_totals.dinner_per_person * totalPax * duration_days 
    : 0
  result.breakdown.meals = {
    lunch_total: lunchTotal,
    dinner_total: dinnerTotal,
    per_person_lunch: rates.daily_totals.lunch_per_person * duration_days,
    per_person_dinner: rates.daily_totals.dinner_per_person * duration_days
  }

  // Accommodation
  const roomsNeeded = Math.ceil(totalPax / 2)
  const nights = duration_days > 1 ? duration_days - 1 : 0
  const accommodationTotal = params.include_accommodation 
    ? rates.daily_totals.accommodation_per_room * roomsNeeded * nights 
    : 0
  result.breakdown.accommodation = {
    total: accommodationTotal,
    per_night: rates.daily_totals.accommodation_per_room,
    rooms: roomsNeeded
  }

  // Tips (default €10/day if not specified)
  const tipPerDay = params.tip_per_day ?? 10
  const tipsTotal = params.include_tips !== false ? tipPerDay * duration_days : 0
  result.breakdown.tips = {
    total: tipsTotal,
    per_day: tipPerDay
  }

  // Water (default €2/person/day if not specified)
  const waterPerPerson = params.water_per_person ?? 2
  const waterTotal = params.include_water !== false ? waterPerPerson * totalPax * duration_days : 0
  result.breakdown.water = {
    total: waterTotal,
    per_person: waterPerPerson * duration_days
  }

  // ============================================
  // GRAND TOTALS
  // ============================================
  result.total_cost = transportTotal + guideTotal + entranceTotal + 
                      lunchTotal + dinnerTotal + accommodationTotal + 
                      tipsTotal + waterTotal

  result.per_person_cost = totalPax > 0 ? result.total_cost / totalPax : 0

  // Round to 2 decimals
  result.total_cost = Math.round(result.total_cost * 100) / 100
  result.per_person_cost = Math.round(result.per_person_cost * 100) / 100

  result.success = true
  return result
}

// ============================================
// FALLBACK RATES (when database is empty)
// ============================================

export function getFallbackRates(params: {
  pax: number
  duration_days: number
  language: string
  is_euro_passport: boolean
}): PricingCalculation {
  const { pax, duration_days } = params

  // Hardcoded fallback rates
  const vehiclePerDay = pax <= 3 ? 45 : pax <= 8 ? 65 : 95
  const guidePerDay = 55
  const entrancePerPerson = params.is_euro_passport ? 18 : 22
  const lunchPerPerson = 12
  const tipPerDay = 10
  const waterPerPerson = 2

  const transportTotal = vehiclePerDay * duration_days
  const guideTotal = guidePerDay * duration_days
  const entranceTotal = entrancePerPerson * pax * duration_days
  const lunchTotal = lunchPerPerson * pax * duration_days
  const tipsTotal = tipPerDay * duration_days
  const waterTotal = waterPerPerson * pax * duration_days

  const totalCost = transportTotal + guideTotal + entranceTotal + lunchTotal + tipsTotal + waterTotal

  return {
    success: true,
    total_cost: totalCost,
    per_person_cost: totalCost / pax,
    breakdown: {
      transportation: { 
        total: transportTotal, 
        per_day: vehiclePerDay, 
        vehicle_type: pax <= 3 ? 'Sedan' : pax <= 8 ? 'Minivan' : 'Bus' 
      },
      guide: { total: guideTotal, per_day: guidePerDay, language: params.language },
      entrances: { 
        total: entranceTotal, 
        per_person: entrancePerPerson * duration_days, 
        count: 3, 
        passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR' 
      },
      meals: { 
        lunch_total: lunchTotal, 
        dinner_total: 0, 
        per_person_lunch: lunchPerPerson * duration_days,
        per_person_dinner: 0
      },
      accommodation: { total: 0, per_night: 0, rooms: 0 },
      tips: { total: tipsTotal, per_day: tipPerDay },
      water: { total: waterTotal, per_person: waterPerPerson * duration_days }
    },
    rates_used: {
      success: false,
      vehicle: null,
      guide: null,
      attractions: [],
      restaurant: null,
      hotel: null,
      daily_totals: {
        transportation: vehiclePerDay,
        guide: guidePerDay,
        entrances_per_person: entrancePerPerson,
        lunch_per_person: lunchPerPerson,
        dinner_per_person: 0,
        accommodation_per_room: 0
      },
      error: 'Using fallback rates'
    }
  }
}