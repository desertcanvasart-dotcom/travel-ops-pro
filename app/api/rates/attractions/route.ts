// ============================================
// ATTRACTIONS API
// File: app/api/rates/attractions/route.ts
// 
// Handles CRUD operations for attraction/entrance fee rates
// Uses entrance_fees table
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { whereNullable } from '@/lib/rates/natural-key'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { rowsInRateCurrency } from '@/lib/rates/rows-in-rate-currency'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { entranceFeeVersions } from '@/lib/rates/entrance-fee-versions'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabase = createActorAdminClient()

// GET - Fetch all attractions
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const activeOnly = searchParams.get('active_only') === 'true'
    const addonsOnly = searchParams.get('addons_only') === 'true'
    
    // Every row, past PostgREST's 1000-row cap: the page's list and tiles
    // count what this returns.
    const { data: rows, error } = await selectAllRows<Record<string, any>>(() => {
      let query = supabase
        .from('entrance_fees')
        .select('*')
        .eq('org_id', orgId)
      if (city) query = query.eq('city', city)
      if (category) query = query.eq('category', category)
      // Use neq(false) instead of eq(true) to include NULL values (default = active)
      if (activeOnly) query = query.neq('is_active', false)
      if (addonsOnly) query = query.eq('is_addon', true)
      return query
    }, { order: [{ column: 'attraction_name' }, { column: 'id' }] })

    if (error) {
      console.error('[Attractions API] Error fetching:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // A picker that copies the fee onto a voucher or a trip asks for every
    // row in the company's rate currency (lib/rates/rows-in-rate-currency).
    const data: Record<string, any>[] = searchParams.get('in_rate_currency') === 'true'
      ? await rowsInRateCurrency('entrance_fees', rows ?? [], await getOrgRateCurrency(supabase, orgId))
      : (rows ?? [])

    // Check for language parameter to merge versions
    const language = searchParams.get('language') || 'en'

    // Build versions map for non-English languages (ids in batches)
    const versionsMap = language !== 'en' && data.length > 0
      ? await entranceFeeVersions(supabase, data.map((item: any) => item.id), language)
      : {}

    // Transform field names for frontend compatibility
    const transformedData = data.map(item => {
      const version = versionsMap[item.id]
      return {
        id: item.id,
        service_code: item.service_code || `ENT-${item.id?.substring(0, 6).toUpperCase()}`,
        attraction_name: version?.attraction_name || item.attraction_name,
        city: item.city,
        fee_type: item.fee_type || 'standard',
        eur_rate: item.eur_rate,
        non_eur_rate: item.non_eur_rate,
        egyptian_rate: item.egyptian_rate,
        student_discount_percentage: item.student_discount_percentage,
        child_discount_percent: item.child_discount_percent,
        season: item.season,
        rate_valid_from: item.rate_valid_from,
        rate_valid_to: item.rate_valid_to,
        category: item.category,
        notes: version?.notes ?? item.notes,
        is_active: item.is_active !== false, // Default to true if not set
        is_addon: item.is_addon || false,
        is_sellable_extra: item.is_sellable_extra || false,
        addon_note: item.addon_note,
        supplier_id: item.supplier_id,
        // The currency the row is ENTERED in. This hand-maintained field
        // list predates per-rate-currency and silently dropped it — so the
        // list showed EGP rates through the org formatter (600 EGP rendered
        // as ¥95,808 for a JPY-display operator) and the edit form reopened
        // on the default, which read exactly like "the currency didn't
        // save". It had saved; this transform ate it on the way back.
        rate_currency: item.rate_currency ?? null,
        ...(item.entered_currency !== undefined ? { entered_currency: item.entered_currency } : {}),
        ...(item.rate_unconvertible ? { rate_unconvertible: true } : {}),
        created_at: item.created_at,
        updated_at: item.updated_at
      }
    })

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length
    })
    
  } catch (error: any) {
    console.error('[Attractions API] Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST - Create new attraction
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }
    
    const {
      service_code,
      attraction_name,
      city,
      fee_type,
      eur_rate,
      non_eur_rate,
      egyptian_rate,
      student_discount_percentage,
      child_discount_percent,
      season,
      rate_valid_from,
      rate_valid_to,
      category,
      notes,
      is_active,
      is_addon,
      is_sellable_extra,
      addon_note,
      supplier_id
    } = body
    
    // Validate required fields
    if (!attraction_name || !city) {
      return NextResponse.json({ 
        success: false, 
        error: 'Attraction name and city are required' 
      }, { status: 400 })
    }

    // The supplier must be this company's: it was stored as sent, so a fee
    // could name the other company's supplier (whose delete it then blocked).
    let supplierId: string | null = null
    if (supplier_id) {
      const supplierCheck = await validateAndResolveSupplierFields({ supplier_id }, supabase)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      supplierId = supplierCheck.supplier_id
    }
    
    const newRecord = {
      service_code: service_code || `ENT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      attraction_name,
      city,
      fee_type: fee_type || 'standard',
      eur_rate: eur_rate || 0,
      non_eur_rate: non_eur_rate || 0,
      egyptian_rate: egyptian_rate || null,
      student_discount_percentage: student_discount_percentage || null,
      child_discount_percent: child_discount_percent || null,
      season: season || 'all_year',
      rate_valid_from,
      rate_valid_to,
      category,
      notes,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: is_active !== false,
      is_addon: is_addon || false,
      is_sellable_extra: is_sellable_extra || false,
      addon_note: addon_note || null,
      supplier_id: supplierId
    }

    // Check for existing rate with same natural key
    let existingQuery = supabase
      .from('entrance_fees')
      .select('*')
      .eq('org_id', orgId)
      .ilike('attraction_name', attraction_name)
    existingQuery = whereNullable(existingQuery, 'city', city)
    // The validity period is part of the identity: next year's fee is a second
    // rate, and pricing uses the one whose period covers the trip.
    existingQuery = whereNullable(existingQuery, 'rate_valid_from', rate_valid_from)
    existingQuery = whereNullable(existingQuery, 'rate_valid_to', rate_valid_to)
    const { data: existing } = await existingQuery.limit(1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: 'An attraction with these details already exists (same name, city and validity period). Edit that one, or change one of those before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabase
        .from('entrance_fees')
        .insert({ ...newRecord, org_id: orgId })
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('[Attractions API] Error creating:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // If creating/updating in non-English, also create a language version
    const language = body.language
    if (language && language !== 'en' && data) {
      const feeId = data.id
      const { data: existingVersion } = await supabase
        .from('entrance_fee_versions')
        .select('id')
        .eq('entrance_fee_id', feeId)
        .eq('language', language)
        .single()

      if (!existingVersion) {
        await supabase
          .from('entrance_fee_versions')
          .insert({
            entrance_fee_id: feeId,
            language,
            attraction_name: attraction_name || null,
            notes: notes || null
          })
      }
    }

    return NextResponse.json({
      success: true,
      data,
      updated: false,
      message: existing?.length ? 'Attraction updated successfully' : 'Attraction created successfully'
    })
    
  } catch (error: any) {
    console.error('[Attractions API] Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}