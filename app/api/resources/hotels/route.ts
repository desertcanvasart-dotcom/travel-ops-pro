// ============================================
// API Route: /api/resources/hotels/route.ts
// ============================================
// Hotels collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// GET - List all hotels
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('hotel_contacts')
      .select('*')
      .order('name', { ascending: true })

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching hotels:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch hotels' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in hotels GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new hotel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.name || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Name and city are required' },
        { status: 400 }
      )
    }

    const hotelData = {
      // Basic fields
      name: body.name,
      property_type: body.property_type || null,
      star_rating: body.star_rating || null,
      city: body.city,
      address: body.address || null,
      contact_person: body.contact_person || null,
      phone: body.phone || null,
      email: body.email || null,
      whatsapp: body.whatsapp || null,
      capacity: body.capacity || null,
      amenities: body.amenities || [],
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,

      // Rate fields - EUR
      rate_single_eur: body.rate_single_eur || null,
      rate_double_eur: body.rate_double_eur || null,
      rate_triple_eur: body.rate_triple_eur || null,
      rate_suite_eur: body.rate_suite_eur || null,

      // Rate fields - Non-EUR
      rate_single_non_eur: body.rate_single_non_eur || null,
      rate_double_non_eur: body.rate_double_non_eur || null,
      rate_triple_non_eur: body.rate_triple_non_eur || null,
      rate_suite_non_eur: body.rate_suite_non_eur || null,

      // Seasonal pricing
      high_season_markup_percent: body.high_season_markup_percent || null,
      peak_season_markup_percent: body.peak_season_markup_percent || null,

      // Meal plan
      meal_plan: body.meal_plan || 'BB',
      breakfast_included: body.breakfast_included !== undefined ? body.breakfast_included : true,
      breakfast_rate_eur: body.breakfast_rate_eur || null,

      // Validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      child_policy: body.child_policy || null
    }

    const { data, error } = await supabase
      .from('hotel_contacts')
      .insert([hotelData])
      .select()
      .single()

    if (error) {
      console.error('Error creating hotel:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create hotel' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Hotel created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in hotels POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}