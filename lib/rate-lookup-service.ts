import { SupabaseClient } from '@supabase/supabase-js'

// ============================================
// ENHANCED RATE LOOKUP SERVICE
// Queries real rates from all database tables
// ============================================

// ============================================
// INTERFACES
// ============================================

export interface RateLookupParams {
  // Basic Info
  pax: number
  num_adults: number
  num_children: number
  duration_days: number
  language: string
  is_euro_passport: boolean
  
  // Transportation
  city?: string
  service_type?: 'day_tour' | 'half_day_tour' | 'airport_transfer' | 'intercity_transfer' | 'dinner_transfer' | 'sound_light_transfer'
  origin_city?: string
  destination_city?: string
  
  // Attractions
  attractions?: string[]
  
  // Meals
  include_lunch?: boolean
  include_dinner?: boolean
  
  // Accommodation
  include_accommodation?: boolean
  hotel_standard?: 'budget' | 'standard' | 'luxury'
  num_hotel_stays?: number  // Number of different hotels (for hotel staff)
  
  // Airport
  include_airport_service?: boolean
  airport_code?: string
  airport_service_type?: 'meet_greet' | 'customs_assist' | 'full_service'
  num_arrivals?: number
  num_departures?: number
  
  // Nile Cruise
  include_cruise?: boolean
  cruise_ship?: string
  cruise_cabin_type?: 'standard' | 'deluxe' | 'suite'
  cruise_embark_city?: string
  cruise_disembark_city?: string
  cruise_nights?: number
  
  // Sleeping Train
  include_sleeping_train?: boolean
  sleeping_train_origin?: string
  sleeping_train_destination?: string
  sleeping_train_cabin?: 'single' | 'double'
  sleeping_train_roundtrip?: boolean
  
  // Regular Train
  include_train?: boolean
  train_origin?: string
  train_destination?: string
  train_class?: 'first_class' | 'second_class'
  
  // Tipping
  include_tips?: boolean
  tip_context?: 'day_tour' | 'half_day_tour' | 'cruise' | 'transfer'
  
  // Other
  include_water?: boolean
}

// Rate Result Interfaces
export interface VehicleRate {
  id: string
  service_code: string
  vehicle_type: string
  service_type: string
  city: string | null
  origin_city: string | null
  destination_city: string | null
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
  child_rate_eur?: number
  child_rate_non_eur?: number
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

export interface AirportStaffRate {
  id: string
  service_code: string
  airport_code: string
  airport_name: string
  service_type: string
  direction: string
  rate_eur: number
}

export interface HotelStaffRate {
  id: string
  service_code: string
  service_type: string
  hotel_category: string
  rate_eur: number
}

export interface CruiseRate {
  id: string
  cruise_code: string
  ship_name: string
  ship_category: string
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: string
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number | null
}

export interface SleepingTrainRate {
  id: string
  service_code: string
  origin_city: string
  destination_city: string
  cabin_type: string
  rate_oneway_eur: number
  rate_roundtrip_eur: number | null
}

export interface TrainRate {
  id: string
  service_code: string
  origin_city: string
  destination_city: string
  class_type: string
  rate_eur: number
  duration_hours: number | null
}

export interface TippingRate {
  id: string
  service_code: string
  role_type: string
  rate_unit: string
  rate_eur: number
  context: string | null
}

export interface RatesUsed {
  success: boolean
  vehicle: VehicleRate | null
  guide: GuideRate | null
  attractions: AttractionRate[]
  restaurant: RestaurantRate | null
  hotel: HotelRate | null
  airport_staff: AirportStaffRate | null
  hotel_staff: HotelStaffRate | null
  cruise: CruiseRate | null
  sleeping_train: SleepingTrainRate | null
  train: TrainRate | null
  tipping: TippingRate[]
}

export interface PricingBreakdown {
  transportation: {
    total: number
    per_day: number
    vehicle_type: string
    service_type: string
  }
  guide: {
    total: number
    per_day: number
    language: string
  }
  entrances: {
    total: number
    per_person: number
    count: number
    passport_type: string
  }
  meals: {
    lunch_total: number
    dinner_total: number
    per_person_lunch: number
    per_person_dinner: number
  }
  accommodation: {
    total: number
    per_night: number
    rooms: number
    nights: number
  }
  airport_staff: {
    total: number
    arrivals: number
    departures: number
    service_type: string
  }
  hotel_staff: {
    total: number
    per_stay: number
    num_stays: number
  }
  cruise: {
    total: number
    per_person: number
    ship_name: string
    cabin_type: string
    nights: number
  }
  sleeping_train: {
    total: number
    per_person: number
    cabin_type: string
    is_roundtrip: boolean
  }
  train: {
    total: number
    per_person: number
    class_type: string
  }
  tips: {
    total: number
    breakdown: { role: string; amount: number }[]
  }
  water: {
    total: number
    per_person: number
  }
}

export interface PricingCalculation {
  success: boolean
  total_cost: number
  per_person_cost: number
  breakdown: PricingBreakdown
  rates_used: RatesUsed
  error?: string
}

// ============================================
// MAIN LOOKUP FUNCTION
// ============================================

export async function lookupRates(
  supabase: SupabaseClient,
  params: RateLookupParams
): Promise<RatesUsed> {
  
  const result: RatesUsed = {
    success: false,
    vehicle: null,
    guide: null,
    attractions: [],
    restaurant: null,
    hotel: null,
    airport_staff: null,
    hotel_staff: null,
    cruise: null,
    sleeping_train: null,
    train: null,
    tipping: []
  }

  try {
    // ============================================
    // 1. TRANSPORTATION RATES
    // ============================================
    const serviceType = params.service_type || 'day_tour'
    
    let vehicleQuery = supabase
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)

    // Build query based on service type
    if (serviceType === 'intercity_transfer' && params.origin_city && params.destination_city) {
      vehicleQuery = vehicleQuery
        .eq('service_type', 'Intercity Transfer')
        .eq('origin_city', params.origin_city)
        .eq('destination_city', params.destination_city)
    } else if (serviceType === 'airport_transfer' && params.city) {
      vehicleQuery = vehicleQuery
        .eq('service_type', 'Airport Transfer')
        .eq('city', params.city)
    } else if (serviceType === 'half_day_tour' && params.city) {
      vehicleQuery = vehicleQuery
        .eq('service_type', 'Half Day Tour')
        .eq('city', params.city)
    } else if (serviceType === 'dinner_transfer' && params.city) {
      vehicleQuery = vehicleQuery
        .eq('service_type', 'Dinner Transfer')
        .eq('city', params.city)
    } else if (serviceType === 'sound_light_transfer' && params.city) {
      vehicleQuery = vehicleQuery
        .eq('service_type', 'Sound Light Transfer')
        .eq('city', params.city)
    } else if (params.city) {
      // Default: Day Tour
      vehicleQuery = vehicleQuery
        .eq('service_type', 'Day Tour')
        .eq('city', params.city)
    }

    const { data: vehicles, error: vehicleError } = await vehicleQuery
      .order('capacity_min', { ascending: true })

    if (vehicleError) {
      console.error('Error fetching vehicles:', vehicleError)
    } else if (vehicles && vehicles.length > 0) {
      // Find vehicle that fits pax count
      const suitableVehicle = vehicles.find(v => 
        params.pax >= (v.capacity_min || 1) && 
        params.pax <= (v.capacity_max || 99)
      ) || vehicles[vehicles.length - 1]

      if (suitableVehicle) {
        result.vehicle = {
          id: suitableVehicle.id,
          service_code: suitableVehicle.service_code,
          vehicle_type: suitableVehicle.vehicle_type,
          service_type: suitableVehicle.service_type,
          city: suitableVehicle.city,
          origin_city: suitableVehicle.origin_city,
          destination_city: suitableVehicle.destination_city,
          rate_per_day: suitableVehicle.base_rate_eur || 0,
          capacity_min: suitableVehicle.capacity_min || 1,
          capacity_max: suitableVehicle.capacity_max || 99
        }
      }
    }

    // ============================================
    // 2. GUIDE RATES
    // ============================================
    const { data: guides, error: guideError } = await supabase
      .from('guides')
      .select('*')
      .eq('is_active', true)
      .contains('languages', [params.language])
      .order('daily_rate_eur', { ascending: true })
      .limit(1)

    if (!guideError && guides && guides.length > 0) {
      const guide = guides[0]
      result.guide = {
        id: guide.id,
        name: guide.name,
        languages: guide.languages || [params.language],
        daily_rate_eur: guide.daily_rate_eur || guide.rate_eur || 0,
        city: guide.city
      }
    }

    // ============================================
    // 3. ATTRACTION RATES (Entrance Fees)
    // ============================================
    if (params.attractions && params.attractions.length > 0) {
      const { data: attractions, error: attractionError } = await supabase
        .from('entrance_fees')
        .select('*')
        .eq('is_active', true)
        .or(params.attractions.map(a => `attraction_name.ilike.%${a}%`).join(','))
        .limit(20)

      if (!attractionError && attractions && attractions.length > 0) {
        result.attractions = attractions.map(a => ({
          id: a.id,
          name: a.attraction_name,
          city: a.city,
          entrance_fee_eur: a.eur_rate || 0,
          entrance_fee_non_eur: a.non_eur_rate || a.eur_rate || 0,
          child_rate_eur: a.child_rate_eur,
          child_rate_non_eur: a.child_rate_non_eur
        }))
      }
    } else if (params.city) {
      // Get default attractions for city
      const { data: attractions, error: attractionError } = await supabase
        .from('entrance_fees')
        .select('*')
        .eq('is_active', true)
        .eq('city', params.city)
        .limit(10)

      if (!attractionError && attractions && attractions.length > 0) {
        result.attractions = attractions.map(a => ({
          id: a.id,
          name: a.attraction_name,
          city: a.city,
          entrance_fee_eur: a.eur_rate || 0,
          entrance_fee_non_eur: a.non_eur_rate || a.eur_rate || 0,
          child_rate_eur: a.child_rate_eur,
          child_rate_non_eur: a.child_rate_non_eur
        }))
      }
    }

    // ============================================
    // 4. RESTAURANT RATES
    // ============================================
    if (params.include_lunch || params.include_dinner) {
      const { data: restaurants, error: restaurantError } = await supabase
        .from('restaurant_contacts')
        .select('*')
        .eq('is_active', true)
        .eq('city', params.city || 'Cairo')
        .order('lunch_rate_eur', { ascending: true })
        .limit(1)

      if (!restaurantError && restaurants && restaurants.length > 0) {
        const restaurant = restaurants[0]
        result.restaurant = {
          id: restaurant.id,
          name: restaurant.name,
          city: restaurant.city,
          lunch_rate_eur: restaurant.lunch_rate_eur || restaurant.rate_per_person || 0,
          dinner_rate_eur: restaurant.dinner_rate_eur || restaurant.rate_per_person || 0
        }
      }
    }

    // ============================================
    // 5. HOTEL RATES
    // ============================================
    if (params.include_accommodation) {
      let hotelQuery = supabase
        .from('hotel_contacts')
        .select('*')
        .eq('is_active', true)
        .eq('city', params.city || 'Cairo')

      if (params.hotel_standard === 'luxury') {
        hotelQuery = hotelQuery.gte('star_rating', 5)
      } else if (params.hotel_standard === 'budget') {
        hotelQuery = hotelQuery.lte('star_rating', 3)
      }

      const { data: hotels, error: hotelError } = await hotelQuery
        .order('rate_double_eur', { ascending: true })
        .limit(1)

      if (!hotelError && hotels && hotels.length > 0) {
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
      }
    }

    // ============================================
    // 6. AIRPORT STAFF RATES
    // ============================================
    if (params.include_airport_service && params.airport_code) {
      const { data: airportStaff, error: airportError } = await supabase
        .from('airport_staff_rates')
        .select('*')
        .eq('is_active', true)
        .eq('airport_code', params.airport_code)
        .eq('service_type', params.airport_service_type || 'meet_greet')
        .eq('direction', 'arrival')
        .limit(1)

      if (!airportError && airportStaff && airportStaff.length > 0) {
        const staff = airportStaff[0]
        result.airport_staff = {
          id: staff.id,
          service_code: staff.service_code,
          airport_code: staff.airport_code,
          airport_name: staff.airport_name,
          service_type: staff.service_type,
          direction: staff.direction,
          rate_eur: staff.rate_eur
        }
      }
    }

    // ============================================
    // 7. HOTEL STAFF RATES
    // ============================================
    if (params.include_accommodation && params.num_hotel_stays && params.num_hotel_stays > 0) {
      const { data: hotelStaff, error: hotelStaffError } = await supabase
        .from('hotel_staff_rates')
        .select('*')
        .eq('is_active', true)
        .eq('service_type', 'full_service')
        .or(`hotel_category.eq.${params.hotel_standard || 'standard'},hotel_category.eq.all`)
        .limit(1)

      if (!hotelStaffError && hotelStaff && hotelStaff.length > 0) {
        const staff = hotelStaff[0]
        result.hotel_staff = {
          id: staff.id,
          service_code: staff.service_code,
          service_type: staff.service_type,
          hotel_category: staff.hotel_category,
          rate_eur: staff.rate_eur
        }
      }
    }

    // ============================================
    // 8. NILE CRUISE RATES
    // ============================================
    if (params.include_cruise && params.cruise_embark_city && params.cruise_disembark_city) {
      let cruiseQuery = supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .eq('embark_city', params.cruise_embark_city)
        .eq('disembark_city', params.cruise_disembark_city)

      if (params.cruise_cabin_type) {
        cruiseQuery = cruiseQuery.eq('cabin_type', params.cruise_cabin_type)
      }
      if (params.cruise_ship) {
        cruiseQuery = cruiseQuery.ilike('ship_name', `%${params.cruise_ship}%`)
      }
      if (params.cruise_nights) {
        cruiseQuery = cruiseQuery.eq('duration_nights', params.cruise_nights)
      }

      const { data: cruises, error: cruiseError } = await cruiseQuery
        .order('rate_double_eur', { ascending: true })
        .limit(1)

      if (!cruiseError && cruises && cruises.length > 0) {
        const cruise = cruises[0]
        result.cruise = {
          id: cruise.id,
          cruise_code: cruise.cruise_code,
          ship_name: cruise.ship_name,
          ship_category: cruise.ship_category,
          route_name: cruise.route_name,
          embark_city: cruise.embark_city,
          disembark_city: cruise.disembark_city,
          duration_nights: cruise.duration_nights,
          cabin_type: cruise.cabin_type,
          rate_single_eur: cruise.rate_single_eur,
          rate_double_eur: cruise.rate_double_eur,
          rate_triple_eur: cruise.rate_triple_eur
        }
      }
    }

    // ============================================
    // 9. SLEEPING TRAIN RATES
    // ============================================
    if (params.include_sleeping_train && params.sleeping_train_origin && params.sleeping_train_destination) {
      const { data: sleepTrains, error: sleepTrainError } = await supabase
        .from('sleeping_train_rates')
        .select('*')
        .eq('is_active', true)
        .eq('origin_city', params.sleeping_train_origin)
        .eq('destination_city', params.sleeping_train_destination)
        .eq('cabin_type', params.sleeping_train_cabin || 'double')
        .limit(1)

      if (!sleepTrainError && sleepTrains && sleepTrains.length > 0) {
        const train = sleepTrains[0]
        result.sleeping_train = {
          id: train.id,
          service_code: train.service_code,
          origin_city: train.origin_city,
          destination_city: train.destination_city,
          cabin_type: train.cabin_type,
          rate_oneway_eur: train.rate_oneway_eur,
          rate_roundtrip_eur: train.rate_roundtrip_eur
        }
      }
    }

    // ============================================
    // 10. REGULAR TRAIN RATES
    // ============================================
    if (params.include_train && params.train_origin && params.train_destination) {
      const { data: trains, error: trainError } = await supabase
        .from('train_rates')
        .select('*')
        .eq('is_active', true)
        .eq('origin_city', params.train_origin)
        .eq('destination_city', params.train_destination)
        .eq('class_type', params.train_class || 'first_class')
        .limit(1)

      if (!trainError && trains && trains.length > 0) {
        const train = trains[0]
        result.train = {
          id: train.id,
          service_code: train.service_code,
          origin_city: train.origin_city,
          destination_city: train.destination_city,
          class_type: train.class_type,
          rate_eur: train.rate_eur,
          duration_hours: train.duration_hours
        }
      }
    }

    // ============================================
    // 11. TIPPING RATES
    // ============================================
    if (params.include_tips !== false) {
      const context = params.tip_context || 'day_tour'
      
      const { data: tips, error: tipError } = await supabase
        .from('tipping_rates')
        .select('*')
        .eq('is_active', true)
        .or(`context.eq.${context},context.is.null`)

      if (!tipError && tips && tips.length > 0) {
        result.tipping = tips.map(t => ({
          id: t.id,
          service_code: t.service_code,
          role_type: t.role_type,
          rate_unit: t.rate_unit,
          rate_eur: t.rate_eur,
          context: t.context
        }))
      }
    }

    result.success = true
    return result

  } catch (error: any) {
    console.error('Error in lookupRates:', error)
    return result
  }
}

// ============================================
// CALCULATE PRICING FROM RATES
// ============================================

export async function calculatePricingFromRates(
  supabase: SupabaseClient,
  params: RateLookupParams
): Promise<PricingCalculation> {
  
  const { pax, num_adults, num_children, duration_days } = params

  // Get rates from database
  const rates = await lookupRates(supabase, params)

  const result: PricingCalculation = {
    success: false,
    total_cost: 0,
    per_person_cost: 0,
    breakdown: {
      transportation: { total: 0, per_day: 0, vehicle_type: 'Unknown', service_type: 'day_tour' },
      guide: { total: 0, per_day: 0, language: params.language },
      entrances: { total: 0, per_person: 0, count: 0, passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR' },
      meals: { lunch_total: 0, dinner_total: 0, per_person_lunch: 0, per_person_dinner: 0 },
      accommodation: { total: 0, per_night: 0, rooms: 0, nights: 0 },
      airport_staff: { total: 0, arrivals: 0, departures: 0, service_type: '' },
      hotel_staff: { total: 0, per_stay: 0, num_stays: 0 },
      cruise: { total: 0, per_person: 0, ship_name: '', cabin_type: '', nights: 0 },
      sleeping_train: { total: 0, per_person: 0, cabin_type: '', is_roundtrip: false },
      train: { total: 0, per_person: 0, class_type: '' },
      tips: { total: 0, breakdown: [] },
      water: { total: 0, per_person: 0 }
    },
    rates_used: rates
  }

  // ============================================
  // 1. TRANSPORTATION (Per Group)
  // ============================================
  if (rates.vehicle) {
    const transportPerDay = rates.vehicle.rate_per_day
    // For intercity/transfers, it's a one-time cost. For day tours, multiply by days
    const isTransfer = ['Intercity Transfer', 'Airport Transfer', 'Dinner Transfer', 'Sound Light Transfer'].includes(rates.vehicle.service_type)
    const transportTotal = isTransfer ? transportPerDay : transportPerDay * duration_days
    
    result.breakdown.transportation = {
      total: transportTotal,
      per_day: transportPerDay,
      vehicle_type: rates.vehicle.vehicle_type,
      service_type: rates.vehicle.service_type
    }
  }

  // ============================================
  // 2. GUIDE (Per Group)
  // ============================================
  if (rates.guide) {
    const guidePerDay = rates.guide.daily_rate_eur
    const guideTotal = guidePerDay * duration_days
    
    result.breakdown.guide = {
      total: guideTotal,
      per_day: guidePerDay,
      language: params.language
    }
  }

  // ============================================
  // 3. ENTRANCES (Per Person)
  // ============================================
  if (rates.attractions.length > 0) {
    let totalEntrancePerPerson = 0
    
    for (const attraction of rates.attractions) {
      const adultFee = params.is_euro_passport ? attraction.entrance_fee_eur : attraction.entrance_fee_non_eur
      totalEntrancePerPerson += adultFee
    }
    
    const entranceTotal = totalEntrancePerPerson * pax * duration_days
    
    result.breakdown.entrances = {
      total: entranceTotal,
      per_person: totalEntrancePerPerson * duration_days,
      count: rates.attractions.length,
      passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR'
    }
  }

  // ============================================
  // 4. MEALS (Per Person)
  // ============================================
  if (rates.restaurant) {
    const lunchPerPerson = params.include_lunch ? rates.restaurant.lunch_rate_eur : 0
    const dinnerPerPerson = params.include_dinner ? rates.restaurant.dinner_rate_eur : 0
    
    result.breakdown.meals = {
      lunch_total: lunchPerPerson * pax * duration_days,
      dinner_total: dinnerPerPerson * pax * duration_days,
      per_person_lunch: lunchPerPerson * duration_days,
      per_person_dinner: dinnerPerPerson * duration_days
    }
  }

  // ============================================
  // 5. ACCOMMODATION (Per Room Per Night)
  // ============================================
  if (rates.hotel && params.include_accommodation) {
    const nights = duration_days > 1 ? duration_days - 1 : 0
    const roomsNeeded = Math.ceil(pax / 2)
    const ratePerNight = rates.hotel.rate_double_eur
    
    result.breakdown.accommodation = {
      total: ratePerNight * roomsNeeded * nights,
      per_night: ratePerNight,
      rooms: roomsNeeded,
      nights: nights
    }
  }

  // ============================================
  // 6. AIRPORT STAFF (Per Service)
  // ============================================
  if (rates.airport_staff && params.include_airport_service) {
    const arrivals = params.num_arrivals || 0
    const departures = params.num_departures || 0
    const ratePerService = rates.airport_staff.rate_eur
    
    result.breakdown.airport_staff = {
      total: ratePerService * (arrivals + departures),
      arrivals: arrivals,
      departures: departures,
      service_type: rates.airport_staff.service_type
    }
  }

  // ============================================
  // 7. HOTEL STAFF (Per Hotel Stay)
  // ============================================
  if (rates.hotel_staff && params.num_hotel_stays) {
    const perStay = rates.hotel_staff.rate_eur
    
    result.breakdown.hotel_staff = {
      total: perStay * params.num_hotel_stays,
      per_stay: perStay,
      num_stays: params.num_hotel_stays
    }
  }

  // ============================================
  // 8. NILE CRUISE (Per Person)
  // ============================================
  if (rates.cruise && params.include_cruise) {
    // Calculate based on occupancy
    let perPerson = rates.cruise.rate_double_eur // Default to double
    
    if (pax === 1) {
      perPerson = rates.cruise.rate_single_eur
    } else if (pax >= 3 && rates.cruise.rate_triple_eur) {
      perPerson = rates.cruise.rate_triple_eur
    }
    
    result.breakdown.cruise = {
      total: perPerson * pax,
      per_person: perPerson,
      ship_name: rates.cruise.ship_name,
      cabin_type: rates.cruise.cabin_type,
      nights: rates.cruise.duration_nights
    }
  }

  // ============================================
  // 9. SLEEPING TRAIN (Per Person)
  // ============================================
  if (rates.sleeping_train && params.include_sleeping_train) {
    const isRoundtrip = params.sleeping_train_roundtrip || false
    const perPerson = isRoundtrip && rates.sleeping_train.rate_roundtrip_eur
      ? rates.sleeping_train.rate_roundtrip_eur
      : rates.sleeping_train.rate_oneway_eur
    
    result.breakdown.sleeping_train = {
      total: perPerson * pax,
      per_person: perPerson,
      cabin_type: rates.sleeping_train.cabin_type,
      is_roundtrip: isRoundtrip
    }
  }

  // ============================================
  // 10. REGULAR TRAIN (Per Person)
  // ============================================
  if (rates.train && params.include_train) {
    const perPerson = rates.train.rate_eur
    
    result.breakdown.train = {
      total: perPerson * pax,
      per_person: perPerson,
      class_type: rates.train.class_type
    }
  }

  // ============================================
  // 11. TIPPING (Configurable)
  // ============================================
  if (rates.tipping.length > 0 && params.include_tips !== false) {
    let tipsTotal = 0
    const tipsBreakdown: { role: string; amount: number }[] = []
    
    for (const tip of rates.tipping) {
      let tipAmount = 0
      
      if (tip.rate_unit === 'per_day') {
        tipAmount = tip.rate_eur * duration_days
      } else if (tip.rate_unit === 'per_service') {
        tipAmount = tip.rate_eur
      } else if (tip.rate_unit === 'per_night' && params.include_cruise) {
        tipAmount = tip.rate_eur * (params.cruise_nights || 0)
      } else if (tip.rate_unit === 'per_cruise' && params.include_cruise) {
        tipAmount = tip.rate_eur
      }
      
      if (tipAmount > 0) {
        tipsTotal += tipAmount
        tipsBreakdown.push({ role: tip.role_type, amount: tipAmount })
      }
    }
    
    result.breakdown.tips = {
      total: tipsTotal,
      breakdown: tipsBreakdown
    }
  }

  // ============================================
  // 12. WATER (Per Person)
  // ============================================
  if (params.include_water !== false) {
    const waterPerPersonPerDay = 2 // €2 per person per day
    const waterTotal = waterPerPersonPerDay * pax * duration_days
    
    result.breakdown.water = {
      total: waterTotal,
      per_person: waterPerPersonPerDay * duration_days
    }
  }

  // ============================================
  // CALCULATE TOTALS
  // ============================================
  result.total_cost = 
    result.breakdown.transportation.total +
    result.breakdown.guide.total +
    result.breakdown.entrances.total +
    result.breakdown.meals.lunch_total +
    result.breakdown.meals.dinner_total +
    result.breakdown.accommodation.total +
    result.breakdown.airport_staff.total +
    result.breakdown.hotel_staff.total +
    result.breakdown.cruise.total +
    result.breakdown.sleeping_train.total +
    result.breakdown.train.total +
    result.breakdown.tips.total +
    result.breakdown.water.total

  result.per_person_cost = pax > 0 ? result.total_cost / pax : 0

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
  const vehiclePerDay = pax <= 2 ? 40 : pax <= 6 ? 55 : pax <= 10 ? 70 : 90
  const guidePerDay = 55
  const entrancePerPerson = params.is_euro_passport ? 18 : 25
  const lunchPerPerson = 12
  const tipPerDay = 15
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
        vehicle_type: pax <= 2 ? 'Sedan' : pax <= 6 ? 'Minivan' : pax <= 10 ? 'Van' : 'Bus',
        service_type: 'day_tour'
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
      accommodation: { total: 0, per_night: 0, rooms: 0, nights: 0 },
      airport_staff: { total: 0, arrivals: 0, departures: 0, service_type: '' },
      hotel_staff: { total: 0, per_stay: 0, num_stays: 0 },
      cruise: { total: 0, per_person: 0, ship_name: '', cabin_type: '', nights: 0 },
      sleeping_train: { total: 0, per_person: 0, cabin_type: '', is_roundtrip: false },
      train: { total: 0, per_person: 0, class_type: '' },
      tips: { total: tipsTotal, breakdown: [{ role: 'guide', amount: tipPerDay * duration_days * 0.67 }, { role: 'driver', amount: tipPerDay * duration_days * 0.33 }] },
      water: { total: waterTotal, per_person: waterPerPerson * duration_days }
    },
    rates_used: {
      success: false,
      vehicle: null,
      guide: null,
      attractions: [],
      restaurant: null,
      hotel: null,
      airport_staff: null,
      hotel_staff: null,
      cruise: null,
      sleeping_train: null,
      train: null,
      tipping: []
    }
  }
}
