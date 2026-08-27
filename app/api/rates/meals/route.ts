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
    const city = searchParams.get('city')
    const mealType = searchParams.get('meal_type')
    const cuisineType = searchParams.get('cuisine_type')
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('meal_rates')
      .select('*')
      .order('restaurant_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (mealType) query = query.eq('meal_type', mealType)
    if (cuisineType) query = query.eq('cuisine_type', cuisineType)
    if (tier) query = query.eq('tier', tier)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET meal_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET meal_rates catch error:', error)
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

    // Discover actual table columns by fetching one row
    const { data: sampleRow } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .limit(1)
      .single()

    // Known columns from the sample row (or fallback to core columns)
    const tableColumns = sampleRow
      ? new Set(Object.keys(sampleRow))
      : new Set([
          'service_code', 'restaurant_name', 'meal_type', 'cuisine_type',
          'city', 'base_rate_eur', 'base_rate_non_eur', 'season',
          'rate_valid_from', 'rate_valid_to', 'supplier_id', 'supplier_name',
          'tier', 'notes', 'is_active'
        ])

    // Build the rate object, only including columns that exist in the table
    const allFields: Record<string, any> = {
      service_code: body.service_code || `MEAL-${Date.now().toString(36).toUpperCase()}`,
      restaurant_name: body.restaurant_name,
      meal_type: body.meal_type || null,
      cuisine_type: body.cuisine_type || null,
      restaurant_type: body.restaurant_type || null,
      city: body.city || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: supplierCheck.supplier_id,
      supplier_name: supplierCheck.supplier_name,
      tier: body.tier || null,
      meal_category: body.meal_category || null,
      dietary_options: body.dietary_options || [],
      per_person_rate: body.per_person_rate !== false,
      minimum_pax: body.minimum_pax ? parseInt(body.minimum_pax) : null,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false,
      is_preferred: body.is_preferred === true
    }

    // Filter to only columns that exist in the table (skip id, created_at, updated_at — auto-managed)
    const newRate: Record<string, any> = {}
    for (const [col, val] of Object.entries(allFields)) {
      if (tableColumns.has(col)) {
        newRate[col] = val
      }
    }

    console.log('[Meal Rate POST] Table columns:', [...tableColumns].join(', '))
    console.log('[Meal Rate POST] Payload:', JSON.stringify(newRate))

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('meal_rates')
      .select('id')
      .ilike('restaurant_name', newRate.restaurant_name)
    if (newRate.city) {
      existingQuery = existingQuery.eq('city', newRate.city)
    } else {
      existingQuery = existingQuery.is('city', null)
    }
    if (newRate.meal_type) {
      existingQuery = existingQuery.eq('meal_type', newRate.meal_type)
    } else {
      existingQuery = existingQuery.is('meal_type', null)
    }
    const { data: existing } = await existingQuery.limit(1)

    let data, error
    if (existing?.length) {
      // Update existing record
      const result = await supabaseAdmin
        .from('meal_rates')
        .update({ ...newRate, ...(tableColumns.has('updated_at') ? { updated_at: new Date().toISOString() } : {}) })
        .eq('id', existing[0].id)
        .select('*')
        .single()
      data = result.data
      error = result.error
    } else {
      // Insert new record
      const result = await supabaseAdmin
        .from('meal_rates')
        .insert(newRate)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST meal_rates error:', error, 'payload:', newRate)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    console.error('POST meal_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}