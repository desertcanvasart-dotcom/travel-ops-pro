import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { sanitizeTiers } from '@/lib/rates/activity-tiers'
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
    const category = searchParams.get('category')
    const pricingType = searchParams.get('pricing_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Every row, past PostgREST's 1000-row cap: the page's list and tiles
    // count what this returns.
    const { data: rows, error } = await selectAllRows<Record<string, any>>(() => {
      let query = supabaseAdmin
        .from('activity_rates')
        .select('*')
        .eq('org_id', orgId)
      if (supplierId) query = query.eq('supplier_id', supplierId)
      if (city) query = query.eq('city', city)
      if (category) query = query.eq('activity_category', category)
      if (pricingType) query = query.eq('pricing_type', pricingType)
      if (activeOnly) query = query.eq('is_active', true)
      return query
    }, { order: [{ column: 'activity_name' }, { column: 'id' }] })

    if (error) {
      console.error('GET activity_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // A picker that copies the rate onto a voucher or a trip asks for every
    // row in the company's rate currency (lib/rates/rows-in-rate-currency);
    // tiered bands are converted with the row.
    const data = searchParams.get('in_rate_currency') === 'true'
      ? await rowsInRateCurrency('activity_rates', rows ?? [], await getOrgRateCurrency(supabaseAdmin, orgId))
      : (rows ?? [])

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET activity_rates catch error:', error)
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

    const newRate = {
      service_code: body.service_code || `ACT-${Date.now().toString(36).toUpperCase()}`,
      activity_name: body.activity_name,
      activity_category: body.activity_category || null,
      activity_type: body.activity_type || null,
      duration: body.duration || null,
      city: body.city || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      // Add-on pricing fields
      pricing_type: body.pricing_type || 'per_person',
      // Volume-discount bands (pricing_type='tiered'); invalid payloads read as no tiers
      tiers: sanitizeTiers(body.tiers),
      unit_label: body.unit_label || null,
      min_capacity: parseInt(body.min_capacity) || 1,
      max_capacity: parseInt(body.max_capacity) || 99,
      // Other fields
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: supplierCheck.supplier_id,
      supplier_name: supplierCheck.supplier_name,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false
    }

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('activity_rates')
      .select('*')
      .eq('org_id', orgId)
      .ilike('activity_name', newRate.activity_name)
    existingQuery = whereNullable(existingQuery, 'city', newRate.city)
    existingQuery = whereNullable(existingQuery, 'supplier_id', newRate.supplier_id)
    // The validity period is part of the identity: next year's price is a
    // second rate, and pricing uses the one whose period covers the trip.
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
        error: 'A rate with these details already exists (same activity, city, supplier and validity period). Edit that rate, or change one of those before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabaseAdmin
        .from('activity_rates')
        .insert({ ...newRate, org_id: orgId })
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST activity_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('POST activity_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}