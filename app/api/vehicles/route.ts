// ============================================
// API Route: /api/vehicles
// ============================================
// Handles CRUD operations for vehicles
// GET: List all vehicles (with filters)
// POST: Create new vehicle
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    
    // Parse query parameters
    const search = searchParams.get('search') || ''
    const vehicle_type = searchParams.get('vehicle_type')
    const is_active = searchParams.get('is_active')
    const min_capacity = searchParams.get('min_capacity')
    const availability_from = searchParams.get('availability_from')
    const availability_to = searchParams.get('availability_to')
    const exclude_itinerary_id = searchParams.get('exclude_itinerary_id') // ⭐ NEW
    const with_stats = searchParams.get('with_stats') === 'true'
    
    // Build query
    let query = supabase
      .from('vehicles')
      .select('*')
      .order('name', { ascending: true })
    
    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,license_plate.ilike.%${search}%,make.ilike.%${search}%`)
    }
    
    if (vehicle_type) {
      query = query.eq('vehicle_type', vehicle_type)
    }
    
    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true')
    }
    
    if (min_capacity) {
      query = query.gte('passenger_capacity', parseInt(min_capacity))
    }
    
    const { data: vehicles, error } = await query
    
    if (error) {
      console.error('Error fetching vehicles:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch vehicles' },
        { status: 500 }
      )
    }
    
    // If checking availability, filter out vehicles with conflicting bookings
    let availableVehicles = vehicles
    if (availability_from && availability_to) {
      // ⭐ UPDATED: Build query to check conflicts, excluding current itinerary
      let bookingsQuery = supabase
        .from('itineraries')
        .select('assigned_vehicle_id')
        .not('assigned_vehicle_id', 'is', null)
        .or(`and(start_date.lte.${availability_to},end_date.gte.${availability_from})`)
      
      // ⭐ NEW: Exclude the current itinerary from conflict check
      if (exclude_itinerary_id) {
        bookingsQuery = bookingsQuery.neq('id', exclude_itinerary_id)
      }
      
      const { data: bookings } = await bookingsQuery
      
      const bookedVehicleIds = bookings?.map(b => b.assigned_vehicle_id) || []
      availableVehicles = vehicles?.filter(v => !bookedVehicleIds.includes(v.id))
    }
    
    // Add statistics if requested
    if (with_stats && availableVehicles) {
      const vehiclesWithStats = await Promise.all(
        availableVehicles.map(async (vehicle) => {
          const { data: bookings } = await supabase
            .from('itineraries')
            .select('id, start_date, end_date, total_cost')
            .eq('assigned_vehicle_id', vehicle.id)
          
          const now = new Date()
          const activeBookings = bookings?.filter(b => 
            new Date(b.start_date) <= now && new Date(b.end_date) >= now
          ).length || 0
          
          const upcomingBookings = bookings?.filter(b => 
            new Date(b.start_date) > now
          ).length || 0
          
          const totalRevenue = bookings?.reduce((sum, b) => sum + (b.total_cost || 0), 0) || 0
          
          return {
            ...vehicle,
            active_bookings: activeBookings,
            upcoming_bookings: upcomingBookings,
            total_revenue: totalRevenue,
          }
        })
      )
      
      return NextResponse.json({
        success: true,
        data: vehiclesWithStats,
        total: vehiclesWithStats.length,
      })
    }
    
    return NextResponse.json({
      success: true,
      data: availableVehicles,
      total: availableVehicles?.length || 0,
    })
    
  } catch (error) {
    console.error('Error in vehicles GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Vehicle name is required' },
        { status: 400 }
      )
    }
    
    if (!body.vehicle_type) {
      return NextResponse.json(
        { success: false, error: 'Vehicle type is required' },
        { status: 400 }
      )
    }
    
    if (!body.passenger_capacity) {
      return NextResponse.json(
        { success: false, error: 'Passenger capacity is required' },
        { status: 400 }
      )
    }
    
    // Validate vehicle type
    const validTypes = ['car', 'van', 'minibus', 'bus', 'suv']
    if (!validTypes.includes(body.vehicle_type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid vehicle type' },
        { status: 400 }
      )
    }
    
    // Prepare vehicle data
    const vehicleData = {
      name: body.name,
      vehicle_type: body.vehicle_type,
      make: body.make || null,
      model: body.model || null,
      year: body.year || null,
      license_plate: body.license_plate || null,
      registration_number: body.registration_number || null,
      passenger_capacity: body.passenger_capacity,
      has_ac: body.has_ac !== undefined ? body.has_ac : true,
      has_wifi: body.has_wifi !== undefined ? body.has_wifi : false,
      is_luxury: body.is_luxury !== undefined ? body.is_luxury : false,
      is_active: body.is_active !== undefined ? body.is_active : true,
      current_mileage: body.current_mileage || null,
      last_service_date: body.last_service_date || null,
      next_service_date: body.next_service_date || null,
      insurance_expiry: body.insurance_expiry || null,
      daily_rate: body.daily_rate || null,
      rate_per_km: body.rate_per_km || null,
      default_driver_name: body.default_driver_name || null,
      default_driver_phone: body.default_driver_phone || null,
      notes: body.notes || null,
      photo_url: body.photo_url || null,
    }
    
    // Insert into database
    const { data, error } = await supabase
      .from('vehicles')
      .insert([vehicleData])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating vehicle:', error)
      
      // Check for unique constraint violation (license_plate)
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A vehicle with this license plate already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to create vehicle' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: 'Vehicle created successfully',
    }, { status: 201 })
    
  } catch (error) {
    console.error('Error in vehicles POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}