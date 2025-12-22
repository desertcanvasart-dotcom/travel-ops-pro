import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Admin client for bypassing RLS on content library
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
// CONTENT LIBRARY INTEGRATION
// ============================================

interface ContentItem {
  id: string
  name: string
  category_name: string
  category_slug: string
  tier: string
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
}

interface WritingRule {
  rule_type: string
  rule_text: string
  category: string
  priority: number
}

async function fetchContentLibrary(
  tier: string,
  cities: string[],
  interests: string[]
): Promise<ContentItem[]> {
  try {
    const searchTags = [
      ...cities.map(c => c.toLowerCase()),
      ...interests.map(i => i.toLowerCase())
    ]

    const { data: variations, error } = await supabaseAdmin
      .from('content_variations')
      .select(`
        id,
        content_id,
        tier,
        title,
        description,
        highlights,
        inclusions,
        content_library!inner (
          id,
          name,
          slug,
          short_description,
          location,
          tags,
          content_categories!inner (
            name,
            slug
          )
        )
      `)
      .eq('tier', tier)
      .eq('is_active', true)

    if (error || !variations) {
      console.log('⚠️ No content library items found:', error?.message)
      return []
    }

    // Filter and transform content
    const content: ContentItem[] = variations
      .filter((v: any) => {
        const item = v.content_library
        if (!item) return false
        
        const itemTags = (item.tags || []).map((t: string) => t.toLowerCase())
        const itemLocation = (item.location || '').toLowerCase()
        const itemName = (item.name || '').toLowerCase()
        
        // Match by location, tags, or name
        const matchesSearch = searchTags.length === 0 || searchTags.some(tag => 
          itemTags.includes(tag) ||
          itemLocation.includes(tag) ||
          itemName.includes(tag) ||
          tag.includes(itemLocation)
        )
        
        return matchesSearch
      })
      .map((v: any) => ({
        id: v.content_id,
        name: v.content_library.name,
        category_name: v.content_library.content_categories?.name || 'General',
        category_slug: v.content_library.content_categories?.slug || 'general',
        tier: v.tier,
        title: v.title || v.content_library.name,
        description: v.description || v.content_library.short_description || '',
        highlights: v.highlights || [],
        inclusions: v.inclusions || []
      }))

    console.log(`📚 Found ${content.length} content items for tier ${tier}`)
    return content
  } catch (err) {
    console.error('⚠️ Error fetching content library:', err)
    return []
  }
}

async function fetchWritingRules(): Promise<WritingRule[]> {
  try {
    const { data: rules, error } = await supabaseAdmin
      .from('writing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error || !rules) {
      console.log('⚠️ No writing rules found')
      return []
    }

    console.log(`📝 Found ${rules.length} writing rules`)
    return rules
  } catch (err) {
    console.error('⚠️ Error fetching writing rules:', err)
    return []
  }
}

function buildContentContext(content: ContentItem[]): string {
  if (content.length === 0) return ''

  const grouped: Record<string, ContentItem[]> = {}
  content.forEach(item => {
    if (!grouped[item.category_slug]) {
      grouped[item.category_slug] = []
    }
    grouped[item.category_slug].push(item)
  })

  let context = '\n\nCONTENT LIBRARY (Use these descriptions as inspiration for your writing):\n'

  for (const [category, items] of Object.entries(grouped)) {
    context += `\n[${items[0]?.category_name || category}]\n`
    items.slice(0, 5).forEach(item => { // Limit to 5 per category to avoid token overflow
      context += `• ${item.name}: ${item.description?.substring(0, 200) || 'No description'}${item.description && item.description.length > 200 ? '...' : ''}\n`
      if (item.highlights && item.highlights.length > 0) {
        context += `  Highlights: ${item.highlights.slice(0, 3).join(', ')}\n`
      }
    })
  }

  return context
}

function buildWritingRulesContext(rules: WritingRule[]): string {
  if (rules.length === 0) return ''

  let context = '\n\nWRITING STYLE GUIDELINES:\n'

  const enforceRules = rules.filter(r => r.rule_type === 'enforce').slice(0, 5)
  const preferRules = rules.filter(r => r.rule_type === 'prefer').slice(0, 5)
  const avoidRules = rules.filter(r => r.rule_type === 'avoid').slice(0, 5)

  if (enforceRules.length > 0) {
    context += 'MUST follow:\n'
    enforceRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  if (preferRules.length > 0) {
    context += 'Preferred style:\n'
    preferRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  if (avoidRules.length > 0) {
    context += 'AVOID:\n'
    avoidRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  return context
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
      tour_name, // Alternative field name from WhatsApp parser
      start_date,
      duration_days: raw_duration_days,
      num_adults,
      num_children,
      language = 'English',
      conversation_language, // From WhatsApp parser
      interests = [],
      cities = [], // Cities from WhatsApp parser
      special_requests = [],
      budget_level = 'standard',
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
      margin_percent = userPrefs.default_margin_percent,
      currency = userPrefs.default_currency,
      cost_mode = userPrefs.default_cost_mode,
      // Package type from WhatsApp parser
      package_type = 'full-package',
      // ⭐ NEW: Skip pricing flag for edit-first workflow
      skip_pricing = false
    } = body

    // Use tour_name if tour_requested not provided
    const finalTourName = tour_requested || tour_name || 'Egypt Tour'
    
    // Use conversation_language if language not explicitly set
    const finalLanguage = language !== 'English' ? language : (conversation_language || 'English')

    // Normalize tier
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
    console.log(`🎯 Service Tier: ${tier.toUpperCase()}`)
    console.log(`📦 Package Type: ${package_type}`)
    console.log(`💰 Margin: ${margin_percent}%`)
    console.log(`💱 Currency: ${currency}`)
    console.log(`📊 Cost Mode: ${cost_mode}`)
    console.log(`🏨 Include accommodation: ${include_accommodation}`)
    console.log(`🌍 Cities: ${cities.join(', ') || city}`)
    // ⭐ NEW: Log skip_pricing mode
    console.log(`✏️ Skip Pricing (Edit First): ${skip_pricing}`)

    const totalPax = num_adults + num_children

    // ============================================
    // FETCH CONTENT LIBRARY
    // ============================================
    const searchCities = cities.length > 0 ? cities : [city]
    const contentLibrary = await fetchContentLibrary(tier, searchCities, interests)
    const writingRules = await fetchWritingRules()
    
    const contentContext = buildContentContext(contentLibrary)
    const writingContext = buildWritingRulesContext(writingRules)

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
    const tierPrefix = tier.charAt(0).toUpperCase()
    const itinerary_code = `ITN-${tierPrefix}-${year}-${randomNum}`

    // ============================================
    // DETERMINE WHAT TO INCLUDE BASED ON PACKAGE TYPE
    // ============================================
    let includeAccommodationFinal = include_accommodation
    let includeAirportTransfers = false
    let includePortTransfers = false

    switch (package_type) {
      case 'day-trips':
        includeAccommodationFinal = false
        break
      case 'tours-only':
        includeAccommodationFinal = false
        break
      case 'land-package':
        includeAccommodationFinal = true
        includeAirportTransfers = false
        break
      case 'full-package':
        includeAccommodationFinal = true
        includeAirportTransfers = true
        break
      case 'cruise-land':
        includeAccommodationFinal = true
        break
      case 'shore-excursions':
        includeAccommodationFinal = false
        includePortTransfers = true
        break
    }

    console.log(`📦 Package config: accommodation=${includeAccommodationFinal}, airport=${includeAirportTransfers}, port=${includePortTransfers}`)

    // ============================================
    // FETCH ALL AVAILABLE RATES WITH TIER FILTERING
    // ============================================
    
    // 1. Transportation rates
    console.log(`🚗 Fetching vehicles for tier: ${tier}...`)
    
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .order('capacity_min', { ascending: true })

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
      selectedVehicle = availableVehicles.find(v => 
        totalPax >= toNumber(v.capacity_min, 1) && 
        totalPax <= toNumber(v.capacity_max, 99)
      ) || availableVehicles[availableVehicles.length - 1]
      
      console.log(`✅ Selected vehicle: ${selectedVehicle.vehicle_type} (tier: ${selectedVehicle.tier}, preferred: ${selectedVehicle.is_preferred})`)
    }

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

    // 2. Guide rates
    console.log(`🎯 Fetching guides for tier: ${tier}, language: ${finalLanguage}...`)
    
    const { data: guides } = await supabase
      .from('guides')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .contains('languages', [finalLanguage])
      .order('is_preferred', { ascending: false })
      .limit(5)

    let availableGuides = guides
    if (!availableGuides || availableGuides.length === 0) {
      console.log(`⚠️ No guides found for tier ${tier} with ${finalLanguage}, trying without tier filter`)
      const { data: fallbackGuides } = await supabase
        .from('guides')
        .select('*')
        .eq('is_active', true)
        .contains('languages', [finalLanguage])
        .order('is_preferred', { ascending: false })
        .limit(5)
      availableGuides = fallbackGuides
    }

    let selectedGuide = null
    if (availableGuides && availableGuides.length > 0) {
      selectedGuide = availableGuides[0]
      console.log(`✅ Selected guide: ${selectedGuide.name} (tier: ${selectedGuide.tier}, preferred: ${selectedGuide.is_preferred})`)
    }

    const { data: guideRates } = await supabase
      .from('guide_rates')
      .select('*')
      .eq('is_active', true)
      .eq('guide_language', finalLanguage)
      .limit(1)

    let guideRate = null
    if (guideRates && guideRates.length > 0) {
      guideRate = guideRates[0]
      console.log(`✅ Guide rate: €${guideRate.base_rate_eur}/day`)
    }

    // 3. ALL entrance fees
    console.log('🏛️ Fetching all entrance fees...')
    const { data: allEntranceFees } = await supabase
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)

    console.log(`✅ Loaded ${allEntranceFees?.length || 0} entrance fees`)

    // 4. Meal rates
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

    const { data: mealRates } = await supabase
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .limit(1)

    let lunchRate = 12
    let dinnerRate = 18
    if (mealRates && mealRates.length > 0) {
      lunchRate = toNumber(mealRates[0].lunch_rate_eur, 12)
      dinnerRate = toNumber(mealRates[0].dinner_rate_eur, 18)
    }

    const tierMealMultiplier: Record<ServiceTier, number> = {
      'budget': 0.8,
      'standard': 1.0,
      'deluxe': 1.3,
      'luxury': 1.6
    }
    lunchRate = Math.round(lunchRate * tierMealMultiplier[tier])
    dinnerRate = Math.round(dinnerRate * tierMealMultiplier[tier])
    console.log(`✅ Meal rates (tier-adjusted): Lunch €${lunchRate}, Dinner €${dinnerRate}`)

    // 5. Accommodation rates
    console.log(`🏨 Fetching hotels for tier: ${tier}...`)
    let hotelRate = 0
    let hotelName_final = hotel_name || 'Standard Hotel'
    let selectedHotel = null
    
    if (includeAccommodationFinal) {
      const { data: hotelContacts, error: hcError } = await supabase
        .from('hotel_contacts')
        .select('*')
        .ilike('city', city)
        .eq('is_active', true)
        .eq('tier', tier)
        .order('is_preferred', { ascending: false })
        .order('star_rating', { ascending: false })
        .limit(5)

      if (hotelContacts && hotelContacts.length > 0) {
        selectedHotel = hotelContacts[0]
        hotelRate = toNumber(selectedHotel.rate_double_eur, 80)
        hotelName_final = selectedHotel.name || hotelName_final
        console.log(`✅ Selected hotel: ${hotelName_final} @ €${hotelRate}/night`)
      } else {
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
        } else {
          const defaultRates: Record<ServiceTier, number> = {
            'budget': 45,
            'standard': 80,
            'deluxe': 120,
            'luxury': 180
          }
          hotelRate = defaultRates[tier]
        }
      }
    }

    // 6. Tipping rates
    const { data: tippingRates } = await supabase
      .from('tipping_rates')
      .select('*')
      .eq('is_active', true)

    let dailyTips = 15
    if (tippingRates && tippingRates.length > 0) {
      dailyTips = tippingRates.reduce((sum, t) => {
        if (t.rate_unit === 'per_day') {
          return sum + toNumber(t.rate_eur, 0)
        }
        return sum
      }, 0)
      if (dailyTips === 0) dailyTips = 15
    }

    const tierTipsMultiplier: Record<ServiceTier, number> = {
      'budget': 0.8,
      'standard': 1.0,
      'deluxe': 1.2,
      'luxury': 1.5
    }
    dailyTips = Math.round(dailyTips * tierTipsMultiplier[tier])

    // ============================================
    // GENERATE ITINERARY WITH AI
    // ============================================
    
    const attractionNames = allEntranceFees?.map(a => a.attraction_name).join(', ') || ''

    const tierDescriptions: Record<ServiceTier, string> = {
      'budget': 'cost-effective options, basic comfort, good value',
      'standard': 'comfortable mid-range options, good quality-price ratio',
      'deluxe': 'superior quality, enhanced comfort, premium experiences',
      'luxury': 'top-tier experiences, finest accommodations, VIP treatment'
    }

    const packageTypeDescriptions: Record<string, string> = {
      'day-trips': 'Day trips only - client returns to their own hotel each day, no accommodation included',
      'tours-only': 'Tours only - client has their own hotel booked separately, include only daily tours',
      'land-package': 'Land package - include accommodation but NO airport transfers',
      'full-package': 'Full package - include EVERYTHING: accommodation, airport transfers, all tours',
      'cruise-land': 'Cruise + Land package - combine Nile cruise with land-based touring',
      'shore-excursions': 'Shore excursions - client arriving by cruise ship, pickup from PORT, time-constrained'
    }

    // Build enhanced prompt with Content Library context
    const prompt = `You are an expert Egypt travel planner for Travel2Egypt. Create a detailed ${duration_days}-day itinerary.

CLIENT DETAILS:
- Name: ${client_name}
- Tour requested: ${finalTourName}
- Start date: ${start_date}
- Duration: ${duration_days} days
- Travelers: ${num_adults} adults${num_children > 0 ? `, ${num_children} children` : ''}
- Language: ${finalLanguage}
- Service Tier: ${tier.toUpperCase()} (${tierDescriptions[tier]})
- Package Type: ${package_type.toUpperCase()} (${packageTypeDescriptions[package_type] || 'Standard package'})
${hotel_name ? `- Client's Hotel: ${hotel_name}` : includeAccommodationFinal ? `- Recommended Hotel: ${hotelName_final}` : '- No accommodation needed'}
${interests.length > 0 ? `- Interests: ${interests.join(', ')}` : ''}
${special_requests.length > 0 ? `- Special requests: ${special_requests.join(', ')}` : ''}
${cities.length > 0 ? `- Cities to visit: ${cities.join(', ')}` : ''}

SELECTED SUPPLIERS:
${selectedVehicle ? `- Vehicle: ${selectedVehicle.vehicle_type} (${selectedVehicle.tier} tier${selectedVehicle.is_preferred ? ', preferred' : ''})` : '- Vehicle: Standard vehicle'}
${selectedGuide ? `- Guide: ${selectedGuide.name} (${selectedGuide.tier} tier${selectedGuide.is_preferred ? ', preferred' : ''})` : '- Guide: Professional guide'}
${selectedHotel && includeAccommodationFinal ? `- Hotel: ${selectedHotel.name} (${selectedHotel.tier} tier${selectedHotel.is_preferred ? ', preferred' : ''})` : ''}

AVAILABLE ATTRACTIONS (use exact names):
${attractionNames}
${contentContext}
${writingContext}

Create a day-by-day itinerary appropriate for ${tier.toUpperCase()} tier and ${package_type} package type.

Return JSON in this EXACT format:
{
  "trip_name": "descriptive trip name",
  "days": [
    {
      "day_number": 1,
      "title": "Day 1: Title describing main activities",
      "description": "Detailed description using the writing style guidelines above",
      "attractions": ["Exact Attraction Name 1", "Exact Attraction Name 2"],
      "city": "${city}",
      "includes_hotel": ${includeAccommodationFinal && duration_days > 1 ? 'true' : 'false'}
    }
  ]
}

IMPORTANT:
- Use EXACT attraction names from the list above
- Set "includes_hotel" to ${includeAccommodationFinal ? 'true for all nights except the last day' : 'false (this is a ' + package_type + ' package)'}
- For ${tier.toUpperCase()} tier: ${tier === 'luxury' ? 'focus on exclusive experiences and VIP access' : tier === 'budget' ? 'prioritize essential sites and efficient routing' : 'balance quality with value'}
- For ${package_type}: ${packageTypeDescriptions[package_type] || ''}`

    console.log('🤖 Generating itinerary content with OpenAI...')
    console.log(`📚 Including ${contentLibrary.length} content items and ${writingRules.length} writing rules in context`)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Egypt travel planner. Always respond with valid JSON only. Use the provided content library descriptions as inspiration for your writing style.'
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
// END OF PART 1 - CONTINUE IN PART 2
// ============================================
// ============================================
// PART 2 - PASTE DIRECTLY AFTER PART 1
// (Remove this comment block after pasting)
// ============================================

    // ============================================
    // INSERT ITINERARY
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
        currency: currency,
        total_cost: 0,
        total_revenue: 0,
        margin_percent: margin_percent,
        status: 'draft',
        tier: tier,
        package_type: package_type,
        cost_mode: cost_mode,
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

    console.log('✅ Created itinerary:', itinerary.id)

    // ============================================
    // INSERT DAYS WITH SERVICES
    // ============================================
    
    const marginMultiplier = 1 + (margin_percent / 100)
    const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100
    
    let totalSupplierCost = 0
    let totalClientPrice = 0

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

      const isLastDay = dayData.day_number === duration_days
      const includesHotelForDay = dayData.includes_hotel !== false && !isLastDay && includeAccommodationFinal

      // ⭐ UPDATED: Insert day with new fields for editor
      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayData.day_number,
          date: dayDate.toISOString().split('T')[0],
          title: dayData.title,
          description: dayData.description,
          city: dayData.city || city,
          overnight_city: dayData.city || city,
          // ⭐ NEW FIELDS for editor functionality
          attractions: dayData.attractions || [],
          guide_required: true,
          lunch_included: include_lunch,
          dinner_included: include_dinner,
          hotel_included: includesHotelForDay
        })
        .select()
        .single()

      if (dayError) {
        console.error(`❌ Error inserting day ${dayData.day_number}:`, dayError)
        throw new Error(`Failed to create day: ${dayError.message}`)
      }

      // ⭐ SKIP SERVICES IF skip_pricing IS TRUE
      if (skip_pricing) {
        console.log(`⏭️ Skipping services for day ${dayData.day_number} (edit-first mode)`)
        continue // Skip to next day, don't create services
      }

      // ============================================
      // CREATE SERVICES (only if NOT skip_pricing)
      // ============================================
      const services = []

      // 1. TRANSPORTATION
      const vehicleCost = toNumber(vehiclePerDay, 0)
      const vehicleName = selectedVehicle?.vehicle_type || vehicleRate?.vehicle_type || 'Vehicle'
      services.push({
        service_type: 'transportation',
        service_code: selectedVehicle?.id || vehicleRate?.service_code || 'TRANS-001',
        service_name: `${vehicleName} Transportation`,
        supplier_name: selectedVehicle?.company_name || null,
        quantity: 1,
        rate_eur: vehicleCost,
        rate_non_eur: vehicleCost,
        total_cost: vehicleCost,
        client_price: withMargin(vehicleCost),
        notes: `${vehicleName} from ${city}${selectedVehicle?.is_preferred ? ' (Preferred)' : ''}`
      })
      totalSupplierCost += vehicleCost
      totalClientPrice += withMargin(vehicleCost)

      // 2. GUIDE
      const guideCost = toNumber(guidePerDay, 0)
      services.push({
        service_type: 'guide',
        service_code: selectedGuide?.id || guideRate?.service_code || `GUIDE-${finalLanguage.substring(0,2).toUpperCase()}`,
        service_name: `${finalLanguage} Speaking Guide`,
        supplier_name: selectedGuide?.name || null,
        quantity: 1,
        rate_eur: guideCost,
        rate_non_eur: guideCost,
        total_cost: guideCost,
        client_price: withMargin(guideCost),
        notes: `Professional ${finalLanguage} speaking guide${selectedGuide?.is_preferred ? ' (Preferred)' : ''}`
      })
      totalSupplierCost += guideCost
      totalClientPrice += withMargin(guideCost)

      // 3. TIPS
      const tipsCost = toNumber(dailyTips, 15)
      services.push({
        service_type: 'tips',
        service_code: 'DAILY-TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: tipsCost,
        rate_non_eur: tipsCost,
        total_cost: tipsCost,
        client_price: tipsCost,
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += tipsCost
      totalClientPrice += tipsCost

      // 4. ENTRANCE FEES
      const dayAttractions = dayData.attractions || []
      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []

      if (dayAttractions.length > 0 && allEntranceFees) {
        for (const attractionName of dayAttractions) {
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

      // 5. LUNCH
      if (include_lunch) {
        const lunchCost = toNumber(lunchRate, 12) * totalPax
        const lunchRestaurant = recommendedRestaurants?.find(r => r.city?.toLowerCase() === city.toLowerCase())
        services.push({
          service_type: 'meal',
          service_code: 'LUNCH',
          service_name: 'Lunch',
          supplier_name: lunchRestaurant?.name || null,
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

      // 6. DINNER
      if (include_dinner) {
        const dinnerCost = toNumber(dinnerRate, 18) * totalPax
        services.push({
          service_type: 'meal',
          service_code: 'DINNER',
          service_name: 'Dinner',
          quantity: totalPax,
          rate_eur: dinnerRate,
          rate_non_eur: dinnerRate,
          total_cost: dinnerCost,
          client_price: withMargin(dinnerCost),
          notes: 'Dinner at restaurant'
        })
        totalSupplierCost += dinnerCost
        totalClientPrice += withMargin(dinnerCost)
      }

      // 7. WATER
      const waterCost = waterPerPersonPerDay * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterPerPersonPerDay,
        rate_non_eur: waterPerPersonPerDay,
        total_cost: waterCost,
        client_price: waterCost,
        notes: 'Bottled water throughout the day'
      })
      totalSupplierCost += waterCost
      totalClientPrice += waterCost

      // 8. HOTEL (based on package type)
      if (includesHotelForDay && hotelRate > 0) {
        const hotelCost = hotelRate * roomsNeeded
        services.push({
          service_type: 'accommodation',
          service_code: selectedHotel?.id || 'HOTEL',
          service_name: `${hotelName_final} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          supplier_name: hotelName_final,
          quantity: roomsNeeded,
          rate_eur: hotelRate,
          rate_non_eur: hotelRate,
          total_cost: hotelCost,
          client_price: withMargin(hotelCost),
          notes: `Overnight at ${hotelName_final}${selectedHotel?.is_preferred ? ' (Preferred)' : ''}`
        })
        totalSupplierCost += hotelCost
        totalClientPrice += withMargin(hotelCost)
      }

      // INSERT ALL SERVICES
      for (const serviceData of services) {
        const { error: serviceError } = await supabase
          .from('itinerary_services')
          .insert({
            itinerary_day_id: day.id,
            service_type: serviceData.service_type,
            service_code: serviceData.service_code,
            service_name: serviceData.service_name,
            supplier_name: serviceData.supplier_name || null,
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
    // UPDATE ITINERARY TOTALS (CONDITIONAL)
    // ============================================
    
    if (skip_pricing) {
      // ⭐ SKIP_PRICING MODE: Keep as draft, no totals
      console.log('📝 Itinerary created in DRAFT mode (edit-first, no pricing yet)')
    } else {
      // NORMAL MODE: Update with calculated totals
      const { error: updateError } = await supabase
        .from('itineraries')
        .update({
          total_cost: totalClientPrice,
          total_revenue: totalClientPrice,
          status: 'quoted'
        })
        .eq('id', itinerary.id)

      if (updateError) {
        console.error('❌ Error updating totals:', updateError)
      }

      console.log('🎉 Itinerary generation completed with pricing!')
      console.log(`💰 Total Supplier Cost: €${totalSupplierCost.toFixed(2)}`)
      console.log(`💰 Total Client Price: €${totalClientPrice.toFixed(2)}`)
    }

    console.log(`🎯 Service Tier: ${tier.toUpperCase()}`)
    console.log(`📦 Package Type: ${package_type}`)
    console.log(`📚 Content Library items used: ${contentLibrary.length}`)

    // ============================================
    // RETURN RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier: tier,
        package_type: package_type,
        // ⭐ NEW: Mode indicator
        mode: skip_pricing ? 'draft' : 'quoted',
        skip_pricing: skip_pricing,
        // ⭐ NEW: Redirect hint for frontend
        redirect_to: skip_pricing 
          ? `/itineraries/${itinerary.id}/edit`
          : `/itineraries/${itinerary.id}`,
        // Include pricing only if calculated
        ...(skip_pricing ? {
          // Draft mode - minimal data
          cost_mode: cost_mode,
          currency: currency,
          total_days: duration_days,
          passport_type: isEuroPassport ? 'EUR' : 'non-EUR'
        } : {
          // Full mode - all pricing data
          cost_mode: cost_mode,
          currency: currency,
          supplier_cost: totalSupplierCost,
          total_cost: totalClientPrice,
          total_revenue: totalClientPrice,
          margin: totalClientPrice - totalSupplierCost,
          margin_percent: margin_percent,
          per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100,
          total_days: duration_days,
          passport_type: isEuroPassport ? 'EUR' : 'non-EUR',
          content_items_used: contentLibrary.length,
          writing_rules_applied: writingRules.length,
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
        })
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