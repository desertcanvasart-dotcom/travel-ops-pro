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

// ============================================
// ENTRANCE FEES API  
// File: app/api/rates/entrance-fees/route.ts
// 
// This endpoint powers the attractions dropdown
// in TourManagerContent.tsx
// ============================================

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const isAddon = searchParams.get('is_addon')
    const activeOnly = searchParams.get('active_only')
    const limit = searchParams.get('limit')
    const search = searchParams.get('search')
    const language = searchParams.get('language') || 'en'

    const build = () => {
      let query = supabaseAdmin
        .from('entrance_fees')
        .select('*')
        .eq('org_id', orgId)
      // Apply filters
      if (city) query = query.eq('city', city)
      if (category) query = query.eq('category', category)
      if (isAddon === 'true') query = query.eq('is_addon', true)
      if (isAddon === 'false') query = query.eq('is_addon', false)
      if (activeOnly === 'true') query = query.neq('is_active', false) // Include NULL (default = active)
      if (search) query = query.ilike('attraction_name', `%${search}%`)
      return query
    }
    const order = [{ column: 'city' }, { column: 'attraction_name' }, { column: 'id' }]
    // A caller's own limit is one page; without one, every row (past the
    // 1000-row cap).
    const { data, error } = limit
      ? await order.reduce((q: any, o) => q.order(o.column, { ascending: true }), build()).limit(parseInt(limit))
      : await selectAllRows<Record<string, any>>(build, { order })

    if (error) {
      console.error('GET entrance_fees error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // A picker that copies the fee onto a voucher or a trip asks for every
    // row in the company's rate currency (lib/rates/rows-in-rate-currency).
    let mergedData: Record<string, any>[] = searchParams.get('in_rate_currency') === 'true'
      ? await rowsInRateCurrency('entrance_fees', data ?? [], await getOrgRateCurrency(supabaseAdmin, orgId))
      : (data ?? [])

    // Merge language versions for non-English (ids in batches)
    if (language !== 'en' && mergedData.length > 0) {
      const versionsMap = await entranceFeeVersions(supabaseAdmin, mergedData.map((item: any) => item.id), language)
      mergedData = mergedData.map((item: any) => {
        const version = versionsMap[item.id]
        return version ? {
          ...item,
          attraction_name: version.attraction_name || item.attraction_name,
          notes: version.notes ?? item.notes
        } : item
      })
    }

    return NextResponse.json({
      success: true,
      data: mergedData,
      count: mergedData.length
    })
  } catch (error: any) {
    console.error('GET entrance_fees catch error:', error)
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

    // city is NOT NULL: `|| null` used to coerce a blank one and the insert

    // then died on a constraint message the user could not act on.

    if (!body.city) {

      return NextResponse.json({ success: false, error: 'City is required' }, { status: 400 })

    }


    // The supplier must be this company's (it was stored as sent).
    let supplierId: string | null = null
    if (body.supplier_id) {
      const supplierCheck = await validateAndResolveSupplierFields({ supplier_id: body.supplier_id }, supabaseAdmin)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      supplierId = supplierCheck.supplier_id
    }

    const newFee = {
      service_code: body.service_code || `ENT-${Date.now().toString(36).toUpperCase()}`,
      attraction_name: body.attraction_name,
      city: body.city,
      fee_type: body.fee_type || 'standard',
      eur_rate: parseFloat(body.eur_rate) || 0,
      non_eur_rate: parseFloat(body.non_eur_rate) || 0,
      egyptian_rate: body.egyptian_rate ? parseFloat(body.egyptian_rate) : null,
      // Stored when sent, never invented: no price reads them (children pay
      // the engine's fixed child rate), and a default of 50 read as a setting.
      student_discount_percentage: body.student_discount_percentage ?? null,
      child_discount_percent: body.child_discount_percent ?? null,
      season: body.season || 'all_year',
      rate_valid_from: body.rate_valid_from || new Date().toISOString().slice(0, 10),
      rate_valid_to: body.rate_valid_to || '2099-12-31',
      category: body.category || null,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false,
      is_addon: body.is_addon === true,
      addon_note: body.addon_note || null,
      supplier_id: supplierId
    }

    // Check for existing rate with same natural key
    // Use service_code first (stable across languages), then fall back to name+city
    let existing: any[] | null = null

    if (body.service_code) {
      const { data } = await supabaseAdmin
        .from('entrance_fees')
        .select('*')
        .eq('org_id', orgId)
        .eq('service_code', body.service_code)
        .limit(1)
      existing = data
    }

    if (!existing?.length) {
      let existingQuery: any = supabaseAdmin
        .from('entrance_fees')
        .select('id')
        .eq('org_id', orgId)
        .ilike('attraction_name', newFee.attraction_name)
      existingQuery = whereNullable(existingQuery, 'city', newFee.city)
      // The validity period is part of the identity: next year's fee is a
      // second rate, priced from its own date.
      existingQuery = whereNullable(existingQuery, 'rate_valid_from', newFee.rate_valid_from)
      existingQuery = whereNullable(existingQuery, 'rate_valid_to', newFee.rate_valid_to)
      const { data } = await existingQuery.limit(1)
      existing = data
    }

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
        .from('entrance_fees')
        .insert({ ...newFee, org_id: orgId })
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST entrance_fees error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('POST entrance_fees catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}