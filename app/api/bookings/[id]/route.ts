// =====================================================
// BOOKINGS API - SINGLE BOOKING OPERATIONS
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get single booking with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch booking with related data
    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        itinerary:itineraries (
          id,
          itinerary_code,
          status
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching booking:', error)
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    // Fetch suppliers
    const { data: suppliers } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('*')
      .eq('booking_id', id)
      .order('service_date', { ascending: true })

    // Fetch payments
    const { data: payments } = await supabaseAdmin
      .from('booking_payments')
      .select('*')
      .eq('booking_id', id)
      .order('payment_date', { ascending: false })

    // Fetch assigned guide details if exists
    let assignedGuide = null
    if (booking.assigned_guide_id) {
      const { data: guide } = await supabaseAdmin
        .from('suppliers')
        .select('id, name, phone, email')
        .eq('id', booking.assigned_guide_id)
        .single()
      assignedGuide = guide
    }

    return NextResponse.json({
      success: true,
      data: {
        ...booking,
        suppliers: suppliers || [],
        payments: payments || [],
        assigned_guide: assignedGuide,
        supplier_summary: {
          total: suppliers?.length || 0,
          confirmed: suppliers?.filter(s => s.status === 'confirmed').length || 0,
          pending: suppliers?.filter(s => s.status === 'pending').length || 0,
        },
        payment_summary: {
          total_paid: payments?.reduce((sum, p) => sum + (p.payment_type !== 'refund' ? p.amount : -p.amount), 0) || 0,
        }
      }
    })
  } catch (error: unknown) {
    console.error('Booking GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update booking
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Fields that can be updated
    const allowedFields = [
      'status',
      'payment_status',
      'deposit_amount',
      'deposit_paid',
      'deposit_paid_date',
      'balance_due',
      'payment_deadline',
      'assigned_guide_id',
      'assigned_vehicle_id',
      'emergency_contact',
      'emergency_phone',
      'special_requests',
      'operational_notes',
      'cancelled_at',
      'cancellation_reason'
    ]

    // Filter body to only allowed fields
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // If status is being set to cancelled, set cancelled_at
    if (updates.status === 'cancelled' && !updates.cancelled_at) {
      updates.cancelled_at = new Date().toISOString()
    }

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating booking:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: booking })
  } catch (error: unknown) {
    console.error('Booking PUT error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if booking exists
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_code, status')
      .eq('id', id)
      .single()

    if (fetchError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    // Prevent deletion of in-progress or completed bookings
    if (['in_progress', 'completed'].includes(booking.status)) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete a booking that is in progress or completed'
      }, { status: 400 })
    }

    // Delete booking (cascades to suppliers and payments)
    const { error: deleteError } = await supabaseAdmin
      .from('bookings')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting booking:', deleteError)
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Booking ${booking.booking_code} deleted successfully`
    })
  } catch (error: unknown) {
    console.error('Booking DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
