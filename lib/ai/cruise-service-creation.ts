// ============================================
// CRUISE SERVICE CREATION MODULE
// Extracted from generate-itinerary/route.ts
// ============================================
// Creates days + services for cruise-only itineraries
// using Content Library data. Mirrors the pattern of
// createLandItineraryServices() in service-creation.ts.

import { type ServiceTier, toNumber } from '@/lib/ai/parsing-utils'
import { type CruiseRate } from '@/lib/ai/cruise-pricing'
import { type CruiseContentMatch, fetchAttractionAliases } from '@/lib/ai/content-library'
import {
  fetchCruiseTransportPricingRules,
  findCruiseTransportRule,
  getCruiseTransportRate,
} from '@/lib/auto-pricing-service'
import {
  getItemizedTippingRates,
  determineTipRolesForDay,
  formatTipServiceName,
  formatTipNotes,
} from '@/lib/tipping-utils'
import { getFixedDailyCosts } from '@/lib/fixed-costs'

// ============================================
// SHARED GUIDE RATE LOOKUP
// ============================================
// Reusable 3-tier fallback: guide_rates (UI-managed) → guides (supplier contacts)

export async function fetchGuideRate(
  supabase: any,
  tier: string,
  language: string
): Promise<{
  guidePerDay: number
  guideName: string | null
  // Rate-row id (guide_rates.id) — used as service_code in itinerary_services
  // for grouping. NOT a suppliers FK.
  guideId: string | null
  // FK to suppliers when the source rate row carries one. NULL when the
  // fallback `guides` registry table is used (separate from suppliers).
  // Added Phase 3 step 1 to stop dropping the supplier FK.
  guideSupplierId: string | null
}> {
  // PRIORITY 1: Check guide_rates table (managed via Rates > Tour Guides UI)
  const { data: guideRates } = await supabase
    .from('guide_rates')
    .select('*')
    .eq('is_active', true)
    .eq('guide_language', language)
    .limit(1)

  if (guideRates?.length) {
    const rate = toNumber(guideRates[0].base_rate_eur, 0)
    const name = guideRates[0].guide_name || `${language} Speaking Guide`
    console.log(`✅ Guide rate from guide_rates: €${rate}/day (${language})`)
    return {
      guidePerDay: rate,
      guideName: name,
      guideId: guideRates[0].id,
      guideSupplierId: guideRates[0].supplier_id || null,
    }
  }

  // PRIORITY 2: Fall back to guides table (supplier contacts)
  // Tier + language → any tier + language → tier only → any active guide
  let guide: any = null

  const { data: tierLangGuides } = await supabase
    .from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [language]).limit(1)
  guide = tierLangGuides?.[0]

  if (!guide) {
    const { data: langGuides } = await supabase
      .from('guides').select('*').eq('is_active', true).contains('languages', [language]).limit(1)
    guide = langGuides?.[0]
  }

  if (!guide) {
    const { data: tierGuides } = await supabase
      .from('guides').select('*').eq('is_active', true).eq('tier', tier).limit(1)
    guide = tierGuides?.[0]
    if (guide) console.warn(`⚠️ No ${language}-speaking guide found — using ${guide.name || 'generic'} guide rate`)
  }

  if (!guide) {
    const { data: anyGuides } = await supabase
      .from('guides').select('*').eq('is_active', true).limit(1)
    guide = anyGuides?.[0]
    if (guide) console.warn(`⚠️ No guide for ${language}/${tier} — using ${guide.name || 'generic'} as last resort`)
  }

  const guidePerDay = guide ? toNumber(guide.daily_rate, 0) : 0
  return {
    guidePerDay,
    guideName: guide?.name || null,
    guideId: guide?.id || null,
    // `guides` is a separate registry without a supplier_id column — leave
    // the FK null on this fallback path. Normalization of guides ↔ suppliers
    // is out of scope for this step.
    guideSupplierId: null,
  }
}

// ============================================
// CRUISE ITINERARY SERVICE CREATION
// ============================================

interface CruiseCreatedDay {
  id: string
  title: string
  description: string
  city: string
  overnight_city: string
}

export async function createCruiseItineraryServices(
  supabase: any,
  params: {
    itineraryId: string
    cruiseContent: CruiseContentMatch
    cruiseRate: CruiseRate
    startDateObj: Date
    durationDays: number
    totalPax: number
    isEuroPassport: boolean
    tier: ServiceTier
    guideLanguage: string
    skipPricing: boolean
    marginPercent: number
    includeGuide?: boolean // Global override: true=always, false=never, undefined=per-day
    effectiveCity: string
    /** Currency the supplier rates are entered in (organizations.rate_currency). Default EUR. */
    rateCurrency?: string
  }
): Promise<{
  createdDays: CruiseCreatedDay[]
  totalSupplierCost: number
  totalClientPrice: number
  warnings: string[]
}> {
  const {
    itineraryId, cruiseContent, cruiseRate, startDateObj, durationDays,
    totalPax, isEuroPassport, tier, guideLanguage, skipPricing,
    marginPercent, includeGuide, effectiveCity,
    rateCurrency = 'EUR',
  } = params

  const warnings: string[] = []

  // The cruise accommodation block below is skipped entirely when no rate was
  // found — that's the itinerary's largest cost component, so surface it as a
  // warning (the land path does; this was lost in the cruise copy).
  if (!skipPricing && !cruiseRate.found) {
    warnings.push(`No cruise rate found (${tier} tier) — cruise accommodation will be €0. Add it in Rates → Cruises.`)
  }

  // Margin helper
  const marginMultiplier = 1 + (marginPercent / 100)
  const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

  // Insert helper: a failed service insert must NOT count toward totals —
  // previously all six insert sites ignored the returned error, so saved
  // itinerary totals could exceed the sum of the stored services.
  const insertService = async (dayNumber: number, payload: Record<string, unknown>): Promise<boolean> => {
    const { error } = await supabase.from('itinerary_services').insert(payload)
    if (error) {
      console.error(`❌ Error creating ${payload.service_type} service on day ${dayNumber}:`, error)
      warnings.push(`Day ${dayNumber}: failed to save ${payload.service_name} — excluded from totals`)
      return false
    }
    return true
  }

  // ============================================
  // FETCH ALL REQUIRED RATES
  // ============================================

  // 1. Cruise transport (bundled flat rate from b2b_pricing_rules)
  const cruiseTransportRules = await fetchCruiseTransportPricingRules()
  const cruiseTransportRule = findCruiseTransportRule(cruiseTransportRules, durationDays)
  let cruiseTransportRate = 0
  let cruiseTransportVehicle = 'Minivan'
  if (cruiseTransportRule) {
    const transport = getCruiseTransportRate(cruiseTransportRule, totalPax)
    cruiseTransportRate = transport.rate
    cruiseTransportVehicle = transport.vehicleType
    console.log(`🚗 Cruise transport: ${cruiseTransportVehicle} = ${cruiseTransportRate} (flat rate for ${durationDays}D)`)
  } else {
    warnings.push(`No bundled cruise transport rule found for ${durationDays} days — transport will be €0`)
  }

  // 2. Guide rate (guide_rates table → guides table fallback)
  const guideResult = await fetchGuideRate(supabase, tier, guideLanguage)
  if (!guideResult.guidePerDay) {
    warnings.push(`No guide rate found for ${guideLanguage} (${tier} tier) — guide will be €0`)
  }

  // 3. Tipping rates (itemized, tier-adjusted)
  const cruiseTippingRates = await getItemizedTippingRates(supabase, tier)
  if (cruiseTippingRates.allRates.length === 0) {
    warnings.push('No tipping rates found — tips will be €0')
  }

  // 4. Entrance fees
  const { data: entranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)
  if (!entranceFees?.length) {
    warnings.push('No entrance fees found — entrance fees will be €0')
  }

  // 4b. Activity rates — M5 fix: cruise-day attractions that exist only in
  // activity_rates (felucca rides, Sound & Light shows, sea trips, …) were
  // previously priced at €0 because this module skipped the activity_rates
  // fallback that the land path uses. Mirror it here so cruise quotes don't
  // systematically under-charge for activity-priced items.
  const { data: activityRates } = await supabase.from('activity_rates').select('*').eq('is_active', true)

  // 5. Water rate
  const fixedCosts = await getFixedDailyCosts()
  const waterRatePerPerson = fixedCosts.waterPerPersonPerDay

  // ============================================
  // CREATE DAYS AND SERVICES
  // ============================================

  let totalSupplierCost = 0
  let totalClientPrice = 0
  const createdDays: CruiseCreatedDay[] = []
  let transportAdded = false

  for (const dayData of cruiseContent.dayByDay) {
    const dayDate = new Date(startDateObj)
    dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

    const dayTitle = dayData.title
    const dayDescription = dayData.description
    const dayCity = dayData.city || effectiveCity
    const dayOvernight = dayData.overnight || `On board - ${dayData.city}`
    const isLastDay = dayData.day_number === durationDays
    const isSailingDay = dayData.is_sailing_day || false
    const dayNeedsGuide = includeGuide !== undefined
      ? (includeGuide && !isSailingDay)
      : (!isSailingDay && (dayData.attractions?.length > 0 || dayData.guide_required !== false))

    // Create day record
    const { data: day, error: dayError } = await supabase
      .from('itinerary_days')
      .insert({
        itinerary_id: itineraryId,
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
        is_cruise_day: true,
      })
      .select()
      .single()

    if (dayError) {
      console.error(`❌ Error creating day ${dayData.day_number}:`, dayError)
      warnings.push(`Day ${dayData.day_number} could not be saved — it is missing from the itinerary`)
      continue
    }

    createdDays.push({ id: day.id, title: dayTitle, description: dayDescription, city: dayCity, overnight_city: dayOvernight })

    if (skipPricing) continue

    // --- SERVICE 1: Cruise Accommodation (per night, not on last day) ---
    if (!isLastDay && cruiseRate.found) {
      const nightCost = cruiseRate.totalPerNight
      const cabinDesc = cruiseRate.cabinAllocation.map(a => `${a.count}×${a.type}`).join(' + ')

      if (await insertService(dayData.day_number, {
        itinerary_day_id: day.id,
        service_type: 'cruise',
        service_code: cruiseRate.supplierId || 'CRUISE',
        service_name: `${cruiseRate.shipName} - Full Board (${cabinDesc})`,
        supplier_name: cruiseRate.shipName,
        // Phase 3 step 1: capture the FK to suppliers. (cruiseRate.supplierId
        // is currently doubled into service_code — that semantic cleanup is
        // out of scope for this step.)
        supplier_id: cruiseRate.supplierId,
        quantity: totalPax,
        rate_eur: cruiseRate.totalPerNight / totalPax,
        rate_non_eur: cruiseRate.totalPerNight / totalPax,
        total_cost: nightCost,
        client_price: withMargin(nightCost),
        notes: `Night ${dayData.day_number}: ${dayOvernight} | ${cruiseRate.season} season | ${cabinDesc}`,
        supplier_currency: rateCurrency,
        supplier_cost_original: nightCost,
        exchange_rate_used: 1,
      })) {
        totalSupplierCost += nightCost
        totalClientPrice += withMargin(nightCost)
      }
    }

    // --- SERVICE 2: Bundled Cruise Transport (flat rate, added once on day 1) ---
    if (!transportAdded && cruiseTransportRate > 0) {
      if (await insertService(dayData.day_number, {
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
        notes: `Bundled transport for ${durationDays}D cruise: transfers + sightseeing (${cruiseTransportVehicle})`,
        supplier_currency: rateCurrency,
        supplier_cost_original: cruiseTransportRate,
        exchange_rate_used: 1,
      })) {
        totalSupplierCost += cruiseTransportRate
        totalClientPrice += withMargin(cruiseTransportRate)
        transportAdded = true
      }
    }

    // --- SERVICE 3: Guide (on touring days, not sailing days) ---
    if (dayNeedsGuide && guideResult.guidePerDay > 0) {
      if (await insertService(dayData.day_number, {
        itinerary_day_id: day.id,
        service_type: 'guide',
        service_code: guideResult.guideId || 'GUIDE',
        service_name: `${guideLanguage} Speaking Guide`,
        supplier_name: guideResult.guideName,
        // Phase 3 step 1: capture the FK to suppliers when the source was
        // guide_rates. NULL on the `guides` fallback path (separate registry).
        supplier_id: guideResult.guideSupplierId,
        quantity: 1,
        rate_eur: guideResult.guidePerDay,
        rate_non_eur: guideResult.guidePerDay,
        total_cost: guideResult.guidePerDay,
        client_price: withMargin(guideResult.guidePerDay),
        notes: `Professional ${guideLanguage} guide`,
        supplier_currency: rateCurrency,
        supplier_cost_original: guideResult.guidePerDay,
        exchange_rate_used: 1,
      })) {
        totalSupplierCost += guideResult.guidePerDay
        totalClientPrice += withMargin(guideResult.guidePerDay)
      }
    }

    // --- SERVICE 4: Context-aware tips ---
    const tipRoles = determineTipRolesForDay({
      hasGuide: dayNeedsGuide,
      hasDriver: false,            // cruise has bundled transport, no separate driver
      hasAirportService: false,
      airportServiceCount: 0,
      hasHotelNight: false,        // cruise accommodation is bundled
      isCruiseDay: true,
      isTransferOnly: false,
      isFreeDay: false,
    })
    for (const tipRole of tipRoles) {
      const tipRate = cruiseTippingRates.getRate(tipRole.role, tipRole.context)
      if (tipRate > 0) {
        const totalTipCost = tipRate * tipRole.quantity
        if (await insertService(dayData.day_number, {
          itinerary_day_id: day.id,
          service_type: 'tips',
          service_code: `TIPS-${tipRole.role.toUpperCase()}`,
          service_name: formatTipServiceName(tipRole.role, tipRole.context),
          quantity: tipRole.quantity,
          rate_eur: tipRate,
          rate_non_eur: tipRate,
          total_cost: totalTipCost,
          client_price: withMargin(totalTipCost),
          notes: formatTipNotes(tipRole.role, tipRole.context, tipRole.quantity),
          supplier_currency: rateCurrency,
          supplier_cost_original: totalTipCost,
          exchange_rate_used: 1,
        })) {
          totalSupplierCost += totalTipCost
          totalClientPrice += withMargin(totalTipCost)
        }
      }
    }

    // --- SERVICE 5: Entrance Fees ---
    const photoStops = dayData.photo_stops || []
    if (dayData.attractions?.length > 0) {
      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []
      // G2.2: attribute the entrance row to the antiquities authority
      // (entrance_fees.supplier_id); null if only activity-rate fallbacks matched.
      let entranceSupplierId: string | null = null

      // Fetch aliases for resolving alternative attraction names
      let aliasToCanonical: Map<string, string> | null = null
      try {
        const aliases = await fetchAttractionAliases(supabase)
        aliasToCanonical = aliases.aliasToCanonical
      } catch { /* ignore if table doesn't exist yet */ }

      for (const attractionName of dayData.attractions) {
        // Skip photo stops (outside viewing only, no fee)
        if (photoStops.some((ps: string) => ps.toLowerCase() === attractionName.toLowerCase())) {
          continue
        }

        // Resolve alias to canonical name
        const normalizedName = attractionName.toLowerCase().replace(/^the /, '').trim()
        const resolvedName = aliasToCanonical?.get(normalizedName) || attractionName

        // Try exact match first, then resolved alias match
        let fee = entranceFees?.find((ef: any) =>
          ef.attraction_name.toLowerCase() === resolvedName.toLowerCase()
        )
        // Fallback: substring match
        if (!fee) {
          fee = entranceFees?.find((ef: any) =>
            ef.attraction_name.toLowerCase().includes(resolvedName.toLowerCase()) ||
            resolvedName.toLowerCase().includes(ef.attraction_name.toLowerCase())
          )
        }

        if (fee) {
          if (fee.is_addon) continue
          const feePerPerson = isEuroPassport ? toNumber(fee.eur_rate, 0) : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
          dayEntranceTotal += feePerPerson * totalPax
          matchedAttractions.push(fee.attraction_name)
          if (fee.supplier_id && !entranceSupplierId) entranceSupplierId = fee.supplier_id
          continue
        }

        // M5 fallback: when entrance_fees has no match, check activity_rates
        // (mirrors lib/ai/service-creation.ts:1653-1678).
        const activityMatch = (activityRates || []).find((ar: any) =>
          ar.activity_name?.toLowerCase() === resolvedName.toLowerCase()
          || ar.activity_name?.toLowerCase().includes(resolvedName.toLowerCase())
          || resolvedName.toLowerCase().includes(ar.activity_name?.toLowerCase() || '')
        )
        if (activityMatch) {
          const activityRate = isEuroPassport
            ? toNumber(activityMatch.base_rate_eur || activityMatch.eur_rate, 0)
            : toNumber(activityMatch.base_rate_non_eur || activityMatch.non_eur_rate, activityMatch.base_rate_eur || activityMatch.eur_rate || 0)
          dayEntranceTotal += activityRate * totalPax
          matchedAttractions.push(activityMatch.activity_name || attractionName)
        } else {
          warnings.push(`Day ${dayData.day_number}: No entrance fee or activity rate found for "${attractionName}"`)
        }
      }

      if (dayEntranceTotal > 0) {
        if (await insertService(dayData.day_number, {
          itinerary_day_id: day.id,
          service_type: 'entrance',
          service_code: 'ENTRANCE',
          service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
          supplier_id: entranceSupplierId,
          quantity: totalPax,
          rate_eur: dayEntranceTotal / totalPax,
          rate_non_eur: dayEntranceTotal / totalPax,
          total_cost: dayEntranceTotal,
          client_price: withMargin(dayEntranceTotal),
          notes: `Sites: ${matchedAttractions.join(', ')}`,
          supplier_currency: rateCurrency,
          supplier_cost_original: dayEntranceTotal,
          exchange_rate_used: 1,
        })) {
          totalSupplierCost += dayEntranceTotal
          totalClientPrice += withMargin(dayEntranceTotal)
        }
      }
    }

    // --- SERVICE 6: Water (on touring days, not sailing days) ---
    if (!isSailingDay) {
      const waterCost = waterRatePerPerson * totalPax
      if (await insertService(dayData.day_number, {
        itinerary_day_id: day.id,
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterRatePerPerson,
        rate_non_eur: waterRatePerPerson,
        total_cost: waterCost,
        client_price: withMargin(waterCost),
        notes: 'Bottled water',
        supplier_currency: rateCurrency,
        supplier_cost_original: waterCost,
        exchange_rate_used: 1,
      })) {
        totalSupplierCost += waterCost
        totalClientPrice += withMargin(waterCost)
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn(`⚠️ ${warnings.length} cruise pricing warning(s):`)
    warnings.forEach(w => console.warn(`  • ${w}`))
  }

  return {
    createdDays,
    totalSupplierCost,
    totalClientPrice,
    warnings,
  }
}
