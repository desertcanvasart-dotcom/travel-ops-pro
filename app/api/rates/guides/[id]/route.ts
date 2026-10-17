import { NextRequest, NextResponse } from 'next/server'
import { guideModeKey } from '@/lib/guides/guide-mode'
import { guideLanguageKey } from '@/lib/guides/guide-language'
import { clientMessage } from '@/lib/api-errors'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { validateRatePayload } from '@/lib/rate-validation'
import { rateInUse, rateInUseMessage } from '@/lib/rates/service-rate-in-use'

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
    if (!(await rowInOrg(supabaseAdmin, 'guide_rates', id, orgId))) return notFoundInOrg('Rate')

    const { data, error } = await supabaseAdmin
      .from('guide_rates')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET guide_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET guide_rate catch error:', error)
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
    if (!(await rowInOrg(supabaseAdmin, 'guide_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // The same money checks as a create: an edit could save a negative rate.
    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ success: false, error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const updateData: Record<string, any> = {}

    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.guide_language !== undefined) updateData.guide_language = guideLanguageKey(body.guide_language)
    if (body.guide_type !== undefined) updateData.guide_type = body.guide_type
    if (body.city !== undefined) updateData.city = body.city || null
    if (body.tour_duration !== undefined) updateData.tour_duration = body.tour_duration
    if (body.guide_mode !== undefined) updateData.guide_mode = guideModeKey(body.guide_mode)
    if (body.base_rate_eur !== undefined) updateData.base_rate_eur = parseFloat(body.base_rate_eur) || 0
    if (body.base_rate_non_eur !== undefined) updateData.base_rate_non_eur = parseFloat(body.base_rate_non_eur) || 0
    if (body.rate_currency !== undefined) updateData.rate_currency = body.rate_currency || null
    if (body.season !== undefined) updateData.season = body.season || null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if ('supplier_id' in body || 'supplier_name' in body) {
      const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      updateData.supplier_id = supplierCheck.supplier_id
    }
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('guide_rates')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      // The database's natural key (uq_guide_rates_natural_key): switching a
      // rate's mode, city or period onto another rate's — "Internal server
      // error" until now.
      if (error.code === '23505') {
        return NextResponse.json({
          success: false,
          error: 'Another rate already has these details (same language, guide type, duration, guide mode, city, guide and validity period). Edit that rate instead, or change one of those.',
        }, { status: 409 })
      }
      console.error('PUT guide_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT guide_rate catch error:', error)
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
    if (!(await rowInOrg(supabaseAdmin, 'guide_rates', id, orgId))) return notFoundInOrg('Rate')

    // Refused, with the reason, while a trip, variation or tour still uses it.
    const use = await rateInUse(supabaseAdmin, 'guide_rates', id, orgId)
    if (use) return NextResponse.json({ success: false, error: rateInUseMessage(use) }, { status: 409 })

    const { error } = await supabaseAdmin
      .from('guide_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return NextResponse.json({ success: false, error: rateInUseMessage({ where: 'tour_day' }) }, { status: 409 })
      }
      console.error('DELETE guide_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE guide_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}