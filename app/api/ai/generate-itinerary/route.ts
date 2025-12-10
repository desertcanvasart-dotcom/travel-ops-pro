import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Default margin percentage (used if no user preference)
const DEFAULT_MARGIN_PERCENT = 25

// ============================================
// TIER SYSTEM CONSTANTS
// ============================================
type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'

const VALID_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

// Map legacy budget_level values to new tier system
const TIER_MAP: Record<string, ServiceTier> = {
  'budget': 'budget',
  'economy': 'budget',
  'standard': 'standard',
  'mid-range': 'standard',
  'deluxe': 'deluxe',
  'superior': 'deluxe',
  'luxury': 'luxury',
  'premium': 'luxury',
  'vip': 'luxury'
}

// Helper to validate date
function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

// Helper to safely convert to number
function toNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return fallback
  }
  return Number(value)
}

// Helper to normalize tier value
function normalizeTier(value: string | null | undefined): ServiceTier {
  if (!value) return 'standard'
  const normalized = value.toLowerCase().trim()
  return TIER_MAP[normalized] || 'standard'
}

// ============================================
// FETCH USER PREFERENCES
// ============================================
async function getUserPreferences(supabase: any): Promise<{
  default_cost_mode: 'auto' | 'manual'
  default_tier: ServiceTier
  default_margin_percent: number
  default_currency: string
}> {
  const defaults = {
    default_cost_mode: 'auto' as const,
    default_tier: 'standard' as ServiceTier,
    default_margin_percent: DEFAULT_MARGIN_PERCENT,
    default_currency: 'EUR'
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      console.log('⚙️ No authenticated user, using default preferences')
      return defaults
    }

    const { data: prefs, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error || !prefs) {
      console.log('⚙️ No user preferences found, using defaults')
      return defaults
    }

    console.log('⚙️ Loaded user preferences:', {
      cost_mode: prefs.default_cost_mode,
      tier: prefs.default_tier,
      margin: prefs.default_margin_percent,
      currency: prefs.default_currency
    })

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      default_tier: normalizeTier(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: prefs.default_margin_percent ?? defaults.default_margin_percent,
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    console.error('⚠️ Error fetching user preferences:', error)
    return defaults
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const supabase = createClient()
    
    // ============================================
    // FETCH USER PREFERENCES FIRST
    // ============================================
    const userPrefs = await getUserPreferences(supabase)
    
    const {
      client_name,
      client_email,
      client_phone,
      tour_requested,
      start_date,
      duration_days: raw_duration_days,
      num_adults,
      num_children,
      language = 'English',
      interests = [],
      special_requests = [],
      budget_level = 'standard',
      // NEW: Accept tier parameter (takes precedence over budget_level, then user preference)
      tier: raw_tier = null,
      hotel_name,
      hotel_location,
      city = 'Cairo',
      transportation_service = 'day_tour',
      client_id = null,
      nationality = null,
      is_euro_passport = null,
      include_lunch = true,
      include_dinner = false,
      include_accommodation = true,
      attractions = [],
      // Use user preference as default, allow override from request
      margin_percent = userPrefs.default_margin_percent,
      // NEW: Accept currency parameter, default to user preference
      currency = userPrefs.default_currency,
      // NEW: Accept cost_mode parameter, default to user preference
      cost_mode = userPrefs.default_cost_mode
    } = body

    // Normalize tier - use explicit tier param if provided, otherwise budget_level, otherwise user preference
    const tier: ServiceTier = raw_tier 
      ? normalizeTier(raw_tier) 
      : budget_level !== 'standard' 
        ? normalizeTier(budget_level)
        : userPrefs.default_tier

    // Validate date
    if (!isValidDate(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid start date before generating the itinerary' },
        { status: 400 }
      )
    }

    const duration_days = parseInt(raw_duration_days) || 1

    console.log('🤖 Starting AI itinerary generation for:', client_name)
    console.log(`📅 Start date: ${start_date}, Duration: ${duration_days} days`)
    console.log(`🎯 Service Tier: ${tier.toUpperCase()} (from: ${raw_tier ? 'request' : budget_level !== 'standard' ? 'budget_level' : 'user preference'})`)
    console.log(`💰 Margin: ${margin_percent}% (from: ${body.margin_percent ? 'request' : 'user preference'})`)
    console.log(`💱 Currency: ${currency} (from: ${body.currency ? 'request' : 'user preference'})`)
    console.log(`📊 Cost Mode: ${cost_mode} (from: ${body.cost_mode ? 'request' : 'user preference'})`)
    console.log(`🏨 Include accommodation: ${include_accommodation}`)

    const totalPax = num_adults + num_children

    // Determine EUR vs non-EUR passport
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = [
        'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark',
        'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland',
        'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands',
        'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden',
        'norway', 'iceland', 'liechtenstein', 'switzerland'
      ]
      isEuroPassport = euCountries.some(c => 
        nationality.toLowerCase().includes(c)
      )
    }
    if (isEuroPassport === null) {
      isEuroPassport = false
    }

    console.log(`🌍 Passport type: ${isEuroPassport ? 'EUR' : 'non-EUR'} (nationality: ${nationality || 'unknown'})`)

    // Calculate dates
    const startDateObj = new Date(start_date)
    const endDate = new Date(startDateObj)
    endDate.setDate(startDateObj.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const itinerary_code = `EGYPT-${year}-${randomNum}`

    // ============================================
    // FETCH ALL AVAILABLE RATES WITH TIER FILTERING
    // ============================================
    
    // 1. Transportation rates - Query vehicles table with tier filter
    console.log(`🚗 Fetching vehicles for tier: ${tier}...`)
    
    // First, try to get preferred vehicles matching tier
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false }) // Preferred first
      .order('capacity_min', { ascending: true })

    // Fallback: If no vehicles match tier, get any active vehicles
    let availableVehicles = vehicles
    if (!availableVehicles || availableVehicles.length === 0) {
      console.log(`⚠️ No vehicles found for tier ${tier}, falling back to all active vehicles`)
      const { data: fallbackVehicles } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .order('capacity_min', { ascending: true })
      availableVehicles = fallbackVehicles
    }

    let selectedVehicle = null
    if (availableVehicles && availableVehicles.length > 0) {
      // Find vehicle that fits the group size, preferring preferred vehicles
      selectedVehicle = availableVehicles.find(v => 
        totalPax >= toNumber(v.capacity_min, 1) && 
        totalPax <= toNumber(v.capacity_max, 99)
      ) || availableVehicles[availableVehicles.length - 1]
      
      console.log(`✅ Selected vehicle: ${selectedVehicle.vehicle_type} (tier: ${selectedVehicle.tier}, preferred: ${selectedVehicle.is_preferred})`)
    }

    // Also get rate from transportation_rates for pricing
    const { data: vehicleRates } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('service_type', 'day_tour')
      .eq('city', city)
      .order('capacity_min')

    let vehicleRate = null
    if (vehicleRates && vehicleRates.length > 0) {
      vehicleRate = vehicleRates.find(v => 
        totalPax >= toNumber(v.capacity_min, 1) && 
        totalPax <= toNumber(v.capacity_max, 99)
      ) || vehicleRates[vehicleRates.length - 1]
      console.log(`✅ Vehicle rate: €${vehicleRate.base_rate_eur}/day`)
    }

    // 2. Guide rates - Query guides table with tier filter
    console.log(`🎯 Fetching guides for tier: ${tier}, language: ${language}...`)
    
    // First, try preferred guides matching tier and language
    const { data: guides } = await supabase
      .from('guides')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false }) // Preferred first
      .limit(5)

    // Fallback: If no guides match tier, get any active guides with the language
    let availableGuides = guides
    if (!availableGuides || availableGuides.length === 0) {
      console.log(`⚠️ No guides found for tier ${tier} with ${language}, trying without tier filter`)
      const { data: fallbackGuides } = await supabase
        .from('guides')
        .select('*')
        .eq('is_active', true)
        .contains('languages', [language])
        .order('is_preferred', { ascending: false })
        .limit(5)
      availableGuides = fallbackGuides
    }

    let selectedGuide = null
    if (availableGuides && availableGuides.length > 0) {
      selectedGuide = availableGuides[0] // First one is preferred (due to ordering)
      console.log(`✅ Selected guide: ${selectedGuide.name} (tier: ${selectedGuide.tier}, preferred: ${selectedGuide.is_preferred})`)
    }

    // Get guide rate from guide_rates table
    const { data: guideRates } = await supabase
      .from('guide_rates')
      .select('*')
      .eq('is_active', true)
      .eq('guide_language', language)
      .limit(1)

    let guideRate = null
    if (guideRates && guideRates.length > 0) {
      guideRate = guideRates[0]
      console.log(`✅ Guide rate: €${guideRate.base_rate_eur}/day`)
    }

    // 3. ALL entrance fees (we'll match per day later)
    console.log('🏛️ Fetching all entrance fees...')
    const { data: allEntranceFees } = await supabase
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)

    console.log(`✅ Loaded ${allEntranceFees?.length || 0} entrance fees`)

    // 4. Meal rates - Query restaurants with tier filter for recommendations
    console.log(`🍽️ Fetching restaurants for tier: ${tier}...`)
    
    const { data: restaurants } = await supabase
      .from('restaurant_contacts')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .limit(10)

    let recommendedRestaurants = restaurants
    if (!recommendedRestaurants || recommendedRestaurants.length === 0) {
      const { data: fallbackRestaurants } = await supabase
        .from('restaurant_contacts')
        .select('*')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .limit(10)
      recommendedRestaurants = fallbackRestaurants
    }

    if (recommendedRestaurants && recommendedRestaurants.length > 0) {
      console.log(`✅ Found ${recommendedRestaurants.length} restaurants for tier ${tier}`)
    }

    // Get meal rates from meal_rates table
    const { data: mealRates } = await supabase
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .limit(1)

    let lunchRate = 12 // Default
    let dinnerRate = 18 // Default
    if (mealRates && mealRates.length > 0) {
      lunchRate = toNumber(mealRates[0].lunch_rate_eur, 12)
      dinnerRate = toNumber(mealRates[0].dinner_rate_eur, 18)
    }

    // Adjust meal rates based on tier
    const tierMealMultiplier: Record<ServiceTier, number> = {
      'budget': 0.8,
      'standard': 1.0,
      'deluxe': 1.3,
      'luxury': 1.6
    }
    lunchRate = Math.round(lunchRate * tierMealMultiplier[tier])
    dinnerRate = Math.round(dinnerRate * tierMealMultiplier[tier])
    console.log(`✅ Meal rates (tier-adjusted): Lunch €${lunchRate}, Dinner €${dinnerRate}`)

    // 5. Accommodation rates - Query hotel_contacts with tier filter
    console.log(`🏨 Fetching hotels for tier: ${tier}...`)
    let hotelRate = 0
    let hotelName_final = hotel_name || 'Standard Hotel'
    let selectedHotel = null
    
    if (include_accommodation) {
      // Query hotel_contacts with tier filter and preferred ordering
      const { data: hotelContacts, error: hcError } = await supabase
        .from('hotel_contacts')
        .select('*')
        .ilike('city', city)
        .eq('is_active', true)
        .eq('tier', tier)
        .order('is_preferred', { ascending: false }) // Preferred hotels first!
        .order('star_rating', { ascending: false })
        .limit(5)

      console.log(`🏨 hotel_contacts query (tier=${tier}): found=${hotelContacts?.length || 0}`)
      if (hcError) console.error('❌ hotel_contacts error:', hcError)

      if (hotelContacts && hotelContacts.length > 0) {
        // First hotel is the best match (preferred + highest rated)
        selectedHotel = hotelContacts[0]
        hotelRate = toNumber(selectedHotel.rate_double_eur, 80)
        hotelName_final = selectedHotel.name || hotelName_final
        console.log(`✅ Selected hotel: ${hotelName_final} @ €${hotelRate}/night (${selectedHotel.star_rating}⭐, tier: ${selectedHotel.tier}, preferred: ${selectedHotel.is_preferred})`)
      } else {
        // Fallback: try without tier filter
        console.log(`⚠️ No hotels found for tier ${tier}, falling back to any active hotels`)
        
        const { data: fallbackHotels } = await supabase
          .from('hotel_contacts')
          .select('*')
          .ilike('city', city)
          .eq('is_active', true)
          .order('is_preferred', { ascending: false })
          .order('star_rating', { ascending: tier === 'luxury' ? false : true })
          .limit(5)

        if (fallbackHotels && fallbackHotels.length > 0) {
          selectedHotel = fallbackHotels[0]
          hotelRate = toNumber(selectedHotel.rate_double_eur, 80)
          hotelName_final = selectedHotel.name || hotelName_final
          console.log(`✅ Fallback hotel: ${hotelName_final} @ €${hotelRate}/night`)
        } else {
          // Last resort: use default rates based on tier
          const defaultRates: Record<ServiceTier, number> = {
            'budget': 45,
            'standard': 80,
            'deluxe': 120,
            'luxury': 180
          }
          hotelRate = defaultRates[tier]
          console.log(`⚠️ No hotel found in database, using default ${tier} rate: €${hotelRate}/night`)
        }
      }
    }

    // 6. Nile Cruises - Query cruise_contacts with tier filter (if applicable)
    console.log(`🚢 Checking for Nile cruises (tier: ${tier})...`)
    const { data: cruises } = await supabase
      .from('cruise_contacts')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .limit(5)

    if (cruises && cruises.length > 0) {
      console.log(`✅ Found ${cruises.length} cruise options for tier ${tier}`)
    }

    // 7. Tipping rates
    console.log('💰 Fetching tipping rates...')
    const { data: tippingRates } = await supabase
      .from('tipping_rates')
      .select('*')
      .eq('is_active', true)

    let dailyTips = 15 // Default
    if (tippingRates && tippingRates.length > 0) {
      dailyTips = tippingRates.reduce((sum, t) => {
        if (t.rate_unit === 'per_day') {
          return sum + toNumber(t.rate_eur, 0)
        }
        return sum
      }, 0)
      if (dailyTips === 0) dailyTips = 15 // Fallback if no per_day rates
    }

    // Adjust tips based on tier
    const tierTipsMultiplier: Record<ServiceTier, number> = {
      'budget': 0.8,
      'standard': 1.0,
      'deluxe': 1.2,
      'luxury': 1.5
    }
    dailyTips = Math.round(dailyTips * tierTipsMultiplier[tier])
    console.log(`✅ Daily tips (tier-adjusted): €${dailyTips}`)

    // ============================================
    // GENERATE ITINERARY WITH AI
    // Include attractions for each day
    // ============================================
    
    const attractionNames = allEntranceFees?.map(a => a.attraction_name).join(', ') || ''

    // Include tier context in the AI prompt
    const tierDescriptions: Record<ServiceTier, string> = {
      'budget': 'cost-effective options, basic comfort, good value',
      'standard': 'comfortable mid-range options, good quality-price ratio',
      'deluxe': 'superior quality, enhanced comfort, premium experiences',
      'luxury': 'top-tier experiences, finest accommodations, VIP treatment'
    }

    const prompt = `You are an expert Egypt travel planner. Create a detailed ${duration_days}-day itinerary for ${city}.

CLIENT DETAILS:
- Name: ${client_name}
- Tour requested: ${tour_requested}
- Start date: ${start_date}
- Duration: ${duration_days} days
- Travelers: ${num_adults} adults${num_children > 0 ? `, ${num_children} children` : ''}
- Language: ${language}
- Service Tier: ${tier.toUpperCase()} (${tierDescriptions[tier]})
${hotel_name ? `- Hotel: ${hotel_name}` : `- Hotel: ${hotelName_final}`}
${interests.length > 0 ? `- Interests: ${interests.join(', ')}` : ''}
${special_requests.length > 0 ? `- Special requests: ${special_requests.join(', ')}` : ''}

SELECTED SUPPLIERS:
${selectedVehicle ? `- Vehicle: ${selectedVehicle.vehicle_type} (${selectedVehicle.tier} tier${selectedVehicle.is_preferred ? ', preferred supplier' : ''})` : '- Vehicle: Standard vehicle'}
${selectedGuide ? `- Guide: ${selectedGuide.name} (${selectedGuide.tier} tier${selectedGuide.is_preferred ? ', preferred supplier' : ''})` : '- Guide: Professional guide'}
${selectedHotel ? `- Hotel: ${selectedHotel.name} (${selectedHotel.tier} tier${selectedHotel.is_preferred ? ', preferred supplier' : ''})` : `- Hotel: ${hotelName_final}`}

AVAILABLE ATTRACTIONS IN DATABASE (use exact names for matching):
${attractionNames}

Create a day-by-day itinerary appropriate for the ${tier.toUpperCase()} service tier. For each day, specify EXACTLY which attractions will be visited.

Return JSON in this EXACT format:
{
  "trip_name": "descriptive trip name",
  "days": [
    {
      "day_number": 1,
      "title": "Day 1: Title describing main activities",
      "description": "Detailed description of the day's activities",
      "attractions": ["Exact Attraction Name 1", "Exact Attraction Name 2"],
      "city": "${city}",
      "includes_hotel": true
    }
  ]
}

IMPORTANT: 
- The "attractions" array must contain EXACT names from the available attractions list above
- Set "includes_hotel" to true for all nights except the last day
- Spread attractions logically across days (don't visit everything on day 1)
- Include 2-4 attractions per day maximum for a realistic pace
- For ${tier.toUpperCase()} tier, ${tier === 'luxury' ? 'focus on exclusive experiences and VIP access where possible' : tier === 'budget' ? 'prioritize essential sites and efficient routing' : 'balance quality experiences with good value'}`

    console.log('🤖 Generating itinerary content with OpenAI...')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Egypt travel planner. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })

    console.log('✅ Received itinerary content from OpenAI')

    const responseText = completion.choices[0].message.content || '{}'
    let cleanedResponse = responseText.trim()
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/g, '')
    }

    const itineraryData = JSON.parse(cleanedResponse)

    console.log('📊 Parsed itinerary:', {
      trip_name: itineraryData.trip_name,
      days_count: itineraryData.days?.length || 0
    })

    // ============================================
    // INSERT ITINERARY (with cost_mode from user preferences)
    // ============================================
    
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        itinerary_code,
        client_name,
        client_email: client_email || null,
        client_phone: client_phone || null,
        trip_name: itineraryData.trip_name,
        start_date: start_date,
        end_date: endDate.toISOString().split('T')[0],
        total_days: duration_days,
        num_adults,
        num_children,
        currency: currency, // Use currency from request or user preference
        total_cost: 0, // Will update after calculating
        total_revenue: 0,
        margin_percent: margin_percent,
        status: 'draft',
        tier: tier, // Store the tier used for this itinerary
        cost_mode: cost_mode, // NEW: Store cost mode from user preference
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        user_id: null,
        client_id: client_id
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Error inserting itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }

    console.log('✅ Created itinerary:', itinerary.id, `(cost_mode: ${cost_mode})`)

    // ============================================
    // INSERT DAYS WITH SERVICES
    // ============================================
    
    const marginMultiplier = 1 + (margin_percent / 100)
    const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100
    
    let totalSupplierCost = 0
    let totalClientPrice = 0

    // Per-day fixed costs (use rates from rate tables if available, otherwise from resource tables)
    const vehiclePerDay = vehicleRate 
      ? toNumber(vehicleRate.base_rate_eur, 0) 
      : (selectedVehicle ? toNumber(selectedVehicle.daily_rate_eur, 50) : 50)
    
    const guidePerDay = guideRate 
      ? toNumber(guideRate.base_rate_eur, 0) 
      : (selectedGuide ? toNumber(selectedGuide.daily_rate_eur, 55) : 55)
    
    const waterPerPersonPerDay = 2
    const roomsNeeded = Math.ceil(totalPax / 2)

    for (const dayData of itineraryData.days) {
      console.log(`📅 Creating day ${dayData.day_number}...`)

      const dayDate = new Date(startDateObj)
      dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayData.day_number,
          date: dayDate.toISOString().split('T')[0],
          title: dayData.title,
          description: dayData.description,
          city: dayData.city || city,
          overnight_city: dayData.city || city
        })
        .select()
        .single()

      if (dayError) {
        console.error(`❌ Error inserting day ${dayData.day_number}:`, dayError)
        throw new Error(`Failed to create day: ${dayError.message}`)
      }

      const services = []

      // ============================================
      // 1. TRANSPORTATION (per day)
      // ============================================
      const vehicleCost = toNumber(vehiclePerDay, 0)
      const vehicleName = selectedVehicle?.vehicle_type || vehicleRate?.vehicle_type || 'Vehicle'
      services.push({
        service_type: 'transportation',
        service_code: selectedVehicle?.id || vehicleRate?.service_code || 'TRANS-001',
        service_name: `${vehicleName} Transportation`,
        supplier_id: selectedVehicle?.id || null,
        supplier_name: selectedVehicle?.company_name || null,
        is_preferred_supplier: selectedVehicle?.is_preferred || false,
        quantity: 1,
        rate_eur: vehicleCost,
        rate_non_eur: vehicleCost,
        total_cost: vehicleCost,
        client_price: withMargin(vehicleCost),
        notes: `${vehicleName} from ${city}${selectedVehicle?.is_preferred ? ' (Preferred Supplier)' : ''}`
      })
      totalSupplierCost += vehicleCost
      totalClientPrice += withMargin(vehicleCost)

      // ============================================
      // 2. GUIDE (per day)
      // ============================================
      const guideCost = toNumber(guidePerDay, 0)
      services.push({
        service_type: 'guide',
        service_code: selectedGuide?.id || guideRate?.service_code || `GUIDE-${language.substring(0,2).toUpperCase()}`,
        service_name: `${language} Speaking Guide`,
        supplier_id: selectedGuide?.id || null,
        supplier_name: selectedGuide?.name || null,
        is_preferred_supplier: selectedGuide?.is_preferred || false,
        quantity: 1,
        rate_eur: guideCost,
        rate_non_eur: guideCost,
        total_cost: guideCost,
        client_price: withMargin(guideCost),
        notes: `Professional ${language} speaking guide${selectedGuide?.is_preferred ? ' (Preferred Supplier)' : ''}`
      })
      totalSupplierCost += guideCost
      totalClientPrice += withMargin(guideCost)

      // ============================================
      // 3. TIPS (per day - no margin)
      // ============================================
      const tipsCost = toNumber(dailyTips, 15)
      services.push({
        service_type: 'tips',
        service_code: 'DAILY-TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: tipsCost,
        rate_non_eur: tipsCost,
        total_cost: tipsCost,
        client_price: tipsCost, // No margin on tips
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += tipsCost
      totalClientPrice += tipsCost

      // ============================================
      // 4. ENTRANCE FEES (per day - SPECIFIC to this day's attractions!)
      // ============================================
      const dayAttractions = dayData.attractions || []
      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []

      if (dayAttractions.length > 0 && allEntranceFees) {
        for (const attractionName of dayAttractions) {
          // Find matching entrance fee (case-insensitive partial match)
          const entranceFee = allEntranceFees.find(ef => 
            ef.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
            attractionName.toLowerCase().includes(ef.attraction_name.toLowerCase())
          )

          if (entranceFee) {
            const feePerPerson = isEuroPassport 
              ? toNumber(entranceFee.eur_rate, 0)
              : toNumber(entranceFee.non_eur_rate, entranceFee.eur_rate || 0)
            
            dayEntranceTotal += feePerPerson * totalPax
            matchedAttractions.push(entranceFee.attraction_name)
            console.log(`   🎫 ${entranceFee.attraction_name}: €${feePerPerson} x ${totalPax} = €${feePerPerson * totalPax}`)
          }
        }
      }

      if (dayEntranceTotal > 0) {
        services.push({
          service_type: 'entrance',
          service_code: 'ENTRANCE-FEES',
          service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'} rates)`,
          quantity: totalPax,
          rate_eur: dayEntranceTotal / totalPax,
          rate_non_eur: dayEntranceTotal / totalPax,
          total_cost: dayEntranceTotal,
          client_price: withMargin(dayEntranceTotal),
          notes: `Sites: ${matchedAttractions.join(', ')}`
        })
        totalSupplierCost += dayEntranceTotal
        totalClientPrice += withMargin(dayEntranceTotal)
      }

      // ============================================
      // 5. LUNCH (per day)
      // ============================================
      if (include_lunch) {
        const lunchCost = toNumber(lunchRate, 12) * totalPax
        // Find a recommended restaurant for the note
        const lunchRestaurant = recommendedRestaurants?.find(r => r.city?.toLowerCase() === city.toLowerCase())
        services.push({
          service_type: 'meal',
          service_code: 'LUNCH',
          service_name: 'Lunch',
          supplier_id: lunchRestaurant?.id || null,
          supplier_name: lunchRestaurant?.name || null,
          is_preferred_supplier: lunchRestaurant?.is_preferred || false,
          quantity: totalPax,
          rate_eur: lunchRate,
          rate_non_eur: lunchRate,
          total_cost: lunchCost,
          client_price: withMargin(lunchCost),
          notes: lunchRestaurant 
            ? `Lunch at ${lunchRestaurant.name}${lunchRestaurant.is_preferred ? ' (Preferred)' : ''}`
            : 'Lunch at local restaurant'
        })
        totalSupplierCost += lunchCost
        totalClientPrice += withMargin(lunchCost)
      }

      // ============================================
      // 6. DINNER (per day if included)
      // ============================================
      if (include_dinner) {
        const dinnerCost = toNumber(dinnerRate, 18) * totalPax
        const dinnerRestaurant = recommendedRestaurants?.find(r => 
          r.city?.toLowerCase() === city.toLowerCase() && r.cuisine_type?.toLowerCase().includes('dinner')
        ) || recommendedRestaurants?.[0]
        services.push({
          service_type: 'meal',
          service_code: 'DINNER',
          service_name: 'Dinner',
          supplier_id: dinnerRestaurant?.id || null,
          supplier_name: dinnerRestaurant?.name || null,
          is_preferred_supplier: dinnerRestaurant?.is_preferred || false,
          quantity: totalPax,
          rate_eur: dinnerRate,
          rate_non_eur: dinnerRate,
          total_cost: dinnerCost,
          client_price: withMargin(dinnerCost),
          notes: dinnerRestaurant 
            ? `Dinner at ${dinnerRestaurant.name}${dinnerRestaurant.is_preferred ? ' (Preferred)' : ''}`
            : 'Dinner at restaurant'
        })
        totalSupplierCost += dinnerCost
        totalClientPrice += withMargin(dinnerCost)
      }

      // ============================================
      // 7. WATER (per day - no margin)
      // ============================================
      const waterCost = waterPerPersonPerDay * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterPerPersonPerDay,
        rate_non_eur: waterPerPersonPerDay,
        total_cost: waterCost,
        client_price: waterCost, // No margin on water
        notes: 'Bottled water throughout the day'
      })
      totalSupplierCost += waterCost
      totalClientPrice += waterCost

      // ============================================
      // 8. HOTEL (per night - NOT on the last day)
      // ============================================
      const isLastDay = dayData.day_number === duration_days
      const includesHotel = dayData.includes_hotel !== false && !isLastDay && include_accommodation

      console.log(`   🏨 Day ${dayData.day_number}: isLastDay=${isLastDay}, includesHotel=${includesHotel}, hotelRate=${hotelRate}`)

      if (includesHotel && hotelRate > 0) {
        const hotelCost = hotelRate * roomsNeeded
        services.push({
          service_type: 'accommodation',
          service_code: selectedHotel?.id || 'HOTEL',
          service_name: `${hotelName_final} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          supplier_id: selectedHotel?.id || null,
          supplier_name: hotelName_final,
          is_preferred_supplier: selectedHotel?.is_preferred || false,
          quantity: roomsNeeded,
          rate_eur: hotelRate,
          rate_non_eur: hotelRate,
          total_cost: hotelCost,
          client_price: withMargin(hotelCost),
          notes: `Overnight at ${hotelName_final}${selectedHotel?.is_preferred ? ' (Preferred Supplier)' : ''}`
        })
        totalSupplierCost += hotelCost
        totalClientPrice += withMargin(hotelCost)
        console.log(`   ✅ Hotel added: ${hotelName_final} - €${hotelRate} x ${roomsNeeded} rooms = €${hotelCost}`)
      } else if (includesHotel && hotelRate === 0) {
        console.log(`   ⚠️ Hotel skipped: rate is €0`)
      }

      // ============================================
      // INSERT ALL SERVICES FOR THIS DAY
      // ============================================
      for (const serviceData of services) {
        const { error: serviceError } = await supabase
          .from('itinerary_services')
          .insert({
            itinerary_day_id: day.id,
            service_type: serviceData.service_type,
            service_code: serviceData.service_code,
            service_name: serviceData.service_name,
            supplier_id: serviceData.supplier_id || null,
            supplier_name: serviceData.supplier_name || null,
            is_preferred_supplier: serviceData.is_preferred_supplier || false,
            quantity: serviceData.quantity,
            rate_eur: toNumber(serviceData.rate_eur, 0),
            rate_non_eur: toNumber(serviceData.rate_non_eur, 0),
            total_cost: toNumber(serviceData.total_cost, 0),
            client_price: toNumber(serviceData.client_price, 0),
            notes: serviceData.notes
          })

        if (serviceError) {
          console.error('❌ Error adding service:', serviceError)
        }
      }

      console.log(`✅ Added ${services.length} services to day ${dayData.day_number}`)
    }

    // ============================================
    // UPDATE ITINERARY TOTALS
    // ============================================
    const { error: updateError } = await supabase
      .from('itineraries')
      .update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice
      })
      .eq('id', itinerary.id)

    if (updateError) {
      console.error('❌ Error updating totals:', updateError)
    }

    console.log('🎉 Itinerary generation completed!')
    console.log(`🎯 Service Tier: ${tier.toUpperCase()}`)
    console.log(`📊 Cost Mode: ${cost_mode}`)
    console.log(`💰 Total Supplier Cost: €${totalSupplierCost.toFixed(2)}`)
    console.log(`💰 Total Client Price: €${totalClientPrice.toFixed(2)}`)
    console.log(`💰 Margin: €${(totalClientPrice - totalSupplierCost).toFixed(2)}`)

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier: tier,
        cost_mode: cost_mode, // Include in response
        currency: currency,
        supplier_cost: totalSupplierCost,
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        margin: totalClientPrice - totalSupplierCost,
        margin_percent: margin_percent,
        per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100,
        total_days: duration_days,
        passport_type: isEuroPassport ? 'EUR' : 'non-EUR',
        // Selected suppliers info
        selected_suppliers: {
          vehicle: selectedVehicle ? {
            name: selectedVehicle.vehicle_type,
            tier: selectedVehicle.tier,
            is_preferred: selectedVehicle.is_preferred
          } : null,
          guide: selectedGuide ? {
            name: selectedGuide.name,
            tier: selectedGuide.tier,
            is_preferred: selectedGuide.is_preferred
          } : null,
          hotel: selectedHotel ? {
            name: selectedHotel.name,
            tier: selectedHotel.tier,
            is_preferred: selectedHotel.is_preferred,
            rate: hotelRate
          } : {
            name: hotelName_final,
            rate: hotelRate
          }
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Error generating itinerary:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate itinerary'
      },
      { status: 500 }
    )
  }
}