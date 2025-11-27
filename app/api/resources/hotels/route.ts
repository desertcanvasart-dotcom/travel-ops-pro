// ============================================
// API Route: /api/resources/hotels/route.ts
// ============================================
// Hotels collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// GET - List all hotels
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()  

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
    const supabase = createClient()  
    const body = await request.json()

    if (!body.name || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Name and city are required' },
        { status: 400 }
      )
    }

    const hotelData = {
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
      is_active: body.is_active !== undefined ? body.is_active : true
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