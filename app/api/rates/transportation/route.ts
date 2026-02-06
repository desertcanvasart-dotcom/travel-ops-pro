import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// TRANSPORTATION RATES API - Full CRUD
// File: app/api/rates/transportation/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Valid enum values
const SERVICE_TYPES = [
  'airport_transfer',
  'city_transfer',
  'day_tour',
  'dinner_transfer',
  'intercity_transfer',
  'sound_light_transfer'
] as const

const DURATIONS = ['full_day', 'half_day', 'one_way'] as const

const VEHICLE_TIERS = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const

const AREAS = [
  'east_bank',
  'west_bank',
  'pyramids',
  'islamic_cairo',
  'old_cairo',
  'temple_visit',
  'nubian_village'
] as const

// Helper to parse tiered rate fields from request body
function parseTieredRates(body: any) {
  const rates: Record<string, any> = {}
  for (const tier of VEHICLE_TIERS) {
    if (body[`${tier}_rate_eur`] !== undefined) {
      rates[`${tier}_rate_eur`] = body[`${tier}_rate_eur`] !== null ? parseFloat(body[`${tier}_rate_eur`]) || null : null
    }
    if (body[`${tier}_rate_non_eur`] !== undefined) {
      rates[`${tier}_rate_non_eur`] = body[`${tier}_rate_non_eur`] !== null ? parseFloat(body[`${tier}_rate_non_eur`]) || null : null
    }
    if (body[`${tier}_capacity_min`] !== undefined) {
      rates[`${tier}_capacity_min`] = body[`${tier}_capacity_min`] !== null ? parseInt(body[`${tier}_capacity_min`]) : null
    }
    if (body[`${tier}_capacity_max`] !== undefined) {
      rates[`${tier}_capacity_max`] = body[`${tier}_capacity_max`] !== null ? parseInt(body[`${tier}_capacity_max`]) : null
    }
  }
  return rates
}

// GET - List transportation rates with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('service_type')
    const duration = searchParams.get('duration')
    const area = searchParams.get('area')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('active_only') !== 'false' // Default true

    let query = supabaseAdmin
      .from('transportation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('city')
      .order('service_type')
      .order('duration')
      .order('area')

    // Apply filters
    if (city) query = query.ilike('city', `%${city}%`)
    if (serviceType) query = query.eq('service_type', serviceType)
    if (duration) query = query.eq('duration', duration)
    if (area) query = query.eq('area', area)
    if (originCity) query = query.ilike('origin_city', `%${originCity}%`)
    if (destinationCity) query = query.ilike('destination_city', `%${destinationCity}%`)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Also return enum options for UI dropdowns
    return NextResponse.json({
      success: true,
      data: data || [],
      options: {
        serviceTypes: SERVICE_TYPES,
        durations: DURATIONS,
        vehicleTiers: VEHICLE_TIERS,
        areas: AREAS
      }
    })
  } catch (error: any) {
    console.error('GET transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST - Create new transportation rate (one row per service with tiered vehicle rates)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Generate service code if not provided
    const serviceCode = body.service_code || generateServiceCode(body)

    // Generate route name if not provided
    const routeName = body.route_name || generateRouteName(body)

    // Parse tiered vehicle rates from body
    const tieredRates = parseTieredRates(body)

    const newRate: Record<string, any> = {
      service_code: serviceCode,
      service_type: body.service_type,
      city: body.city || null,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      duration: body.duration || null,
      area: body.area || null,
      route_name: routeName,
      includes: body.includes || null,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== false,
      ...tieredRates
    }

    // Validate required fields
    if (!newRate.service_type) {
      return NextResponse.json({ success: false, error: 'service_type is required' }, { status: 400 })
    }
    if (newRate.service_type === 'intercity_transfer') {
      if (!newRate.origin_city || !newRate.destination_city) {
        return NextResponse.json({
          success: false,
          error: 'origin_city and destination_city are required for intercity transfers'
        }, { status: 400 })
      }
    } else if (!newRate.city) {
      return NextResponse.json({ success: false, error: 'city is required' }, { status: 400 })
    }

    // Must have at least one vehicle tier rate
    const firstTierRate = VEHICLE_TIERS.map(t => tieredRates[`${t}_rate_eur`]).find(r => r != null && r > 0)
    if (!firstTierRate) {
      return NextResponse.json({ success: false, error: 'At least one vehicle tier rate is required' }, { status: 400 })
    }

    // Set legacy base_rate_eur from first available tier rate (NOT NULL constraint)
    newRate.base_rate_eur = firstTierRate
    newRate.base_rate_non_eur = firstTierRate

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('POST transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update transportation rate
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...rawUpdates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    // Parse tiered rates from the update payload
    const tieredRates = parseTieredRates(rawUpdates)

    // Remove tiered fields from rawUpdates to avoid double-setting
    const updates: Record<string, any> = {}
    for (const [key, val] of Object.entries(rawUpdates)) {
      if (!VEHICLE_TIERS.some(t => key.startsWith(`${t}_`))) {
        updates[key] = val
      }
    }

    // Regenerate route_name if relevant fields changed
    if (updates.city || updates.service_type || updates.duration || updates.area) {
      const { data: current } = await supabaseAdmin
        .from('transportation_rates')
        .select('*')
        .eq('id', id)
        .single()

      if (current) {
        const merged = { ...current, ...updates }
        updates.route_name = updates.route_name || generateRouteName(merged)
      }
    }

    updates.updated_at = new Date().toISOString()

    // Keep legacy base_rate_eur in sync with first available tier rate
    const firstTierRate = VEHICLE_TIERS.map(t => tieredRates[`${t}_rate_eur`]).find(r => r != null && r > 0)
    if (firstTierRate) {
      updates.base_rate_eur = firstTierRate
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update({ ...updates, ...tieredRates })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete transportation rate
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('transportation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateServiceCode(data: any): string {
  const parts: string[] = []

  if (data.service_type === 'intercity_transfer') {
    parts.push('INTERCITY')
    parts.push(data.origin_city?.substring(0, 3).toUpperCase() || 'XXX')
    parts.push(data.destination_city?.substring(0, 3).toUpperCase() || 'XXX')
  } else {
    parts.push(data.city?.toUpperCase().replace(/\s+/g, '') || 'CITY')

    if (data.area) {
      parts.push(data.area.toUpperCase().replace(/_/g, ''))
    }

    if (data.duration === 'half_day') {
      parts.push('HALF')
    } else if (data.duration === 'full_day') {
      parts.push('FULL')
    }
  }

  // Service type suffix
  const typeMap: Record<string, string> = {
    'airport_transfer': 'APT',
    'city_transfer': 'CITY',
    'day_tour': 'TOUR',
    'dinner_transfer': 'DINNER',
    'intercity_transfer': 'XFER',
    'sound_light_transfer': 'SL'
  }
  parts.push(typeMap[data.service_type] || data.service_type?.toUpperCase() || 'SVC')

  return parts.join('-')
}

function generateRouteName(data: any): string {
  if (data.service_type === 'intercity_transfer') {
    return `${data.origin_city || 'Origin'} to ${data.destination_city || 'Destination'}`
  }

  const parts: string[] = []
  parts.push(data.city || 'City')

  if (data.area) {
    const areaNames: Record<string, string> = {
      'east_bank': 'East Bank',
      'west_bank': 'West Bank',
      'pyramids': 'Pyramids',
      'islamic_cairo': 'Islamic Cairo',
      'old_cairo': 'Old Cairo',
      'temple_visit': 'Temple Visit',
      'nubian_village': 'Nubian Village'
    }
    parts.push(areaNames[data.area] || data.area)
  }

  if (data.duration === 'half_day') {
    parts.push('Half Day')
  } else if (data.duration === 'full_day') {
    parts.push('Full Day')
  }

  const serviceNames: Record<string, string> = {
    'airport_transfer': 'Airport Transfer',
    'city_transfer': 'City Transfer',
    'day_tour': 'Day Tour',
    'dinner_transfer': 'Dinner Transfer',
    'sound_light_transfer': 'Sound & Light Transfer'
  }
  parts.push(serviceNames[data.service_type] || data.service_type || 'Service')

  return parts.join(' ')
}