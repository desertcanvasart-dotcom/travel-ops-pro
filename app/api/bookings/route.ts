// =====================================================
// BOOKINGS API - LIST & CREATE
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import {
  buildBookingRow,
  populateSuppliersFromItinerary,
  DEFAULT_DEPOSIT_PERCENT,
} from '@/lib/booking-creation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List bookings with filters
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)

    // Filters
    const status = searchParams.get('status')
    const startDateFrom = searchParams.get('startDateFrom')
    const startDateTo = searchParams.get('startDateTo')
    const search = sanitizeSearchTerm(searchParams.get('search'))
    const assignedGuideId = searchParams.get('assignedGuideId')

    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build query
    let query = supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
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
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Get summary counts
    const { data: allBookings } = await supabaseAdmin
      .from('bookings')
      .select('status')
      .eq('org_id', orgId)

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

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
      .eq('org_id', orgId)
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
      .eq('org_id', orgId)
      .single()

    if (itineraryError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // Extract partner info if linked
    const partnerInfo = itinerary.b2b_partners as { id: string; company_name: string; partner_code: string } | null

    // Generate booking code
    const { data: codeData } = await supabaseAdmin.rpc('generate_booking_code')
    const bookingCode = codeData || `BKG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`

    // Row shape (and the deposit/balance arithmetic) is shared with
    // /api/bookings/from-quote so the two entry points cannot drift.
    //
    // NOTE: balance_due is now the FULL total, not total - deposit. It has to be:
    // record_booking_payment() recomputes it as greatest(0, total_cost -
    // total_paid), so the old value showed 70% owed on a booking where nothing
    // had been paid, then jumped up on the first payment.
    const { data: booking, error: createError } = await supabaseAdmin
      .from('bookings')
      .insert(
        buildBookingRow({
          orgId,
          bookingCode,
          itinerary,
          depositPercent: DEFAULT_DEPOSIT_PERCENT,
          partnerName: partnerInfo?.company_name ?? null,
        })
      )
      .select()
      .single()

    if (createError) {
      console.error('Error creating booking:', createError)
      return NextResponse.json({ success: false, error: clientMessage(createError, 'Internal server error') }, { status: 500 })
    }

    // Populate suppliers from itinerary services (shared with from-quote)
    const suppliers = await populateSuppliersFromItinerary(supabaseAdmin, booking.id, itinerary_id)
    if (suppliers.error) {
      console.error('Booking created but supplier manifest failed:', suppliers.error)
    }

    return NextResponse.json({ success: true, data: booking }, { status: 201 })
  } catch (error: unknown) {
    console.error('Bookings POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
