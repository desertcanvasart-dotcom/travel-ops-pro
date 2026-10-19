// PATCH (this programme's price) / DELETE (unlink) one extra × programme link.
// Scoped by company as well as id.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { usableRate } from '@/lib/pricing/usable-rate'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { linkId } = await params
    const body = await request.json()
    const raw = body?.selling_price
    // Blank = the extra's own price; never 0 (the unpriced-rates rule).
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ success: false, error: 'The price must be a number, 0 or more' }, { status: 400 })
      }
    }
    const { data, error } = await createServerClient()
      .from('extras_catalogue_programmes')
      .update({ selling_price: usableRate(raw) })
      .eq('id', linkId)
      .eq('org_id', orgId)
      .select('id, extra_id, template_id, selling_price')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH extras-catalogue/programmes:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the price' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { linkId } = await params
    const { data, error } = await createServerClient()
      .from('extras_catalogue_programmes')
      .delete()
      .eq('id', linkId)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE extras-catalogue/programmes:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove the extra from this programme' }, { status: 500 })
  }
}
