// ============================================
// API Route: /api/resources/restaurants/route.ts
// ============================================
// Restaurants collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// GET - List all restaurants
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('restaurant_contacts')
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
      console.error('Error fetching restaurants:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch restaurants' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in restaurants GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new restaurant
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

    const restaurantData = {
      // Basic fields
      name: body.name,
      restaurant_type: body.restaurant_type || null,
      cuisine_type: body.cuisine_type || null,
      city: body.city,
      address: body.address || null,
      contact_person: body.contact_person || null,
      phone: body.phone || null,
      email: body.email || null,
      whatsapp: body.whatsapp || null,
      capacity: body.capacity || null,
      meal_types: body.meal_types || [],
      dietary_options: body.dietary_options || [],
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,

      // Rate fields - EUR
      rate_per_person_eur: body.rate_per_person_eur || null,
      rate_breakfast_eur: body.rate_breakfast_eur || null,
      rate_lunch_eur: body.rate_lunch_eur || null,
      rate_dinner_eur: body.rate_dinner_eur || null,

      // Rate fields - Non-EUR
      rate_per_person_non_eur: body.rate_per_person_non_eur || null,
      rate_breakfast_non_eur: body.rate_breakfast_non_eur || null,
      rate_lunch_non_eur: body.rate_lunch_non_eur || null,
      rate_dinner_non_eur: body.rate_dinner_non_eur || null,

      // Inclusions
      drinks_included: body.drinks_included || false,
      tip_included: body.tip_included || false,

      // Discounts
      child_discount_percent: body.child_discount_percent !== undefined ? body.child_discount_percent : 50,
      group_discount_percent: body.group_discount_percent || null,
      group_min_size: body.group_min_size || 10,

      // Validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null
    }

    const { data, error } = await supabase
      .from('restaurant_contacts')
      .insert([restaurantData])
      .select()
      .single()

    if (error) {
      console.error('Error creating restaurant:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create restaurant' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Restaurant created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in restaurants POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}