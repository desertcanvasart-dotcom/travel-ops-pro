import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { clientMessage } from '@/lib/api-errors'
import {
  parsePartnerInput, isUniqueViolation, partnerCodeTaken, partnerDeleteBlock,
} from '@/lib/b2b/partners'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B PARTNERS INDIVIDUAL API
// File: app/api/b2b/partners/[id]/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Per-variation overrides and every quote's selling price: manager-and-
    // above, like the writes. No screen calls this route.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('b2b_partners')
      .select(`
        *,
        b2b_partner_pricing (
          id, variation_id, margin_percent_override, fixed_price_per_pax, is_active,
          tour_variations (variation_name, variation_code, tier, tour_templates (template_name))
        ),
        tour_quotes (id, quote_number, status, selling_price, created_at)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Defence in depth: middleware gates this to manager-and-above too.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Only the allowlisted columns: id, org_id, created_at, created_by and the
    // unused ones are never written, and a margin outside 0-100 is refused
    // (the engine would price it as "not set"). A blank partner_code keeps the
    // old one.
    const parsed = parsePartnerInput(await request.json(), 'update')
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const updateData = parsed.data
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    const code = typeof updateData.partner_code === 'string' ? updateData.partner_code : null
    if (code) {
      const { data: rows } = await supabaseAdmin.from('b2b_partners').select('id, partner_code').eq('org_id', orgId)
      const clash = ((rows ?? []) as { id: string; partner_code: string }[])
        .some(r => r.id !== id && r.partner_code.toUpperCase() === code.toUpperCase())
      if (clash) return NextResponse.json({ success: false, error: partnerCodeTaken(code) }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from('b2b_partners')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error && isUniqueViolation(error) && code) {
      return NextResponse.json({ success: false, error: partnerCodeTaken(code) }, { status: 409 })
    }
    if (!error && !data) return notFoundInOrg('Partner')

    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

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
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Ownership first — b2b_partners is org-scoped as of
    // 20260825_b2b_partner_pricing_transport_org_id.sql, so a partner belongs to
    // exactly one organisation and this check is now both correct and safe.
    const { data: partner } = await supabaseAdmin
      .from('b2b_partners')
      .select('id, company_name')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!partner) return notFoundInOrg('Partner')

    // FAIL CLOSED. A lookup error blocks the delete rather than waving it
    // through. Quotes, trips (itineraries) and bookings all point at the
    // partner; the last two are ON DELETE SET NULL, so deleting would silently
    // strip the partner from them and lose its name on the booking.
    const count = async (table: string) => {
      const { count: n, error } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', id)
        .eq('org_id', orgId)
      if (error) throw error
      return n ?? 0
    }
    let counts
    try {
      counts = { quotes: await count('tour_quotes'), trips: await count('itineraries'), bookings: await count('bookings') }
    } catch (refErr) {
      console.error('Partner reference check failed:', refErr)
      return NextResponse.json(
        { success: false, error: 'Could not verify partner references — delete refused.' },
        { status: 500 }
      )
    }
    const blocked = partnerDeleteBlock(partner.company_name, counts)
    if (blocked) {
      return NextResponse.json({ success: false, error: blocked, counts }, { status: 409 })
    }

    // The partner's per-variation pricing rows go with it (ON DELETE CASCADE).
    const { error } = await supabaseAdmin.from('b2b_partners').delete().eq('id', id).eq('org_id', orgId)

    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Partner deleted' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
