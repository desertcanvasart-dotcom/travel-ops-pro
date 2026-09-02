// app/api/rates/airport-services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('airport_staff_rates')
      .select('*')
      .order('airport_code')
      .order('service_type')

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    // An unpicked supplier arrives from the form as '' and the column is a
    // uuid, which would fail the insert. Absent is null, not empty.
    const payload = { ...body, supplier_id: body.supplier_id || null }

    // Check for existing rate with same natural key
    let existingQuery = supabase
      .from('airport_staff_rates')
      .select('id')
    if (body.airport_code) {
      existingQuery = existingQuery.eq('airport_code', body.airport_code)
    } else {
      existingQuery = existingQuery.is('airport_code', null)
    }
    if (body.service_type) {
      existingQuery = existingQuery.eq('service_type', body.service_type)
    } else {
      existingQuery = existingQuery.is('service_type', null)
    }
    // A rate belongs to a supplier: two companies may quote the same service,
    // and a key that ignores the supplier makes the second overwrite the first.
    if (payload.supplier_id) {
      existingQuery = existingQuery.eq('supplier_id', payload.supplier_id)
    } else {
      existingQuery = existingQuery.is('supplier_id', null)
    }
    const { data: existing } = await existingQuery.limit(1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: 'A rate with these details already exists. Edit that rate, or change what makes this one different (supplier, period, class, city) before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabase
        .from('airport_staff_rates')
        .insert([payload])
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}