// app/api/rates/airport-services/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { sanitizeRateUpdate } from '@/lib/rates/update-payload'
import { cleanPricingBasisFields } from '@/lib/pricing/pricing-basis'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { rateDeleteBlocked } from '@/lib/rates/rate-delete-guard'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'airport_staff_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // The form posts its whole state; '' on a uuid column is a 500, and the
    // client must not rewrite id/created_at. See lib/rates/update-payload.ts.
    const clean = sanitizeRateUpdate(body)
    if (!clean.ok) {
      return NextResponse.json(
        { success: false, error: clean.error, violations: clean.violations },
        { status: clean.status }
      )
    }

    // A supplier in the edit must be one of this company's ('__none__' = none).
    if ('supplier_id' in clean.payload) {
      const supplierCheck = await validateAndResolveSupplierFields({ supplier_id: clean.payload.supplier_id }, supabase, orgId)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      clean.payload.supplier_id = supplierCheck.supplier_id
    }

    // Per group / per person / per unit (migration 20261104).
    const basis = cleanPricingBasisFields(body)
    if (!basis.ok) {
      return NextResponse.json({ success: false, error: basis.error }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('airport_staff_rates')
      .update({ ...clean.payload, ...basis.fields })
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
    if (!(await rowInOrg(supabase, 'airport_staff_rates', id, orgId))) return notFoundInOrg('Rate')

    // In use → refused with what uses it (lib/rates/rate-delete-guard).
    const blocked = await rateDeleteBlocked(supabase, orgId, id)
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 })

    const { error } = await supabase
      .from('airport_staff_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}