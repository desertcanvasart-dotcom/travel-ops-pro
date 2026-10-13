import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentCurrencyFor } from '@/lib/payment-currency'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()

    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries ( * )
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) throw error

    // Only this org's trip (as send-receipt does): itinerary_id was stored as
    // given on older payments, and another company's trip would print that
    // company's client, phone, email and total on our invoice and receipt.
    const trip = payment.itineraries?.org_id === orgId ? payment.itineraries : null

    const formattedPayment = {
      ...payment,
      itineraries: trip,
      itinerary_code: trip?.itinerary_code,
      client_name: trip?.client_name,
      // The receipt's WhatsApp button and the email on the invoice and
      // receipt need these; the list route already returned them.
      client_phone: trip?.client_phone,
      client_email: trip?.client_email,
      total_cost: trip?.total_cost,
      // The trip's VAT (lib/vat.ts) — the payment's invoice and receipt state
      // the VAT inside the amount paid. '*' above so a database without the
      // columns (migration 20261214) still answers.
      vat_applied: trip?.vat_applied === true,
      vat_rate: trip?.vat_rate ?? null,
    }

    return NextResponse.json({
      success: true,
      data: formattedPayment
    })
  } catch (error: any) {
    console.error('GET payment error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()
    const body = await request.json()

    console.log('Updating payment:', id, body)

    // M3 Phase 2A: strip any caller-supplied org_id so an update can't
    // re-home a payment row into another org.
    const { org_id: _ignoredOrgId, ...safeBody } = body

    // As POST: the trip is this org's and the payment is in its currency.
    if ('itinerary_id' in safeBody || 'currency' in safeBody) {
      const { data: current } = await supabase
        .from('payments')
        .select('itinerary_id')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!current) return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
      const tripId = 'itinerary_id' in safeBody ? safeBody.itinerary_id : current.itinerary_id
      if (tripId) {
        if (typeof tripId !== 'string') {
          return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
        }
        const { data: trip } = await supabase
          .from('itineraries')
          .select('id, currency')
          .eq('id', tripId)
          .eq('org_id', orgId)
          .maybeSingle()
        if (!trip) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
        const paid = paymentCurrencyFor(safeBody.currency, trip.currency)
        if (!paid.ok) return NextResponse.json({ success: false, error: paid.error }, { status: 400 })
        safeBody.currency = paid.currency
      }
    }

    const { data, error } = await supabase
      .from('payments')
      .update(safeBody)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) {
      console.error('Supabase update error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('PUT payment error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()

    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) throw error

    return NextResponse.json({
      success: true
    })
  } catch (error: any) {
    console.error('DELETE payment error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}