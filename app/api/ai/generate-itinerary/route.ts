import { NextRequest, NextResponse } from 'next/server'
import { debugLog } from '@/lib/debug-log'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { reassertClientId } from '@/lib/itineraries/reassert-client'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { isEuroPassport as isEuroPassportFromNationality } from '@/lib/passport'
import {
  fetchCruiseTransportPricingRules,
  findCruiseTransportRule,
  getCruiseTransportRate
} from '@/lib/auto-pricing-service'
import { type PackageType } from '@/lib/package-types'
import {
  type ServiceTier,
  isValidDate,
  normalizeTier,
  calculateExpectedDays,
  determineInputMode,
} from '@/lib/ai/parsing-utils'
import {
  detectCruiseRequest,
  determinePackageType,
} from '@/lib/ai/cruise-detection'
import {
  getCruiseRate,
} from '@/lib/ai/cruise-pricing'
import {
  findCruiseContent,
  fetchContentLibrary,
  fetchWritingRules,
  buildWritingRulesContext,
  fetchAttractionsList,
  fetchAttractionsWithCity,
  fetchAttractionAliases,
  formatAttractionMenuForPrompt,
  buildAttractionContentMap,
  buildRichContentContext,
  logContentUsage,
} from '@/lib/ai/content-library'
import { generateFromStructuredInput, generateCreativeItinerary } from '@/lib/ai/prompt-builder'
import { fetchAllPricingRates, createLandItineraryServices, fetchHotelsForCities, setAliasCache } from '@/lib/ai/service-creation'
import { createCruiseItineraryServices } from '@/lib/ai/cruise-service-creation'
import { buildInclusionsExclusions, extractItineraryDetails } from '@/lib/inclusions-builder'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { createLanguageVersions } from '@/lib/ai/language-versions'
import { getUserPreferences } from '@/lib/ai/user-preferences'
import { applyDayRules } from '@/lib/ai/day-rules-engine'
import { reconcileWithParserData } from '@/lib/ai/reconciliation'
import { getMemoriesForPrompt, logAgentRun } from '@/lib/agent-memory'


// Admin client for bypassing RLS on content library
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = supabaseAdmin
    const userPrefs = await getUserPreferences(supabase)

    // M3 Phase 2A — every itinerary INSERT must stamp org_id (NOT NULL).
    // Resolve from the operator's session. Both INSERT paths below (cruise +
    // land) use this same orgId.
    const orgId = await getCurrentOrgId()
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'No organization context — re-login or contact admin.' },
        { status: 403 }
      )
    }
    
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
      include_lunch: raw_include_lunch,
      include_dinner: raw_include_dinner,
      include_accommodation = true,
      include_guide,  // undefined = per-day AI decision, true = always, false = never
      meal_plan = null,  // From WhatsApp parser: RO|BB|HB|FB|AI
      margin_percent = userPrefs.default_margin_percent,
      currency = userPrefs.default_currency,
      cost_mode = userPrefs.default_cost_mode,
      package_type: requested_package_type = 'land-package',
      // Harness: pricing is OPT-IN and safe-by-default. Conversations from
      // WhatsApp/email generate an UNPRICED draft for the user to revise, then
      // price in the grid. The route only prices if a caller explicitly asks.
      skip_pricing = true,

      // NEW: Structured input parameters from parser
      is_structured_input = false,
      extracted_days = null,
      raw_itinerary = null,
      input_mode_override = null, // 'creative' | 'structured' | null

      // B2B Partner fields
      partner_id = null,
      partner_commission_percent = 0,
      source = 'b2c_whatsapp',

      // Idempotency
      idempotency_key = null,

      // Phase 2 — provenance pointer back to the originating Copilot thread.
      // Preferred: caller (the WhatsApp inbox launcher or the parser page)
      // passes thread_id directly. Backstop: caller passes
      // whatsapp_conversation_id (resolved server-side below). The Concierge
      // path doesn't go through this route; its thread_id is wired in
      // lib/concierge/commit-brief-to-itinerary.ts.
      thread_id = null,
      whatsapp_conversation_id = null,
    } = body

    // ============================================
    // MEAL PLAN → include_lunch / include_dinner mapping
    // The WhatsApp parser extracts meal_plan (RO|BB|HB|FB|AI) but the
    // frontend never sends include_lunch/include_dinner explicitly.
    // Map meal_plan to the correct defaults:
    //   RO (Room Only) = no meals
    //   BB (Bed & Breakfast) = no lunch, no dinner (breakfast from hotel)
    //   HB (Half Board) = lunch included, no dinner
    //   FB (Full Board) = lunch + dinner included
    //   AI (All Inclusive) = lunch + dinner included
    // If include_lunch/include_dinner were explicitly sent (not undefined), honor them.
    // ============================================
    let include_lunch = raw_include_lunch
    let include_dinner = raw_include_dinner
    if (meal_plan && typeof meal_plan === 'string') {
      const mp = meal_plan.toUpperCase().trim()
      if (raw_include_lunch === undefined || raw_include_lunch === null) {
        include_lunch = ['HB', 'FB', 'AI'].includes(mp)
      }
      if (raw_include_dinner === undefined || raw_include_dinner === null) {
        include_dinner = ['FB', 'AI'].includes(mp)
      }
      debugLog(`🍽️ Meal plan "${mp}" → include_lunch=${include_lunch}, include_dinner=${include_dinner}`)
    } else {
      // No meal_plan and no explicit values: use safe defaults
      if (include_lunch === undefined || include_lunch === null) include_lunch = true
      if (include_dinner === undefined || include_dinner === null) include_dinner = false
    }

    // ============================================
    // IDEMPOTENCY CHECK
    // If the client sent an idempotency key, check if an itinerary
    // was already created with it. Return the existing one if so.
    // ============================================
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('itineraries')
        .select('id, itinerary_code, trip_name, tier, package_type, currency, total_days, total_cost, supplier_cost, status')
        .eq('idempotency_key', idempotency_key)
        .single()

      if (existing) {
        debugLog(`\u267B\uFE0F Idempotency hit: returning existing itinerary ${existing.id}`)
        return NextResponse.json({
          success: true,
          data: {
            id: existing.id,
            itinerary_id: existing.id,
            itinerary_code: existing.itinerary_code,
            trip_name: existing.trip_name,
            tier: existing.tier,
            package_type: existing.package_type,
            mode: existing.status,
            redirect_to: existing.status === 'draft'
              ? `/itineraries/${existing.id}/edit`
              : `/itineraries/${existing.id}`,
            currency: existing.currency,
            total_days: existing.total_days,
            supplier_cost: existing.supplier_cost,
            total_cost: existing.total_cost,
            deduplicated: true,
          }
        })
      }
    }

    // ============================================
    // PHASE 2 — THREAD_ID RESOLUTION + IDEMPOTENCY
    // Prefer the caller-supplied thread_id; otherwise resolve from
    // whatsapp_conversation_id as a backstop. If a thread resolves AND an
    // itinerary already exists for it (one-itinerary-per-thread is enforced
    // by idx_itineraries_thread_id_unique), return that existing itinerary.
    // ============================================
    let resolvedThreadId: string | null = thread_id || null
    if (!resolvedThreadId && whatsapp_conversation_id) {
      const { data: threadRow } = await supabase
        .from('communication_threads')
        .select('id')
        .eq('whatsapp_conversation_id', whatsapp_conversation_id)
        .maybeSingle()
      resolvedThreadId = threadRow?.id || null
    }
    if (resolvedThreadId) {
      const { data: existingByThread } = await supabase
        .from('itineraries')
        .select('id, itinerary_code, trip_name, tier, package_type, currency, total_days, total_cost, supplier_cost, status')
        .eq('thread_id', resolvedThreadId)
        .maybeSingle()
      if (existingByThread) {
        debugLog(`♻️ Thread idempotency hit: returning existing itinerary ${existingByThread.id} for thread ${resolvedThreadId}`)
        return NextResponse.json({
          success: true,
          data: {
            id: existingByThread.id,
            itinerary_id: existingByThread.id,
            itinerary_code: existingByThread.itinerary_code,
            trip_name: existingByThread.trip_name,
            tier: existingByThread.tier,
            package_type: existingByThread.package_type,
            mode: existingByThread.status,
            redirect_to: existingByThread.status === 'draft'
              ? `/itineraries/${existingByThread.id}/edit`
              : `/itineraries/${existingByThread.id}`,
            currency: existingByThread.currency,
            total_days: existingByThread.total_days,
            supplier_cost: existingByThread.supplier_cost,
            total_cost: existingByThread.total_cost,
            deduplicated: true,
          },
        })
      }
    }

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
    // Tier priority: explicit raw_tier > budget_level > user default
    // Note: budget_level 'standard' IS a valid explicit choice, not a fallback signal
    const tier: ServiceTier = raw_tier
      ? normalizeTier(raw_tier)
      : budget_level
        ? normalizeTier(budget_level)
        : userPrefs.default_tier

    if (!isValidDate(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid start date' },
        { status: 400 }
      )
    }

    // ============================================
    // DETERMINE INPUT MODE
    // ============================================
    const inputMode = determineInputMode({
      input_mode_override,
      is_structured_input,
      extracted_days,
      raw_itinerary,
    })
    debugLog('🤖 Input Mode:', inputMode, '| Override:', input_mode_override, '| is_structured_input:', is_structured_input)

    let duration_days = parseInt(raw_duration_days) || 1
    
    // For structured mode, calculate days from raw itinerary
    if (inputMode === 'structured' && raw_itinerary) {
      const calculatedDays = calculateExpectedDays(raw_itinerary, extracted_days)
      if (calculatedDays > duration_days) {
        duration_days = calculatedDays
        debugLog(`📊 Adjusted duration to ${duration_days} days based on itinerary analysis`)
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
        debugLog(`🚢 Adjusted cruise duration to ${duration_days} days`)
      }
    }

    // UPDATED: Determine effective package type
    const effectivePackageType = determinePackageType(requested_package_type, cruiseDetection)
    debugLog(`📦 Package type: ${effectivePackageType}`)

    let effectiveCity = city
    if (cruiseDetection.isCruise && cruiseDetection.startCity) {
      effectiveCity = cruiseDetection.startCity
    } else if (cities.length > 0) {
      effectiveCity = cities[0]
    }

    debugLog('🤖 Starting itinerary generation:', {
      client: client_name,
      inputMode,
      isCruise: cruiseDetection.isCruise,
      packageType: effectivePackageType,
      tier,
      duration: duration_days,
      startCity: effectiveCity
    })

    const totalPax = Number(num_adults) + Number(num_children)

    // Guard against a zero/invalid pax count: totalPax is the divisor for
    // per_person_cost below, so 0 (or a non-numeric body value) would save an
    // Infinity/NaN price. The defaults (num_adults=2) only apply when the keys
    // are absent — an explicit num_adults:0 reaches here.
    if (!Number.isFinite(totalPax) || totalPax < 1) {
      return NextResponse.json(
        { success: false, error: 'At least 1 passenger (adult or child) is required.' },
        { status: 400 }
      )
    }

    // Passport type — match both country names AND demonyms (e.g., "French", "German")
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      isEuroPassport = isEuroPassportFromNationality(nationality)
    }
    isEuroPassport = isEuroPassport ?? false

    // Auto-set currency to EUR for Euro passport holders
    let effectiveCurrency = currency
    if (isEuroPassport && effectiveCurrency !== 'EUR') {
      debugLog(`💶 Euro passport detected (${nationality}) — setting currency to EUR (was ${effectiveCurrency})`)
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

    // ============================================
    // CRUISE PATH (creative mode ONLY, cruise-package or cruise-land)
    // CRITICAL: Structured mode ALWAYS takes priority over cruise content library.
    // If the user provided a day-by-day itinerary, we must follow it — not replace with a cruise template.
    // ============================================
    if (cruiseDetection.isCruise && inputMode === 'creative' && !is_structured_input && (effectivePackageType === 'cruise-package' || effectivePackageType === 'cruise-land')) {
      debugLog(`🚢 Processing as ${effectivePackageType} itinerary (creative mode, no structured input)...`)
      
      const cruiseContent = await findCruiseContent(supabaseAdmin, cruiseDetection, tier, duration_days)
      
      if (cruiseContent.found && cruiseContent.dayByDay.length > 0) {
        debugLog(`📚 Using Content Library cruise: ${cruiseContent.content.name}`)
        
        // Use Content Library duration if available — and recompute end_date,
        // which was derived from the requested duration BEFORE this override
        // (the land path does the same via finalEndDate). Otherwise a 5-day
        // request matched to an 8-day library cruise saves an end_date 3 days
        // short of the actual day records.
        if (cruiseContent.content.duration_days) {
          duration_days = cruiseContent.content.duration_days
          endDate.setTime(startDateObj.getTime())
          endDate.setDate(startDateObj.getDate() + duration_days - 1)
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
        debugLog(`💰 Cruise rate: ${cruiseRate.totalPerNight}/night total on ${cruiseRate.shipName} (${cruiseRate.season} season)`)
        if (cruiseRate.cabinAllocation.length > 0) {
          debugLog(`🛏️ Cabins: ${cruiseRate.cabinAllocation.map(a => `${a.count}×${a.type}`).join(' + ')}`)
        }

        // Quick transport lookup for inclusions vehicle type (actual rate fetched inside module)
        const cruiseTransportRulesForInc = await fetchCruiseTransportPricingRules()
        const cruiseTransportRuleForInc = findCruiseTransportRule(cruiseTransportRulesForInc, duration_days)
        const cruiseTransportVehicle = cruiseTransportRuleForInc
          ? getCruiseTransportRate(cruiseTransportRuleForInc, totalPax).vehicleType
          : 'Minivan'

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

        debugLog('📋 Built cruise inclusions/exclusions:', {
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
            org_id: orgId,
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
            status: 'draft',
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
            source: partner_id ? 'b2b_custom' : source,
            // Idempotency
            idempotency_key: idempotency_key || null,
          })
          .select()
          .single()

        if (itineraryError) throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
        // Prod drops client_id on INSERT — see lib/itineraries/reassert-client.ts
        await reassertClientId(supabase, itinerary, client_id)

        debugLog('✅ Created cruise itinerary:', itinerary.id)

        // Delegate day + service creation to the extracted cruise module
        const cruiseServiceResult = await createCruiseItineraryServices(supabase, {
          itineraryId: itinerary.id,
          cruiseContent,
          cruiseRate,
          startDateObj,
          durationDays: duration_days,
          totalPax,
          isEuroPassport,
          tier,
          guideLanguage,
          skipPricing: skip_pricing,
          marginPercent: margin_percent,
          includeGuide: include_guide,
          effectiveCity,
        })

        const { createdDays: createdCruiseDays, totalSupplierCost, totalClientPrice, warnings: cruiseWarnings } = cruiseServiceResult

        // Update pricing totals (inclusions/exclusions were already set in the INSERT)
        // Always persist generation warnings for visibility
        if (cruiseWarnings.length > 0) {
          await supabase.from('itineraries').update({
            generation_warnings: cruiseWarnings,
          }).eq('id', itinerary.id)
        }

        if (!skip_pricing) {
          const { error: updateError } = await supabase.from('itineraries').update({
            total_cost: totalClientPrice,
            total_revenue: totalClientPrice,
            supplier_cost: totalSupplierCost,
            profit: totalClientPrice - totalSupplierCost,
            generation_warnings: cruiseWarnings.length > 0 ? cruiseWarnings : null,
          }).eq('id', itinerary.id)
          if (updateError) {
            console.error('❌ Failed to update cruise itinerary pricing:', updateError)
            throw new Error(`Failed to save cruise pricing: ${updateError.message}`)
          }
        }

        debugLog('🎉 Cruise itinerary complete!')

        // Log content library usage for cruise path
        if (cruiseContent.found && cruiseContent.content?.id) {
          logContentUsage(supabaseAdmin, [cruiseContent.content.id], tier, itinerary.id, 'cruise_generation')
        }

        // Auto-create language version
        const cruiseTripName = cruiseContent.variation.title || cruiseContent.content.name
        await createLanguageVersions(supabase, itinerary.id, cruiseTripName, contentLanguage, createdCruiseDays)

        // Record this run for the agent-memory feedback loop (best-effort).
        // Cruise generation doesn't inject memories (no creative prompt), but the
        // resulting itinerary still feeds learning (margin/client/supplier patterns).
        await logAgentRun({
          supabase: supabaseAdmin,
          org_id: orgId,
          agent_type: 'itinerary',
          triggered_by: null,
          itinerary_id: itinerary.id,
          input_summary: `cruise ${tier} ${cruiseTripName || ''}`.trim(),
          output_summary: `Created cruise itinerary`,
          memories_injected: 0,
        })

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
            mode: 'draft',
            // Unpriced draft → editor (revise first); priced → view.
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
            }),
            ...(cruiseWarnings.length > 0 ? { warnings: cruiseWarnings } : {})
          }
        })
      } else {
        debugLog('⚠️ No cruise content in Content Library, falling back to AI generation')
        // Fall through to standard AI generation
      }
    }

    // ============================================
    // LAND TOUR / CRUISE+LAND PATH (STRUCTURED OR CREATIVE)
    // ============================================
    debugLog(`🏛️ Processing as ${effectivePackageType} itinerary (${inputMode} mode)...`)

    // Fetch rates and content — these five lookups are independent of each
    // other, so run them in parallel (I/O scheduling only, same results)
    const searchCities = cities.length > 0 ? cities : [effectiveCity]
    const [
      contentLibrary,
      writingRules,
      attractionNames,
      attractionsWithCity,
      { aliasToCanonical },
    ] = await Promise.all([
      fetchContentLibrary(supabaseAdmin, tier, searchCities, interests),
      fetchWritingRules(supabaseAdmin),
      fetchAttractionsList(supabase),
      fetchAttractionsWithCity(supabase),
      // DB aliases for service-creation matching
      fetchAttractionAliases(supabase),
    ])
    const attractionMenu = formatAttractionMenuForPrompt(attractionsWithCity)
    setAliasCache(aliasToCanonical)

    // Build rich content map (full descriptions, not truncated) and format for prompts
    const contentMap = buildAttractionContentMap(contentLibrary)
    const { context: contentContext, matchedContentIds } = buildRichContentContext(contentMap, attractionNames)
    const writingContext = buildWritingRulesContext(writingRules)

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

    // Agent-memory personalisation: learned client/pricing/inquiry/supplier
    // patterns for this org, injected into the CREATIVE generator's prompt only
    // (the structured converter must transcribe the given itinerary verbatim).
    // getMemoriesForPrompt is fully fault-tolerant — if the migration isn't
    // applied it returns an empty block and generation is unaffected.
    let agentMemory = { prompt_block: '', count: 0 }

    if (inputMode === 'structured' && raw_itinerary) {
      debugLog('📋 Using STRUCTURED mode - following provided itinerary')

      itineraryData = await generateFromStructuredInput(
        extracted_days || [],
        raw_itinerary,
        {
          tier,
          totalPax,
          language: contentLanguage,
          attractionNames,
          attractionMenu,
          writingRules,
          packageType: effectivePackageType,
          contentContext,
        }
      )
    } else {
      debugLog('🎨 Using CREATIVE mode - AI generating itinerary')

      // Pull learned personalisation context for this org (+ client when known).
      agentMemory = await getMemoriesForPrompt({ supabase, org_id: orgId, client_id })
      if (agentMemory.count > 0) debugLog(`🧠 Injecting ${agentMemory.count} agent memories into the prompt`)

      itineraryData = await generateCreativeItinerary({
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
        attractionMenu,
        contentContext,
        writingContext,
        includeLunch: include_lunch,
        includeDinner: include_dinner,
        includeAccommodation: includeAccommodationFinal,
        memoryContext: agentMemory.prompt_block,
      })
    }

    // ============================================
    // POST-AI VALIDATION: Reconcile + Apply business rules
    // ============================================
    const attractionValidationWarnings: string[] = []
    if (itineraryData.days && itineraryData.days.length > 0) {
      // Step 1: Reconcile AI output with parser's extracted_days
      // The parser extracts detailed per-day data (attractions with INSIDE/OUTSIDE,
      // meals, flights, cities) that the AI may miss when re-parsing raw text.
      if (extracted_days && extracted_days.length > 0) {
        debugLog('🔧 Running reconciliation layer (parser data → AI output)...')
        itineraryData.days = reconcileWithParserData(itineraryData.days, extracted_days)
      }

      // Step 2: Apply deterministic day rules
      debugLog('🔧 Applying day rules engine (pre-service-creation validation)...')
      itineraryData.days = applyDayRules(itineraryData.days, effectivePackageType)
      debugLog('✅ Day rules applied successfully')

      // Step 3: Validate AI attractions against database (with alias resolution)
      // If the AI used an alias, auto-correct to the canonical name before flagging
      const dbAttractionSet = new Set(attractionNames.map((n: string) => n.toLowerCase()))
      for (const day of itineraryData.days) {
        if (day.attractions && Array.isArray(day.attractions)) {
          for (let i = 0; i < day.attractions.length; i++) {
            const attr = day.attractions[i]
            const attrLower = attr.toLowerCase().replace(/^the /, '').trim()

            // Already matches DB directly
            if (dbAttractionSet.has(attrLower)) continue

            // Check if it's a known alias → auto-correct to canonical name
            const canonical = aliasToCanonical.get(attrLower)
            if (canonical && dbAttractionSet.has(canonical.toLowerCase())) {
              debugLog(`🔄 Day ${day.day_number}: Auto-corrected "${attr}" → "${canonical}" (alias match)`)
              day.attractions[i] = canonical
              continue
            }

            // No match at all — warn
            attractionValidationWarnings.push(
              `Day ${day.day_number}: "${attr}" not found in entrance fees or activity rates — pricing will be €0`
            )
          }
        }
      }
      if (attractionValidationWarnings.length > 0) {
        console.warn(`⚠️ ${attractionValidationWarnings.length} attraction(s) not matched in DB:`)
        attractionValidationWarnings.forEach(w => console.warn(`  • ${w}`))
      }
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

    debugLog('📋 Built inclusions/exclusions:', {
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
        org_id: orgId,
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
        status: 'draft',
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
        source: partner_id ? 'b2b_custom' : source,
        // Phase 2 — provenance pointer to the Copilot thread that produced
        // this itinerary. NULL for direct-paste itineraries (no inbound
        // conversation). Same column as Concierge (lib/concierge/commit-brief-
        // to-itinerary.ts uses it too).
        thread_id: resolvedThreadId,
        // Idempotency
        idempotency_key: idempotency_key || null,
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Failed to create itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }
    // Prod drops client_id on INSERT — see lib/itineraries/reassert-client.ts
    await reassertClientId(supabase, itinerary, client_id)

    debugLog(`✅ Created itinerary ${itinerary.id} with ${duration_days} days`)

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
      mealPlan: meal_plan || null,
    })


    const { createdDays, totalSupplierCost, totalClientPrice, mealSelections, warnings: pricingWarnings } = serviceResult

    // Rebuild inclusions with actual restaurant names from service creation
    const updatedIncExc = buildInclusionsExclusions({
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
      mealSelections: mealSelections.length > 0 ? mealSelections : undefined,
    })

    // Combine all warnings (attraction validation + rate validation + per-day pricing warnings)
    const allWarnings = [...attractionValidationWarnings, ...pricingWarnings]

    // Update pricing totals AND inclusions with actual restaurant names
    const updatePayload: Record<string, any> = {
      inclusions: updatedIncExc.inclusions,
      exclusions: updatedIncExc.exclusions,
      generation_warnings: allWarnings.length > 0 ? allWarnings : null,
    }
    if (!skip_pricing) {
      updatePayload.total_cost = totalClientPrice
      updatePayload.total_revenue = totalClientPrice
      updatePayload.supplier_cost = totalSupplierCost
      updatePayload.profit = totalClientPrice - totalSupplierCost
      // Status stays 'draft' — user must manually mark as 'quoted' after review
    }
    const { error: updateError } = await supabase.from('itineraries')
      .update(updatePayload)
      .eq('id', itinerary.id)
    if (updateError) {
      console.error('❌ Failed to update itinerary pricing/inclusions:', updateError)
      throw new Error(`Failed to save pricing: ${updateError.message}`)
    }

    debugLog('🎉 Land tour itinerary complete!', {
      id: itinerary.id,
      mode: inputMode,
      packageType: effectivePackageType,
      days: duration_days,
      supplierCost: totalSupplierCost,
      clientPrice: totalClientPrice
    })

    // Log content library usage for land path
    if (matchedContentIds.length > 0) {
      logContentUsage(supabaseAdmin, matchedContentIds, tier, itinerary.id, 'land_generation')
    }

    // Auto-create language version
    const createdLandDays = createdDays.map(d => ({
      id: d.dayId,
      title: d.title,
      description: d.description,
      city: d.city,
      overnight_city: d.overnightCity
    }))
    await createLanguageVersions(supabase, itinerary.id, itineraryData.trip_name, contentLanguage, createdLandDays)

    // Collect warnings from attraction validation + pricing
    const responseWarnings = [
      ...attractionValidationWarnings,
      ...(pricingWarnings || []),
    ]

    // Record this run for the agent-memory feedback loop (best-effort — the
    // nightly cron later turns it into learned memories).
    await logAgentRun({
      supabase: supabaseAdmin,
      org_id: orgId,
      agent_type: 'itinerary',
      triggered_by: null,
      itinerary_id: itinerary.id,
      input_summary: `${duration_days}-day ${tier} ${finalTourName || ''}`.trim(),
      output_summary: `Created ${createdDays.length} day(s)`,
      memories_injected: agentMemory.count,
    })

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
        mode: 'draft',
        // Unpriced draft → editor (revise first); priced → view.
        redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
        currency: effectiveCurrency,
        total_days: duration_days,
        ...(skip_pricing ? {} : {
          supplier_cost: totalSupplierCost,
          total_cost: totalClientPrice,
          margin: totalClientPrice - totalSupplierCost,
          per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100
        }),
        ...(responseWarnings.length > 0 ? { warnings: responseWarnings } : {})
      }
    })

  } catch (error: any) {
    console.error('❌ Error generating itinerary:', error)
    const { message, status } = getUserFriendlyError(error)
    return NextResponse.json(
      { success: false, error: message },
      { status }
    )
  }
}