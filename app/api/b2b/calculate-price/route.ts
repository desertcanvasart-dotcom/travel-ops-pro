import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B TOUR PRICE CALCULATOR - v3
// File: app/api/b2b/calculate-price/route.ts
// 
// Uses B2B-specific pricing tables:
// - b2b_pricing_rules (felucca boats, tiered discounts)
// - b2b_transport_packages (cruise sightseeing)
// 
// Does NOT modify existing rate tables!
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RATE_TABLES: Record<string, { table: string; eurField: string; nonEurField?: string }> = {
  transportation: {
    table: 'transportation_rates',
    eurField: 'base_rate_eur',
    nonEurField: 'base_rate_non_eur'
  },
  guide: {
    table: 'guide_rates',
    eurField: 'base_rate_non_eur',  // Contains EUR rates despite the name
    nonEurField: 'base_rate_non_eur'
  },
  activity: {
    table: 'activity_rates',
    eurField: 'base_rate_eur',
    nonEurField: 'base_rate_non_eur'
  },
  meal: {
    table: 'meal_rates',
    eurField: 'base_rate_eur',
    nonEurField: 'base_rate_non_eur'
  },
  accommodation: {
    table: 'accommodation_rates',
    eurField: 'rate_low_season_sgl'
  },
  cruise: {
    table: 'nile_cruises',
    eurField: 'rate_double_eur',
    nonEurField: 'rate_double_eur'
  }
}

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
  travel_date: string
  season: string
  is_eur_passport: boolean
  services: CalculatedService[]
  optional_services: CalculatedService[]
  subtotal_cost: number
  optional_total: number
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
}

function getSeason(date: Date): 'low' | 'high' | 'peak' {
  const month = date.getMonth() + 1
  if ([12, 1, 2, 3, 4].includes(month)) return 'high'
  if ([7, 8].includes(month)) return 'peak'
  return 'low'
}

// Check for B2B pricing rules for an activity
async function getB2BPricingRule(serviceName: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_pricing_rules')
    .select('*')
    .eq('is_active', true)
    .ilike('service_name', `%${serviceName.split(' ')[0]}%`)  // Match first word
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

// Get transport package for cruise sightseeing
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

// Calculate price using B2B pricing rule
function applyB2BPricingRule(
  rule: any, 
  numPax: number
): { unitCost: number; lineTotal: number; pricingNote: string; quantityMode: string } {
  const model = rule.pricing_model

  switch (model) {
    case 'per_unit': {
      // Per boat, per vehicle - select tier based on group size
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 999)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || 'Small'
      } else if (rule.tier2_max_pax && numPax <= rule.tier2_max_pax) {
        rate = rule.tier2_rate_eur
        label = rule.tier2_label || 'Large'
      } else {
        // Need multiple units
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
      // Volume discounts - per person rate based on group size
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      variation_id,
      num_pax = 2,
      travel_date = new Date().toISOString().split('T')[0],
      is_eur_passport = true,
      margin_percent = 25,
      partner_id = null,
      include_optionals = false
    } = body

    if (!variation_id) {
      return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
    }

    // Fetch variation with template info
    const { data: variation, error: varError } = await supabaseAdmin
      .from('tour_variations')
      .select(`
        id, variation_name, variation_code, tier, group_type, min_pax, max_pax,
        tour_templates (id, template_name, template_code, duration_days)
      `)
      .eq('id', variation_id)
      .single()

    if (varError || !variation) {
      console.error('Variation fetch error:', varError)
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 })
    }

    // Fetch services for this variation
    const { data: services, error: servError } = await supabaseAdmin
      .from('tour_variation_services')
      .select('*')
      .eq('variation_id', variation_id)
      .order('sequence_order')

    if (servError) {
      console.error('Services fetch error:', servError)
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
    }

    const travelDate = new Date(travel_date)
    const season = getSeason(travelDate)

    // Determine effective margin
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
      // STEP 1: Check for B2B pricing rules first
      // ============================================
      if (service.rate_type === 'activity' && service.service_name) {
        const b2bRule = await getB2BPricingRule(service.service_name)
        
        if (b2bRule) {
          const priceResult = applyB2BPricingRule(b2bRule, num_pax)
          unitCost = priceResult.unitCost
          lineTotal = priceResult.lineTotal
          pricingNote = priceResult.pricingNote
          effectiveQuantityMode = priceResult.quantityMode
          rateSource = 'b2b_rule'
          
          console.log(`B2B Rule applied: ${service.service_name} -> ${pricingNote}`)
        }
      }

      // ============================================
      // STEP 2: Check for transport packages
      // ============================================
      if (rateSource === 'manual' && service.service_category === 'transportation') {
        // Check if this is a cruise sightseeing package
        if (service.service_name?.toLowerCase().includes('sightseeing')) {
          const pkg = await getTransportPackage('cruise_sightseeing', 'Luxor', 'Aswan')
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: €${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'
          }
        }
        // Check if this is cruise transfer
        else if (service.service_name?.toLowerCase().includes('transfer') || 
                 service.service_name?.toLowerCase().includes('airport')) {
          const pkg = await getTransportPackage('cruise_transfer', 'Luxor', 'Aswan')
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: €${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'
          }
        }
      }

      // ============================================
      // STEP 3: Standard rate table lookup
      // ============================================
      if (rateSource === 'manual' && service.rate_type && service.rate_id) {
        const rateConfig = RATE_TABLES[service.rate_type]
        
        if (rateConfig) {
          const { data: rate, error: rateError } = await supabaseAdmin
            .from(rateConfig.table)
            .select('*')
            .eq('id', service.rate_id)
            .single()

          if (rateError) {
            console.error(`Rate fetch error for ${service.rate_type}/${service.rate_id}:`, rateError)
          }

          if (rate) {
            rateSource = rateConfig.table

            // Handle cruise rates (cabin-based)
            if (service.rate_type === 'cruise') {
              if (num_pax === 1 && rate.rate_single_eur) {
                unitCost = rate.rate_single_eur
                pricingNote = 'Single occupancy'
              } else if (num_pax >= 3 && rate.rate_triple_eur) {
                unitCost = rate.rate_triple_eur
                pricingNote = 'Triple occupancy'
              } else {
                unitCost = rate.rate_double_eur || 0
                pricingNote = 'Double occupancy'
              }
            }
            // Handle transportation (capacity-based)
            else if (service.rate_type === 'transportation' && rate.capacity_min && rate.capacity_max) {
              // Check if this vehicle fits the group
              if (num_pax >= rate.capacity_min && num_pax <= rate.capacity_max) {
                unitCost = is_eur_passport ? rate.base_rate_eur : rate.base_rate_non_eur
                pricingNote = `${rate.vehicle_type} (${rate.capacity_min}-${rate.capacity_max} pax)`
              } else {
                // Vehicle doesn't fit - just use base rate
                unitCost = is_eur_passport ? rate.base_rate_eur : rate.base_rate_non_eur
                pricingNote = `${rate.vehicle_type} (base rate)`
              }
            }
            // Standard rate lookup
            else {
              if (!is_eur_passport && rateConfig.nonEurField && rate[rateConfig.nonEurField]) {
                unitCost = rate[rateConfig.nonEurField]
              } else {
                unitCost = rate[rateConfig.eurField] || 0
              }
            }

            console.log(`Rate lookup: ${service.service_name} -> €${unitCost} (${rateSource})`)
          }
        }
      }
      
      // ============================================
      // STEP 4: Fall back to stored cost_per_unit
      // ============================================
      if (rateSource === 'manual' && service.cost_per_unit) {
        unitCost = service.cost_per_unit
        rateSource = 'stored'
      }

      // ============================================
      // STEP 5: Calculate line total if not already set
      // ============================================
      if (lineTotal === 0) {
        let quantity = service.quantity_value || 1

        switch (effectiveQuantityMode) {
          case 'per_pax':
            quantity = (service.quantity_value || 1) * num_pax
            break
          case 'per_group':
            quantity = service.quantity_value || 1
            break
          case 'per_day':
            quantity = (service.quantity_value || 1) * ((variation.tour_templates as any)?.duration_days || 1)
            break
          case 'per_night':
            quantity = (service.quantity_value || 1) * (((variation.tour_templates as any)?.duration_days || 1) - 1)
            break
          case 'fixed':
            quantity = service.quantity_value || 1
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
        unit_cost: unitCost,
        line_total: lineTotal,
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
    const sellingPrice = totalCost + marginAmount
    const pricePerPerson = sellingPrice / num_pax

    const result: PriceCalculationResult = {
      variation_id: variation.id,
      variation_name: variation.variation_name,
      template_name: (variation.tour_templates as any)?.template_name || '',
      num_pax,
      travel_date,
      season,
      is_eur_passport,
      services: calculatedServices,
      optional_services: optionalServices,
      subtotal_cost: Math.round(subtotalCost * 100) / 100,
      optional_total: Math.round(optionalTotal * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      margin_percent: effectiveMargin,
      margin_amount: Math.round(marginAmount * 100) / 100,
      selling_price: Math.round(sellingPrice * 100) / 100,
      price_per_person: Math.round(pricePerPerson * 100) / 100,
      currency: 'EUR'
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('Error calculating tour price:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const variation_id = searchParams.get('variation_id')
  const num_pax = parseInt(searchParams.get('num_pax') || '2')
  const travel_date = searchParams.get('travel_date') || new Date().toISOString().split('T')[0]
  const is_eur = searchParams.get('is_eur') !== 'false'
  const margin = parseFloat(searchParams.get('margin') || '25')

  if (!variation_id) {
    return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
  }

  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ variation_id, num_pax, travel_date, is_eur_passport: is_eur, margin_percent: margin })
  })

  return POST(mockRequest)
}