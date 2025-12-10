// ============================================
// API Route: /api/vehicles/[id]
// ============================================
// Handles single vehicle operations
// GET: Get vehicle details
// PUT: Update vehicle
// DELETE: Delete vehicle
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    
    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !vehicle) {
      return NextResponse.json(
        { success: false, error: 'Vehicle not found' },
        { status: 404 }
      )
    }
    
    // Get associated bookings
    const { data: bookings } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, client_name, start_date, end_date, total_cost, num_travelers')
      .eq('assigned_vehicle_id', id)
      .order('start_date', { ascending: true })
    
    return NextResponse.json({
      success: true,
      data: {
        ...vehicle,
        bookings: bookings || [],
      },
    })
    
  } catch (error) {
    console.error('Error in vehicle GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()
    
    // Prepare update data (only include provided fields)
    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.vehicle_type !== undefined) {
      const validTypes = ['car', 'sedan', 'van', 'minivan', 'minibus', 'bus', 'suv']
      if (!validTypes.includes(body.vehicle_type)) {
        return NextResponse.json(
          { success: false, error: 'Invalid vehicle type' },
          { status: 400 }
        )
      }
      updateData.vehicle_type = body.vehicle_type
    }
    if (body.make !== undefined) updateData.make = body.make
    if (body.model !== undefined) updateData.model = body.model
    if (body.year !== undefined) updateData.year = body.year
    if (body.license_plate !== undefined) updateData.license_plate = body.license_plate
    if (body.registration_number !== undefined) updateData.registration_number = body.registration_number
    if (body.passenger_capacity !== undefined) updateData.passenger_capacity = body.passenger_capacity
    if (body.has_ac !== undefined) updateData.has_ac = body.has_ac
    if (body.has_wifi !== undefined) updateData.has_wifi = body.has_wifi
    if (body.is_luxury !== undefined) updateData.is_luxury = body.is_luxury
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.current_mileage !== undefined) updateData.current_mileage = body.current_mileage
    if (body.last_service_date !== undefined) updateData.last_service_date = body.last_service_date || null
    if (body.next_service_date !== undefined) updateData.next_service_date = body.next_service_date || null
    if (body.insurance_expiry !== undefined) updateData.insurance_expiry = body.insurance_expiry || null
    if (body.daily_rate !== undefined) updateData.daily_rate = body.daily_rate
    if (body.rate_per_km !== undefined) updateData.rate_per_km = body.rate_per_km
    if (body.default_driver_name !== undefined) updateData.default_driver_name = body.default_driver_name
    if (body.default_driver_phone !== undefined) updateData.default_driver_phone = body.default_driver_phone
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.photo_url !== undefined) updateData.photo_url = body.photo_url
    if (body.tier !== undefined) updateData.tier = body.tier
    if (body.is_preferred !== undefined) updateData.is_preferred = body.is_preferred
    if (body.city !== undefined) updateData.city = body.city
    
    // Update in database
    
    // Update in database
    const { data, error } = await supabase
      .from('vehicles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating vehicle:', error)
      
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A vehicle with this license plate already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to update vehicle' },
        { status: 500 }
      )
    }
    
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Vehicle not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: 'Vehicle updated successfully',
    })
    
  } catch (error) {
    console.error('Error in vehicle PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    
    // Check if vehicle has any assigned bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('itineraries')
      .select('id')
      .eq('assigned_vehicle_id', id)
      .limit(1)
    
    if (bookingsError) {
      return NextResponse.json(
        { success: false, error: 'Failed to check vehicle assignments' },
        { status: 500 }
      )
    }
    
    // If vehicle has bookings, don't allow deletion
    if (bookings && bookings.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot delete vehicle with assigned bookings. Please unassign bookings first or set vehicle to inactive.' 
        },
        { status: 409 }
      )
    }
    
    // Delete vehicle
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting vehicle:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete vehicle' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Vehicle deleted successfully',
    })
    
  } catch (error) {
    console.error('Error in vehicle DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}