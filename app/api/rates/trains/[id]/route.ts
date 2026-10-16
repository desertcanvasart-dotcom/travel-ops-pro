import { NextRequest, NextResponse } from 'next/server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'
import { clientMessage } from '@/lib/api-errors'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { enteredFare } from '@/lib/rates/ticket-guide-fare'
import { rateDeleteBlocked } from '@/lib/rates/rate-delete-guard'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'train_rates', id, orgId))) return notFoundInOrg('Rate')

    const { data, error } = await supabaseAdmin
      .from('train_rates')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET train_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
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
    if (!(await rowInOrg(supabaseAdmin, 'train_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // The edit is held to what the create is held to: a negative fare or
    // guide fare was stored as sent.
    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: rateCheck.errors }, { status: 400 })
    }

    // The operator must be one of this company's suppliers ('__none__' = none).
    let supplierId: string | null | undefined
    if (body.supplier_id !== undefined) {
      const supplierCheck = await validateAndResolveSupplierFields({ supplier_id: body.supplier_id }, supabaseAdmin, orgId)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      supplierId = supplierCheck.supplier_id
    }

    const updateData: Record<string, any> = {}

    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.rate_currency !== undefined) updateData.rate_currency = body.rate_currency || null
    if (body.origin_city !== undefined) updateData.origin_city = body.origin_city || null
    if (body.destination_city !== undefined) updateData.destination_city = body.destination_city || null
    if (body.class_type !== undefined) updateData.class_type = body.class_type || null
    // Blank is "not priced yet" (NULL), never 0 — see the POST route.
    if (body.rate_eur !== undefined) updateData.rate_eur = enteredFare(body.rate_eur)
    // Throughout-guide fare: blank clears back to NULL = pays the customer rate.
    if (body.guide_rate !== undefined) updateData.guide_rate = body.guide_rate === '' || body.guide_rate === null ? null : parseFloat(body.guide_rate)
    if (body.duration_hours !== undefined) updateData.duration_hours = body.duration_hours ? parseFloat(body.duration_hours) : null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    // The supplier IS the operator: derive the denormalized name rather
    // than trusting the client, so the two can never disagree. Clearing the
    // supplier clears the name — a name with no supplier is the orphan state
    // this replaced. A payload naming neither (e.g. CSV) is left alone.
    if (body.supplier_id !== undefined || body.operator_name !== undefined) {
      updateData.operator_name = await operatorNameForSupplier(
        supabaseAdmin,
        supplierId === undefined ? body.supplier_id : supplierId,
        body.operator_name
      )
    }
    if (supplierId !== undefined) updateData.supplier_id = supplierId
    if (body.property_id !== undefined) {
      const trainProp = await resolveRateProperty(supabaseAdmin, {
        propertyType: 'train',
        supplierId: supplierId ?? null,
        name: null,
        propertyId: body.property_id,
      })
      // Explicit null clears the link; a stale id also resolves to null.
      updateData.property_id = trainProp.property_id
    }
    if (body.departure_times !== undefined) updateData.departure_times = body.departure_times || null
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('train_rates')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT train_rate catch error:', error)
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
    if (!(await rowInOrg(supabaseAdmin, 'train_rates', id, orgId))) return notFoundInOrg('Rate')

    // In use → refused with what uses it (lib/rates/rate-delete-guard).
    const blocked = await rateDeleteBlocked(supabaseAdmin, orgId, id)
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 })

    const { error } = await supabaseAdmin
      .from('train_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) {
      console.error('DELETE train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE train_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}