import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  fetchCruiseTransportPricingRules,
  findCruiseTransportRule,
  getCruiseTransportRate
} from '@/lib/auto-pricing-service'
import { type PackageType } from '@/lib/package-types'
import {
  type ServiceTier,
  type InputMode,
  isValidDate,
  toNumber,
  normalizeTier,
  calculateExpectedDays,
} from '@/lib/ai/parsing-utils'
import {
  type CruiseDetectionResult,
  detectCruiseRequest,
  determinePackageType,
} from '@/lib/ai/cruise-detection'
import {
  type CabinAllocation,
  type CruiseRate,
  getCruiseRate,
} from '@/lib/ai/cruise-pricing'
import {
  findCruiseContent,
  fetchContentLibrary,
  fetchWritingRules,
  buildContentContext,
  buildWritingRulesContext,
} from '@/lib/ai/content-library'
import { generateFromStructuredInput, generateCreativeItinerary } from '@/lib/ai/prompt-builder'
import { fetchAllPricingRates, createLandItineraryServices, fetchHotelsForCities } from '@/lib/ai/service-creation'
import { buildInclusionsExclusions, extractItineraryDetails } from '@/lib/inclusions-builder'
import { getFixedDailyCosts } from '@/lib/fixed-costs'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Admin client for bypassing RLS on content library
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default margin percentage (used if no user preference)
const DEFAULT_MARGIN_PERCENT = 25

// ============================================
// LANGUAGE CODE MAPPING
// ============================================

type VersionLanguage = 'en' | 'ja'

function getVersionLanguageCode(language: string): VersionLanguage {
  const lower = (language || '').toLowerCase()
  if (lower.includes('japanese') || lower === 'ja' || lower === '日本語') return 'ja'
  // Default to English for all other languages
  return 'en'
}

/**
 * Auto-create itinerary_version and itinerary_day_versions after generation.
 * This ensures the language tab is populated immediately.
 */
async function createLanguageVersions(
  supabase: any,
  itineraryId: string,
  tripName: string,
  language: string,
  dayIds: { id: string; title: string; description: string; city: string; overnight_city: string | null }[]
) {
  const langCode = getVersionLanguageCode(language)

  try {
    // Create itinerary_version
    const { error: versionError } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: itineraryId,
        language: langCode,
        trip_name: tripName
      })

    if (versionError) {
      // Unique constraint violation = version already exists, skip
      if (!versionError.message?.includes('duplicate') && !versionError.message?.includes('unique')) {
        console.error('Error creating itinerary version:', versionError)
      }
    } else {
      console.log(`✅ Auto-created ${langCode} itinerary version`)
    }

    // Create itinerary_day_versions for each day
    if (dayIds.length > 0) {
      const dayVersions = dayIds.map(day => ({
        itinerary_day_id: day.id,
        language: langCode,
        title: day.title,
        description: day.description,
        city: day.city,
        overnight_city: day.overnight_city
      }))

      const { error: dayVersionError } = await supabase
        .from('itinerary_day_versions')
        .insert(dayVersions)

      if (dayVersionError) {
        if (!dayVersionError.message?.includes('duplicate') && !dayVersionError.message?.includes('unique')) {
          console.error('Error creating day versions:', dayVersionError)
        }
      } else {
        console.log(`✅ Auto-created ${langCode} day versions for ${dayIds.length} days`)
      }
    }
  } catch (err) {
    // Non-critical - don't fail the whole generation
    console.error('Error in createLanguageVersions:', err)
  }
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
    
    if (!user) return defaults

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs) return defaults

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      default_tier: normalizeTier(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: prefs.default_margin_percent ?? defaults.default_margin_percent,
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    return defaults
  }
}

// ============================================
// FETCH ATTRACTION NAMES LIST
// ============================================
async function fetchAttractionsList(supabase: any): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('entrance_fees')
      .select('attraction_name')
      .eq('is_active', true)
      .eq('is_addon', false) // Exclude add-ons

    if (!data) return []

    // CRITICAL: Filter out non-Latin names (e.g., Japanese, Arabic) to prevent
    // the AI from outputting attraction names in wrong languages.
    // Only pass English/Latin-script names to the AI prompt.
    return data
      .map((a: any) => a.attraction_name)
      .filter((name: string) => {
        // Keep names that are primarily Latin characters (English, French, etc.)
        // Reject names that are primarily non-Latin (Japanese, Arabic, etc.)
        const latinChars = (name.match(/[a-zA-Z]/g) || []).length
        return latinChars > name.length * 0.3 // At least 30% Latin characters
      })
  } catch {
    return []
  }
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createClient()
    const userPrefs = await getUserPreferences(supabase)
    
    const {
      client_name,
      client_email,
      client_phone,
      tour_requested,
      tour_name,
      start_date,
      duration_days: raw_duration_days,
      num_adults = 2,
      num_children = 0,
      language = 'English',
      conversation_language,
      interests = [],
      cities = [],
      special_requests = [],
      budget_level = 'standard',
      tier: raw_tier = null,
      hotel_name,
      city = 'Cairo',
      client_id = null,
      nationality = null,
      is_euro_passport = null,
      include_lunch = true,
      include_dinner = false,
      include_accommodation = true,
      include_guide,  // undefined = per-day AI decision, true = always, false = never
      margin_percent = userPrefs.default_margin_percent,
      currency = userPrefs.default_currency,
      cost_mode = userPrefs.default_cost_mode,
      package_type: requested_package_type = 'land-package',
      skip_pricing = false,
      
      // NEW: Structured input parameters from parser
      is_structured_input = false,
      extracted_days = null,
      raw_itinerary = null,
      input_mode_override = null, // 'creative' | 'structured' | null

      // B2B Partner fields
      partner_id = null,
      partner_commission_percent = 0,
      source = 'b2c_whatsapp'
    } = body

    const finalTourName = tour_requested || tour_name || 'Egypt Tour'
    // ============================================
    // LANGUAGE SEPARATION:
    // guideLanguage = what language the guide speaks (from nationality or explicit request)
    //   → Used for: guide pricing, guide services, inclusions text
    // contentLanguage = what language the itinerary content is written in
    //   → ALWAYS English by default
    //   → Users can create translated versions manually via the multilingual system
    // ============================================
    const guideLanguage = language || 'English'
    const contentLanguage = 'English'
    const tier: ServiceTier = raw_tier ? normalizeTier(raw_tier) : budget_level !== 'standard' ? normalizeTier(budget_level) : userPrefs.default_tier

    if (!isValidDate(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid start date' },
        { status: 400 }
      )
    }

    // ============================================
    // DETERMINE INPUT MODE
    // ============================================
    let inputMode: InputMode = 'creative'

    if (input_mode_override === 'structured') {
      inputMode = 'structured'
    } else if (input_mode_override === 'creative') {
      inputMode = 'creative'
    } else if (is_structured_input && extracted_days && extracted_days.length > 0) {
      inputMode = 'structured'
    } else if (raw_itinerary) {
      // Auto-detect structured input from raw itinerary patterns
      // EXPANDED: Now also catches prose-style "Day 1 Arrival..." without colon/dash
      const structuredPatterns = [
        /\bD\d+\b/i,                    // D1, D2, D3...
        /\d+\s*NTS?\s*[A-Z]{2,4}/i,     // 2NTS CAI, 3NTS CRZ
        /\bDay\s*\d+\s*(?:[:\-–—]|\b)/i, // Day 1:, Day 2 -, Day 1 Arrival (any separator or word boundary)
        /PROGRAM\s*:/i,                  // PROGRAM: header
        /\b[A-Z]{3}\/[A-Z]{3}\b/        // CAI/ALX, LXR/HRG city transitions
      ]

      // Count how many "Day N" markers exist — if >=2, it's definitely structured
      const dayMarkerCount = (raw_itinerary.match(/\bDay\s*\d+\b/gi) || []).length
      const dMarkerCount = (raw_itinerary.match(/\bD\d+\b/gi) || []).length

      if (structuredPatterns.some(pattern => pattern.test(raw_itinerary))) {
        inputMode = 'structured'
        console.log('🔍 Auto-detected structured input from patterns in raw_itinerary')
      }

      // Extra safety: if there are 2+ day markers, force structured even if regex didn't match
      if (inputMode === 'creative' && (dayMarkerCount >= 2 || dMarkerCount >= 2)) {
        inputMode = 'structured'
        console.log(`🔍 Forced structured mode: found ${dayMarkerCount} Day markers and ${dMarkerCount} D markers`)
      }
    }

    // CRITICAL SAFETY: If parser flagged structured AND raw_itinerary exists, ALWAYS use structured
    // This prevents falling through to creative mode which ignores the provided itinerary
    if (is_structured_input && raw_itinerary && inputMode === 'creative') {
      inputMode = 'structured'
      console.log('🛡️ SAFETY: Parser detected structured input but mode was creative — forcing structured')
    }

    console.log('🤖 Input Mode:', inputMode, '| Override:', input_mode_override, '| is_structured_input:', is_structured_input)

    let duration_days = parseInt(raw_duration_days) || 1
    
    // For structured mode, calculate days from raw itinerary
    if (inputMode === 'structured' && raw_itinerary) {
      const calculatedDays = calculateExpectedDays(raw_itinerary, extracted_days)
      if (calculatedDays > duration_days) {
        duration_days = calculatedDays
        console.log(`📊 Adjusted duration to ${duration_days} days based on itinerary analysis`)
      }
    } else if (inputMode === 'structured' && extracted_days?.length) {
      duration_days = extracted_days.length
    }

    // ============================================
    // CRUISE DETECTION (for both modes now)
    // ============================================
    const cruiseDetection = detectCruiseRequest(
      finalTourName,
      interests,
      cities,
      special_requests,
      duration_days,
      raw_itinerary || '', // Pass raw itinerary for better detection
      requested_package_type // Pass parser's package type to prevent false overrides
    )

    // Adjust duration for cruise if needed:
    // - Apply when duration is 1 (undetected) OR when cruise detection found a more accurate duration
    if (cruiseDetection.isCruise) {
      const defaultCruiseDuration = cruiseDetection.cruiseType === 'lake-nasser' ? 4 : 5
      const bestDuration = cruiseDetection.detectedDuration || defaultCruiseDuration
      if (duration_days === 1 || (cruiseDetection.detectedDuration && cruiseDetection.detectedDuration > duration_days)) {
        duration_days = bestDuration
        console.log(`🚢 Adjusted cruise duration to ${duration_days} days`)
      }
    }

    // UPDATED: Determine effective package type
    const effectivePackageType = determinePackageType(requested_package_type, cruiseDetection)
    console.log(`📦 Package type: ${effectivePackageType}`)

    let effectiveCity = city
    if (cruiseDetection.isCruise && cruiseDetection.startCity) {
      effectiveCity = cruiseDetection.startCity
    } else if (cities.length > 0) {
      effectiveCity = cities[0]
    }

    console.log('🤖 Starting itinerary generation:', {
      client: client_name,
      inputMode,
      isCruise: cruiseDetection.isCruise,
      packageType: effectivePackageType,
      tier,
      duration: duration_days,
      startCity: effectiveCity
    })

    const totalPax = num_adults + num_children

    // Passport type
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'norway', 'iceland', 'liechtenstein', 'switzerland']
      isEuroPassport = euCountries.some(c => nationality.toLowerCase().includes(c))
    }
    isEuroPassport = isEuroPassport ?? false

    // Auto-set currency to EUR for Euro passport holders
    let effectiveCurrency = currency
    if (isEuroPassport && effectiveCurrency !== 'EUR') {
      console.log(`💶 Euro passport detected (${nationality}) — setting currency to EUR (was ${effectiveCurrency})`)
      effectiveCurrency = 'EUR'
    }

    // Calculate dates
    const startDateObj = new Date(start_date)
    const endDate = new Date(startDateObj)
    endDate.setDate(startDateObj.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const tierPrefix = tier.charAt(0).toUpperCase()
    const itinerary_code = `ITN-${tierPrefix}-${year}-${randomNum}`

    const marginMultiplier = 1 + (margin_percent / 100)
    const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

    // Fetch configurable fixed daily costs (water, tips)
    const fixedCosts = await getFixedDailyCosts()
    const waterRatePerPerson = fixedCosts.waterPerPersonPerDay

    // ============================================
    // CRUISE PATH (creative mode ONLY, cruise-package or cruise-land)
    // CRITICAL: Structured mode ALWAYS takes priority over cruise content library.
    // If the user provided a day-by-day itinerary, we must follow it — not replace with a cruise template.
    // ============================================
    if (cruiseDetection.isCruise && inputMode === 'creative' && !is_structured_input && (effectivePackageType === 'cruise-package' || effectivePackageType === 'cruise-land')) {
      console.log(`🚢 Processing as ${effectivePackageType} itinerary (creative mode, no structured input)...`)
      
      const cruiseContent = await findCruiseContent(supabaseAdmin, cruiseDetection, tier, duration_days)
      
      if (cruiseContent.found && cruiseContent.dayByDay.length > 0) {
        console.log(`📚 Using Content Library cruise: ${cruiseContent.content.name}`)
        
        // Use Content Library duration if available
        if (cruiseContent.content.duration_days) {
          duration_days = cruiseContent.content.duration_days
        }
        
        const nights = duration_days - 1
        const cruiseRate = await getCruiseRate({
          tier,
          recommendedSuppliers: cruiseContent.recommendedSuppliers,
          supabase,
          totalPax,
          nights,
          startDate: start_date,
          isEuroPassport
        })
        console.log(`💰 Cruise rate: ${cruiseRate.totalPerNight}/night total on ${cruiseRate.shipName} (${cruiseRate.season} season)`)
        if (cruiseRate.cabinAllocation.length > 0) {
          console.log(`🛏️ Cabins: ${cruiseRate.cabinAllocation.map(a => `${a.count}×${a.type}`).join(' + ')}`)
        }

        // Fetch cruise transport (bundled flat rate)
        const cruiseTransportRules = await fetchCruiseTransportPricingRules()
        const cruiseTransportRule = findCruiseTransportRule(cruiseTransportRules, duration_days)
        let cruiseTransportRate = 0
        let cruiseTransportVehicle = 'Minivan'
        if (cruiseTransportRule) {
          const transport = getCruiseTransportRate(cruiseTransportRule, totalPax)
          cruiseTransportRate = transport.rate
          cruiseTransportVehicle = transport.vehicleType
          console.log(`🚗 Cruise transport: ${cruiseTransportVehicle} = ${cruiseTransportRate} (flat rate for ${duration_days}D)`)
        }

        // Fetch guide rate (uses guideLanguage for pricing) — 3-tier fallback
        let cruiseGuide: any = null
        const { data: cruiseGuides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [guideLanguage]).limit(5)
        cruiseGuide = cruiseGuides?.[0]
        if (!cruiseGuide) {
          // Fallback: any active guide for this language (ignore tier)
          const { data: fallback1 } = await supabase.from('guides').select('*').eq('is_active', true).contains('languages', [guideLanguage]).limit(1)
          cruiseGuide = fallback1?.[0]
        }
        if (!cruiseGuide) {
          // Fallback: any active guide at same tier (ignore language) — baseline rate
          const { data: fallback2 } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).limit(1)
          cruiseGuide = fallback2?.[0]
          if (cruiseGuide) console.warn(`⚠️ No ${guideLanguage}-speaking cruise guide — using ${cruiseGuide.name || 'generic'} rate`)
        }
        if (!cruiseGuide) {
          // Last resort: any active guide
          const { data: fallback3 } = await supabase.from('guides').select('*').eq('is_active', true).limit(1)
          cruiseGuide = fallback3?.[0]
          if (cruiseGuide) console.warn(`⚠️ No cruise guide for ${guideLanguage}/${tier} — using last resort rate`)
        }
        const cruiseGuidePerDay = cruiseGuide ? toNumber(cruiseGuide.daily_rate, 0) : 0
        if (!cruiseGuidePerDay) console.warn(`⚠️ No cruise guide rate found at all — guide will be €0`)

        // Fetch tipping rates
        const { data: cruiseTippingRates } = await supabase.from('tipping_rates').select('*').eq('is_active', true)
        let cruiseDailyTips = cruiseTippingRates?.reduce((sum: number, t: any) => t.rate_unit === 'per_day' ? sum + toNumber(t.rate_eur, 0) : sum, 0) || 0
        if (!cruiseDailyTips) console.warn('⚠️ No cruise tipping rates found')

        // Fetch entrance fees
        const { data: cruiseEntranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)

        // Build cruise-specific inclusions/exclusions BEFORE creating the record
        const cruiseAttractionsPre: string[] = []
        const cruiseCitiesPre = new Set<string>()
        for (const dayData of cruiseContent.dayByDay) {
          if (dayData.attractions) cruiseAttractionsPre.push(...dayData.attractions)
          if (dayData.city) cruiseCitiesPre.add(dayData.city)
        }

        // Extract detailed cruise itinerary data for richer inclusions
        const cruiseDetails = extractItineraryDetails(cruiseContent.dayByDay)

        const cruiseIncExc = buildInclusionsExclusions({
          packageType: effectivePackageType as PackageType,
          tier,
          includeLunch: true,
          includeDinner: true,
          includeAccommodation: true,
          isCruise: true,
          cruiseNights: duration_days - 1,
          language: guideLanguage,
          hasAirportTransfer: true,
          attractions: [...new Set(cruiseAttractionsPre)],
          citiesVisited: [...cruiseCitiesPre],
          totalDays: duration_days,
          numAdults: num_adults,
          numChildren: num_children,
          vehicleType: cruiseTransportVehicle || undefined,
          domesticFlights: cruiseDetails.domesticFlights.length > 0
            ? cruiseDetails.domesticFlights : undefined,
          intercityTransfers: cruiseDetails.intercityTransfers.length > 0
            ? cruiseDetails.intercityTransfers : undefined,
        })

        console.log('📋 Built cruise inclusions/exclusions:', {
          inclusionsCount: cruiseIncExc.inclusions.length,
          exclusionsCount: cruiseIncExc.exclusions.length,
          firstInclusion: cruiseIncExc.inclusions[0],
          packageType: effectivePackageType,
        })

        // Create itinerary with cabin_allocation AND inclusions/exclusions in INSERT
        const { data: itinerary, error: itineraryError } = await supabase
          .from('itineraries')
          .insert({
            itinerary_code,
            client_name,
            client_email: client_email || null,
            client_phone: client_phone || null,
            trip_name: cruiseContent.variation.title || cruiseContent.content.name,
            start_date,
            end_date: endDate.toISOString().split('T')[0],
            total_days: duration_days,
            num_adults,
            num_children,
            currency: effectiveCurrency,
            total_cost: 0,
            total_revenue: 0,
            margin_percent,
            status: skip_pricing ? 'draft' : 'quoted',
            tier,
            package_type: effectivePackageType,
            cost_mode,
            notes: special_requests.length > 0 ? special_requests.join('; ') : null,
            client_id,
            cabin_allocation: cruiseRate.found ? cruiseRate.cabinAllocation : null,
            // Dynamic inclusions/exclusions — included at INSERT time
            inclusions: cruiseIncExc.inclusions,
            exclusions: cruiseIncExc.exclusions,
            // B2B Partner fields
            partner_id: partner_id || null,
            partner_commission_percent: partner_commission_percent || 0,
            source: partner_id ? 'b2b_custom' : source
          })
          .select()
          .single()

        if (itineraryError) throw new Error(`Failed to create itinerary: ${itineraryError.message}`)

        console.log('✅ Created cruise itinerary:', itinerary.id)

        let totalSupplierCost = 0
        let totalClientPrice = 0
        const createdCruiseDays: { id: string; title: string; description: string; city: string; overnight_city: string }[] = []
        let transportAdded = false

        // Create days from Content Library
        for (const dayData of cruiseContent.dayByDay) {
          const dayDate = new Date(startDateObj)
          dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

          const dayTitle = dayData.title
          const dayDescription = dayData.description
          const dayCity = dayData.city || effectiveCity
          const dayOvernight = dayData.overnight || `On board - ${dayData.city}`
          const isLastDay = dayData.day_number === duration_days
          const isSailingDay = dayData.is_sailing_day || false
          const dayNeedsGuide = include_guide !== undefined
            ? (include_guide && !isSailingDay)  // Global override from user
            : (!isSailingDay && (dayData.attractions?.length > 0 || dayData.guide_required !== false))

          const { data: day, error: dayError } = await supabase
            .from('itinerary_days')
            .insert({
              itinerary_id: itinerary.id,
              day_number: dayData.day_number,
              date: dayDate.toISOString().split('T')[0],
              title: dayTitle,
              description: dayDescription,
              city: dayCity,
              overnight_city: dayOvernight,
              attractions: dayData.attractions || [],
              guide_required: dayNeedsGuide,
              lunch_included: dayData.meals?.includes('lunch') ?? true,
              dinner_included: dayData.meals?.includes('dinner') ?? true,
              hotel_included: false,
              is_cruise_day: true
            })
            .select()
            .single()

          if (dayError) {
            console.error(`❌ Error creating day ${dayData.day_number}:`, dayError)
            continue
          }

          createdCruiseDays.push({ id: day.id, title: dayTitle, description: dayDescription, city: dayCity, overnight_city: dayOvernight })

          if (skip_pricing) continue

          // --- SERVICE 1: Cruise Accommodation (per night, not on last day) ---
          if (!isLastDay && cruiseRate.found) {
            const nightCost = cruiseRate.totalPerNight
            const cabinDesc = cruiseRate.cabinAllocation.map(a => `${a.count}×${a.type}`).join(' + ')

            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'cruise',
              service_code: cruiseRate.supplierId || 'CRUISE',
              service_name: `${cruiseRate.shipName} - Full Board (${cabinDesc})`,
              supplier_name: cruiseRate.shipName,
              quantity: totalPax,
              rate_eur: cruiseRate.totalPerNight / totalPax,
              rate_non_eur: cruiseRate.totalPerNight / totalPax,
              total_cost: nightCost,
              client_price: withMargin(nightCost),
              notes: `Night ${dayData.day_number}: ${dayOvernight} | ${cruiseRate.season} season | ${cabinDesc}`
            })

            totalSupplierCost += nightCost
            totalClientPrice += withMargin(nightCost)
          }

          // --- SERVICE 2: Bundled Cruise Transport (flat rate, added once on day 1) ---
          if (!transportAdded && cruiseTransportRate > 0) {
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'transportation',
              service_code: cruiseTransportRule?.id || 'CRUISE-TRANSPORT',
              service_name: `Cruise Transport Package (${cruiseTransportVehicle})`,
              supplier_name: null,
              quantity: 1,
              rate_eur: cruiseTransportRate,
              rate_non_eur: cruiseTransportRate,
              total_cost: cruiseTransportRate,
              client_price: withMargin(cruiseTransportRate),
              notes: `Bundled transport for ${duration_days}D cruise: transfers + sightseeing (${cruiseTransportVehicle})`
            })

            totalSupplierCost += cruiseTransportRate
            totalClientPrice += withMargin(cruiseTransportRate)
            transportAdded = true
          }

          // --- SERVICE 3: Guide (on touring days, not sailing days) ---
          if (dayNeedsGuide) {
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'guide',
              service_code: cruiseGuide?.id || 'GUIDE',
              service_name: `${guideLanguage} Speaking Guide`,
              supplier_name: cruiseGuide?.name || null,
              quantity: 1,
              rate_eur: cruiseGuidePerDay,
              rate_non_eur: cruiseGuidePerDay,
              total_cost: cruiseGuidePerDay,
              client_price: withMargin(cruiseGuidePerDay),
              notes: `Professional ${guideLanguage} guide`
            })

            totalSupplierCost += cruiseGuidePerDay
            totalClientPrice += withMargin(cruiseGuidePerDay)

            // --- SERVICE 4: Tips (when guide is present) ---
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'tips',
              service_code: 'TIPS',
              service_name: 'Daily Tips',
              quantity: 1,
              rate_eur: cruiseDailyTips,
              rate_non_eur: cruiseDailyTips,
              total_cost: cruiseDailyTips,
              client_price: withMargin(cruiseDailyTips),
              notes: 'Driver and guide tips'
            })

            totalSupplierCost += cruiseDailyTips
            totalClientPrice += withMargin(cruiseDailyTips)
          }

          // --- SERVICE 5: Entrance Fees (all attractions get fees, except photo_stops) ---
          const cruisePhotoStops = dayData.photo_stops || []
          if (dayData.attractions?.length > 0) {
            let dayEntranceTotal = 0
            const matchedAttractions: string[] = []

            for (const attractionName of dayData.attractions) {
              // Skip if this attraction is a photo stop (outside viewing only, no fee)
              if (cruisePhotoStops.some((ps: string) => ps.toLowerCase() === attractionName.toLowerCase())) {
                continue
              }

              const fee = cruiseEntranceFees?.find((ef: any) =>
                ef.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
                attractionName.toLowerCase().includes(ef.attraction_name.toLowerCase())
              )

              if (fee) {
                if (fee.is_addon) continue
                const feePerPerson = isEuroPassport ? toNumber(fee.eur_rate, 0) : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
                dayEntranceTotal += feePerPerson * totalPax
                matchedAttractions.push(fee.attraction_name)
              }
            }

            if (dayEntranceTotal > 0) {
              await supabase.from('itinerary_services').insert({
                itinerary_day_id: day.id,
                service_type: 'entrance',
                service_code: 'ENTRANCE',
                service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
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
          }

          // --- SERVICE 6: Water (on touring days) — rate from fixed_daily_costs table ---
          if (!isSailingDay) {
            const waterCost = waterRatePerPerson * totalPax
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
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
        }

        // Update pricing totals (inclusions/exclusions were already set in the INSERT)
        if (!skip_pricing) {
          const { error: updateError } = await supabase.from('itineraries').update({
            total_cost: totalClientPrice,
            total_revenue: totalClientPrice,
            supplier_cost: totalSupplierCost,
            profit: totalClientPrice - totalSupplierCost,
          }).eq('id', itinerary.id)
          if (updateError) {
            console.error('❌ Failed to update cruise itinerary pricing:', updateError)
          }
        }

        console.log('🎉 Cruise itinerary complete!')

        // Auto-create language version
        const cruiseTripName = cruiseContent.variation.title || cruiseContent.content.name
        await createLanguageVersions(supabase, itinerary.id, cruiseTripName, contentLanguage, createdCruiseDays)

        return NextResponse.json({
          success: true,
          data: {
            id: itinerary.id,
            itinerary_id: itinerary.id,
            itinerary_code: itinerary.itinerary_code,
            trip_name: cruiseTripName,
            tier,
            package_type: effectivePackageType,
            is_cruise: true,
            cruise_ship: cruiseRate.shipName,
            generation_mode: 'creative',
            mode: skip_pricing ? 'draft' : 'quoted',
            redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
            currency: effectiveCurrency,
            total_days: duration_days,
            ...(skip_pricing ? {} : {
              supplier_cost: totalSupplierCost,
              total_cost: totalClientPrice,
              margin: totalClientPrice - totalSupplierCost,
              per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100,
              content_library_used: true,
              cruise_content: cruiseContent.content.name
            })
          }
        })
      } else {
        console.log('⚠️ No cruise content in Content Library, falling back to AI generation')
        // Fall through to standard AI generation
      }
    }

    // ============================================
    // LAND TOUR / CRUISE+LAND PATH (STRUCTURED OR CREATIVE)
    // ============================================
    console.log(`🏛️ Processing as ${effectivePackageType} itinerary (${inputMode} mode)...`)

    // Fetch rates and content
    const searchCities = cities.length > 0 ? cities : [effectiveCity]
    const contentLibrary = await fetchContentLibrary(supabaseAdmin, tier, searchCities, interests)
    const writingRules = await fetchWritingRules(supabaseAdmin)
    const contentContext = buildContentContext(contentLibrary)
    const writingContext = buildWritingRulesContext(writingRules)
    const attractionNames = await fetchAttractionsList(supabase)

    // Determine inclusions based on package type
    let includeAccommodationFinal = include_accommodation
    if (effectivePackageType === 'day-trips' || effectivePackageType === 'tours-only') {
      includeAccommodationFinal = false
    }

    // Fetch all pricing rates from database
    const rates = await fetchAllPricingRates(supabase, {
      tier,
      effectiveCity,
      totalPax,
      isEuroPassport,
      language: guideLanguage,
      hotelName: hotel_name || null,
      includeAccommodation: includeAccommodationFinal,
    })


    // ============================================
    // GENERATE ITINERARY CONTENT
    // ============================================

    let itineraryData: any

    if (inputMode === 'structured' && raw_itinerary) {
      console.log('📋 Using STRUCTURED mode - following provided itinerary')
      
      itineraryData = await generateFromStructuredInput(
        anthropic,
        extracted_days || [],
        raw_itinerary,
        {
          tier,
          totalPax,
          language: contentLanguage,
          attractionNames,
          writingRules,
          packageType: effectivePackageType
        }
      )
    } else {
      console.log('🎨 Using CREATIVE mode - AI generating itinerary')
      
      itineraryData = await generateCreativeItinerary(anthropic, {
        clientName: client_name,
        tourName: finalTourName,
        durationDays: duration_days,
        tier,
        totalPax,
        numAdults: num_adults,
        numChildren: num_children,
        language: contentLanguage,
        cities,
        interests,
        specialRequests: special_requests,
        startDate: start_date,
        effectiveCity,
        attractionNames,
        contentContext,
        writingContext,
        includeLunch: include_lunch,
        includeDinner: include_dinner,
        includeAccommodation: includeAccommodationFinal
      })
    }

    // Update duration from AI result
    if (itineraryData.total_days) {
      duration_days = itineraryData.total_days
    }

    // Recalculate end date
    const finalEndDate = new Date(startDateObj)
    finalEndDate.setDate(startDateObj.getDate() + duration_days - 1)

    // Build itinerary-specific inclusions/exclusions BEFORE creating the record
    // so they are part of the initial INSERT (not a separate UPDATE that could fail silently)
    const allAttractions: string[] = []
    const allCities = new Set<string>()
    for (const dayData of itineraryData.days || []) {
      if (dayData.attractions) allAttractions.push(...dayData.attractions)
      if (dayData.city) allCities.add(dayData.city)
      if (dayData.cities_visited) {
        dayData.cities_visited.forEach((c: string) => allCities.add(c))
      }
    }

    // Extract detailed itinerary data for richer inclusions
    const itineraryDetails = extractItineraryDetails(itineraryData.days || [])

    // Fetch hotel names for all overnight cities (not just the primary city)
    let hotelsPerCity: Array<{ city: string; hotelName: string; nights: number }> | undefined
    if (includeAccommodationFinal && itineraryDetails.nightsPerCity.size > 0) {
      const allOvernightCities = [...itineraryDetails.nightsPerCity.keys()]
      const hotelMap = await fetchHotelsForCities(supabase, {
        cities: allOvernightCities,
        tier,
        primaryCity: effectiveCity,
        primaryHotelName: rates.hotelName,
      })

      hotelsPerCity = []
      for (const [city, nights] of itineraryDetails.nightsPerCity) {
        const cityHotelName = hotelMap.get(city.toLowerCase()) || 'Hotel as per itinerary'
        hotelsPerCity.push({ city, hotelName: cityHotelName, nights })
      }
    }

    const landIncExc = buildInclusionsExclusions({
      packageType: effectivePackageType as PackageType,
      tier,
      includeLunch: include_lunch,
      includeDinner: include_dinner,
      includeAccommodation: includeAccommodationFinal,
      isCruise: cruiseDetection.isCruise,
      language: guideLanguage,
      hotelName: rates.hotelName || undefined,
      hasAirportTransfer: effectivePackageType === 'full-package' ||
        effectivePackageType === 'cruise-package' || effectivePackageType === 'cruise-land',
      attractions: [...new Set(allAttractions)],
      citiesVisited: [...allCities],
      totalDays: duration_days,
      numAdults: num_adults,
      numChildren: num_children,
      vehicleType: rates.vehicleTypeName || undefined,
      hotelsPerCity,
      domesticFlights: itineraryDetails.domesticFlights.length > 0
        ? itineraryDetails.domesticFlights : undefined,
      intercityTransfers: itineraryDetails.intercityTransfers.length > 0
        ? itineraryDetails.intercityTransfers : undefined,
    })

    console.log('📋 Built inclusions/exclusions:', {
      inclusionsCount: landIncExc.inclusions.length,
      exclusionsCount: landIncExc.exclusions.length,
      firstInclusion: landIncExc.inclusions[0],
      packageType: effectivePackageType,
    })

    // Create itinerary record WITH inclusions/exclusions included in INSERT
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        itinerary_code,
        client_name,
        client_email: client_email || null,
        client_phone: client_phone || null,
        trip_name: itineraryData.trip_name || finalTourName,
        start_date,
        end_date: finalEndDate.toISOString().split('T')[0],
        total_days: duration_days,
        num_adults,
        num_children,
        currency: effectiveCurrency,
        total_cost: 0,
        total_revenue: 0,
        margin_percent,
        status: skip_pricing ? 'draft' : 'quoted',
        tier,
        package_type: effectivePackageType,
        cost_mode,
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        client_id,
        // Dynamic inclusions/exclusions — included at INSERT time
        inclusions: landIncExc.inclusions,
        exclusions: landIncExc.exclusions,
        // B2B Partner fields
        partner_id: partner_id || null,
        partner_commission_percent: partner_commission_percent || 0,
        source: partner_id ? 'b2b_custom' : source
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Failed to create itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }

    console.log(`✅ Created itinerary ${itinerary.id} with ${duration_days} days`)

    // Create days and services using extracted module
    const serviceResult = await createLandItineraryServices(supabase, {
      itineraryId: itinerary.id,
      itineraryData,
      rates,
      startDateObj,
      durationDays: duration_days,
      effectivePackageType,
      effectiveCity,
      totalPax,
      isEuroPassport,
      tier,
      language: guideLanguage,
      includeLunch: include_lunch,
      includeDinner: include_dinner,
      includeAccommodation: includeAccommodationFinal,
      includeGuide: include_guide,
      skipPricing: skip_pricing,
      marginPercent: margin_percent,
      startDate: start_date,
      currency: effectiveCurrency,
    })


    const { createdDays, totalSupplierCost, totalClientPrice } = serviceResult

    // Update pricing totals (inclusions/exclusions were already set in the INSERT)
    if (!skip_pricing) {
      const { error: updateError } = await supabase.from('itineraries').update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        supplier_cost: totalSupplierCost,
        profit: totalClientPrice - totalSupplierCost,
        status: 'quoted'
      }).eq('id', itinerary.id)
      if (updateError) {
        console.error('❌ Failed to update itinerary pricing:', updateError)
      }
    }

    console.log('🎉 Land tour itinerary complete!', {
      id: itinerary.id,
      mode: inputMode,
      packageType: effectivePackageType,
      days: duration_days,
      supplierCost: totalSupplierCost,
      clientPrice: totalClientPrice
    })

    // Auto-create language version
    const createdLandDays = createdDays.map(d => ({
      id: d.dayId,
      title: d.title,
      description: d.description,
      city: d.city,
      overnight_city: d.overnightCity
    }))
    await createLanguageVersions(supabase, itinerary.id, itineraryData.trip_name, contentLanguage, createdLandDays)

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier,
        package_type: effectivePackageType,
        is_cruise: cruiseDetection.isCruise,
        generation_mode: inputMode,
        mode: skip_pricing ? 'draft' : 'quoted',
        redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
        currency: effectiveCurrency,
        total_days: duration_days,
        ...(skip_pricing ? {} : {
          supplier_cost: totalSupplierCost,
          total_cost: totalClientPrice,
          margin: totalClientPrice - totalSupplierCost,
          per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100
        })
      }
    })

  } catch (error: any) {
    console.error('❌ Error generating itinerary:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate itinerary' },
      { status: 500 }
    )
  }
}