// ============================================
// API Route: /api/resources/hotels/[id]/route.ts
// ============================================
// Single hotel operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// GET - Get single hotel
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params

    const { data, error } = await supabase
      .from('hotel_contacts')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Hotel not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in hotel GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update hotel
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updateData: any = {}
    
    // Basic fields
    if (body.name !== undefined) updateData.name = body.name
    if (body.property_type !== undefined) updateData.property_type = body.property_type
    if (body.star_rating !== undefined) updateData.star_rating = body.star_rating
    if (body.city !== undefined) updateData.city = body.city
    if (body.address !== undefined) updateData.address = body.address
    if (body.contact_person !== undefined) updateData.contact_person = body.contact_person
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.email !== undefined) updateData.email = body.email
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.capacity !== undefined) updateData.capacity = body.capacity
    if (body.amenities !== undefined) updateData.amenities = body.amenities
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    // Rate fields - EUR
    if (body.rate_single_eur !== undefined) updateData.rate_single_eur = body.rate_single_eur || null
    if (body.rate_double_eur !== undefined) updateData.rate_double_eur = body.rate_double_eur || null
    if (body.rate_triple_eur !== undefined) updateData.rate_triple_eur = body.rate_triple_eur || null
    if (body.rate_suite_eur !== undefined) updateData.rate_suite_eur = body.rate_suite_eur || null

    // Rate fields - Non-EUR
    if (body.rate_single_non_eur !== undefined) updateData.rate_single_non_eur = body.rate_single_non_eur || null
    if (body.rate_double_non_eur !== undefined) updateData.rate_double_non_eur = body.rate_double_non_eur || null
    if (body.rate_triple_non_eur !== undefined) updateData.rate_triple_non_eur = body.rate_triple_non_eur || null
    if (body.rate_suite_non_eur !== undefined) updateData.rate_suite_non_eur = body.rate_suite_non_eur || null

    // Seasonal pricing
    if (body.high_season_markup_percent !== undefined) updateData.high_season_markup_percent = body.high_season_markup_percent || null
    if (body.peak_season_markup_percent !== undefined) updateData.peak_season_markup_percent = body.peak_season_markup_percent || null

    // Meal plan
    if (body.meal_plan !== undefined) updateData.meal_plan = body.meal_plan || 'BB'
    if (body.breakfast_included !== undefined) updateData.breakfast_included = body.breakfast_included
    if (body.breakfast_rate_eur !== undefined) updateData.breakfast_rate_eur = body.breakfast_rate_eur || null

    // Validity
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.child_policy !== undefined) updateData.child_policy = body.child_policy || null

    const { data, error } = await supabase
      .from('hotel_contacts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating hotel:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update hotel' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Hotel not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Hotel updated successfully'
    })

  } catch (error) {
    console.error('Error in hotel PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete hotel
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params

    // Check if hotel has assigned itineraries
    const { data: itineraries, error: checkError } = await supabase
      .from('itineraries')
      .select('id')
      .eq('assigned_hotel_id', id)
      .limit(1)

    if (checkError) {
      return NextResponse.json(
        { success: false, error: 'Failed to check hotel assignments' },
        { status: 500 }
      )
    }

    if (itineraries && itineraries.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot delete hotel with assigned bookings. Please unassign bookings first or set hotel to inactive.' 
        },
        { status: 409 }
      )
    }

    const { error } = await supabase
      .from('hotel_contacts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting hotel:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete hotel' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Hotel deleted successfully'
    })

  } catch (error) {
    console.error('Error in hotel DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}