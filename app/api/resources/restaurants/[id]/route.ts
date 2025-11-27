// ============================================
// API Route: /api/resources/restaurants/[id]/route.ts
// ============================================
// Single restaurant operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// GET - Get single restaurant
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = params

    const { data, error } = await supabase
      .from('restaurant_contacts')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in restaurant GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update restaurant
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = params
    const body = await request.json()

    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.restaurant_type !== undefined) updateData.restaurant_type = body.restaurant_type
    if (body.cuisine_type !== undefined) updateData.cuisine_type = body.cuisine_type
    if (body.city !== undefined) updateData.city = body.city
    if (body.address !== undefined) updateData.address = body.address
    if (body.contact_person !== undefined) updateData.contact_person = body.contact_person
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.email !== undefined) updateData.email = body.email
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.capacity !== undefined) updateData.capacity = body.capacity
    if (body.meal_types !== undefined) updateData.meal_types = body.meal_types
    if (body.dietary_options !== undefined) updateData.dietary_options = body.dietary_options
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabase
      .from('restaurant_contacts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating restaurant:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update restaurant' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Restaurant updated successfully'
    })

  } catch (error) {
    console.error('Error in restaurant PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete restaurant
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = params

    // Check if restaurant has assigned itineraries
    const { data: itineraries, error: checkError } = await supabase
      .from('itineraries')
      .select('id')
      .eq('assigned_restaurant_id', id)
      .limit(1)

    if (checkError) {
      return NextResponse.json(
        { success: false, error: 'Failed to check restaurant assignments' },
        { status: 500 }
      )
    }

    if (itineraries && itineraries.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot delete restaurant with assigned bookings. Please unassign bookings first or set restaurant to inactive.' 
        },
        { status: 409 }
      )
    }

    const { error } = await supabase
      .from('restaurant_contacts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting restaurant:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete restaurant' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurant deleted successfully'
    })

  } catch (error) {
    console.error('Error in restaurant DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}