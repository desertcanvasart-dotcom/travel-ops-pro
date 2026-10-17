import { NextRequest, NextResponse } from 'next/server'
import { resolveTripShapeWrite } from '@/lib/pricing/road-trips'
import { resolveVehicleWrite } from '@/lib/rates/vehicle-bands-server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { OWN_SUPPLIER_EMBED, ownSupplierOnRow } from '@/lib/rates/own-supplier-embed'
import { findServiceCodeClash } from '@/lib/rates/transport-natural-key'
import { rateDeleteBlocked } from '@/lib/rates/rate-delete-guard'
import { validateRatePayload } from '@/lib/rate-validation'

// Actor-attributed service-role client (lib/supabase-actor): rate-table
// writes from here reach fn_rate_audit_trigger, and without the actor
// header every one of them lands in rate_audit_log as changed_by NULL —
// which the rate-change digest then reports as "unknown user /
// 不明なユーザー" to the whole team (audit AUT-H04).
const supabaseAdmin = createServerClient()

// Vehicles are resolved by lib/rates/vehicle-bands-server — see the POST route.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'transportation_rates', id, orgId))) return notFoundInOrg('Rate')

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .select(`*, ${OWN_SUPPLIER_EMBED}`)
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching transportation rate:', error)
      return NextResponse.json({ error: 'Transportation rate not found' }, { status: 404 })
    }

    return NextResponse.json(ownSupplierOnRow(data, orgId))
  } catch (error) {
    console.error('Error in transportation rate GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'transportation_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // Validate required fields
    if (!body.city || !body.service_type) {
      return NextResponse.json(
        { error: 'City and service type are required' },
        { status: 400 }
      )
    }

    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: rateCheck.errors }, { status: 400 })
    }

    // This company's supplier, or none ('__none__' = Direct booking) — see the POST route.
    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin, orgId)
    if (!supplierCheck.ok) {
      return NextResponse.json({ error: supplierCheck.error }, { status: supplierCheck.status })
    }

    // The vehicles this rate offers — merged over the row's own when the
    // client sends legacy fields, so nothing it does not know is dropped.
    const { data: currentRow } = await supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .single()
    const vehicleWrite = await resolveVehicleWrite(body, currentRow ?? null)
    if (!vehicleWrite.ok) {
      return NextResponse.json({ error: vehicleWrite.error }, { status: 400 })
    }
    if (vehicleWrite.patch && vehicleWrite.patch.vehicles.length === 0) {
      return NextResponse.json({ error: 'At least one vehicle rate is required' }, { status: 400 })
    }
    const vehiclePatch = vehicleWrite.patch ?? {}
    const tripShapeWrite = resolveTripShapeWrite(body, currentRow ?? null)
    if (!tripShapeWrite.ok) return NextResponse.json({ error: tripShapeWrite.error }, { status: 400 })

    // Build non-vehicle update fields
    const updateData: Record<string, any> = {
      service_code: body.service_code,
      service_type: body.service_type,
      city: body.city,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      // Road transfers: the trip's shape (lib/pricing/road-trips); others none.
      trip_shape: tripShapeWrite.value,
      duration: body.duration || null,
      area: body.area || null,
      // The form's Route Name — it was sent and dropped.
      ...('route_name' in body ? { route_name: body.route_name || null } : {}),
      includes: body.includes || null,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from,
      rate_valid_to: body.rate_valid_to,
      // supplier_id was missing here while POST has always written it: editing a
      // rate saved the company's NAME and dropped the link, so the form reported
      // success and the row stayed unlinked. Rate dedup keys are built from
      // supplier_id, so a lost link is not cosmetic.
      supplier_id: supplierCheck.supplier_id,
      supplier_name: supplierCheck.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      // Phase B (per-rate currency) named the WRONG route family for this
      // form — it saves through /api/resources/transportation, so the chosen
      // currency was silently dropped here. Only-when-present, so old
      // clients and unmigrated databases are untouched.
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      updated_at: new Date().toISOString(),
      ...vehiclePatch
    }

    if (updateData.rate_valid_from && updateData.rate_valid_to && updateData.rate_valid_to < updateData.rate_valid_from) {
      return NextResponse.json({ error: 'Valid to must be on or after Valid from' }, { status: 400 })
    }
    if (updateData.service_code) {
      const { data: sameCode } = await supabaseAdmin
        .from('transportation_rates')
        .select('id, service_code')
        .eq('org_id', orgId)
        .ilike('service_code', updateData.service_code)
      const clash = findServiceCodeClash(updateData.service_code, sameCode ?? [], id)
      if (clash) {
        return NextResponse.json({ error: `Service code ${updateData.service_code} is already used by another rate. Change the code.` }, { status: 409 })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to update transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in transportation rate PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'transportation_rates', id, orgId))) return notFoundInOrg('Rate')

    // A rate a trip, programme, variation or pricing rule uses is not deleted
    // out from under it (lib/rates/rate-delete-guard) — deactivate it instead.
    const blocked = await rateDeleteBlocked(supabaseAdmin, orgId, id)
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

    const { error } = await supabaseAdmin
      .from('transportation_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) {
      console.error('Error deleting transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to delete transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in transportation rate DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
