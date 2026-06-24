// =====================================================
// BOOKING PAYMENTS API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // M3 Phase 2A: verify the parent booking belongs to this org BEFORE
    // returning its child payments. booking_payments has no org_id of its
    // own — it inherits via FK — so without this check one org could read
    // another's payments by guessing a booking_id. We fold the currency
    // fetch (used below for M21 totals) into the same query.
    const { data: bookingRow } = await supabaseAdmin
      .from('bookings')
      .select('currency')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!bookingRow) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    const { data: payments, error } = await supabaseAdmin
      .from('booking_payments')
      .select('*')
      .eq('booking_id', id)
      .order('payment_date', { ascending: false })

    if (error) {
      console.error('Error fetching payments:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // M21: aggregate per-currency. Summing 1000 USD + 1000 EUR into 2000
    // and comparing against an EUR booking is wrong; the response now
    // returns both a per-currency breakdown AND a flat totalPaid for the
    // PRIMARY currency (= the booking's currency when known, else EUR).
    const bookingCurrency = bookingRow?.currency || 'EUR'

    const totalsByCurrency: Record<string, number> = {}
    for (const p of payments || []) {
      const c = p.currency || 'EUR'
      const signed = p.payment_type === 'refund' ? -p.amount : p.amount
      totalsByCurrency[c] = (totalsByCurrency[c] || 0) + signed
    }
    const totalPaid = totalsByCurrency[bookingCurrency] || 0

    return NextResponse.json({
      success: true,
      data: payments,
      summary: {
        total_paid: totalPaid,
        currency: bookingCurrency,
        totals_by_currency: totalsByCurrency,
        payment_count: payments?.length || 0,
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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

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

    // M21: a booking has a single currency. Pre-flight read just so the API
    // returns a friendly 400 instead of letting the DB raise — the RPC also
    // enforces this server-side. M3 Phase 2A: org-scope the read so a caller
    // can't record a payment against another org's booking_id.
    const { data: bookingCurrencyRow } = await supabaseAdmin
      .from('bookings')
      .select('currency')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!bookingCurrencyRow) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }
    const bookingCurrency = bookingCurrencyRow?.currency || 'EUR'
    const paymentCurrency = body.currency || bookingCurrency
    if (paymentCurrency !== bookingCurrency) {
      return NextResponse.json({
        success: false,
        error: `Payment currency (${paymentCurrency}) must match booking currency (${bookingCurrency})`,
      }, { status: 400 })
    }

    // M20: route the INSERT + booking-status recompute through a single
    // PL/pgSQL function that takes a SELECT ... FOR UPDATE lock on the
    // booking, so two concurrent POSTs serialize on this booking_id. The
    // previous JS pattern (insert, then read all payments, sum, update)
    // ran without a lock — two interleaved calls each computed stale
    // totals and the last writer wiped out the other's transition.
    const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc('record_booking_payment', {
      p_booking_id: id,
      p_payment_type: payment_type,
      p_amount: amountNum,
      p_currency: paymentCurrency,
      p_payment_method: body.payment_method || null,
      p_payment_date: payment_date,
      p_transaction_reference: body.transaction_reference || null,
      p_notes: body.notes || null,
    })

    if (rpcError) {
      console.error('Error recording booking payment:', rpcError)
      return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 })
    }

    const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows
    const paymentId = rpcResult?.payment_id

    // Re-fetch the inserted row so the response shape matches the prior
    // behavior (full row with all columns + the DB-generated defaults).
    const { data: payment } = paymentId
      ? await supabaseAdmin.from('booking_payments').select('*').eq('id', paymentId).single()
      : { data: null as any }

    return NextResponse.json({
      success: true,
      data: payment,
      booking_summary: rpcResult
        ? {
            payment_status: rpcResult.payment_status,
            balance_due: rpcResult.balance_due,
            deposit_paid: rpcResult.deposit_paid,
          }
        : null,
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Payments POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// updateBookingPaymentStatus() lived here pre-M20 and ran the booking total
// recompute as a series of separate, unlocked queries. Replaced by the
// record_booking_payment PL/pgSQL function (migrations/20260624_record_
// booking_payment_atomic.sql) which does the insert + recompute inside a
// single SELECT ... FOR UPDATE transaction. The function is removed from
// this file rather than left as dead code so a future caller can't bypass
// the lock by accident.
