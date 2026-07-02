import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

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

function getSeason(date: Date): 'low' | 'high' | 'peak' {
  const month = date.getMonth() + 1
  if ([12, 1, 2, 3, 4].includes(month)) return 'high'
  if ([7, 8].includes(month)) return 'peak'
  return 'low'
}

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
): { unitCost: number; lineTotal: number; pricingNote: string; quantityMode: string } {
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
          pricingNote: `${unitsNeeded}x ${rule.tier2_label || rule.unit_type} @ €${largeRate} = €${totalCost}`,
          quantityMode: 'fixed'
        }
      }

      return {
        unitCost: rate,
        lineTotal: rate,
        pricingNote: `${label}: €${rate} flat`,
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
        pricingNote: `${label}: €${rate}/pax × ${numPax} = €${rate * numPax}`,
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

  return {
    rate: selectedVehicle.daily_rate || 0,
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

    return {
      rate: anyGuide[0].daily_rate || 0,
      name: anyGuide[0].name || 'Guide',
      id: anyGuide[0].id
    }
  }

  let selectedGuide = guides.find((g: any) => g.tier === tier) || guides[0]

  return {
    rate: selectedGuide.daily_rate || 0,
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
    ? (fee.eur_rate || 0)
    : (fee.non_eur_rate || fee.eur_rate || 0)

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

  if (!error && hotels && hotels.length > 0) {
    const ppd = isEurPassport ? (hotels[0].pp_double_eur || 0) : (hotels[0].pp_double_non_eur || 0)
    const singleSupp = isEurPassport ? (hotels[0].single_supp_eur || 0) : (hotels[0].single_supp_non_eur || 0)
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

    if (fbHotels && fbHotels.length > 0) {
      const ppd = isEurPassport ? (fbHotels[0].pp_double_eur || 0) : (fbHotels[0].pp_double_non_eur || 0)
      const singleSupp = isEurPassport ? (fbHotels[0].single_supp_eur || 0) : (fbHotels[0].single_supp_non_eur || 0)
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
      margin_percent = 25,
      tour_leader_included = false,
      is_eur_passport = true,
      language = 'English',
    } = body

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
    const travelDate = itinerary.start_date ? new Date(itinerary.start_date) : new Date()
    const season = getSeason(travelDate)

    console.log('📊 Pricing context:', { tier, numPax, season, effectiveMargin })

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
        // lines KEPT from the itinerary must be normalized to EUR too —
        // itinerary_services.total_cost is stored in the itinerary's display
        // currency (e.g. JPY). service-creation stamps supplier_currency /
        // supplier_cost_original (EUR) / exchange_rate_used for exactly this.
        const eurLineTotal =
          svc.supplier_currency === 'EUR' && svc.supplier_cost_original != null
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

        // Try B2B-specific pricing for activities/entrance fees
        if (serviceType === 'entrance' || serviceType === 'activity') {
          // Check B2B pricing rules first (tiered pricing like felucca)
          const b2bRule = await getB2BPricingRule(serviceName)
          if (b2bRule) {
            const priceResult = applyB2BPricingRule(b2bRule, numPax)
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
              pricingNote = `${fee.name}: €${fee.rate}/pax (${is_eur_passport ? 'EUR' : 'non-EUR'})`
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
            pricingNote = `Kept itinerary rate (transfer/bundled transport): €${Math.round(eurLineTotal * 100) / 100}`
          } else {
            const vehicle = await selectVehicleFromB2CTable(numPax, tier)
            if (vehicle) {
              unitCost = vehicle.rate
              lineTotal = vehicle.rate
              quantityMode = 'fixed'
              pricingNote = `${vehicle.vehicle}: €${vehicle.rate}/day`
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
            pricingNote = `${guide.name}: €${guide.rate}/day`
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
            pricingNote = `${hotel.name}: €${hotel.rate}/pax (double occupancy)`
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
            pricingNote = `€${Math.round(unitCost * 100) / 100}/pax`
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
    const sellingPrice = Math.round((totalCost + marginAmount) * 100) / 100
    const pricePerPerson = Math.round((sellingPrice / numPax) * 100) / 100

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
        season,
        // Every line in services_snapshot is EUR (B2B rate tables + the
        // EUR-normalized kept lines above) — saving the itinerary's display
        // currency here mislabeled the amounts whenever it wasn't EUR.
        currency: 'EUR',
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
        season,
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
