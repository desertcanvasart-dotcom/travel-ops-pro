import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

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
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

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
      supplier_id: supplierCheck.supplier_id,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false
    }

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('guide_rates')
      .select('*')
      .eq('guide_language', newRate.guide_language)
      .eq('guide_type', newRate.guide_type)
      .eq('tour_duration', newRate.tour_duration)
    if (newRate.city) {
      existingQuery = existingQuery.eq('city', newRate.city)
    } else {
      existingQuery = existingQuery.is('city', null)
    }
    if (newRate.supplier_id) {
      existingQuery = existingQuery.eq('supplier_id', newRate.supplier_id)
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
      const result = await supabaseAdmin
        .from('guide_rates')
        .insert(newRate)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST guide_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('POST guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}