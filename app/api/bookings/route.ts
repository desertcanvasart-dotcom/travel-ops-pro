// =====================================================
// BOOKINGS API - LIST & CREATE
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List bookings with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Filters
    const status = searchParams.get('status')
    const startDateFrom = searchParams.get('startDateFrom')
    const startDateTo = searchParams.get('startDateTo')
    const search = searchParams.get('search')
    const assignedGuideId = searchParams.get('assignedGuideId')

    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build query
    let query = supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('start_date', { ascending: true })

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (startDateFrom) {
      query = query.gte('start_date', startDateFrom)
    }

    if (startDateTo) {
      query = query.lte('start_date', startDateTo)
    }

    if (assignedGuideId) {
      query = query.eq('assigned_guide_id', assignedGuideId)
    }

    if (search) {
      query = query.or(`client_name.ilike.%${search}%,trip_name.ilike.%${search}%,booking_code.ilike.%${search}%`)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: bookings, error, count } = await query

    if (error) {
      console.error('Error fetching bookings:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Get summary counts
    const { data: allBookings } = await supabaseAdmin
      .from('bookings')
      .select('status')

    const summary = {
      total: allBookings?.length || 0,
      pending: allBookings?.filter(b => b.status === 'pending').length || 0,
      supplier_confirmed: allBookings?.filter(b => b.status === 'supplier_confirmed').length || 0,
      payment_received: allBookings?.filter(b => b.status === 'payment_received').length || 0,
      ready: allBookings?.filter(b => b.status === 'ready').length || 0,
      in_progress: allBookings?.filter(b => b.status === 'in_progress').length || 0,
      completed: allBookings?.filter(b => b.status === 'completed').length || 0,
      cancelled: allBookings?.filter(b => b.status === 'cancelled').length || 0,
    }

    return NextResponse.json({
      success: true,
      data: bookings,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      },
      summary
    })
  } catch (error: unknown) {
    console.error('Bookings GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create booking from itinerary
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itinerary_id } = body

    if (!itinerary_id) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }

    // Check if booking already exists for this itinerary
    const { data: existingBooking } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_code')
      .eq('itinerary_id', itinerary_id)
      .single()

    if (existingBooking) {
      return NextResponse.json({
        success: false,
        error: 'Booking already exists for this itinerary',
        existing_booking: existingBooking
      }, { status: 409 })
    }

    // Fetch itinerary data with partner info if linked
    const { data: itinerary, error: itineraryError } = await supabaseAdmin
      .from('itineraries')
      .select('*, b2b_partners(id, company_name, partner_code)')
      .eq('id', itinerary_id)
      .single()

    if (itineraryError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // Extract partner info if linked
    const partnerInfo = itinerary.b2b_partners as { id: string; company_name: string; partner_code: string } | null

    // Generate booking code
    const { data: codeData } = await supabaseAdmin.rpc('generate_booking_code')
    const bookingCode = codeData || `BKG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`

    // Calculate balance due
    const depositAmount = itinerary.total_cost * 0.3 // 30% deposit default
    const balanceDue = itinerary.total_cost - depositAmount

    // Create booking with B2B partner info if linked
    const { data: booking, error: createError } = await supabaseAdmin
      .from('bookings')
      .insert({
        booking_code: bookingCode,
        itinerary_id: itinerary_id,
        client_name: itinerary.client_name,
        client_email: itinerary.client_email,
        client_phone: itinerary.client_phone,
        trip_name: itinerary.trip_name,
        start_date: itinerary.start_date,
        end_date: itinerary.end_date,
        num_adults: itinerary.num_adults || 1,
        num_children: itinerary.num_children || 0,
        total_cost: itinerary.total_cost || 0,
        currency: itinerary.currency || 'EUR',
        tier: itinerary.tier,
        status: 'pending',
        deposit_amount: depositAmount,
        balance_due: balanceDue,
        assigned_guide_id: itinerary.assigned_guide_id,
        assigned_vehicle_id: itinerary.assigned_vehicle_id,
        // B2B Partner info (copied from itinerary)
        partner_id: itinerary.partner_id || null,
        partner_name: partnerInfo?.company_name || null,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating booking:', createError)
      return NextResponse.json({ success: false, error: createError.message }, { status: 500 })
    }

    // Populate suppliers from itinerary services
    const { data: days } = await supabaseAdmin
      .from('itinerary_days')
      .select('id, date, day_number')
      .eq('itinerary_id', itinerary_id)
      .order('day_number', { ascending: true })

    if (days && days.length > 0) {
      const dayIds = days.map(d => d.id)

      const { data: services } = await supabaseAdmin
        .from('itinerary_services')
        .select('*, itinerary_day_id')
        .in('itinerary_day_id', dayIds)

      if (services && services.length > 0) {
        const supplierStatuses = services.map(service => {
          const day = days.find(d => d.id === service.itinerary_day_id)
          return {
            booking_id: booking.id,
            supplier_type: service.service_type || 'other',
            supplier_name: service.service_name || service.supplier_name || 'Unknown',
            service_description: service.notes,
            service_date: day?.date,
            quoted_cost: service.total_cost,
            status: 'pending'
          }
        })

        await supabaseAdmin
          .from('booking_supplier_status')
          .insert(supplierStatuses)
      }
    }

    return NextResponse.json({ success: true, data: booking }, { status: 201 })
  } catch (error: unknown) {
    console.error('Bookings POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
