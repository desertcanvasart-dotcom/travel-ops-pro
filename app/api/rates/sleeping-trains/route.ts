import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const cabinType = searchParams.get('cabin_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('sleeping_train_rates')
      .select('*')
      .order('origin_city')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (originCity) query = query.eq('origin_city', originCity)
    if (destinationCity) query = query.eq('destination_city', destinationCity)
    if (cabinType) query = query.eq('cabin_type', cabinType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET sleeping_train_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET sleeping_train_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newRate = {
      service_code: body.service_code || `SLP-${Date.now().toString(36).toUpperCase()}`,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      cabin_type: body.cabin_type || null,
      rate_oneway_eur: parseFloat(body.rate_oneway_eur) || 0,
      rate_roundtrip_eur: body.rate_roundtrip_eur ? parseFloat(body.rate_roundtrip_eur) : null,
      departure_time: body.departure_time || null,
      arrival_time: body.arrival_time || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      season: body.season || null,
      operator_name: body.operator_name || null,
      supplier_id: body.supplier_id || null,
      description: body.description || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('sleeping_train_rates')
      .select('id')
    if (newRate.origin_city) {
      existingQuery = existingQuery.ilike('origin_city', newRate.origin_city)
    } else {
      existingQuery = existingQuery.is('origin_city', null)
    }
    if (newRate.destination_city) {
      existingQuery = existingQuery.ilike('destination_city', newRate.destination_city)
    } else {
      existingQuery = existingQuery.is('destination_city', null)
    }
    if (newRate.cabin_type) {
      existingQuery = existingQuery.eq('cabin_type', newRate.cabin_type)
    } else {
      existingQuery = existingQuery.is('cabin_type', null)
    }
    const { data: existing } = await existingQuery.limit(1)

    let data, error
    if (existing?.length) {
      // Update existing record
      const result = await supabaseAdmin
        .from('sleeping_train_rates')
        .update({ ...newRate, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select('*')
        .single()
      data = result.data
      error = result.error
    } else {
      // Insert new record
      const result = await supabaseAdmin
        .from('sleeping_train_rates')
        .insert(newRate)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST sleeping_train_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    console.error('POST sleeping_train_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}