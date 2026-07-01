import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

// GET /api/bookings/[id]/passengers — passenger manifest for a booking (org-scoped).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth

    const { data: passengers, error } = await supabase
      .from('booking_passengers')
      .select('*')
      .eq('booking_id', id)
      .eq('org_id', org_id)
      .order('is_lead_passenger', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching passengers:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch passengers' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: passengers || [] })
  } catch (error: any) {
    console.error('Error in passengers GET:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/bookings/[id]/passengers — add a passenger to a booking (org-scoped).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    const body = await request.json()

    // Verify the booking exists and belongs to this org.
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', id)
      .eq('org_id', org_id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    const {
      title,
      first_name,
      last_name,
      date_of_birth,
      gender,
      nationality,
      email,
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      passport_number,
      passport_expiry,
      passport_issuing_country,
      visa_required,
      passenger_type = 'adult',
      is_lead_passenger = false,
      room_type,
      meal_preference,
      mobility_requirements,
      medical_conditions,
      special_requests,
    } = body

    if (!first_name || !last_name) {
      return NextResponse.json({ success: false, error: 'First name and last name are required' }, { status: 400 })
    }

    const passengerData = {
      org_id,
      booking_id: id,
      title,
      first_name,
      last_name,
      date_of_birth,
      gender,
      nationality,
      email,
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      passport_number,
      passport_expiry,
      passport_issuing_country,
      visa_required,
      passenger_type,
      is_lead_passenger,
      room_type,
      meal_preference,
      mobility_requirements,
      medical_conditions,
      special_requests,
    }

    const { data: passenger, error } = await supabase
      .from('booking_passengers')
      .insert(passengerData)
      .select()
      .single()

    if (error) {
      console.error('Error creating passenger:', error)
      return NextResponse.json({ success: false, error: 'Failed to create passenger' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Passenger added successfully', data: passenger })
  } catch (error: any) {
    console.error('Error in passenger POST:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
