import { NextRequest, NextResponse } from 'next/server'
import { resolveTripShapeWrite } from '@/lib/pricing/road-trips'
import { resolveVehicleWrite } from '@/lib/rates/vehicle-bands-server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { ownSupplierFilterId } from '@/lib/suppliers/supplier-org'
import { OWN_SUPPLIER_EMBED, ownSupplierOnRow, ownSupplierOnRows } from '@/lib/rates/own-supplier-embed'
import { findSameTransportRate, findServiceCodeClash } from '@/lib/rates/transport-natural-key'
import { validateRatePayload } from '@/lib/rate-validation'

// Actor-attributed service-role client (lib/supabase-actor): rate-table
// writes from here reach fn_rate_audit_trigger, and without the actor
// header every one of them lands in rate_audit_log as changed_by NULL —
// which the rate-change digest then reports as "unknown user /
// 不明なユーザー" to the whole team (audit AUT-H04).
const supabaseAdmin = createServerClient()

// Vehicles are resolved by lib/rates/vehicle-bands-server (a list from the
// form, or the legacy per-vehicle fields), validated against the agency's
// vehicle types, and stored as the list plus its legacy-column mirror.

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('serviceType')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('activeOnly') === 'true'

    // The screen's tiles: counts over ALL the company's rates, whatever the
    // list is filtered to — they counted only the rows loaded, so "Inactive"
    // read 0 unless Show Inactive was on.
    if (searchParams.get('summary') === '1') {
      const { data, error } = await supabaseAdmin
        .from('transportation_rates')
        .select('id, city, is_active, supplier_id')
        .eq('org_id', orgId)
      if (error) {
        console.error('Error counting transportation rates:', error)
        return NextResponse.json({ error: 'Failed to count transportation rates' }, { status: 500 })
      }
      return NextResponse.json(transportSummary(data ?? []))
    }

    // The supplier embed carries its company so another company's supplier
    // (linked before the writes checked it) is never shown — lib/rates/own-supplier-embed.
    let query = supabaseAdmin
      .from('transportation_rates')
      .select(`*, ${OWN_SUPPLIER_EMBED}`)
      .eq('org_id', orgId)
      .order('city', { ascending: true })
      .order('service_type', { ascending: true })

    if (city) query = query.eq('city', city)
    if (serviceType) query = query.eq('service_type', serviceType)
    // Only one of the caller's company's suppliers (lib/suppliers/supplier-org).
    if (supplierId) query = query.eq('supplier_id', await ownSupplierFilterId(supabaseAdmin, supplierId, orgId))
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transportation rates:', error)
      return NextResponse.json({ error: 'Failed to fetch transportation rates' }, { status: 500 })
    }

    return NextResponse.json(ownSupplierOnRows(data, orgId))
  } catch (error) {
    console.error('Error in transportation rates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    if (!body.city || !body.service_type) {
      return NextResponse.json({ error: 'City and service type are required' }, { status: 400 })
    }

    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: rateCheck.errors }, { status: 400 })
    }

    // The supplier must be one of this company's; "No supplier / Direct
    // booking" (the '__none__' option) is stored as no supplier. It used to
    // go into the uuid column raw, so that option could never save, and any
    // id — another company's included — was stored unchecked.
    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin, orgId)
    if (!supplierCheck.ok) {
      return NextResponse.json({ error: supplierCheck.error }, { status: supplierCheck.status })
    }

    // The vehicles this rate offers
    const vehicleWrite = await resolveVehicleWrite(body, null)
    if (!vehicleWrite.ok) {
      return NextResponse.json({ error: vehicleWrite.error }, { status: 400 })
    }
    const vehiclePatch = vehicleWrite.patch ?? { vehicles: [] }
    if (vehiclePatch.vehicles.length === 0) {
      return NextResponse.json({ error: 'At least one vehicle rate is required' }, { status: 400 })
    }

    const serviceCode = body.service_code ||
      `${body.city.toUpperCase().replace(/\s+/g, '-')}-${body.service_type.toUpperCase().replace(/_/g, '-')}`
    const tripShapeWrite = resolveTripShapeWrite({ ...body, service_code: serviceCode })
    if (!tripShapeWrite.ok) return NextResponse.json({ error: tripShapeWrite.error }, { status: 400 })

    const newRate: Record<string, any> = {
      service_code: serviceCode,
      service_type: body.service_type,
      city: body.city,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      // Road transfers: the trip's shape (lib/pricing/road-trips); others none.
      trip_shape: tripShapeWrite.value,
      duration: body.duration || null,
      area: body.area || null,
      // The form's Route Name — it was sent and dropped.
      route_name: body.route_name || null,
      includes: body.includes || null,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || new Date().toISOString().split('T')[0],
      rate_valid_to: body.rate_valid_to || '2099-12-31',
      supplier_id: supplierCheck.supplier_id,
      supplier_name: supplierCheck.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      // Phase B (per-rate currency) named the WRONG route family for this
      // form — it saves through /api/resources/transportation, so the chosen
      // currency was silently dropped here. Only-when-present, so old
      // clients and unmigrated databases are untouched.
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      ...vehiclePatch
    }

    if (newRate.rate_valid_to < newRate.rate_valid_from) {
      return NextResponse.json({ error: 'Valid to must be on or after Valid from' }, { status: 400 })
    }

    // A create never inserts a second copy of a rate (lib/rates/transport-natural-key).
    const { data: orgRates } = await supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('org_id', orgId)
    const clash = findServiceCodeClash(newRate.service_code, orgRates ?? [])
    if (clash) {
      return NextResponse.json({
        error: `Service code ${newRate.service_code} is already used by another rate. Change the code, or edit that rate.`,
        existing: clash,
      }, { status: 409 })
    }
    const existing = findSameTransportRate(newRate, (orgRates ?? []).filter((r: any) => r.service_type === newRate.service_type))
    if (existing) {
      return NextResponse.json({
        error: 'A rate with these details already exists. Edit that rate, or change what makes this one different (supplier, route name, validity dates, city) before saving.',
        existing,
      }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .insert([{ ...newRate, org_id: orgId }])
      .select(`*, ${OWN_SUPPLIER_EMBED}`)
      .single()

    if (error) {
      console.error('Error creating transportation rate:', error)
      return NextResponse.json({ error: `Failed to create: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json(ownSupplierOnRow(data, orgId), { status: 201 })
  } catch (error) {
    console.error('Error in transportation rates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** The tiles' counts over every rate of the company. */
export function transportSummary(rows: ReadonlyArray<{ city?: string | null; is_active?: boolean | null; supplier_id?: string | null }>) {
  const active = rows.filter(r => r.is_active).length
  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    cities: new Set(rows.map(r => String(r.city ?? '').trim().toLowerCase()).filter(Boolean)).size,
    linked: rows.filter(r => r.supplier_id).length,
  }
}
