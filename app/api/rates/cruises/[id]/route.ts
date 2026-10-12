// app/api/rates/cruises/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSeasons, legacyColumnMirror, datedPeriodCount, tooManyPeriodsMessage } from '@/lib/rates/rate-seasons'
import { sanitizeSupplements } from '@/lib/rates/supplements'
import { sanitizeSailingDays } from '@/lib/rates/cruise-sailing'
import { createServerClient } from '@/lib/supabase-server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'nile_cruises', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // Validate supplier_id only when the client touched the field (PUT can patch).
    // A rate stays in its company: org_id is never the client's to set.
    const ownBody = { ...body }
    delete ownBody.org_id
    let updateBody = ownBody
    if ('supplier_id' in body || 'supplier_name' in body) {
      const supplierCheck = await validateAndResolveSupplierFields(body, supabase)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      updateBody = { ...ownBody, supplier_id: supplierCheck.supplier_id }
    }

    // PUT can patch, so only touch periods when the client sent them. When it
    // did, they are validated rather than passed through as raw JSONB, and the
    // first period is mirrored onto the base columns for readers that have no
    // travel date.
    if ('seasons' in body) {
      const periodLimit = tooManyPeriodsMessage(datedPeriodCount(body.seasons))
      if (periodLimit) return NextResponse.json({ success: false, error: periodLimit }, { status: 400 })
      const cruiseSeasons = sanitizeSeasons(body.seasons, 'cruise')
      updateBody = {
        ...updateBody,
        seasons: cruiseSeasons,
        ...legacyColumnMirror(cruiseSeasons, 'cruise'),
      }
    }
    // The supplements the ship carries (their prices ride in the periods).
    // Only when the body speaks of them, like `seasons` above.
    if ('supplements' in body) {
      updateBody = { ...updateBody, supplements: sanitizeSupplements(body.supplements) }
    }
    // The weekdays this sailing departs on. Only when the body speaks of them,
    // so a patch that leaves them out does not clear a schedule.
    if ('sailing_days' in body) {
      updateBody = { ...updateBody, sailing_days: sanitizeSailingDays(body.sailing_days) }
    }

    // Re-link the ship when anything identifying it moved (PUT can patch, so
    // read the row for whichever half the payload left out).
    if ('ship_name' in updateBody || 'supplier_id' in updateBody || 'property_id' in updateBody) {
      const { data: current } = await supabase
        .from('nile_cruises')
        .select('supplier_id, ship_name')
        .eq('org_id', orgId)
        .eq('id', id)
        .maybeSingle()
      const ship = await resolveRateProperty(supabase, {
        propertyType: 'ship',
        supplierId: 'supplier_id' in updateBody ? updateBody.supplier_id : current?.supplier_id,
        name: 'ship_name' in updateBody ? updateBody.ship_name : current?.ship_name,
        propertyId: updateBody.property_id,
      })
      updateBody = {
        ...updateBody,
        ...(ship.property_id ? { property_id: ship.property_id } : {}),
        ...(ship.name ? { ship_name: ship.name } : {}),
      }
    }

    const { data, error } = await supabase
      .from('nile_cruises')
      .update(updateBody)
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
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
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'nile_cruises', id, orgId))) return notFoundInOrg('Rate')

    const { error } = await supabase
      .from('nile_cruises')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}