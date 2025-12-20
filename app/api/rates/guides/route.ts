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
    const language = searchParams.get('language')
    const city = searchParams.get('city')
    const guideType = searchParams.get('guide_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('guide_rates')
      .select('*')
      .order('guide_language')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (language) query = query.eq('guide_language', language)
    if (city) query = query.eq('city', city)
    if (guideType) query = query.eq('guide_type', guideType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET guide_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newRate = {
      service_code: body.service_code || `GD-${Date.now().toString(36).toUpperCase()}`,
      guide_language: body.guide_language,
      guide_type: body.guide_type || 'licensed',
      city: body.city || null,
      tour_duration: body.tour_duration || 'full_day',
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await supabaseAdmin
      .from('guide_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST guide_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}