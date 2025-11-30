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

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in transportation rates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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

    // Generate service code if not provided
    const serviceCode = body.service_code || 
      `${body.city.toUpperCase().replace(/\s+/g, '-')}-${body.service_type.toUpperCase().replace(/_/g, '-')}-${body.vehicle_type.toUpperCase()}`

    const newRate = {
      service_code: serviceCode,
      service_type: body.service_type,
      vehicle_type: body.vehicle_type,
      capacity_min: body.capacity_min || 1,
      capacity_max: body.capacity_max || 2,
      city: body.city,
      base_rate_eur: body.base_rate_eur || 0,
      base_rate_non: body.base_rate_non || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || new Date().toISOString().split('T')[0],
      rate_valid_to: body.rate_valid_to || '2099-12-31',
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .insert([newRate])
      .select()
      .single()

    if (error) {
      console.error('Error creating transportation rate:', error)
      return NextResponse.json({ error: 'Failed to create transportation rate' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in transportation rates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}