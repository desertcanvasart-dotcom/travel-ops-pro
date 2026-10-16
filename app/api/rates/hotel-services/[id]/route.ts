// app/api/rates/hotel-services/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { sanitizeRateUpdate } from '@/lib/rates/update-payload'
import { cleanPricingBasisFields } from '@/lib/pricing/pricing-basis'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { pickHotelServiceColumns } from '@/lib/rates/accommodation-payload'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { rateUsage, rateInUseMessage } from '@/lib/rates/rate-in-use'
import { isForeignKeyViolation } from '@/lib/rates/accommodation-duplicates'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'hotel_staff_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // The form posts its whole state; '' on a uuid column is a 500, and the
    // client must not rewrite id/created_at. See lib/rates/update-payload.ts.
    // The form's columns only (lib/rates/accommodation-payload).
    const clean = sanitizeRateUpdate(pickHotelServiceColumns(body))
    if (!clean.ok) {
      return NextResponse.json(
        { success: false, error: clean.error, violations: clean.violations },
        { status: clean.status }
      )
    }

    // Another company's supplier is refused, never stored (the engine copies
    // supplier_id onto trip lines, and vouchers look it up from there).
    if ('supplier_id' in clean.payload) {
      const supplierCheck = await validateAndResolveSupplierFields({ supplier_id: clean.payload.supplier_id }, supabase)
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
      .from('hotel_staff_rates')
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
    if (!(await rowInOrg(supabase, 'hotel_staff_rates', id, orgId))) return notFoundInOrg('Rate')

    // Refused while a Pricing Grid line still names it (lib/rates/rate-in-use).
    const inUse = rateInUseMessage(await rateUsage(supabase, 'hotel_staff_rates', id, orgId))
    if (inUse) return NextResponse.json({ success: false, error: inUse }, { status: 409 })

    const { error } = await supabase
      .from('hotel_staff_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (isForeignKeyViolation(error)) {
      return NextResponse.json({ success: false, error: 'This rate is still used elsewhere. Switch it off (untick Active) instead of deleting it.' }, { status: 409 })
    }
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}