// ============================================
// API Route: /api/guides
// ============================================
// Handles CRUD operations for tour guides
// GET: List all guides (with filters)
// POST: Create new guide
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    
    // Parse query parameters
    const search = searchParams.get('search') || ''
    const is_active = searchParams.get('is_active')
    const availability_from = searchParams.get('availability_from')
    const availability_to = searchParams.get('availability_to')
    const exclude_itinerary_id = searchParams.get('exclude_itinerary_id') // ⭐ NEW
    const with_stats = searchParams.get('with_stats') === 'true'
    
    // Build query
    let query = supabase
      .from('guides')
      .select('*')
      .order('name', { ascending: true })
    
    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    
    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true')
    }
    
    const { data: guides, error } = await query
    
    if (error) {
      console.error('Error fetching guides:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch guides' },
        { status: 500 }
      )
    }
    
    // If checking availability, filter out guides with conflicting bookings
    let availableGuides = guides
    if (availability_from && availability_to) {
      // ⭐ UPDATED: Build query to check conflicts, excluding current itinerary
      let bookingsQuery = supabase
        .from('itineraries')
        .select('assigned_guide_id')
        .not('assigned_guide_id', 'is', null)
        .or(`and(start_date.lte.${availability_to},end_date.gte.${availability_from})`)
      
      // ⭐ NEW: Exclude the current itinerary from conflict check
      if (exclude_itinerary_id) {
        bookingsQuery = bookingsQuery.neq('id', exclude_itinerary_id)
      }
      
      const { data: bookings } = await bookingsQuery
      
      const bookedGuideIds = bookings?.map(b => b.assigned_guide_id) || []
      availableGuides = guides?.filter(g => !bookedGuideIds.includes(g.id))
    }
    
    // Add statistics if requested
    if (with_stats && availableGuides) {
      const guidesWithStats = await Promise.all(
        availableGuides.map(async (guide) => {
          const { data: bookings } = await supabase
            .from('itineraries')
            .select('id, start_date, end_date, total_cost')
            .eq('assigned_guide_id', guide.id)
          
          const now = new Date()
          const activeBookings = bookings?.filter(b => 
            new Date(b.start_date) <= now && new Date(b.end_date) >= now
          ).length || 0
          
          const upcomingBookings = bookings?.filter(b => 
            new Date(b.start_date) > now
          ).length || 0
          
          const totalRevenue = bookings?.reduce((sum, b) => sum + (b.total_cost || 0), 0) || 0
          
          return {
            ...guide,
            active_bookings: activeBookings,
            upcoming_bookings: upcomingBookings,
            total_revenue: totalRevenue,
          }
        })
      )
      
      return NextResponse.json({
        success: true,
        data: guidesWithStats,
        total: guidesWithStats.length,
      })
    }
    
    return NextResponse.json({
      success: true,
      data: availableGuides,
      total: availableGuides?.length || 0,
    })
    
  } catch (error) {
    console.error('Error in guides GET:', error)
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
        { success: false, error: 'Guide name is required' },
        { status: 400 }
      )
    }
    
    // Prepare guide data
    const guideData = {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      languages: body.languages || [],
      specialties: body.specialties || [],
      certification_number: body.certification_number || null,
      license_expiry: body.license_expiry || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      max_group_size: body.max_group_size || null,
      hourly_rate: body.hourly_rate || null,
      daily_rate: body.daily_rate || null,
      emergency_contact_name: body.emergency_contact_name || null,
      emergency_contact_phone: body.emergency_contact_phone || null,
      address: body.address || null,
      notes: body.notes || null,
      profile_photo_url: body.profile_photo_url || null,
    }
    
    // Insert into database
    const { data, error } = await supabase
      .from('guides')
      .insert([guideData])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating guide:', error)
      
      // Check for unique constraint violation (email)
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A guide with this email already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to create guide' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: 'Guide created successfully',
    }, { status: 201 })
    
  } catch (error) {
    console.error('Error in guides POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}