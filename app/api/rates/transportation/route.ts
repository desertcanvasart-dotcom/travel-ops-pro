import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createClient } from '@supabase/supabase-js'

// ============================================
// TRANSPORTATION RATES API - Full CRUD
// File: app/api/rates/transportation/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Canonical service_type taxonomy — locked in 2026-06-23. Matches the DB
// CHECK constraint and the bulk-import validator enum. See memory:
// transportation-types.md for the per-day rule semantics each value drives.
const SERVICE_TYPES = [
  'airport_transfer',
  'airport_with_sightseeing',
  'city_transfer',
  'city_tour',
  'intercity',
  'intercity_with_sightseeing',
  'half_day',
  'day_tour',
  'extended_day_tour',
  'sound_light',
  'dinner_transfer',
] as const

// Both intercity variants require an origin_city + destination_city rather
// than a single city. Use this helper everywhere instead of an exact-match
// check against the now-retired 'intercity_transfer' literal.
function isIntercityType(serviceType: string | null | undefined): boolean {
  return serviceType === 'intercity' || serviceType === 'intercity_with_sightseeing'
}

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
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
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
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST - Create new transportation rate (one row per service with tiered vehicle rates)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

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
      supplier_id: supplierCheck.supplier_id,
      supplier_name: supplierCheck.supplier_name,
      notes: body.notes || null,
      is_active: body.is_active !== false,
      ...tieredRates
    }

    // Validate required fields
    if (!newRate.service_type) {
      return NextResponse.json({ success: false, error: 'service_type is required' }, { status: 400 })
    }
    if (isIntercityType(newRate.service_type)) {
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


    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('transportation_rates')
      .select('id')
      .eq('service_type', newRate.service_type)

    if (isIntercityType(newRate.service_type)) {
      existingQuery = existingQuery
        .ilike('origin_city', newRate.origin_city)
        .ilike('destination_city', newRate.destination_city)
    } else {
      existingQuery = existingQuery.ilike('city', newRate.city)
      if (newRate.duration) existingQuery = existingQuery.eq('duration', newRate.duration)
      if (newRate.area) existingQuery = existingQuery.eq('area', newRate.area)
    }

    const { data: existing } = await existingQuery.limit(1)

    let data, error
    if (existing?.length) {
      const result = await supabaseAdmin
        .from('transportation_rates')
        .update({ ...newRate, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select('*')
        .single()
      data = result.data
      error = result.error
    } else {
      const result = await supabaseAdmin
        .from('transportation_rates')
        .insert(newRate)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST transportation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: !!existing?.length }, { status: existing?.length ? 200 : 201 })
  } catch (error: any) {
    console.error('POST transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
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

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update({ ...updates, ...tieredRates })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT transportation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
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
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateServiceCode(data: any): string {
  const parts: string[] = []

  if (isIntercityType(data.service_type)) {
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

  // Service type suffix — canonical taxonomy. Legacy keys (intercity_transfer,
  // sound_light_transfer, half_day_tour) are retained so any orphan rows that
  // somehow escaped the migration still generate a sensible code.
  const typeMap: Record<string, string> = {
    'airport_transfer': 'APT',
    'airport_with_sightseeing': 'APTSL',
    'city_transfer': 'CITY',
    'city_tour': 'CTOUR',
    'intercity': 'XFER',
    'intercity_with_sightseeing': 'XFERSL',
    'half_day': 'HALF',
    'day_tour': 'TOUR',
    'extended_day_tour': 'TOURX',
    'sound_light': 'SL',
    'dinner_transfer': 'DINNER',
    // Legacy fallbacks:
    'intercity_transfer': 'XFER',
    'sound_light_transfer': 'SL',
    'half_day_tour': 'HALF',
  }
  parts.push(typeMap[data.service_type] || data.service_type?.toUpperCase() || 'SVC')

  return parts.join('-')
}

function generateRouteName(data: any): string {
  if (isIntercityType(data.service_type)) {
    const suffix = data.service_type === 'intercity_with_sightseeing' ? ' (with sightseeing)' : ''
    return `${data.origin_city || 'Origin'} to ${data.destination_city || 'Destination'}${suffix}`
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

  // Canonical display labels. Legacy keys retained as fallbacks.
  const serviceNames: Record<string, string> = {
    'airport_transfer': 'Airport Transfer',
    'airport_with_sightseeing': 'Airport Transfer with Sightseeing',
    'city_transfer': 'City Transfer',
    'city_tour': 'City Tour',
    'intercity': 'Intercity Transfer',
    'intercity_with_sightseeing': 'Intercity Transfer with Sightseeing',
    'half_day': 'Half Day Tour',
    'day_tour': 'Day Tour',
    'extended_day_tour': 'Extended Day Tour',
    'sound_light': 'Sound & Light Transfer',
    'dinner_transfer': 'Dinner Transfer',
    // Legacy fallbacks:
    'intercity_transfer': 'Intercity Transfer',
    'sound_light_transfer': 'Sound & Light Transfer',
    'half_day_tour': 'Half Day Tour',
  }
  parts.push(serviceNames[data.service_type] || data.service_type || 'Service')

  return parts.join(' ')
}