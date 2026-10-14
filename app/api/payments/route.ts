import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { blankToNull } from '@/lib/blank-to-null'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentCurrencyFor } from '@/lib/payment-currency'
import { checkPaymentAmount, pickPaymentFields } from '@/lib/payments/fields'
import { tripPaymentVatColumns } from '@/lib/payments/vat'
import { loadTripVatExtras } from '@/lib/vat'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()

    // Clamp the caller-supplied limit to a sane range so a huge `?limit=` can't
    // be used to extract the whole table / exhaust memory. Default 100, max 1000.
    const { searchParams } = new URL(request.url)
    const requestedLimit = parseInt(searchParams.get('limit') || '100')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 100
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const from = (page - 1) * limit
    // One trip's payments (the New Payment screen works out what it has paid).
    const itineraryId = searchParams.get('itineraryId')

    let query = supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          org_id,
          itinerary_code,
          client_name,
          client_phone,
          client_email,
          total_cost
        )
      `)
      .eq('org_id', orgId)
    if (itineraryId) query = query.eq('itinerary_id', itineraryId)
    const { data: payments, error } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    if (error) throw error

    // Only this org's trip (as GET /api/payments/[id] does): itinerary_id was
    // stored as given on older payments, and another company's trip would
    // show that company's client, phone, email and total on our pages.
    const formattedPayments = payments?.map((p: any) => {
      const trip = p.itineraries?.org_id === orgId ? p.itineraries : null
      return {
        ...p,
        itineraries: trip,
        itinerary_code: trip?.itinerary_code,
        client_name: trip?.client_name,
        client_phone: trip?.client_phone,
        client_email: trip?.client_email,
        total_cost: trip?.total_cost
      }
    })

    return NextResponse.json({
      success: true,
      data: formattedPayments || []
    })
  } catch (error: any) {
    console.error('GET /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    // A form field the user left alone arrives as "", and "" is not a date:
    // `due_date: ""` made Postgres reject the whole insert, which is how this
    // route silently discarded payments (AUT-W01).
    const body = blankToNull(await request.json())

    // Only the columns a caller may set (lib/payments/fields): the body used
    // to be spread into the insert, id and created_at included.
    const fields = pickPaymentFields(body)

    // Validate the amount is a positive, finite number before recording — a
    // negative/NaN/string amount would silently corrupt invoice balances.
    const checked = checkPaymentAmount(fields.amount)
    if (!checked.ok) {
      return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
    }
    fields.amount = checked.amount

    // The trip must be this org's, and the payment in its currency — the
    // receipt prints it (lib/org-refs, lib/payment-currency). Its VAT is
    // written on the payment (lib/payments/vat): the receipt states the VAT it
    // was recorded with, whatever the trip says later.
    let vatColumns: Record<string, unknown> = {}
    if (fields.itinerary_id) {
      if (typeof fields.itinerary_id !== 'string') {
        return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
      }
      const { data: trip } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', fields.itinerary_id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!trip) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
      const paid = paymentCurrencyFor(fields.currency, trip.currency)
      if (!paid.ok) return NextResponse.json({ success: false, error: paid.error }, { status: 400 })
      fields.currency = paid.currency
      vatColumns = tripPaymentVatColumns(
        checked.amount,
        trip.vat_applied === true ? { ...trip, ...(await loadTripVatExtras(supabase, trip.id)) } : trip,
        paid.currency
      )
    }

    // M3 Phase 2A: stamp org_id from the session, never from the body.
    const { data, error } = await supabase
      .from('payments')
      .insert([{ ...fields, ...vatColumns, org_id: orgId }])
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('POST /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
