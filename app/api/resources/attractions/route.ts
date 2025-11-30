import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create admin client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch all attractions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const activeOnly = searchParams.get('active') === 'true'

    let query = supabaseAdmin
      .from('entrance_fees')
      .select('*')
      .order('attraction_name', { ascending: true })

    if (city) {
      query = query.eq('city', city)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attractions' },
      { status: 500 }
    )
  }
}

// POST - Create new attraction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.attraction_name || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Attraction name and city are required' },
        { status: 400 }
      )
    }

    // Generate service code if not provided
    if (!body.service_code) {
      const prefix = 'ENT'
      const random = Math.random().toString(36).substring(2, 8).toUpperCase()
      body.service_code = `${prefix}-${random}`
    }

    // Set defaults
    const attractionData = {
      service_code: body.service_code,
      attraction_name: body.attraction_name,
      city: body.city,
      fee_type: body.fee_type || 'standard',
      eur_rate: body.eur_rate || 0,
      non_eur_rate: body.non_eur_rate || 0,
      egyptian_rate: body.egyptian_rate || null,
      student_discount_percentage: body.student_discount_percentage || null,
      child_discount_percent: body.child_discount_percent || null,
      season: body.season || 'all_year',
      rate_valid_from: body.rate_valid_from,
      rate_valid_to: body.rate_valid_to,
      category: body.category || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('entrance_fees')
      .insert([attractionData])
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Attraction created successfully'
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create attraction' },
      { status: 500 }
    )
  }
}