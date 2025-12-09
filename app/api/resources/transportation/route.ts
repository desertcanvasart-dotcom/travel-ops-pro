import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('serviceType')
    const vehicleType = searchParams.get('vehicleType')
    const activeOnly = searchParams.get('activeOnly') === 'true'

    let query = supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .order('city', { ascending: true })
      .order('service_type', { ascending: true })
      .order('vehicle_type', { ascending: true })

    if (city) {
      query = query.eq('city', city)
    }

    if (serviceType) {
      query = query.eq('service_type', serviceType)
    }

    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType)
    }

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transportation rates:', error)
      return NextResponse.json({ error: 'Failed to fetch transportation rates' }, { status: 500 })
    }

    // Transform data to match frontend expectations (add capacity_min as derived field)
    const transformedData = (data || []).map(rate => ({
      ...rate,
      // Derive capacity_min from vehicle type or default to 1
      capacity_min: getMinCapacityForVehicle(rate.vehicle_type),
      // Map base_rate_non_eur to base_rate_non for frontend compatibility
      base_rate_non: rate.base_rate_non_eur
    }))

    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Error in transportation rates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to get min capacity based on vehicle type
function getMinCapacityForVehicle(vehicleType: string): number {
  const vehicleCapacities: Record<string, number> = {
    'Sedan': 1,
    'SUV': 1,
    '4x4': 1,
    'Minivan': 3,
    'Van': 9,
    'Minibus': 15,
    'Bus': 25
  }
  return vehicleCapacities[vehicleType] || 1
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.city || !body.vehicle_type || !body.service_type) {
      return NextResponse.json(
        { error: 'City, vehicle type, and service type are required' },
        { status: 400 }
      )
    }

    // Validate base_rate_eur is provided and valid
    if (body.base_rate_eur === undefined || body.base_rate_eur === null) {
      return NextResponse.json(
        { error: 'EUR rate is required' },
        { status: 400 }
      )
    }

    // Generate service code if not provided
    const serviceCode = body.service_code || 
      `${body.city.toUpperCase().replace(/\s+/g, '-')}-${body.service_type.toUpperCase().replace(/_/g, '-')}-${body.vehicle_type.toUpperCase()}`

    // Build the rate object matching ACTUAL database columns
    const newRate = {
      service_code: serviceCode,
      service_type: body.service_type,
      vehicle_type: body.vehicle_type,
      // capacity_min does NOT exist in database - removed
      capacity_max: body.capacity_max || 2,
      city: body.city,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      // FIXED: Use correct column name base_rate_non_eur
      base_rate_non_eur: parseFloat(body.base_rate_non || body.base_rate_non_eur) || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || new Date().toISOString().split('T')[0],
      rate_valid_to: body.rate_valid_to || '2099-12-31',
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      // Optional: origin_city and destination_city for intercity transfers
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null
    }

    console.log('Creating transportation rate:', newRate)

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .insert([newRate])
      .select()
      .single()

    if (error) {
      console.error('Error creating transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to create transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    // Transform response to match frontend expectations
    const transformedData = {
      ...data,
      capacity_min: getMinCapacityForVehicle(data.vehicle_type),
      base_rate_non: data.base_rate_non_eur
    }

    return NextResponse.json(transformedData, { status: 201 })
  } catch (error) {
    console.error('Error in transportation rates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}