// =====================================================
// BOOKING PAYMENTS API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List payments for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: payments, error } = await supabaseAdmin
      .from('booking_payments')
      .select('*')
      .eq('booking_id', id)
      .order('payment_date', { ascending: false })

    if (error) {
      console.error('Error fetching payments:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Calculate totals
    const totalPaid = payments?.reduce((sum, p) => {
      if (p.payment_type === 'refund') {
        return sum - p.amount
      }
      return sum + p.amount
    }, 0) || 0

    return NextResponse.json({
      success: true,
      data: payments,
      summary: {
        total_paid: totalPaid,
        payment_count: payments?.length || 0
      }
    })
  } catch (error: unknown) {
    console.error('Payments GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Record a new payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { payment_type, amount, payment_date } = body

    if (!payment_type || amount === undefined || !payment_date) {
      return NextResponse.json({
        success: false,
        error: 'payment_type, amount, and payment_date are required'
      }, { status: 400 })
    }

    // Amount must be a positive, finite number — a negative/NaN amount would
    // corrupt the booking's running totals.
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({
        success: false,
        error: 'amount must be a positive number'
      }, { status: 400 })
    }

    // Create payment record
    const { data: payment, error } = await supabaseAdmin
      .from('booking_payments')
      .insert({
        booking_id: id,
        payment_type,
        amount: amountNum,
        currency: body.currency || 'EUR',
        payment_method: body.payment_method || null,
        payment_date,
        transaction_reference: body.transaction_reference || null,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating payment:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Update booking payment status
    await updateBookingPaymentStatus(id)

    return NextResponse.json({ success: true, data: payment }, { status: 201 })
  } catch (error: unknown) {
    console.error('Payments POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to update booking payment status based on payments
async function updateBookingPaymentStatus(bookingId: string) {
  // Get booking details
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('total_cost, deposit_amount')
    .eq('id', bookingId)
    .single()

  if (!booking) return

  // Get all payments
  const { data: payments } = await supabaseAdmin
    .from('booking_payments')
    .select('payment_type, amount')
    .eq('booking_id', bookingId)

  if (!payments) return

  // Calculate total paid
  const totalPaid = payments.reduce((sum, p) => {
    if (p.payment_type === 'refund') {
      return sum - p.amount
    }
    return sum + p.amount
  }, 0)

  // Determine payment status
  let paymentStatus = 'pending'
  let depositPaid = false
  const balanceDue = Math.max(0, (booking.total_cost || 0) - totalPaid)

  if (totalPaid >= (booking.total_cost || 0)) {
    paymentStatus = 'paid'
    depositPaid = true
  } else if (totalPaid >= (booking.deposit_amount || 0)) {
    paymentStatus = totalPaid > (booking.deposit_amount || 0) ? 'partial' : 'deposit_received'
    depositPaid = true
  }

  // Update booking
  const updates: Record<string, unknown> = {
    payment_status: paymentStatus,
    deposit_paid: depositPaid,
    balance_due: balanceDue,
    updated_at: new Date().toISOString()
  }

  // If deposit just paid, record the date
  if (depositPaid) {
    const { data: currentBooking } = await supabaseAdmin
      .from('bookings')
      .select('deposit_paid')
      .eq('id', bookingId)
      .single()

    if (currentBooking && !currentBooking.deposit_paid) {
      updates.deposit_paid_date = new Date().toISOString().split('T')[0]
    }
  }

  // Update booking status if payment received and suppliers confirmed
  const { data: bookingData } = await supabaseAdmin
    .from('bookings')
    .select('status')
    .eq('id', bookingId)
    .single()

  if (bookingData && paymentStatus !== 'pending') {
    if (bookingData.status === 'supplier_confirmed') {
      updates.status = 'payment_received'
    } else if (bookingData.status === 'pending' && paymentStatus === 'deposit_received') {
      // Don't auto-update status if just deposit received and suppliers not confirmed
    }
  }

  await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
}
