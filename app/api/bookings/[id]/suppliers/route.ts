// =====================================================
// BOOKING SUPPLIERS API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List suppliers for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: suppliers, error } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('*')
      .eq('booking_id', id)
      .order('service_date', { ascending: true })

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load suppliers') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: suppliers })
  } catch (error: unknown) {
    console.error('Suppliers GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Add supplier or update status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // If supplier_id is provided in body, update existing supplier
    if (body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

      // Update status and confirmation details
      if (body.status !== undefined) updates.status = body.status
      if (body.confirmation_number !== undefined) updates.confirmation_number = body.confirmation_number
      if (body.confirmation_notes !== undefined) updates.confirmation_notes = body.confirmation_notes
      if (body.confirmed_cost !== undefined) updates.confirmed_cost = body.confirmed_cost

      // If marking as confirmed, set confirmed_at
      if (body.status === 'confirmed' && !body.confirmed_at) {
        updates.confirmed_at = new Date().toISOString()
      }

      const { data: supplier, error } = await supabaseAdmin
        .from('booking_supplier_status')
        .update(updates)
        .eq('id', body.id)
        .eq('booking_id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating supplier:', error)
        return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to update supplier') }, { status: 500 })
      }

      // Check if all suppliers are confirmed and update booking status
      await checkAndUpdateBookingStatus(id)

      return NextResponse.json({ success: true, data: supplier })
    }

    // Create new supplier entry
    const { supplier_type, supplier_name } = body

    if (!supplier_type || !supplier_name) {
      return NextResponse.json({
        success: false,
        error: 'supplier_type and supplier_name are required'
      }, { status: 400 })
    }

    const { data: supplier, error } = await supabaseAdmin
      .from('booking_supplier_status')
      .insert({
        booking_id: id,
        supplier_id: body.supplier_id || null,
        supplier_type,
        supplier_name,
        service_description: body.service_description || null,
        service_date: body.service_date || null,
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        quoted_cost: body.quoted_cost || null,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to create supplier') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: supplier }, { status: 201 })
  } catch (error: unknown) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to check if all suppliers are confirmed and update booking status
async function checkAndUpdateBookingStatus(bookingId: string) {
  const { data: suppliers } = await supabaseAdmin
    .from('booking_supplier_status')
    .select('status')
    .eq('booking_id', bookingId)

  if (!suppliers || suppliers.length === 0) return

  const allConfirmed = suppliers.every(s => s.status === 'confirmed')

  if (allConfirmed) {
    // Get current booking status
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single()

    // Only auto-update if still in pending status
    if (booking && booking.status === 'pending') {
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'supplier_confirmed', updated_at: new Date().toISOString() })
        .eq('id', bookingId)
    }
  }
}
