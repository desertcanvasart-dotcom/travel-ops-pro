import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTieredActivityRate, applyActivityTiers } from '@/lib/rates/activity-tiers'
import { calculateAutoPricing, calculatePricingWithPassengerBreakdown, ServiceTier, CHILD_DISCOUNT_PERCENT, loadSeasonWindows } from '@/lib/auto-pricing-service'
import { computeUplift, seasonForDate } from '@/lib/pricing/season-uplift'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { currencySymbol } from '@/lib/currency-totals'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { getCurrentOrgId } from '@/lib/auth/current-org'

// ============================================
// B2B TOUR PRICE CALCULATOR - v6
// File: app/api/b2b/calculate-price/route.ts
// 
// UPDATES in v6:
// - Added tour_leader_included parameter
// - Returns single_supplement in response
// - Returns pax_pricing_table for rate sheet generation
//
// NOW WITH AUTO-PRICING FALLBACK:
// If tour_variation_services is empty, uses auto-pricing
// from tour_templates.itinerary (via auto-pricing-service.ts)
//
// SHARED B2C RATE TABLES:
// - vehicles, guides, entrance_fees, hotel_contacts, meal_rates, nile_cruises
// 
// B2B-SPECIFIC TABLES:
// - b2b_transport_packages, b2b_partners, b2b_partner_pricing
// (tiered activity pricing moved to activity_rates.tiers — b2b_pricing_rules
//  was empty in production since launch and is no longer read)
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CalculatedService {
  service_id: string
  service_name: string
  service_category: string
  rate_type: string | null
  rate_source: string
  quantity_mode: string
  quantity: number
  unit_cost: number
  line_total: number
  is_optional: boolean
  day_number: number | null
  pricing_note?: string
}

interface PriceCalculationResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  num_adults?: number        // NEW: Passenger breakdown
  num_children?: number      // NEW: Ages 4-12 (50% discount)
  num_infants?: number       // NEW: Ages 0-3 (FREE except flights)
  travel_date: string
  is_eur_passport: boolean
  tour_leader_included: boolean
  services: CalculatedService[]
  optional_services: CalculatedService[]
  subtotal_cost: number
  optional_total: number
  total_cost: number
  tour_leader_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement: number
  currency: string
  // What the trip costs on an ordinary date, and the operator's own premium for
  // this departure. selling_price and price_per_person already INCLUDE the
  // premium — these two are here so a quote can show why they differ.
  base_selling_price?: number
  season_uplift?: {
    season_name: string
    percent: number
    amount: number
    base: number
  } | null
  pax_pricing_table?: any[]
  // NEW: Age-based pricing breakdown
  age_based_pricing?: {
    adult_rate: number
    child_rate: number
    infant_rate: number
    adults_subtotal: number
    children_subtotal: number
    infants_subtotal: number
    child_discount_percent: number
    breakdown: {
      category: string
      count: number
      rate: number
      subtotal: number
      note: string
    }[]
  }
  // Completeness from the hardened core (consolidation Phase D): a rate sheet is
  // deliverable only when complete; holes are surfaced, never fabricated away.
  complete?: boolean
  holes?: { kind: string; message: string }[]
}

// Get transport package for cruise sightseeing (kept for package deals)
async function getTransportPackage(packageType: string, originCity: string, destCity: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_transport_packages')
    .select('*')
    .eq('package_type', packageType)
    .eq('origin_city', originCity)
    .eq('destination_city', destCity)
    .eq('is_active', true)
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

// Select vehicle from transport package based on group size
function selectVehicleFromPackage(pkg: any, numPax: number): { rate: number; vehicle: string } {
  if (numPax <= pkg.sedan_capacity && pkg.sedan_rate) {
    return { rate: pkg.sedan_rate, vehicle: 'Sedan' }
  } else if (numPax <= pkg.minivan_capacity && pkg.minivan_rate) {
    return { rate: pkg.minivan_rate, vehicle: 'Minivan' }
  } else if (numPax <= pkg.van_capacity && pkg.van_rate) {
    return { rate: pkg.van_rate, vehicle: 'Van' }
  } else if (numPax <= pkg.minibus_capacity && pkg.minibus_rate) {
    return { rate: pkg.minibus_rate, vehicle: 'Minibus' }
  } else {
    return { rate: pkg.bus_rate || pkg.minibus_rate, vehicle: 'Bus' }
  }
}

// Select appropriate vehicle from vehicles table based on pax count and tier
async function selectVehicleFromB2CTable(numPax: number, tier: string = 'standard'): Promise<{ rate: number; vehicle: string; id: string } | null> {
  const { data: vehicles, error } = await supabaseAdmin
    .from('vehicles')
    .select('id, vehicle_type, name, daily_rate, passenger_capacity, tier, is_preferred')
    .eq('is_active', true)
    .order('is_preferred', { ascending: false })

  if (error || !vehicles || vehicles.length === 0) return null

  // First try to find a vehicle matching tier and capacity
  let selectedVehicle = vehicles.find((v: any) => 
    v.tier === tier && 
    numPax <= (v.passenger_capacity || 99)
  )

  // Fallback: any vehicle that fits capacity
  if (!selectedVehicle) {
    selectedVehicle = vehicles.find((v: any) => 
      numPax <= (v.passenger_capacity || 99)
    )
  }

  // Final fallback: largest vehicle
  if (!selectedVehicle) {
    selectedVehicle = vehicles[vehicles.length - 1]
  }

  if (!selectedVehicle) return null

  return {
    rate: selectedVehicle.daily_rate || 0,
    vehicle: selectedVehicle.vehicle_type || selectedVehicle.name || 'Vehicle',
    id: selectedVehicle.id
  }
}

// Select guide from guides table based on language and tier
async function selectGuideFromB2CTable(language: string = 'English', tier: string = 'standard'): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: guides, error } = await supabaseAdmin
    .from('guides')
    .select('id, name, daily_rate, languages, tier, is_preferred')
    .eq('is_active', true)
    .contains('languages', [language])
    .order('is_preferred', { ascending: false })

  if (error || !guides || guides.length === 0) {
    // Fallback: any guide
    const { data: anyGuide } = await supabaseAdmin
      .from('guides')
      .select('id, name, daily_rate, tier')
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (!anyGuide || anyGuide.length === 0) return null
    
    return {
      rate: anyGuide[0].daily_rate || 0,
      name: anyGuide[0].name || 'Guide',
      id: anyGuide[0].id
    }
  }

  // Find guide matching tier
  let selectedGuide = guides.find((g: any) => g.tier === tier) || guides[0]

  return {
    rate: selectedGuide.daily_rate || 0,
    name: selectedGuide.name || 'Guide',
    id: selectedGuide.id
  }
}

// Get entrance fee from entrance_fees table
async function getEntranceFee(attractionName: string, isEurPassport: boolean): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: fees, error } = await supabaseAdmin
    .from('entrance_fees')
    .select('id, attraction_name, eur_rate, non_eur_rate')
    .eq('is_active', true)
    .ilike('attraction_name', `%${attractionName}%`)
    .limit(1)

  if (error || !fees || fees.length === 0) return null

  const fee = fees[0]
  const rate = isEurPassport 
    ? (fee.eur_rate || 0) 
    : (fee.non_eur_rate || fee.eur_rate || 0)

  return {
    rate,
    name: fee.attraction_name,
    id: fee.id
  }
}

// Get hotel rate from accommodation_rates table (authoritative per-person rates)
async function getHotelRate(
  city: string,
  tier: string = 'standard',
  isEurPassport: boolean = true
): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: hotels, error } = await supabaseAdmin
    .from('accommodation_rates')
    .select('id, property_name, pp_double_eur, pp_double_non_eur, city, tier')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .eq('tier', tier)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!error && hotels && hotels.length > 0) {
    const rate = isEurPassport ? (hotels[0].pp_double_eur || 0) : (hotels[0].pp_double_non_eur || 0)
    return {
      rate,
      name: hotels[0].property_name || 'Hotel',
      id: hotels[0].id
    }
  }

  // Fallback: try adjacent tiers (never jump to a completely different tier)
  const TIER_FALLBACK: Record<string, string[]> = {
    budget:   ['standard'],
    standard: ['deluxe', 'budget'],
    deluxe:   ['standard', 'luxury'],
    luxury:   ['deluxe']
  }
  const fallbackTiers = TIER_FALLBACK[tier] || []

  for (const fbTier of fallbackTiers) {
    const { data: fbHotels } = await supabaseAdmin
      .from('accommodation_rates')
      .select('id, property_name, pp_double_eur, pp_double_non_eur, city, tier')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .eq('tier', fbTier)
      .order('created_at', { ascending: false })
      .limit(1)

    if (fbHotels && fbHotels.length > 0) {
      const rate = isEurPassport ? (fbHotels[0].pp_double_eur || 0) : (fbHotels[0].pp_double_non_eur || 0)
      console.warn(`⚠️ No ${tier} hotel for ${city} — using ${fbTier} tier: ${fbHotels[0].property_name}`)
      return {
        rate,
        name: fbHotels[0].property_name || 'Hotel',
        id: fbHotels[0].id
      }
    }
  }

  console.warn(`⚠️ No hotel found for ${city} in any tier`)
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // What the org's rate tables are in — the engine labels its result with it,
    // and every currency this route reports is that one.
    const rateCurrency = await getOrgRateCurrency(supabaseAdmin, await getCurrentOrgId())
    const rateSym = currencySymbol(rateCurrency)
    const {
      variation_id,
      // Alternative to variation_id: price a template directly. The engine
      // (calculateAutoPricing) needs only templateId + tier + pax — a variation
      // is a services lookup, not a pricing requirement. Imported programmes
      // (A.T.S catalogue) have itineraries but no variations, and must still
      // be priceable.
      template_id = null,
      num_pax = 2,
      // NEW: Passenger breakdown for child discounts
      num_adults,
      num_children = 0,    // Ages 4-12: 50% discount
      num_infants = 0,     // Ages 0-3: FREE except flights
      flight_cost_per_person = 0,  // Optional flight cost
      travel_date = new Date().toISOString().split('T')[0],
      is_eur_passport = true,
      margin_percent: requestedMargin = null,  // resolved below: request → org default → 25
      partner_id = null,
      include_optionals = false,
      language = 'English',
      tier = 'standard',
      tour_leader_included = false
    } = body
    const margin_percent = resolveMarginPercent({ requested: requestedMargin, orgDefault: await getOrgDefaultMargin(supabaseAdmin, await getCurrentOrgId()) })

    // Determine if using passenger breakdown or simple num_pax
    const usePassengerBreakdown = num_adults !== undefined && num_adults !== null
    const effectiveNumAdults = usePassengerBreakdown ? num_adults : num_pax
    const effectiveNumChildren = usePassengerBreakdown ? (num_children || 0) : 0
    const effectiveNumInfants = usePassengerBreakdown ? (num_infants || 0) : 0
    const effectiveTotalPax = effectiveNumAdults + effectiveNumChildren + effectiveNumInfants

    console.log('📥 B2B Calculate Price Request:', {
      variation_id,
      num_pax: effectiveTotalPax,
      num_adults: effectiveNumAdults,
      num_children: effectiveNumChildren,
      num_infants: effectiveNumInfants,
      usePassengerBreakdown,
      tour_leader_included,
      is_eur_passport,
      margin_percent
    })

    if (!variation_id && !template_id) {
      return NextResponse.json({ error: 'variation_id or template_id is required' }, { status: 400 })
    }

    let variation: any
    if (variation_id) {
      // Fetch variation with template info
      const { data: varRow, error: varError } = await supabaseAdmin
        .from('tour_variations')
        .select(`
          id, variation_name, variation_code, tier, group_type, min_pax, max_pax,
          tour_templates (id, template_name, template_code, duration_days, uses_day_builder, pricing_mode)
        `)
        .eq('id', variation_id)
        .single()

      if (varError || !varRow) {
        console.error('Variation fetch error:', varError)
        return NextResponse.json({ error: 'Variation not found' }, { status: 404 })
      }
      variation = varRow
    } else {
      // Template-direct: synthesize the variation shape the rest of this route
      // expects. No services row exists, so the auto-pricing fallback below is
      // the path that will actually price it.
      const { data: templateRow, error: tplError } = await supabaseAdmin
        .from('tour_templates')
        .select('id, template_name, template_code, duration_days, uses_day_builder, pricing_mode')
        .eq('id', template_id)
        .single()

      if (tplError || !templateRow) {
        console.error('Template fetch error:', tplError)
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      variation = {
        id: null,
        variation_name: `${templateRow.template_name} (${tier})`,
        variation_code: null,
        tier,
        group_type: 'private',
        min_pax: 1,
        max_pax: 15,
        tour_templates: templateRow,
      }
    }

    const effectiveTier = (variation.tier || tier) as ServiceTier
    const template = variation.tour_templates as any
    const templateId = template?.id

    // Fetch services for this variation (template-direct requests have none).
    let services: any[] | null = null
    if (variation_id) {
      const { data: serviceRows, error: servError } = await supabaseAdmin
        .from('tour_variation_services')
        .select('*')
        .eq('variation_id', variation_id)
        .order('sequence_order')

      if (servError) {
        console.error('Services fetch error:', servError)
        return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
      }
      services = serviceRows
    }

    // ============================================
    // AUTO-PRICING FALLBACK
    // If no services AND template uses day builder, use auto-pricing
    // ============================================
    if ((!services || services.length === 0) && templateId) {
      console.log('📊 No variation services found, using auto-pricing fallback')
      console.log(`   tourLeaderIncluded: ${tour_leader_included}`)
      console.log(`   usePassengerBreakdown: ${usePassengerBreakdown}`)

      // Determine effective margin (partner override)
      let effectiveMargin = margin_percent
      if (partner_id) {
        const { data: partner } = await supabaseAdmin
          .from('b2b_partners')
          .select('default_margin_percent')
          .eq('id', partner_id)
          .single()

        if (partner?.default_margin_percent) {
          effectiveMargin = partner.default_margin_percent
        }
      }

      // Use passenger breakdown pricing if breakdown is provided
      let autoPriceResult
      if (usePassengerBreakdown && (effectiveNumChildren > 0 || effectiveNumInfants > 0)) {
        console.log('🧒 Using age-based pricing with child/infant discounts')
        autoPriceResult = await calculatePricingWithPassengerBreakdown({
          // Whose calendar, and which departure — the premium needs both, and
          // the engine charges nothing without them.
          orgId: await getCurrentOrgId() ?? undefined,
          rateCurrency,
          travelDate: travel_date,
          templateId,
          tier: effectiveTier,
          numPax: effectiveTotalPax,
          passengers: {
            numAdults: effectiveNumAdults,
            numChildren: effectiveNumChildren,
            numInfants: effectiveNumInfants
          },
          isEurPassport: is_eur_passport,
          language,
          marginPercent: effectiveMargin,
          mealPlan: 'lunch_only',
          includeAccommodation: (template?.duration_days || 1) > 1,
          tourLeaderIncluded: tour_leader_included,
          flightCostPerPerson: flight_cost_per_person
        })
      } else {
        // Call standard auto-pricing service
        autoPriceResult = await calculateAutoPricing({
          orgId: await getCurrentOrgId() ?? undefined,
          rateCurrency,
          travelDate: travel_date,
          templateId,
          tier: effectiveTier,
          numPax: effectiveTotalPax,
          isEurPassport: is_eur_passport,
          language,
          marginPercent: effectiveMargin,
          mealPlan: 'lunch_only',
          includeAccommodation: (template?.duration_days || 1) > 1,
          tourLeaderIncluded: tour_leader_included
        })
      }

      if (!autoPriceResult.success) {
        return NextResponse.json({ 
          error: 'Auto-pricing failed', 
          warnings: autoPriceResult.warnings 
        }, { status: 500 })
      }

      // Convert auto-pricing result to B2B format
      const convertedServices: CalculatedService[] = autoPriceResult.services.map(s => ({
        service_id: s.id,
        service_name: s.serviceName,
        service_category: s.serviceType,
        rate_type: s.serviceType,
        rate_source: s.rateSource,
        quantity_mode: s.quantityMode,
        quantity: s.quantity,
        unit_cost: s.unitCost,
        line_total: s.lineTotal,
        is_optional: s.isOptional,
        day_number: s.dayNumber,
        pricing_note: s.notes
      }))

      const convertedOptional: CalculatedService[] = autoPriceResult.optionalServices.map(s => ({
        service_id: s.id,
        service_name: s.serviceName,
        service_category: s.serviceType,
        rate_type: s.serviceType,
        rate_source: s.rateSource,
        quantity_mode: s.quantityMode,
        quantity: s.quantity,
        unit_cost: s.unitCost,
        line_total: s.lineTotal,
        is_optional: true,
        day_number: s.dayNumber,
        pricing_note: s.notes
      }))

      // Extract age-based pricing if available
      const ageBasedPricingData = (autoPriceResult as any).ageBasedPricing

      const result: PriceCalculationResult = {
        variation_id: variation.id,
        variation_name: variation.variation_name,
        template_name: template?.template_name || '',
        num_pax: effectiveTotalPax,
        num_adults: usePassengerBreakdown ? effectiveNumAdults : undefined,
        num_children: usePassengerBreakdown ? effectiveNumChildren : undefined,
        num_infants: usePassengerBreakdown ? effectiveNumInfants : undefined,
        travel_date,
        is_eur_passport,
        tour_leader_included,
        services: convertedServices,
        optional_services: convertedOptional,
        subtotal_cost: autoPriceResult.subtotalCost,
        optional_total: autoPriceResult.optionalTotal,
        total_cost: autoPriceResult.totalCost,
        tour_leader_cost: autoPriceResult.tourLeaderCost,
        margin_percent: autoPriceResult.marginPercent,
        margin_amount: autoPriceResult.marginAmount,
        selling_price: autoPriceResult.sellingPrice,
        price_per_person: autoPriceResult.pricePerPerson,
        single_supplement: autoPriceResult.singleSupplement ?? 0,
        currency: autoPriceResult.currency,
        base_selling_price: autoPriceResult.baseSellingPrice,
        season_uplift: autoPriceResult.seasonUplift
          ? {
              season_name: autoPriceResult.seasonUplift.seasonName ?? '',
              percent: autoPriceResult.seasonUplift.percent,
              amount: autoPriceResult.seasonUplift.amount,
              base: autoPriceResult.seasonUplift.base,
            }
          : null,
        pax_pricing_table: autoPriceResult.paxPricingTable,
        // Include age-based pricing breakdown if available
        age_based_pricing: ageBasedPricingData ? {
          adult_rate: ageBasedPricingData.adultRate,
          child_rate: ageBasedPricingData.childRate,
          infant_rate: ageBasedPricingData.infantRate,
          adults_subtotal: ageBasedPricingData.adultsSubtotal,
          children_subtotal: ageBasedPricingData.childrenSubtotal,
          infants_subtotal: ageBasedPricingData.infantsSubtotal,
          child_discount_percent: CHILD_DISCOUNT_PERCENT,
          breakdown: ageBasedPricingData.breakdown
        } : undefined,
        // Propagate completeness from the hardened engine — never silently
        // present an under-backed rate sheet as final.
        complete: autoPriceResult.complete,
        holes: autoPriceResult.holes?.map(h => ({ kind: h.kind, message: h.message })),
      }

      console.log('🎉 B2B Price calculated via auto-pricing:', {
        variation: variation.variation_name,
        numPax: effectiveTotalPax,
        numAdults: effectiveNumAdults,
        numChildren: effectiveNumChildren,
        numInfants: effectiveNumInfants,
        tourLeader: tour_leader_included,
        cost: result.total_cost,
        tourLeaderCost: result.tour_leader_cost,
        margin: effectiveMargin + '%',
        selling: result.selling_price,
        perPerson: result.price_per_person,
        singleSupplement: result.single_supplement,
        hasAgeBasedPricing: !!result.age_based_pricing
      })

      return NextResponse.json({ success: true, data: result })
    }

    // ============================================
    // ORIGINAL LOGIC: Process tour_variation_services
    // ============================================

    // Determine effective margin (partner override)
    let effectiveMargin = margin_percent
    if (partner_id) {
      const { data: partner } = await supabaseAdmin
        .from('b2b_partners')
        .select('default_margin_percent')
        .eq('id', partner_id)
        .single()
      
      if (partner?.default_margin_percent) {
        effectiveMargin = partner.default_margin_percent
      }

      const { data: override } = await supabaseAdmin
        .from('b2b_partner_pricing')
        .select('margin_percent_override')
        .eq('partner_id', partner_id)
        .eq('variation_id', variation_id)
        .eq('is_active', true)
        .single()
      
      if (override?.margin_percent_override) {
        effectiveMargin = override.margin_percent_override
      }
    }

    const calculatedServices: CalculatedService[] = []
    const optionalServices: CalculatedService[] = []
    let subtotalCost = 0
    let optionalTotal = 0

    // Process each service
    for (const service of (services || [])) {
      let unitCost = 0
      let lineTotal = 0
      let rateSource = 'manual'
      let pricingNote = ''
      let effectiveQuantityMode = service.quantity_mode || 'per_pax'

      // ============================================
      // STEP 1: Tiered activity pricing from the catalog (volume discounts
      // like felucca). Lives on activity_rates.tiers now — the old
      // b2b_pricing_rules lookup pointed at a table that was empty in
      // production since launch, so tiered pricing never actually fired.
      // ============================================
      if (service.rate_type === 'activity' && service.service_name) {
        const tiered = await getTieredActivityRate(supabaseAdmin, service.service_name)

        if (tiered) {
          const priceResult = applyActivityTiers(tiered.tiers, num_pax, is_eur_passport, rateSym)
          unitCost = priceResult.unitCost
          lineTotal = priceResult.lineTotal
          pricingNote = priceResult.pricingNote
          effectiveQuantityMode = priceResult.quantityMode
          rateSource = 'activity_tiers'

          console.log(`✅ Tiered activity rate: ${tiered.activity_name} -> ${pricingNote}`)
        }
      }

      // ============================================
      // STEP 2: Check for B2B transport packages (cruise sightseeing)
      // ============================================
      if (rateSource === 'manual' && service.service_category === 'transportation') {
        if (service.service_name?.toLowerCase().includes('sightseeing')) {
          const pkg = await getTransportPackage('cruise_sightseeing', 'Luxor', 'Aswan')
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'
            console.log(`✅ B2B Package applied: ${service.service_name} -> ${pricingNote}`)
          }
        }
        else if (service.service_name?.toLowerCase().includes('transfer') || 
                 service.service_name?.toLowerCase().includes('airport')) {
          const pkg = await getTransportPackage('cruise_transfer', 'Luxor', 'Aswan')
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'
          }
        }
      }

      // ============================================
      // STEP 3: Use B2C tables for standard lookups
      // ============================================
      if (rateSource === 'manual') {
        const rateType = service.rate_type || service.service_category

        switch (rateType) {
          case 'transportation': {
            const vehicle = await selectVehicleFromB2CTable(num_pax, effectiveTier)
            if (vehicle) {
              unitCost = vehicle.rate
              lineTotal = vehicle.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate}/day`
              rateSource = 'vehicles'
              console.log(`✅ Vehicle from B2C: ${vehicle.vehicle} -> ${rateSym}${vehicle.rate}`)
            }
            break
          }

          case 'guide': {
            const guide = await selectGuideFromB2CTable(language, effectiveTier)
            if (guide) {
              unitCost = guide.rate
              lineTotal = guide.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${guide.name}: ${rateSym}${guide.rate}/day`
              rateSource = 'guides'
              console.log(`✅ Guide from B2C: ${guide.name} -> ${rateSym}${guide.rate}`)
            }
            break
          }

          case 'activity':
          case 'entrance': {
            if (service.service_name) {
              const fee = await getEntranceFee(service.service_name, is_eur_passport)
              if (fee) {
                unitCost = fee.rate
                lineTotal = fee.rate * num_pax
                effectiveQuantityMode = 'per_pax'
                pricingNote = `${fee.name}: ${rateSym}${fee.rate}/pax (${is_eur_passport ? 'EUR' : 'non-EUR'})`
                rateSource = 'entrance_fees'
                console.log(`✅ Entrance from B2C: ${fee.name} -> ${rateSym}${fee.rate}/pax`)
              }
            }
            break
          }

          case 'accommodation': {
            // rate_double_eur is per-person (double occupancy), not per-room
            const hotel = await getHotelRate(service.city || 'Cairo', effectiveTier, is_eur_passport)
            if (hotel) {
              unitCost = hotel.rate
              lineTotal = hotel.rate * num_pax
              effectiveQuantityMode = 'per_pax'
              pricingNote = `${hotel.name}: ${rateSym}${hotel.rate}/pax (double occupancy)`
              rateSource = 'accommodation_rates'
              console.log(`✅ Hotel: ${hotel.name} -> ${rateSym}${hotel.rate}/pax (${effectiveTier})`)
            }
            break
          }

          case 'cruise': {
            // Cruise rates from nile_cruises table
            if (service.rate_id) {
              const { data: cruise } = await supabaseAdmin
                .from('nile_cruises')
                .select('*')
                .eq('id', service.rate_id)
                .single()

              if (cruise) {
                if (num_pax === 1 && cruise.rate_single_eur) {
                  unitCost = cruise.rate_single_eur
                  pricingNote = 'Single occupancy'
                } else if (num_pax >= 3 && cruise.rate_triple_eur) {
                  unitCost = cruise.rate_triple_eur
                  pricingNote = 'Triple occupancy'
                } else {
                  unitCost = cruise.rate_double_eur || 0
                  pricingNote = 'Double occupancy'
                }
                lineTotal = unitCost * num_pax
                effectiveQuantityMode = 'per_pax'
                rateSource = 'nile_cruises'
                console.log(`✅ Cruise from B2C: ${cruise.ship_name} -> ${rateSym}${unitCost}/pax`)
              }
            }
            break
          }

          case 'meal': {
            const { data: mealRate } = await supabaseAdmin
              .from('meal_rates')
              .select('*')
              .eq('is_active', true)
              .limit(1)
              .single()

            if (mealRate) {
              if (service.service_name?.toLowerCase().includes('dinner')) {
                unitCost = mealRate.dinner_rate_eur || 0
              } else {
                unitCost = mealRate.lunch_rate_eur || 0
              }
              lineTotal = unitCost * num_pax
              effectiveQuantityMode = 'per_pax'
              pricingNote = `${rateSym}${unitCost}/pax`
              rateSource = 'meal_rates'
              console.log(`✅ Meal from B2C: ${service.service_name} -> ${rateSym}${unitCost}/pax`)
            }
            break
          }
        }
      }

      // ============================================
      // STEP 4: Fall back to stored cost_per_unit
      // ============================================
      if (rateSource === 'manual' && service.cost_per_unit) {
        unitCost = service.cost_per_unit
        rateSource = 'stored'
        console.log(`⚠️ Fallback to stored: ${service.service_name} -> ${rateSym}${unitCost}`)
      }

      // ============================================
      // STEP 5: Calculate line total if not already set
      // ============================================
      if (lineTotal === 0 && unitCost > 0) {
        let quantity = service.quantity_value || 1

        switch (effectiveQuantityMode) {
          case 'per_pax':
            quantity = (service.quantity_value || 1) * num_pax
            break
          case 'per_group':
          case 'fixed':
            quantity = service.quantity_value || 1
            break
          case 'per_day':
            quantity = (service.quantity_value || 1) * (template?.duration_days || 1)
            break
          case 'per_night':
            quantity = (service.quantity_value || 1) * ((template?.duration_days || 1) - 1)
            break
          case 'per_room':
            quantity = Math.ceil(num_pax / 2)
            break
        }

        lineTotal = unitCost * quantity
      }

      const calculatedService: CalculatedService = {
        service_id: service.id,
        service_name: service.service_name,
        service_category: service.service_category,
        rate_type: service.rate_type,
        rate_source: rateSource,
        quantity_mode: effectiveQuantityMode,
        quantity: effectiveQuantityMode === 'fixed' ? 1 : (service.quantity_value || 1) * (effectiveQuantityMode === 'per_pax' ? num_pax : 1),
        unit_cost: Math.round(unitCost * 100) / 100,
        line_total: Math.round(lineTotal * 100) / 100,
        is_optional: service.is_optional || false,
        day_number: service.day_number,
        pricing_note: pricingNote || undefined
      }

      if (service.is_optional) {
        optionalServices.push(calculatedService)
        if (include_optionals) optionalTotal += lineTotal
      } else {
        calculatedServices.push(calculatedService)
        subtotalCost += lineTotal
      }
    }

    // Calculate totals
    const totalCost = subtotalCost + (include_optionals ? optionalTotal : 0)
    const marginAmount = totalCost * (effectiveMargin / 100)
    const baseSellingPrice = totalCost + marginAmount

    // The operator's demand premium, on this path too. A variation that happens
    // to carry its own service rows must not quote Golden Week at the ordinary
    // price while the day-builder path charges 15% more for the same departure.
    const demandSeason = seasonForDate(
      await loadSeasonWindows(await getCurrentOrgId() ?? undefined, travel_date),
      travel_date
    )
    const uplift = computeUplift({ sellingPrice: baseSellingPrice, season: demandSeason })
    const upliftAmount = Math.round(uplift.amount * 100) / 100
    const sellingPrice = baseSellingPrice + upliftAmount
    const pricePerPerson = sellingPrice / num_pax

    const result: PriceCalculationResult = {
      variation_id: variation.id,
      variation_name: variation.variation_name,
      template_name: template?.template_name || '',
      num_pax,
      travel_date,
      is_eur_passport,
      tour_leader_included,  // NEW
      services: calculatedServices,
      optional_services: optionalServices,
      subtotal_cost: Math.round(subtotalCost * 100) / 100,
      optional_total: Math.round(optionalTotal * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      tour_leader_cost: 0,  // Not calculated in legacy mode
      margin_percent: effectiveMargin,
      margin_amount: Math.round(marginAmount * 100) / 100,
      selling_price: Math.round(sellingPrice * 100) / 100,
      price_per_person: Math.round(pricePerPerson * 100) / 100,
      single_supplement: 0,  // Not calculated in legacy mode
      currency: rateCurrency,
      base_selling_price: Math.round(baseSellingPrice * 100) / 100,
      season_uplift: demandSeason
        ? {
            season_name: demandSeason.name,
            percent: demandSeason.upliftPercent,
            amount: upliftAmount,
            base: Math.round(uplift.base * 100) / 100,
          }
        : null,
    }

    console.log('🎉 B2B Price calculated:', {
      variation: variation.variation_name,
      numPax: num_pax,
      cost: totalCost,
      margin: effectiveMargin + '%',
      selling: sellingPrice
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('❌ Error calculating tour price:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const variation_id = searchParams.get('variation_id')
  const num_pax = parseInt(searchParams.get('num_pax') || '2')
  // NEW: Support passenger breakdown in GET params
  const num_adults = searchParams.get('num_adults') ? parseInt(searchParams.get('num_adults')!) : undefined
  const num_children = parseInt(searchParams.get('num_children') || '0')
  const num_infants = parseInt(searchParams.get('num_infants') || '0')
  const flight_cost = parseFloat(searchParams.get('flight_cost_per_person') || '0')
  const travel_date = searchParams.get('travel_date') || new Date().toISOString().split('T')[0]
  const is_eur = searchParams.get('is_eur') !== 'false'
  const margin = parseFloat(searchParams.get('margin') || '25')
  const tour_leader = searchParams.get('tour_leader') === 'true'

  if (!variation_id) {
    return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
  }

  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({
      variation_id,
      num_pax,
      num_adults,
      num_children,
      num_infants,
      flight_cost_per_person: flight_cost,
      travel_date,
      is_eur_passport: is_eur,
      margin_percent: margin,
      tour_leader_included: tour_leader
    })
  })

  return POST(mockRequest)
}