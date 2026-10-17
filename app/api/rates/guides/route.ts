import { NextRequest, NextResponse } from 'next/server'
import { guideModeKey } from '@/lib/guides/guide-mode'
import { guideLanguageKey, sameGuideLanguage } from '@/lib/guides/guide-language'
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

/** The refusal for a rate that already exists — from the route's own check or
 *  from the database's unique index (23505), which used to surface as
 *  "Internal server error". */
const DUPLICATE_GUIDE_RATE =
  'A rate with these details already exists (same language, guide type, duration, guide mode, city, guide and validity period). Edit that rate, or change one of those before saving.'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const language = searchParams.get('language')
    const city = searchParams.get('city')
    const guideType = searchParams.get('guide_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Every row, past PostgREST's 1000-row cap: the page's list and tiles
    // count what this returns.
    const { data: rows, error } = await selectAllRows<Record<string, any>>(() => {
      let query = supabaseAdmin
        .from('guide_rates')
        .select('*')
        .eq('org_id', orgId)
      if (supplierId) query = query.eq('supplier_id', supplierId)
      // Language is compared by vocabulary key below — rows hold the word or the key.
      if (city) query = query.eq('city', city)
      if (guideType) query = query.eq('guide_type', guideType)
      if (activeOnly) query = query.eq('is_active', true)
      return query
    }, { order: [{ column: 'guide_language' }, { column: 'id' }] })

    if (error) {
      console.error('GET guide_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    let data = language ? (rows ?? []).filter(r => sameGuideLanguage(r.guide_language, language)) : (rows ?? [])
    // A picker that copies the rate onto a voucher or a trip asks for every
    // row in the company's rate currency (lib/rates/rows-in-rate-currency).
    if (searchParams.get('in_rate_currency') === 'true') {
      data = await rowsInRateCurrency('guide_rates', data, await getOrgRateCurrency(supabaseAdmin, orgId))
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET guide_rates catch error:', error)
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
      service_code: body.service_code || `GD-${Date.now().toString(36).toUpperCase()}`,
      // The vocabulary KEY (lib/guides/guide-language), whatever the caller sent.
      guide_language: guideLanguageKey(body.guide_language),
      guide_type: body.guide_type || 'licensed',
      city: body.city || null,
      tour_duration: body.tour_duration || 'full_day',
      // spot / throughout — which quotes this rate prices (lib/guides/guide-mode).
      guide_mode: guideModeKey(body.guide_mode),
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

    // The full identity of a guide rate (lib/rates/natural-key) — the same
    // columns as the database's uq_guide_rates_natural_key (migration
    // 20261220): the validity period is part of it, so this year's and next
    // year's price for one guide are two rates, and the engine prices the
    // one whose period covers the trip.
    let existingQuery = supabaseAdmin
      .from('guide_rates')
      .select('*')
      .eq('org_id', orgId)
      .eq('guide_type', newRate.guide_type)
      .eq('tour_duration', newRate.tour_duration)
      .eq('guide_mode', newRate.guide_mode)
    existingQuery = whereNullable(existingQuery, 'city', newRate.city)
    existingQuery = whereNullable(existingQuery, 'supplier_id', newRate.supplier_id)
    existingQuery = whereNullable(existingQuery, 'rate_valid_from', newRate.rate_valid_from)
    existingQuery = whereNullable(existingQuery, 'rate_valid_to', newRate.rate_valid_to)
    // Same language by KEY: an older row saying "Japanese" is the same rate as
    // a new one saying "japanese".
    const { data: sameKey } = await existingQuery
    const existing = (sameKey ?? []).filter((r: any) => sameGuideLanguage(r.guide_language, newRate.guide_language)).slice(0, 1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: DUPLICATE_GUIDE_RATE,
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabaseAdmin
        .from('guide_rates')
        .insert({ ...newRate, org_id: orgId })
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: DUPLICATE_GUIDE_RATE }, { status: 409 })
      }
      console.error('POST guide_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('POST guide_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
