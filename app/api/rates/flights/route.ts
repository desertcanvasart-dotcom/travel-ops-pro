import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { AIRLINE_CODES, knownAirlineCode } from '@/lib/airline-codes'

// ============================================
// FLIGHT RATES API - Full CRUD
// File: app/api/rates/flights/route.ts
// ============================================

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

// Valid enum values
const FLIGHT_TYPES = ['domestic', 'international'] as const
const CABIN_CLASSES = ['economy', 'business', 'first'] as const

// Carrier codes live in lib/airline-codes.ts (a code map, not a supplier list).

const FREQUENCIES = [
  'daily',
  'weekdays',
  'weekends',
  'mon_wed_fri',
  'tue_thu_sat',
  'weekly',
  'charter'
] as const

// GET - List flight rates with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const routeFrom = searchParams.get('route_from')
    const routeTo = searchParams.get('route_to')
    const airline = searchParams.get('airline')
    const flightType = searchParams.get('flight_type')
    const cabinClass = searchParams.get('cabin_class')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('active_only') !== 'false' // Default true

    let query = supabaseAdmin
      .from('flight_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('route_from')
      .order('route_to')
      .order('airline')
      .order('cabin_class')

    // Apply filters
    if (routeFrom) query = query.ilike('route_from', `%${routeFrom}%`)
    if (routeTo) query = query.ilike('route_to', `%${routeTo}%`)
    if (airline) query = query.ilike('airline', `%${airline}%`)
    if (flightType) query = query.eq('flight_type', flightType)
    if (cabinClass) query = query.eq('cabin_class', cabinClass)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET flight_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Also return enum options for UI dropdowns
    return NextResponse.json({ 
      success: true, 
      data: data || [],
      options: {
        flightTypes: FLIGHT_TYPES,
        cabinClasses: CABIN_CLASSES,
        airlines: AIRLINE_CODES,
        frequencies: FREQUENCIES
      }
    })
  } catch (error: any) {
    console.error('GET flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST - Create new flight rate
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    // Generate service code if not provided
    const serviceCode = body.service_code || generateServiceCode(body)

    // Generate route name if not provided
    const routeName = body.route_name || `${body.route_from} to ${body.route_to}`

    // Get airline code
    const airlineCode = body.airline_code || getAirlineCode(body.airline)

    const newRate = {
      service_code: serviceCode,
      route_from: body.route_from,
      route_to: body.route_to,
      route_name: routeName,
      airline: body.airline,
      airline_code: airlineCode,
      flight_number: body.flight_number || null,
      flight_type: body.flight_type || 'domestic',
      cabin_class: body.cabin_class || 'economy',
      departure_time: body.departure_time || null,
      arrival_time: body.arrival_time || null,
      duration_minutes: body.duration_minutes ? parseInt(body.duration_minutes) : null,
      frequency: body.frequency || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || parseFloat(body.base_rate_eur) || 0,
      tax_eur: parseFloat(body.tax_eur) || 0,
      tax_non_eur: parseFloat(body.tax_non_eur) || 0,
      baggage_kg: body.baggage_kg ? parseInt(body.baggage_kg) : 23,
      carry_on_kg: body.carry_on_kg ? parseInt(body.carry_on_kg) : 7,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false
    }

    // Validate required fields
    if (!newRate.route_from) {
      return NextResponse.json({ success: false, error: 'route_from is required' }, { status: 400 })
    }
    if (!newRate.route_to) {
      return NextResponse.json({ success: false, error: 'route_to is required' }, { status: 400 })
    }
    if (!newRate.airline) {
      return NextResponse.json({ success: false, error: 'airline is required' }, { status: 400 })
    }
    if (newRate.route_from === newRate.route_to) {
      return NextResponse.json({ success: false, error: 'route_from and route_to must be different' }, { status: 400 })
    }

    // Check for existing rate with same natural key
    const existingQuery = supabaseAdmin
      .from('flight_rates')
      .select('*')
      .ilike('route_from', newRate.route_from)
      .ilike('route_to', newRate.route_to)
      .ilike('airline', newRate.airline)
      .eq('cabin_class', newRate.cabin_class)
    const { data: existing } = await existingQuery.limit(1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: 'A rate with these details already exists. Edit that rate, or change what makes this one different (supplier, period, class, city) before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabaseAdmin
        .from('flight_rates')
        .insert(newRate)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST flight_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false }, { status: existing?.length ? 200 : 201 })
  } catch (error: any) {
    console.error('POST flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT - Update flight rate (by ID in body)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    // Regenerate route_name if route fields changed
    if (updates.route_from || updates.route_to) {
      const { data: current } = await supabaseAdmin
        .from('flight_rates')
        .select('*')
        .eq('id', id)
        .single()

      if (current) {
        const merged = { ...current, ...updates }
        updates.route_name = updates.route_name || `${merged.route_from} to ${merged.route_to}`
      }
    }

    // Update airline_code if airline changed
    if (updates.airline) {
      updates.airline_code = getAirlineCode(updates.airline)
    }

    // Parse numeric fields
    if (updates.base_rate_eur !== undefined) {
      updates.base_rate_eur = parseFloat(updates.base_rate_eur) || 0
    }
    if (updates.base_rate_non_eur !== undefined) {
      updates.base_rate_non_eur = parseFloat(updates.base_rate_non_eur) || 0
    }
    if (updates.tax_eur !== undefined) {
      updates.tax_eur = parseFloat(updates.tax_eur) || 0
    }
    if (updates.tax_non_eur !== undefined) {
      updates.tax_non_eur = parseFloat(updates.tax_non_eur) || 0
    }
    if (updates.duration_minutes !== undefined) {
      updates.duration_minutes = updates.duration_minutes ? parseInt(updates.duration_minutes) : null
    }
    if (updates.baggage_kg !== undefined) {
      updates.baggage_kg = updates.baggage_kg ? parseInt(updates.baggage_kg) : null
    }
    if (updates.carry_on_kg !== undefined) {
      updates.carry_on_kg = updates.carry_on_kg ? parseInt(updates.carry_on_kg) : null
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('flight_rates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT flight_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete flight rate (by query param)
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('flight_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE flight_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAirlineCode(airlineName: string): string {
  return knownAirlineCode(airlineName)
}

function generateServiceCode(data: any): string {
  const fromCode = getCityCode(data.route_from)
  const toCode = getCityCode(data.route_to)
  const airlineCode = getAirlineCode(data.airline)
  const classCode = (data.cabin_class || 'economy').substring(0, 3).toUpperCase()
  
  return `FLT-${airlineCode}-${fromCode}-${toCode}-${classCode}`
}

function getCityCode(city: string): string {
  if (!city) return 'XXX'
  
  // Common Egyptian city codes
  const cityCodeMap: Record<string, string> = {
    'cairo': 'CAI',
    'alexandria': 'ALX',
    'aswan': 'ASW',
    'luxor': 'LXR',
    'hurghada': 'HRG',
    'sharm el sheikh': 'SSH',
    'marsa alam': 'RMF',
    'abu simbel': 'ABS',
    'borg el arab': 'HBE',
    'sohag': 'HMB',
    'asyut': 'ATZ',
    'taba': 'TCP'
  }
  
  const lowerCity = city.toLowerCase()
  
  // Check for known cities
  for (const [name, code] of Object.entries(cityCodeMap)) {
    if (lowerCity.includes(name)) {
      return code
    }
  }
  
  // Extract code if in format "City (CODE)"
  const codeMatch = city.match(/\(([A-Z]{3})\)/)
  if (codeMatch) {
    return codeMatch[1]
  }
  
  // Fallback: first 3 letters
  return city.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase()
}