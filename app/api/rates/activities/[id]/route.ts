import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeTiers } from '@/lib/rates/activity-tiers'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { validateRatePayload } from '@/lib/rate-validation'
import { rateInUse, rateInUseMessage } from '@/lib/rates/rate-in-use'

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
    if (!(await rowInOrg(supabaseAdmin, 'activity_rates', id, orgId))) return notFoundInOrg('Rate')

    const { data, error } = await supabaseAdmin
      .from('activity_rates')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET activity_rates by id error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Rate not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET activity_rates by id catch error:', error)
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
    if (!(await rowInOrg(supabaseAdmin, 'activity_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // The same money checks as a create: an edit could save a negative rate.
    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ success: false, error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

    const updateData = {
      service_code: body.service_code,
      activity_name: body.activity_name,
      activity_category: body.activity_category || null,
      activity_type: body.activity_type || null,
      duration: body.duration || null,
      city: body.city || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
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
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('activity_rates')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT activity_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT activity_rates catch error:', error)
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
    if (!(await rowInOrg(supabaseAdmin, 'activity_rates', id, orgId))) return notFoundInOrg('Rate')

    // Refused, with the reason, while a trip line or variation still uses it.
    const use = await rateInUse(supabaseAdmin, 'activity_rates', id, orgId)
    if (use) return NextResponse.json({ success: false, error: rateInUseMessage(use) }, { status: 409 })

    const { error } = await supabaseAdmin
      .from('activity_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) {
      console.error('DELETE activity_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Rate deleted successfully' })
  } catch (error: any) {
    console.error('DELETE activity_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}