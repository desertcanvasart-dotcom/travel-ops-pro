import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { blankToNull } from '@/lib/blank-to-null'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentCurrencyFor } from '@/lib/payment-currency'
import { loadTripVatExtras } from '@/lib/vat'
import { checkPaymentAmount, pickPaymentFields } from '@/lib/payments/fields'
import { tripPaymentVatColumns } from '@/lib/payments/vat'

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
    // No VAT on the trip's extras (owner, 2026-10-13): the payment's VAT is
    // worked out on the taxed share of the trip (lib/vat.ts vatInsideGross).
    // A payment records its own VAT when it is made (lib/payments/vat); one
    // from before that has NULL and still reads the trip.
    const recorded = typeof payment.vat_applied === 'boolean'
    const taxed = recorded ? payment.vat_applied === true : trip?.vat_applied === true
    const extras = taxed && trip ? await loadTripVatExtras(supabase, trip.id) : null

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
      // The VAT (lib/vat.ts) the payment's invoice and receipt state inside the
      // amount paid: the payment's own record, else the trip's. '*' above so a
      // database without the columns (migration 20261214) still answers.
      vat_recorded: recorded,
      ...(recorded ? {} : { vat_applied: trip?.vat_applied === true, vat_rate: trip?.vat_rate ?? null }),
      ...(extras && extras.vat_excluded > 0 ? { vat_excluded: extras.vat_excluded, vat_net: extras.vat_net } : {}),
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
    // As POST: a form field left alone arrives as "", and "" is not a date.
    const body = blankToNull(await request.json())

    // Only the columns a caller may set (lib/payments/fields), as POST: org_id
    // (a payment cannot be re-homed into another org), the receipt number and
    // the recorded VAT are not the caller's.
    const safeBody = pickPaymentFields(body)
    if (Object.keys(safeBody).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    // As POST, an amount must be a positive number.
    if ('amount' in safeBody) {
      const checked = checkPaymentAmount(safeBody.amount)
      if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
      safeBody.amount = checked.amount
    }

    // As POST: the trip is this org's and the payment is in its currency.
    // A new amount, trip or currency re-records the VAT inside the payment.
    if ('itinerary_id' in safeBody || 'currency' in safeBody || 'amount' in safeBody) {
      const { data: current } = await supabase
        .from('payments')
        .select('*')
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
          .select('*')
          .eq('id', tripId)
          .eq('org_id', orgId)
          .maybeSingle()
        if (!trip) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
        // Only a changed trip or currency is held to the trip's currency; a new
        // amount alone leaves the payment's own.
        let currency = current.currency
        if ('itinerary_id' in safeBody || 'currency' in safeBody) {
          const paid = paymentCurrencyFor(safeBody.currency, trip.currency)
          if (!paid.ok) return NextResponse.json({ success: false, error: paid.error }, { status: 400 })
          safeBody.currency = paid.currency
          currency = paid.currency
        }
        // Same trip and a payment that already records its VAT: keep the
        // flag and rate it was recorded with, re-work the amount.
        const sameTrip = tripId === current.itinerary_id && typeof current.vat_applied === 'boolean'
        const vatFacts = sameTrip ? { vat_applied: current.vat_applied, vat_rate: current.vat_rate } : trip
        Object.assign(safeBody, tripPaymentVatColumns(
          'amount' in safeBody ? safeBody.amount : current.amount,
          vatFacts.vat_applied === true ? { ...vatFacts, ...(await loadTripVatExtras(supabase, trip.id)) } : vatFacts,
          currency
        ))
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