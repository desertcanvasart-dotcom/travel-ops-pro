// app/api/rates/airport-services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateRatePayload } from '@/lib/rate-validation'
import { createClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('airport_staff_rates')
      .select('*')
      .order('airport_code')
      .order('service_type')

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

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
    const { data: existing } = await existingQuery.limit(1)

    let data, error
    if (existing?.length) {
      // Update existing record
      const result = await supabase
        .from('airport_staff_rates')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select()
        .single()
      data = result.data
      error = result.error
    } else {
      // Insert new record
      const result = await supabase
        .from('airport_staff_rates')
        .insert([body])
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}