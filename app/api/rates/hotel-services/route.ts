// app/api/rates/hotel-services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { cleanPricingBasisFields } from '@/lib/pricing/pricing-basis'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { sanitizeRateUpdate } from '@/lib/rates/update-payload'
import { pickHotelServiceColumns } from '@/lib/rates/accommodation-payload'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('hotel_staff_rates')
      .select('*')
      .eq('org_id', orgId)
      .order('service_type')
      .order('hotel_category')

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    // Normalize empty destination to null (means "all destinations")
    if (body.destination === '' || body.destination === undefined) {
      body.destination = null
    }

    // The form's columns only, '' read as absent on uuid/date/CHECKed ones
    // (lib/rates/update-payload) — never `id`, `created_at` or an unknown key.
    const clean = sanitizeRateUpdate(pickHotelServiceColumns(body))
    if (!clean.ok) {
      return NextResponse.json({ success: false, error: clean.error, violations: clean.violations }, { status: clean.status })
    }

    // Only one of the caller's company's suppliers: another company's id is
    // refused (400), never saved onto the rate and copied onto trip lines.
    const supplierCheck = await validateAndResolveSupplierFields({ supplier_id: body.supplier_id }, supabase)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

    // Per group / per person / per unit (migration 20261104).
    const basis = cleanPricingBasisFields(body)
    if (!basis.ok) {
      return NextResponse.json({ success: false, error: basis.error }, { status: 400 })
    }
    const payload = { ...clean.payload, supplier_id: supplierCheck.supplier_id, ...basis.fields }

    // Check for existing rate with same natural key
    let existingQuery = supabase
      .from('hotel_staff_rates')
      .select('id')
      .eq('org_id', orgId)
    if (body.service_type) {
      existingQuery = existingQuery.eq('service_type', body.service_type)
    } else {
      existingQuery = existingQuery.is('service_type', null)
    }
    if (body.hotel_category) {
      existingQuery = existingQuery.eq('hotel_category', body.hotel_category)
    } else {
      existingQuery = existingQuery.is('hotel_category', null)
    }
    if (body.destination) {
      existingQuery = existingQuery.eq('destination', body.destination)
    } else {
      existingQuery = existingQuery.is('destination', null)
    }
    // A rate belongs to a supplier: two companies may quote the same service,
    // and a key that ignores the supplier makes the second overwrite the first.
    if (payload.supplier_id) {
      existingQuery = existingQuery.eq('supplier_id', payload.supplier_id)
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
        error: 'A rate with the same service type, hotel category, destination and supplier already exists. Edit that rate, or change one of those before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabase
        .from('hotel_staff_rates')
        .insert([{ ...payload, org_id: orgId }])
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}