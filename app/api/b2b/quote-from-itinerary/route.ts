import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { loadSeasonWindows } from '@/lib/auto-pricing-service'
import { computeUplift, seasonForDate } from '@/lib/pricing/season-uplift'
import { usableRate } from '@/lib/pricing/usable-rate'
import { currencySymbol } from '@/lib/currency-totals'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { getCurrentOrgId } from '@/lib/auth/current-org'

// ============================================
// B2B QUOTE FROM ITINERARY API
// File: app/api/b2b/quote-from-itinerary/route.ts
//
// Creates a B2B quote from a WhatsApp-parsed itinerary.
// Re-prices services using B2B rate tables and partner margins.
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// HELPER FUNCTIONS (same as calculate-price/route.ts)
// ============================================

async function getB2BPricingRule(serviceName: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_pricing_rules')
    .select('*')
    .eq('is_active', true)
    .ilike('service_name', `%${serviceName.split(' ')[0]}%`)
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

function applyB2BPricingRule(
  rule: any,
  numPax: number
, rateSym: string): { unitCost: number; lineTotal: number; pricingNote: string; quantityMode: string } {
  const model = rule.pricing_model

  switch (model) {
    case 'per_unit': {
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 999)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || 'Small'
      } else if (rule.tier2_max_pax && numPax <= rule.tier2_max_pax) {
        rate = rule.tier2_rate_eur
        label = rule.tier2_label || 'Large'
      } else {
        const largeCapacity = rule.tier2_max_pax || rule.tier1_max_pax || 8
        const largeRate = rule.tier2_rate_eur || rule.tier1_rate_eur
        const unitsNeeded = Math.ceil(numPax / largeCapacity)
        const totalCost = largeRate * unitsNeeded

        return {
          unitCost: totalCost,
          lineTotal: totalCost,
          pricingNote: `${unitsNeeded}x ${rule.tier2_label || rule.unit_type} @ ${rateSym}${largeRate} = ${rateSym}${totalCost}`,
          quantityMode: 'fixed'
        }
      }

      return {
        unitCost: rate,
        lineTotal: rate,
        pricingNote: `${label}: ${rateSym}${rate} flat`,
        quantityMode: 'fixed'
      }
    }

    case 'tiered': {
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 2)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || `1-${rule.tier1_max_pax}`
      } else if (numPax <= (rule.tier2_max_pax || 10)) {
        rate = rule.tier2_rate_eur
        label = rule.tier2_label || `${rule.tier1_max_pax + 1}-${rule.tier2_max_pax}`
      } else if (numPax <= (rule.tier3_max_pax || 20)) {
        rate = rule.tier3_rate_eur
        label = rule.tier3_label || `${rule.tier2_max_pax + 1}-${rule.tier3_max_pax}`
      } else {
        rate = rule.tier4_rate_eur || rule.tier3_rate_eur
        label = rule.tier4_label || `${rule.tier3_max_pax + 1}+`
      }

      return {
        unitCost: rate,
        lineTotal: rate * numPax,
        pricingNote: `${label}: ${rateSym}${rate}/pax × ${numPax} = ${rateSym}${rate * numPax}`,
        quantityMode: 'per_pax'
      }
    }

    default:
      return {
        unitCost: rule.tier1_rate_eur || 0,
        lineTotal: (rule.tier1_rate_eur || 0) * numPax,
        pricingNote: 'Per person',
        quantityMode: 'per_pax'
      }
  }
}

async function selectVehicleFromB2CTable(numPax: number, tier: string = 'standard'): Promise<{ rate: number; vehicle: string; id: string } | null> {
  const { data: vehicles, error } = await supabaseAdmin
    .from('vehicles')
    .select('id, vehicle_type, name, daily_rate, passenger_capacity, tier, is_preferred')
    .eq('is_active', true)
    .order('is_preferred', { ascending: false })

  if (error || !vehicles || vehicles.length === 0) return null

  let selectedVehicle = vehicles.find((v: any) =>
    v.tier === tier &&
    numPax <= (v.passenger_capacity || 99)
  )

  if (!selectedVehicle) {
    selectedVehicle = vehicles.find((v: any) =>
      numPax <= (v.passenger_capacity || 99)
    )
  }

  if (!selectedVehicle) {
    selectedVehicle = vehicles[vehicles.length - 1]
  }

  if (!selectedVehicle) return null

  // A vehicle on file with no daily rate is not a €0 vehicle — it is a vehicle
  // nobody has priced yet, and the caller must keep the cost it already had.
  const rate = usableRate(selectedVehicle.daily_rate)
  if (rate === null) return null

  return {
    rate,
    vehicle: selectedVehicle.vehicle_type || selectedVehicle.name || 'Vehicle',
    id: selectedVehicle.id
  }
}

async function selectGuideFromB2CTable(language: string = 'English', tier: string = 'standard'): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: guides, error } = await supabaseAdmin
    .from('guides')
    .select('id, name, daily_rate, languages, tier, is_preferred')
    .eq('is_active', true)
    .contains('languages', [language])
    .order('is_preferred', { ascending: false })

  if (error || !guides || guides.length === 0) {
    const { data: anyGuide } = await supabaseAdmin
      .from('guides')
      .select('id, name, daily_rate, tier')
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (!anyGuide || anyGuide.length === 0) return null

    const anyRate = usableRate(anyGuide[0].daily_rate)
    if (anyRate === null) return null

    return {
      rate: anyRate,
      name: anyGuide[0].name || 'Guide',
      id: anyGuide[0].id
    }
  }

  // Prefer a guide of the right tier who HAS a rate. Most of this table has no
  // daily_rate at all, and picking the first name in the list handed the caller
  // a zero that wiped the itinerary's own guide cost.
  const priced = guides.filter((g: any) => usableRate(g.daily_rate) !== null)
  if (priced.length === 0) return null
  const selectedGuide = priced.find((g: any) => g.tier === tier) || priced[0]

  return {
    rate: usableRate(selectedGuide.daily_rate)!,
    name: selectedGuide.name || 'Guide',
    id: selectedGuide.id
  }
}

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
    ? usableRate(fee.eur_rate)
    : usableRate(fee.non_eur_rate) ?? usableRate(fee.eur_rate)
  if (rate === null) return null

  return {
    rate,
    name: fee.attraction_name,
    id: fee.id
  }
}

// Get hotel rate from accommodation_rates table (per-person pricing with single supplement)
async function getHotelRate(
  city: string,
  tier: string = 'standard',
  isEurPassport: boolean = true
): Promise<{ rate: number; singleRate: number; name: string; id: string } | null> {
  const { data: hotels, error } = await supabaseAdmin
    .from('accommodation_rates')
    .select('id, property_name, pp_double_eur, pp_double_non_eur, single_supp_eur, single_supp_non_eur, city, tier')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .eq('tier', tier)
    .order('created_at', { ascending: false })
    .limit(1)

  const ppdOf = (row: any) =>
    usableRate(isEurPassport ? row.pp_double_eur : row.pp_double_non_eur)

  // A property row with no per-person rate falls through to the tier fallback
  // below, and then to null — never out as a free room.
  if (!error && hotels && hotels.length > 0 && ppdOf(hotels[0]) !== null) {
    const ppd = ppdOf(hotels[0])!
    const singleSupp = (isEurPassport ? hotels[0].single_supp_eur : hotels[0].single_supp_non_eur) || 0
    return {
      rate: ppd,
      singleRate: ppd + singleSupp,
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
      .select('id, property_name, pp_double_eur, pp_double_non_eur, single_supp_eur, single_supp_non_eur, city, tier')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .eq('tier', fbTier)
      .order('created_at', { ascending: false })
      .limit(1)

    if (fbHotels && fbHotels.length > 0 && ppdOf(fbHotels[0]) !== null) {
      const ppd = ppdOf(fbHotels[0])!
      const singleSupp = (isEurPassport ? fbHotels[0].single_supp_eur : fbHotels[0].single_supp_non_eur) || 0
      console.warn(`⚠️ No ${tier} hotel for ${city} — using ${fbTier} tier: ${fbHotels[0].property_name}`)
      return {
        rate: ppd,
        singleRate: ppd + singleSupp,
        name: fbHotels[0].property_name || 'Hotel',
        id: fbHotels[0].id
      }
    }
  }

  console.warn(`⚠️ No hotel found for ${city} in any tier`)
  return null
}

// ============================================
// MAIN HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      itinerary_id,
      partner_id = null,
      margin_percent: requestedMargin = null,  // resolved below: request → org default → 25
      tour_leader_included = false,
      is_eur_passport = true,
      language = 'English',
    } = body
    const margin_percent = resolveMarginPercent({ requested: requestedMargin, orgDefault: await getOrgDefaultMargin(supabaseAdmin, await getCurrentOrgId()) })

    if (!itinerary_id) {
      return NextResponse.json(
        { success: false, error: 'itinerary_id is required' },
        { status: 400 }
      )
    }

    console.log('📥 B2B Quote from Itinerary:', { itinerary_id, partner_id, margin_percent, tour_leader_included })

    // 1. Fetch the itinerary
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('id', itinerary_id)
      .single()

    if (itinError || !itinerary) {
      console.error('Itinerary not found:', itinError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // 2. Fetch itinerary days with services
    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select(`
        *,
        itinerary_services (*)
      `)
      .eq('itinerary_id', itinerary_id)
      .order('day_number')

    if (daysError) {
      console.error('Failed to fetch itinerary days:', daysError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch itinerary days' },
        { status: 500 }
      )
    }

    // 3. Determine partner margin override
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

    const tier = itinerary.tier || 'standard'
    const numPax = (itinerary.num_adults || 2) + (itinerary.num_children || 0)

    // The operator's own high dates, judged on the itinerary's DEPARTURE — the
    // same calendar and the same rule as the template engine, so a quote built
    // from an itinerary cannot disagree with one built from a programme.
    const orgId = await getCurrentOrgId()
    // What the rate tables (and services' supplier_cost_original) are in.
    const rateCurrency = await getOrgRateCurrency(supabaseAdmin, orgId)
    const rateSym = currencySymbol(rateCurrency)
    const departureDate: string | null = itinerary.start_date
      ? String(itinerary.start_date).slice(0, 10)
      : null
    const season = seasonForDate(
      await loadSeasonWindows(orgId ?? undefined, departureDate ?? undefined),
      departureDate
    )

    console.log('📊 Pricing context:', { tier, numPax, season: season?.name ?? null, effectiveMargin })

    // 4. Re-price each service using B2B rate tables
    // Meal rates fetched ONCE here (was a query per meal service inside the
    // loop) and resolved by meal_type/base_rate_eur — the shape the meals
    // rates UI writes — with the legacy lunch/dinner columns as fallback.
    const { data: allMealRates } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
    const mealRateFor = (mealType: 'lunch' | 'dinner'): number => {
      const typed = (allMealRates || []).filter(
        (r: any) => r.meal_type?.toLowerCase() === mealType && (r.base_rate_eur || 0) > 0
      )
      if (typed.length > 0) {
        return typed.reduce((sum: number, r: any) => sum + (r.base_rate_eur || 0), 0) / typed.length
      }
      const legacyCol = mealType === 'lunch' ? 'lunch_rate_eur' : 'dinner_rate_eur'
      const legacy = (allMealRates || []).find((r: any) => (r[legacyCol] || 0) > 0)
      return legacy ? legacy[legacyCol] : 0
    }

    const servicesSnapshot: any[] = []
    let subtotalCost = 0

    for (const day of (days || [])) {
      const dayServices = day.itinerary_services || []

      for (const svc of dayServices) {
        // Every re-priced line below is EUR (B2B rate tables are EUR), so
        // lines KEPT from the itinerary must be normalized to the rate currency
        // too — itinerary_services.total_cost is stored in the itinerary's
        // display currency (e.g. JPY). service-creation stamps supplier_currency
        // / supplier_cost_original / exchange_rate_used for exactly this.
        const eurLineTotal =
          svc.supplier_currency === rateCurrency && svc.supplier_cost_original != null
            ? Number(svc.supplier_cost_original) || 0
            : Number(svc.exchange_rate_used) > 0
              ? (Number(svc.total_cost) || 0) / Number(svc.exchange_rate_used)
              : Number(svc.total_cost) || 0

        let unitCost = svc.rate_eur || eurLineTotal
        let lineTotal = eurLineTotal
        let rateSource = 'itinerary'
        let quantityMode = svc.quantity > 1 ? 'per_pax' : 'fixed'
        let pricingNote = ''

        const serviceType = svc.service_type || ''
        const serviceName = svc.service_name || ''

        // Every branch below re-prices a line the ITINERARY already priced.
        // The invariant: a lookup may only override that price when it comes
        // back with a rate somebody can charge. A half-filled rate table used
        // to overwrite a real cost with zero and the line silently became free.
        //
        // Try B2B-specific pricing for activities/entrance fees
        if (serviceType === 'entrance' || serviceType === 'activity') {
          // Check B2B pricing rules first (tiered pricing like felucca)
          const b2bRule = await getB2BPricingRule(serviceName)
          const ruleResult = b2bRule ? applyB2BPricingRule(b2bRule, numPax, rateSym) : null
          if (ruleResult && usableRate(ruleResult.lineTotal) !== null) {
            const priceResult = ruleResult
            unitCost = priceResult.unitCost
            lineTotal = priceResult.lineTotal
            quantityMode = priceResult.quantityMode
            pricingNote = priceResult.pricingNote
            rateSource = 'b2b_rule'
          } else {
            // Try entrance_fees table
            const fee = await getEntranceFee(serviceName, is_eur_passport)
            if (fee) {
              unitCost = fee.rate
              lineTotal = fee.rate * numPax
              quantityMode = 'per_pax'
              pricingNote = `${fee.name}: ${rateSym}${fee.rate}/pax (${is_eur_passport ? 'EUR' : 'non-EUR'})`
              rateSource = 'entrance_fees'
            }
          }
        }

        // Transportation — re-price ONLY generic day-tour vehicles. Airport
        // transfers and the bundled cruise transport package have their own
        // (very different) pricing; flattening a €25 transfer or a multi-day
        // €500 cruise bundle to one vehicle day-rate mispriced both. Those
        // keep their stored (EUR-normalized) cost.
        if (serviceType === 'transportation') {
          const isTransferOrBundle =
            svc.service_code === 'CRUISE-TRANSPORT' ||
            /transfer|cruise transport|airport/i.test(serviceName)
          if (isTransferOrBundle) {
            pricingNote = `Kept itinerary rate (transfer/bundled transport): ${rateSym}${Math.round(eurLineTotal * 100) / 100}`
          } else {
            const vehicle = await selectVehicleFromB2CTable(numPax, tier)
            if (vehicle) {
              unitCost = vehicle.rate
              lineTotal = vehicle.rate
              quantityMode = 'fixed'
              pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate}/day`
              rateSource = 'vehicles'
            }
          }
        }

        // Guide
        if (serviceType === 'guide') {
          const guide = await selectGuideFromB2CTable(language, tier)
          if (guide) {
            unitCost = guide.rate
            lineTotal = guide.rate
            quantityMode = 'fixed'
            pricingNote = `${guide.name}: ${rateSym}${guide.rate}/day`
            rateSource = 'guides'
          }
        }

        // Accommodation (hotel) - rate_double_eur is per-person (double occupancy)
        if (serviceType === 'hotel' || serviceType === 'accommodation') {
          const dayCity = day.city || day.overnight_location || 'Cairo'
          const hotel = await getHotelRate(dayCity, tier, is_eur_passport)
          if (hotel) {
            unitCost = hotel.rate
            lineTotal = hotel.rate * numPax
            quantityMode = 'per_pax'
            pricingNote = `${hotel.name}: ${rateSym}${hotel.rate}/pax (double occupancy)`
            rateSource = 'accommodation_rates'
          }
        }

        // Meals
        if (serviceType === 'meal') {
          const mealRate = mealRateFor(serviceName.toLowerCase().includes('dinner') ? 'dinner' : 'lunch')
          if (mealRate > 0) {
            unitCost = mealRate
            lineTotal = unitCost * numPax
            quantityMode = 'per_pax'
            pricingNote = `${rateSym}${Math.round(unitCost * 100) / 100}/pax`
            rateSource = 'meal_rates'
          }
        }

        // Cruise
        if (serviceType === 'cruise') {
          // Keep existing cruise pricing from itinerary
          rateSource = 'itinerary'
        }

        subtotalCost += lineTotal

        servicesSnapshot.push({
          service_id: svc.id,
          service_name: serviceName,
          service_category: serviceType,
          rate_type: serviceType,
          rate_source: rateSource,
          quantity_mode: quantityMode,
          quantity: quantityMode === 'per_pax' ? numPax : 1,
          unit_cost: Math.round(unitCost * 100) / 100,
          line_total: Math.round(lineTotal * 100) / 100,
          is_optional: false,
          day_number: day.day_number,
          pricing_note: pricingNote || undefined
        })
      }
    }

    // 5. Calculate tour leader cost
    let tourLeaderCost = 0
    if (tour_leader_included) {
      const guide = await selectGuideFromB2CTable(language, tier)
      const vehicle = await selectVehicleFromB2CTable(numPax + 1, tier)
      const guideRate = guide?.rate || 0
      const baseVehicle = await selectVehicleFromB2CTable(numPax, tier)
      const vehicleDiff = vehicle ? (vehicle.rate - (baseVehicle?.rate ?? 0)) : 0
      const touringDays = (days || []).filter((d: any) =>
        (d.itinerary_services || []).some((s: any) => s.service_type === 'guide' || s.service_type === 'entrance')
      ).length || Math.max((itinerary.total_days || 1) - 1, 1)

      tourLeaderCost = (guideRate + vehicleDiff) * touringDays
      subtotalCost += tourLeaderCost
    }

    // 6. Calculate single supplement
    let singleSupplement = 0
    const accommodationDays = (days || []).filter((d: any) =>
      (d.itinerary_services || []).some((s: any) =>
        s.service_type === 'hotel' || s.service_type === 'accommodation'
      )
    )
    for (const day of accommodationDays) {
      const dayCity = day.city || day.overnight_location || 'Cairo'
      const hotel = await getHotelRate(dayCity, tier, is_eur_passport)
      if (hotel) {
        // Single supplement = single rate - double rate (both per-person)
        singleSupplement += hotel.singleRate - hotel.rate
      }
    }

    // 7. Calculate final pricing
    const totalCost = Math.round(subtotalCost * 100) / 100
    const marginAmount = Math.round(totalCost * (effectiveMargin / 100) * 100) / 100
    const baseSellingPrice = Math.round((totalCost + marginAmount) * 100) / 100
    // On top of the selling price, on the whole of it. marginAmount keeps
    // meaning margin; the premium is its own line.
    const seasonUplift = Math.round(computeUplift({ sellingPrice: baseSellingPrice, season }).amount * 100) / 100
    const sellingPrice = Math.round((baseSellingPrice + seasonUplift) * 100) / 100
    const pricePerPerson = numPax > 0 ? Math.round((sellingPrice / numPax) * 100) / 100 : 0

    console.log('💰 B2B Pricing calculated:', {
      totalCost,
      marginPercent: effectiveMargin,
      marginAmount,
      sellingPrice,
      pricePerPerson,
      tourLeaderCost,
      singleSupplement,
      servicesCount: servicesSnapshot.length
    })

    // 8. Create the B2B quote
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 30)

    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('tour_quotes')
      .insert({
        variation_id: null,
        itinerary_id,
        partner_id: partner_id || null,
        trip_name: itinerary.trip_name || 'Custom Tour',
        source: 'whatsapp_b2b',
        client_name: itinerary.client_name || null,
        client_email: itinerary.client_email || null,
        client_phone: itinerary.client_phone || null,
        travel_date: itinerary.start_date || null,
        num_adults: itinerary.num_adults || 2,
        num_children: itinerary.num_children || 0,
        services_snapshot: servicesSnapshot,
        total_cost: totalCost,
        margin_percent: effectiveMargin,
        margin_amount: marginAmount,
        selling_price: sellingPrice,
        price_per_person: pricePerPerson,
        tour_leader_included,
        tour_leader_cost: tourLeaderCost,
        single_supplement: singleSupplement,
        is_eur_passport,
        season_name: season?.name ?? null,
        season_uplift_percent: season?.upliftPercent ?? 0,
        season_uplift_amount: seasonUplift,
        // Every line in services_snapshot is in the RATE currency (B2B rate
        // tables + the normalized kept lines above) — saving the itinerary's
        // display currency here mislabeled the amounts whenever it differed.
        currency: rateCurrency,
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        notes: `Created from WhatsApp-parsed itinerary ${itinerary.itinerary_code}`,
      })
      .select()
      .single()

    if (quoteError || !quote) {
      console.error('Failed to create B2B quote:', quoteError)
      return NextResponse.json(
        { success: false, error: quoteError?.message || 'Failed to create quote' },
        { status: 500 }
      )
    }

    // 9. Auto-create English version
    const { error: versionError } = await supabaseAdmin
      .from('quote_versions')
      .insert({
        quote_id: quote.id,
        language: 'en',
        title: `Quote ${quote.quote_number}`,
        notes: quote.notes || null
      })

    if (versionError) {
      console.warn('Warning: Could not create English version:', versionError)
    }

    console.log('✅ B2B Quote created from itinerary:', {
      quoteNumber: quote.quote_number,
      itineraryCode: itinerary.itinerary_code,
      sellingPrice,
      pricePerPerson
    })

    return NextResponse.json({
      success: true,
      data: {
        id: quote.id,
        quote_number: quote.quote_number,
        itinerary_id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itinerary.trip_name,
        total_cost: totalCost,
        margin_percent: effectiveMargin,
        margin_amount: marginAmount,
        selling_price: sellingPrice,
        price_per_person: pricePerPerson,
        tour_leader_cost: tourLeaderCost,
        single_supplement: singleSupplement,
        currency: itinerary.currency || 'EUR',
        num_pax: numPax,
        season_name: season?.name ?? null,
        season_uplift_percent: season?.upliftPercent ?? 0,
        season_uplift_amount: seasonUplift,
        services_count: servicesSnapshot.length,
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ Error creating B2B quote from itinerary:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
