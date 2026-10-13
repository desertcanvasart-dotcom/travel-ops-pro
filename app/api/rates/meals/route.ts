import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { whereNullable } from '@/lib/rates/natural-key'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { rowsInRateCurrency } from '@/lib/rates/rows-in-rate-currency'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const city = searchParams.get('city')
    const mealType = searchParams.get('meal_type')
    const cuisineType = searchParams.get('cuisine_type')
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Every row, past PostgREST's 1000-row cap: the page's list and tiles
    // count what this returns.
    const { data: rows, error } = await selectAllRows<Record<string, any>>(() => {
      let query = supabaseAdmin
        .from('meal_rates')
        .select('*')
        .eq('org_id', orgId)
      if (supplierId) query = query.eq('supplier_id', supplierId)
      if (city) query = query.eq('city', city)
      if (mealType) query = query.eq('meal_type', mealType)
      if (cuisineType) query = query.eq('cuisine_type', cuisineType)
      if (tier) query = query.eq('tier', tier)
      if (activeOnly) query = query.eq('is_active', true)
      return query
    }, { order: [{ column: 'restaurant_name' }, { column: 'id' }] })

    if (error) {
      console.error('GET meal_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // A picker that copies the rate onto a voucher or a trip asks for every
    // row in the company's rate currency (lib/rates/rows-in-rate-currency).
    const data = searchParams.get('in_rate_currency') === 'true'
      ? await rowsInRateCurrency('meal_rates', rows ?? [], await getOrgRateCurrency(supabaseAdmin, orgId))
      : (rows ?? [])

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET meal_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

    // Every column the meals form saves — all of them on meal_rates since the
    // baseline (migrations/20260829_baseline_schema.sql). The list used to be
    // discovered from ONE sample row of the company, with a fallback for a
    // company with no meals yet that left out rate_currency, restaurant_type,
    // meal_category, dietary_options, per_person_rate, minimum_pax and
    // is_preferred: a company's first meal "Lunch 600, Rate currency EGP, per
    // group" was saved as 600 in the default currency, per person.
    const newRate: Record<string, any> = {
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
      dietary_options: Array.isArray(body.dietary_options) ? body.dietary_options : [],
      per_person_rate: body.per_person_rate !== false,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false,
      is_preferred: body.is_preferred === true
    }

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('org_id', orgId)
      .ilike('restaurant_name', newRate.restaurant_name)
    existingQuery = whereNullable(existingQuery, 'city', newRate.city)
    existingQuery = whereNullable(existingQuery, 'meal_type', newRate.meal_type)
    // The validity period is part of the identity: next year's price for the
    // same restaurant is a second rate, and pricing uses the one whose period
    // covers the trip (lib/pricing/service-rates).
    existingQuery = whereNullable(existingQuery, 'rate_valid_from', newRate.rate_valid_from)
    existingQuery = whereNullable(existingQuery, 'rate_valid_to', newRate.rate_valid_to)
    const { data: existing } = await existingQuery.limit(1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: 'A rate with these details already exists (same restaurant, city, meal type and validity period). Edit that rate, or change one of those before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabaseAdmin
        .from('meal_rates')
        .insert({ ...newRate, org_id: orgId })
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST meal_rates error:', error, 'payload:', newRate)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('POST meal_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}