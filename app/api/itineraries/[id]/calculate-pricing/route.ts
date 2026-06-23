// ============================================
// CALCULATE PRICING API
// File: app/api/itineraries/[id]/calculate-pricing/route.ts
// 
// Recalculates pricing for an existing itinerary
// after edits in the Editor page.
// NOW USES USER PREFERENCES for margin, tier, etc.
// UPDATED: Respects is_addon flag for attractions
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchExchangeRates, convertCurrency, isUsingFallbackRates, type ExchangeRates } from '@/lib/currency-service'
import { getFixedDailyCosts } from '@/lib/fixed-costs'
// B4: shared margin formula (one source of truth across the grid calculator
// and this route) + smart per-day transport rate selection from auto-pricing-service.
import { applyMargin } from '@/lib/pricing-math'
import {
  buildTransportCache,
  determineTransportNeeds,
  findTransportRate,
  type ItineraryDay,
  type TransportNeed,
} from '@/lib/auto-pricing-service'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// TYPES
// ============================================

interface DayService {
  guide: boolean
  lunch: boolean
  dinner: boolean
  hotel: boolean
  water: boolean
  tips: boolean
}

interface DayInput {
  day_number: number
  city: string
  attractions: string[]
  services: DayService
  overnight_city: string | null
}

interface PricingRequest {
  tier: string
  package_type: string
  days: DayInput[]
  num_adults: number
  num_children: number    // Ages 4-12: 50% discount
  num_infants: number     // Ages 0-3: FREE except flights
  nationality_type: 'eur' | 'non-eur'
  include_addons?: boolean // Whether to include add-on attractions
}

// Child discount constants (matches auto-pricing-service.ts)
const CHILD_DISCOUNT_PERCENT = 50  // Children (4-12) get 50% off
const INFANT_RATE_PERCENT = 0      // Infants (0-3) are FREE except flights

interface UserPreferences {
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

// ============================================
// DEFAULT VALUES (fallback if no user prefs)
// ============================================

const DEFAULT_MARGIN_PERCENT = 25
const DEFAULT_TIER = 'standard'
const DEFAULT_CURRENCY = 'EUR'

// ============================================
// GET USER PREFERENCES
// ============================================

async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      console.log('[Pricing] No user preferences found, using defaults')
      return null
    }

    console.log('[Pricing] User preferences loaded:', {
      margin: data.default_margin_percent,
      tier: data.default_tier,
      cost_mode: data.default_cost_mode
    })

    return {
      default_cost_mode: data.default_cost_mode || 'auto',
      default_tier: data.default_tier || DEFAULT_TIER,
      default_margin_percent: data.default_margin_percent ?? DEFAULT_MARGIN_PERCENT,
      default_currency: data.default_currency || DEFAULT_CURRENCY
    }
  } catch (error) {
    console.error('[Pricing] Error fetching user preferences:', error)
    return null
  }
}

// ============================================
// GET CURRENT USER FROM SESSION
// ============================================

async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch (error) {
    console.error('[Pricing] Error getting current user:', error)
    return null
  }
}

// ============================================
// RATE FETCHING
// ============================================
//
// Transportation rate selection moved to lib/auto-pricing-service (B4):
// determineTransportNeeds + findTransportRate. That engine knows the new
// canonical service_type taxonomy (B3) — a day correctly emits one OR many
// transport line items (e.g. flight day = two airport transfers), and a
// cruise day's ground excursion is bundled in the cruise package.
//
// The local applyMarkup wrapper has been replaced with applyMargin from
// lib/pricing-math — the single canonical cost → margin → selling formula.

/**
 * Convert a request-body DayInput to the ItineraryDay shape the
 * transport-rules engine expects. The edit-page UI doesn't currently expose
 * arrival/departure/cruise/flight flags, so we infer airport_arrival from
 * "first day" and airport_departure from "last day" — matching the
 * convention parseItinerary uses for AI-generated itineraries.
 *
 * Future work (B5+ scope): extend the edit-page UI to expose
 * skip_arrival_checkin / transport_type / extras / is_cruise_day so users
 * can opt into the multi-leg flight day, cruise package, and extras rules.
 */
function toItineraryDay(d: DayInput, isFirstDay: boolean, isLastDay: boolean): ItineraryDay {
  return {
    day: d.day_number,
    title: '',
    city: d.city,
    overnight_city: d.overnight_city || undefined,
    accommodation_type: 'hotel',
    meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
    attractions: d.attractions || [],
    services: {
      airport_arrival: isFirstDay,
      airport_departure: isLastDay,
      hotel_checkin: isFirstDay,
      hotel_checkout: isLastDay,
      guide_required: d.services?.guide || false,
    },
  }
}

async function getGuideRate(city: string, tier: string, language: string = 'English') {
  // Try guide_rates table
  const { data: rate } = await supabaseAdmin
    .from('guide_rates')
    .select('*')
    .eq('is_active', true)
    .ilike('guide_language', `%${language}%`)
    .limit(1)
    .single()

  if (rate) {
    return {
      rate: rate.base_rate_eur || rate.full_day_rate_eur || 0,
      supplier_id: rate.supplier_id || null,
      supplier_name: rate.guide_name || null,
      name: `${language} Speaking Guide - ${city}`,
      code: rate.service_code || `GUIDE-${language.substring(0,2).toUpperCase()}`
    }
  }

  // Try guides table
  const { data: guide } = await supabaseAdmin
    .from('guides')
    .select('*')
    .eq('is_active', true)
    .contains('languages', [language])
    .limit(1)
    .single()

  if (guide) {
    return {
      rate: guide.daily_rate || 0,
      supplier_id: guide.id,
      supplier_name: guide.name || null,
      name: `${language} Speaking Guide - ${city}`,
      code: guide.id || `GUIDE-${language.substring(0,2).toUpperCase()}`
    }
  }

  // No DB rate found — return 0 so the gap is visible
  console.warn(`⚠️ [Pricing] No guide rate found for ${language} in ${city} — returning €0`)
  return {
    rate: 0,
    supplier_id: null,
    supplier_name: null,
    name: `${language} Speaking Guide - ${city}`,
    code: `GUIDE-${language.substring(0,2).toUpperCase()}`
  }
}

// ============================================
// UPDATED: getEntranceFee with is_addon support
// ============================================

interface EntranceFeeResult {
  rate: number
  rateEur: number
  rateNonEur: number
  name: string
  code: string
  isAddon: boolean  // NEW: Flag to indicate if this is an add-on
  addonNote?: string // NEW: Optional note about the add-on
}

async function getEntranceFee(attractionName: string, isEuroPassport: boolean): Promise<EntranceFeeResult> {
  // Try entrance_fees table first (PRIMARY TABLE)
  // Use exact match first, then fall back to fuzzy match
  let fee = null
  
  // First try exact match
  const { data: exactFee } = await supabaseAdmin
    .from('entrance_fees')
    .select('*')
    .eq('is_active', true)
    .eq('attraction_name', attractionName)
    .limit(1)
    .single()
  
  if (exactFee) {
    fee = exactFee
  } else {
    // Fall back to fuzzy match
    const { data: fuzzyFee } = await supabaseAdmin
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)
      .single()
    fee = fuzzyFee
  }

  if (fee) {
    const rateEur = fee.eur_rate || 0
    const rateNonEur = fee.non_eur_rate || fee.eur_rate || 0
    return {
      rate: isEuroPassport ? rateEur : rateNonEur,
      rateEur,
      rateNonEur,
      name: fee.attraction_name,
      code: fee.service_code || `ENT-${fee.attraction_name.substring(0,5).toUpperCase().replace(/\s/g, '')}`,
      isAddon: fee.is_addon || false,
      addonNote: fee.addon_note || undefined
    }
  }

  // Try activity_rates table as secondary
  const { data: activity } = await supabaseAdmin
    .from('activity_rates')
    .select('*')
    .eq('is_active', true)
    .ilike('activity_name', `%${attractionName}%`)
    .limit(1)
    .single()

  if (activity) {
    const rateEur = activity.base_rate_eur || 0
    const rateNonEur = activity.base_rate_non_eur || activity.base_rate_eur || 0
    return {
      rate: isEuroPassport ? rateEur : rateNonEur,
      rateEur,
      rateNonEur,
      name: activity.activity_name,
      code: activity.activity_code || `ENT-${activity.activity_name.substring(0,5).toUpperCase().replace(/\s/g, '')}`,
      isAddon: activity.is_addon || false,
      addonNote: activity.addon_note || undefined
    }
  }

  // Fallback - unknown attractions are NOT add-ons
  console.log(`[Pricing] ⚠️ No rate found for "${attractionName}", using fallback €15`)
  return {
    rate: 15,
    rateEur: 15,
    rateNonEur: 15,
    name: attractionName,
    code: `ENT-${attractionName.substring(0,5).toUpperCase().replace(/\s/g, '')}`,
    isAddon: false
  }
}

async function getMealRate(city: string, mealType: 'lunch' | 'dinner', tier: string) {
  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1)

  // Try to find a meal rate matching city + meal_type + tier
  // Fallback cascade: city+type+tier → city+type → type only → any active
  let rate: any = null

  // 1. Best match: city + meal_type + tier
  const { data: exactMatch } = await supabaseAdmin
    .from('meal_rates')
    .select('*')
    .eq('is_active', true)
    .ilike('city', city)
    .ilike('meal_type', mealType)
    .eq('tier', tier)
    .limit(1)
    .single()
  rate = exactMatch

  // 2. City + meal_type (any tier)
  if (!rate) {
    const { data: cityTypeMatch } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .ilike('city', city)
      .ilike('meal_type', mealType)
      .limit(1)
      .single()
    rate = cityTypeMatch
  }

  // 3. Meal type only (any city)
  if (!rate) {
    const { data: typeMatch } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .ilike('meal_type', mealType)
      .limit(1)
      .single()
    rate = typeMatch
  }

  // 4. Any active meal rate
  if (!rate) {
    const { data: anyMatch } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single()
    rate = anyMatch
  }

  if (rate) {
    const baseRate = rate.base_rate_eur || 0
    if (baseRate > 0) {
      return {
        rate: baseRate,
        supplier_name: rate.supplier_name || rate.restaurant_name || null,
        name: `${mealLabel} - ${rate.restaurant_name || city}`,
        code: rate.service_code || (mealType === 'lunch' ? 'LUNCH' : 'DINNER')
      }
    }
  }

  // No DB rate found — return 0 so the gap is visible
  console.warn(`⚠️ [Pricing] No meal rate found for ${mealType} in ${city} — returning €0`)
  const fallback = 0
  return {
    rate: fallback,
    supplier_name: null,
    name: `${mealLabel} - ${city}`,
    code: mealType === 'lunch' ? 'LUNCH' : 'DINNER'
  }
}

async function getHotelRate(city: string, tier: string) {
  const { data: hotel } = await supabaseAdmin
    .from('hotel_contacts')
    .select('*')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .eq('tier', tier)
    .order('is_preferred', { ascending: false })
    .limit(1)
    .single()

  if (hotel) {
    return {
      rate: hotel.rate_double_eur || 0,
      supplier_id: hotel.id,
      supplier_name: hotel.name,
      name: `${hotel.name} - Double Room`,
      code: hotel.id || `HTL-${city.substring(0,3).toUpperCase()}`
    }
  }

  // Fallback without tier filter
  const { data: anyHotel } = await supabaseAdmin
    .from('hotel_contacts')
    .select('*')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .order('is_preferred', { ascending: false })
    .limit(1)
    .single()

  if (anyHotel) {
    return {
      rate: anyHotel.rate_double_eur || 0,
      supplier_id: anyHotel.id,
      supplier_name: anyHotel.name,
      name: `${anyHotel.name} - Double Room`,
      code: anyHotel.id || `HTL-${city.substring(0,3).toUpperCase()}`
    }
  }

  // No DB rate found — return 0 so the gap is visible
  console.warn(`⚠️ [Pricing] No hotel rate found for ${city} (tier: ${tier}) — returning €0`)
  return {
    rate: 0,
    supplier_id: null,
    supplier_name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Hotel`,
    name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Hotel - ${city}`,
    code: `HTL-${city.substring(0,3).toUpperCase()}`
  }
}

async function getItemizedTips(tier: string) {
  const { getItemizedTippingRates } = await import('@/lib/tipping-utils')
  return getItemizedTippingRates(supabaseAdmin, tier)
}

// ============================================
// MAIN HANDLER
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is now a Promise
    const { id: itineraryId } = await params
    const body: PricingRequest = await request.json()
    
    const {
      tier,
      package_type,
      days,
      num_adults,
      num_children = 0,   // Ages 4-12: 50% discount
      num_infants = 0,    // Ages 0-3: FREE except flights
      nationality_type,
      include_addons = false  // Default to NOT including add-ons
    } = body

    const totalPax = num_adults + num_children + num_infants
    const isEuroPassport = nationality_type === 'eur'

    console.log(`[Pricing] Starting for itinerary ${itineraryId}`)
    console.log(`[Pricing] ${days.length} days, ${totalPax} pax (${num_adults} adults, ${num_children} children, ${num_infants} infants), tier: ${tier}, package: ${package_type}`)
    console.log(`[Pricing] Include add-ons: ${include_addons}`)

    // Helper function to calculate cost with age-based discounts for per-pax services
    const calculatePerPaxCost = (ratePerPerson: number) => {
      const adultsCost = ratePerPerson * num_adults
      const childrenCost = ratePerPerson * (1 - CHILD_DISCOUNT_PERCENT / 100) * num_children
      const infantsCost = 0  // Infants are FREE (except flights)
      return adultsCost + childrenCost + infantsCost
    }

    // Helper to calculate total count for pricing display
    const getEffectivePax = () => {
      // For per-pax services, effective count considers discounts
      // Adults = 1x, Children = 0.5x, Infants = 0x
      return num_adults + (num_children * (1 - CHILD_DISCOUNT_PERCENT / 100)) + 0
    }

    // ============================================
    // GET USER PREFERENCES
    // ============================================
    const userId = await getCurrentUserId()
    let userPrefs: UserPreferences | null = null
    
    if (userId) {
      userPrefs = await getUserPreferences(userId)
    }

    // ============================================
    // GET ITINERARY & DETERMINE MARGIN
    // ============================================
    const { data: itinerary } = await supabaseAdmin
      .from('itineraries')
      .select('margin_percent, currency, created_by')
      .eq('id', itineraryId)
      .single()

    // Priority: 1) Itinerary-specific margin, 2) User preferences, 3) Default
    let marginPercent: number
    if (itinerary?.margin_percent !== null && itinerary?.margin_percent !== undefined) {
      marginPercent = itinerary.margin_percent
      console.log(`[Pricing] Using itinerary margin: ${marginPercent}%`)
    } else if (userPrefs?.default_margin_percent !== null && userPrefs?.default_margin_percent !== undefined) {
      marginPercent = userPrefs.default_margin_percent
      console.log(`[Pricing] Using user preference margin: ${marginPercent}%`)
      
      // Also save this margin to the itinerary for future reference
      await supabaseAdmin
        .from('itineraries')
        .update({ margin_percent: marginPercent })
        .eq('id', itineraryId)
    } else {
      marginPercent = DEFAULT_MARGIN_PERCENT
      console.log(`[Pricing] Using default margin: ${marginPercent}%`)
    }

    const currency = itinerary?.currency || userPrefs?.default_currency || DEFAULT_CURRENCY

    // Fetch exchange rates for currency conversion
    const needsConversion = currency !== 'EUR'
    let exchangeRates: ExchangeRates | null = null
    if (needsConversion) {
      try {
        exchangeRates = await fetchExchangeRates('EUR')
        const rate = exchangeRates.rates[currency]
        if (isUsingFallbackRates()) {
          console.warn(`⚠️ [Pricing] Using FALLBACK exchange rates! EUR → ${currency} = ${rate || 'N/A'}. Live API unavailable.`)
        } else {
          console.log(`[Pricing] Currency conversion: EUR → ${currency}, rate: ${rate || 'N/A'} (live)`)
        }
      } catch (e) {
        console.warn('[Pricing] Failed to fetch exchange rates, prices will remain in EUR:', e)
      }
    }
    const toTargetCurrency = (eurAmount: number): number => {
      if (!needsConversion || !exchangeRates) return eurAmount
      return Math.round(convertCurrency(eurAmount, 'EUR', currency, exchangeRates) * 100) / 100
    }

    // Get existing days (to get their IDs)
    const { data: existingDays, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('id, day_number')
      .eq('itinerary_id', itineraryId)
      .order('day_number')

    if (daysError || !existingDays?.length) {
      throw new Error('No itinerary days found. Save the draft first.')
    }

    const dayIdMap = new Map<number, string>()
    existingDays.forEach(day => dayIdMap.set(day.day_number, day.id))

    // Delete existing services
    const dayIds = existingDays.map(d => d.id)
    await supabaseAdmin
      .from('itinerary_services')
      .delete()
      .in('itinerary_day_id', dayIds)

    // Calculate services
    const allServices: any[] = []
    let totalSupplierCost = 0
    let totalClientPrice = 0
    
    // NEW: Track skipped add-ons for reporting
    const skippedAddons: string[] = []

    const tippingRates = await getItemizedTips(tier)

    // Determine which package types include airport services
    const hasAirportPackage = ['full-package', 'cruise-package', 'cruise-land'].includes(package_type)
    const fixedCosts = await getFixedDailyCosts()
    const waterRate = fixedCosts.waterPerPersonPerDay
    // rate_double_eur is per-person (double occupancy), no rooms calculation needed

    // Determine what to include based on package type
    let includeAccommodation = true
    if (package_type === 'day-trips' || package_type === 'tours-only') {
      includeAccommodation = false
    }

    // B4: build the transport rate cache ONCE before the day loop. Each
    // per-day call to determineTransportNeeds + findTransportRate then runs
    // entirely against in-memory keys instead of a per-day DB round-trip.
    const transportCache = await buildTransportCache()

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex]
      const dayId = dayIdMap.get(day.day_number)
      if (!dayId) continue

      const { city, attractions, services, overnight_city } = day

      // TRANSPORTATION (B4)
      // The smart per-day rule engine returns ZERO, ONE, or MANY transport
      // line items per day. A flight day correctly produces two (one airport
      // transfer in each city); a cruise day with no extras produces zero;
      // a same-city sightseeing day with an evening sound-and-light produces
      // two (the day_tour + the sound_light). Each becomes its own row in
      // itinerary_services so totals match the displayed line items.
      const lastIndex = days.length - 1
      const itineraryDay = toItineraryDay(day, dayIndex === 0, dayIndex === lastIndex)
      const prevItDay = dayIndex > 0 ? toItineraryDay(days[dayIndex - 1], dayIndex - 1 === 0, dayIndex - 1 === lastIndex) : null
      const nextItDay = dayIndex < lastIndex ? toItineraryDay(days[dayIndex + 1], dayIndex + 1 === 0, dayIndex + 1 === lastIndex) : null
      const transportNeeds: TransportNeed[] = determineTransportNeeds(itineraryDay, prevItDay, nextItDay)

      for (let legIndex = 0; legIndex < transportNeeds.length; legIndex++) {
        const need = transportNeeds[legIndex]
        const legCity = need.city || city
        const rate = findTransportRate(transportCache, {
          serviceType: need.serviceType,
          city: legCity,
          duration: need.duration,
          area: need.area,
          pax: totalPax,
          vehicleType: need.useSpecialVehicle ? need.specialVehicleType : undefined,
          originCity: need.originCity || (dayIndex > 0 ? days[dayIndex - 1].city : undefined),
          destinationCity: need.destinationCity || city,
        })

        const cost = rate?.base_rate_eur || 0
        const transportClient = applyMargin(cost, marginPercent)
        const idSuffix = legIndex > 0 ? `-${legIndex + 1}` : ''
        const serviceCode = rate?.service_code || `TRANS-${need.serviceType.toUpperCase().replace(/_/g, '-').slice(0, 12)}-${legCity.substring(0, 3).toUpperCase()}`
        const vehicleLabel = rate?.vehicle_type || 'Vehicle'

        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'transportation',
          service_code: `${serviceCode}${idSuffix}`,
          service_name: rate?.route_name || `${vehicleLabel} - ${legCity}`,
          supplier_name: null,
          quantity: 1,
          rate_eur: cost,
          rate_non_eur: cost,
          total_cost: cost,
          client_price: transportClient,
          notes: `${need.serviceType} | ${need.duration}${transportNeeds.length > 1 ? ` (leg ${legIndex + 1}/${transportNeeds.length})` : ''}`,
        })
        totalSupplierCost += cost
        totalClientPrice += transportClient

        if (!rate) {
          console.warn(`⚠️ [Pricing] No rate matched for ${need.serviceType} in ${legCity} (pax ${totalPax}) — €0 line persisted`)
        }
      }

      // GUIDE
      if (services.guide) {
        const guide = await getGuideRate(city, tier)
        const guideClient = applyMargin(guide.rate, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'guide',
          service_code: guide.code,
          service_name: guide.name,
          supplier_name: guide.supplier_name,
          quantity: 1,
          rate_eur: guide.rate,
          rate_non_eur: guide.rate,
          total_cost: guide.rate,
          client_price: guideClient,
          notes: `Full day - ${city}`
        })
        totalSupplierCost += guide.rate
        totalClientPrice += guideClient
      }

      // ENTRANCE FEES - WITH ADD-ON CHECK AND CHILD/INFANT DISCOUNTS
      // Skip attractions marked (outside) — these are photo stops only, no entrance fee
      for (const rawAttraction of attractions) {
        if (/\(outside\)/i.test(rawAttraction)) {
          console.log(`[Pricing] 📸 Skipping photo stop: ${rawAttraction}`)
          continue
        }
        // Strip any remaining markers from the name for database matching
        const attraction = rawAttraction.replace(/\s*\((?:outside|inside)\)\s*/gi, '').trim()
        const entrance = await getEntranceFee(attraction, isEuroPassport)

        // Skip add-ons if not explicitly included
        if (entrance.isAddon && !include_addons) {
          console.log(`[Pricing] ⏭️ Skipping add-on: ${entrance.name} (${entrance.addonNote || 'optional extra'})`)
          skippedAddons.push(entrance.name)
          continue
        }

        // Apply child/infant discounts to entrance fees
        const entranceTotal = calculatePerPaxCost(entrance.rate)
        // No markup on entrance fees typically
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'entrance',
          service_code: entrance.code,
          service_name: entrance.name,
          quantity: totalPax,
          rate_eur: entrance.rateEur,
          rate_non_eur: entrance.rateNonEur,
          total_cost: entranceTotal,
          client_price: entranceTotal,
          notes: entrance.isAddon
            ? `${isEuroPassport ? 'EUR' : 'non-EUR'} rate (Optional Add-on)`
            : `${isEuroPassport ? 'EUR' : 'non-EUR'} rate${num_children > 0 ? ' (children 50% off)' : ''}${num_infants > 0 ? ' (infants free)' : ''}`
        })
        totalSupplierCost += entranceTotal
        totalClientPrice += entranceTotal
      }

      // LUNCH - WITH CHILD/INFANT DISCOUNTS
      if (services.lunch) {
        const meal = await getMealRate(city, 'lunch', tier)
        const mealTotal = calculatePerPaxCost(meal.rate)
        const mealClient = applyMargin(mealTotal, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'meal',
          service_code: meal.code,
          service_name: meal.name,
          supplier_name: meal.supplier_name,
          quantity: totalPax,
          rate_eur: meal.rate,
          rate_non_eur: meal.rate,
          total_cost: mealTotal,
          client_price: mealClient,
          notes: `Lunch${num_children > 0 ? ' (children 50% off)' : ''}${num_infants > 0 ? ' (infants free)' : ''}`
        })
        totalSupplierCost += mealTotal
        totalClientPrice += mealClient
      }

      // DINNER - WITH CHILD/INFANT DISCOUNTS
      if (services.dinner) {
        const meal = await getMealRate(city, 'dinner', tier)
        const mealTotal = calculatePerPaxCost(meal.rate)
        const mealClient = applyMargin(mealTotal, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'meal',
          service_code: `${meal.code}-DINNER`,
          service_name: meal.name.replace('Lunch', 'Dinner'),
          supplier_name: meal.supplier_name,
          quantity: totalPax,
          rate_eur: meal.rate,
          rate_non_eur: meal.rate,
          total_cost: mealTotal,
          client_price: mealClient,
          notes: `Dinner${num_children > 0 ? ' (children 50% off)' : ''}${num_infants > 0 ? ' (infants free)' : ''}`
        })
        totalSupplierCost += mealTotal
        totalClientPrice += mealClient
      }

      // WATER (standard inclusion) - WITH CHILD/INFANT DISCOUNTS
      const waterTotal = calculatePerPaxCost(waterRate)
      allServices.push({
        itinerary_day_id: dayId,
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterRate,
        rate_non_eur: waterRate,
        total_cost: waterTotal,
        client_price: waterTotal,
        notes: `Bottled water${num_children > 0 ? ' (children 50% off)' : ''}${num_infants > 0 ? ' (infants free)' : ''}`
      })
      totalSupplierCost += waterTotal
      totalClientPrice += waterTotal

      // TIPS (context-aware per-role)
      const { determineTipRolesForDay, formatTipServiceName, formatTipNotes } = await import('@/lib/tipping-utils')
      const isFirstDay = day.day_number === 1
      const isLastDay = day.day_number === days.length
      const hasAirportToday = hasAirportPackage && (isFirstDay || isLastDay)
      const dayTipRoles = determineTipRolesForDay({
        hasGuide: services.guide,
        hasDriver: true,
        hasAirportService: hasAirportToday,
        airportServiceCount: hasAirportToday ? 1 : 0,
        hasHotelNight: services.hotel && !isLastDay,
        isCruiseDay: false,
        isTransferOnly: !services.guide && (isFirstDay || isLastDay),
        isFreeDay: false,
      })
      for (const tipRole of dayTipRoles) {
        const tipRate = tippingRates.getRate(tipRole.role, tipRole.context)
        if (tipRate > 0) {
          const totalTipCost = tipRate * tipRole.quantity
          const tipClient = applyMargin(totalTipCost, marginPercent)
          allServices.push({
            itinerary_day_id: dayId,
            service_type: 'tips',
            service_code: `TIPS-${tipRole.role.toUpperCase()}`,
            service_name: formatTipServiceName(tipRole.role, tipRole.context),
            quantity: tipRole.quantity,
            rate_eur: tipRate,
            rate_non_eur: tipRate,
            total_cost: totalTipCost,
            client_price: tipClient,
            notes: formatTipNotes(tipRole.role, tipRole.context, tipRole.quantity)
          })
          totalSupplierCost += totalTipCost
          totalClientPrice += tipClient
        }
      }

      // HOTEL
      if (services.hotel && overnight_city && includeAccommodation && !isLastDay) {
        const hotel = await getHotelRate(overnight_city, tier)
        const hotelTotal = hotel.rate * totalPax
        const hotelClient = applyMargin(hotelTotal, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'accommodation',
          service_code: hotel.code,
          service_name: `${hotel.supplier_name} (PPD × ${totalPax} pax)`,
          supplier_name: hotel.supplier_name,
          quantity: totalPax,
          rate_eur: hotel.rate,
          rate_non_eur: hotel.rate,
          total_cost: hotelTotal,
          client_price: hotelClient,
          notes: `Overnight at ${overnight_city} - per person double occupancy`
        })
        totalSupplierCost += hotelTotal
        totalClientPrice += hotelClient
      }
    }

    // Convert service prices to target currency before inserting
    const convertedServices = allServices.map(svc => ({
      ...svc,
      total_cost: toTargetCurrency(svc.total_cost),
      client_price: toTargetCurrency(svc.client_price),
      // rate_eur and rate_non_eur stay in EUR as source of truth
    }))

    // Insert services
    if (convertedServices.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('itinerary_services')
        .insert(convertedServices)

      if (insertError) {
        console.error('[Pricing] Insert error:', insertError)
        throw insertError
      }
    }

    // Convert totals to target currency
    const convertedSupplierCost = toTargetCurrency(totalSupplierCost)
    const convertedClientPrice = toTargetCurrency(totalClientPrice)

    // Calculate profit
    const profit = convertedClientPrice - convertedSupplierCost
    const actualMarginPercent = convertedSupplierCost > 0
      ? ((profit / convertedSupplierCost) * 100).toFixed(1)
      : '0'

    // Update itinerary totals
    await supabaseAdmin
      .from('itineraries')
      .update({
        total_cost: convertedClientPrice,
        total_revenue: convertedClientPrice,
        supplier_cost: convertedSupplierCost,
        profit: profit,
        margin_percent: marginPercent,
        tier: tier,
        package_type: package_type,
        currency: currency,
        status: 'quoted',
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)

    console.log(`[Pricing] Complete: Cost ${currency} ${convertedSupplierCost.toFixed(2)} → Client ${currency} ${convertedClientPrice.toFixed(2)} (${marginPercent}% margin = ${currency} ${profit.toFixed(2)} profit)`)

    if (skippedAddons.length > 0) {
      console.log(`[Pricing] Skipped ${skippedAddons.length} add-ons: ${skippedAddons.join(', ')}`)
    }

    return NextResponse.json({
      success: true,
      itinerary_id: itineraryId,
      supplier_cost: convertedSupplierCost,
      total_cost: convertedClientPrice,
      profit: profit,
      margin: profit,
      margin_percent: marginPercent,
      actual_margin_percent: actualMarginPercent,
      currency,
      services_count: allServices.length,
      per_person: Math.round(totalClientPrice / totalPax * 100) / 100,
      preferences_used: !!userPrefs,
      using_fallback_rates: needsConversion && isUsingFallbackRates(),
      // Report skipped add-ons
      skipped_addons: skippedAddons,
      skipped_addons_count: skippedAddons.length,
      // Passenger breakdown with discounts applied
      passenger_breakdown: {
        num_adults,
        num_children,
        num_infants,
        total_pax: totalPax,
        child_discount_percent: CHILD_DISCOUNT_PERCENT,
        effective_pax: getEffectivePax()  // For cost calculation purposes
      }
    })

  } catch (error: any) {
    console.error('[Pricing] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Pricing calculation failed' },
      { status: 500 }
    )
  }
}