import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { clientMessage } from '@/lib/api-errors'
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
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    // Strip org_id too — a partner cannot be re-homed to another organisation.
    const { id: _, org_id: _dropOrg, created_at, ...updateData } = body

    const { data, error } = await supabaseAdmin
      .from('b2b_partners')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (!error && !data) return notFoundInOrg('Partner')

    if (error) {
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Ownership first — b2b_partners is org-scoped as of
    // 20260825_b2b_partner_pricing_transport_org_id.sql, so a partner belongs to
    // exactly one organisation and this check is now both correct and safe.
    if (!(await rowInOrg(supabaseAdmin, 'b2b_partners', id, orgId))) return notFoundInOrg('Partner')

    // FAIL CLOSED. This reference check used to ignore its own error, so a
    // failed lookup left `quotes` null and the delete proceeded — deleting a
    // partner that quotes still referenced. A lookup error now blocks the
    // delete rather than waving it through.
    const { data: quotes, error: refErr } = await supabaseAdmin
      .from('tour_quotes')
      .select('id')
      .eq('partner_id', id)
      .limit(1)

    if (refErr) {
      return NextResponse.json(
        { error: 'Could not verify partner references — delete refused.' },
        { status: 500 }
      )
    }
    if (quotes && quotes.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete partner with existing quotes. Deactivate instead.' },
        { status: 400 }
      )
    }

    await supabaseAdmin.from('b2b_partner_pricing').delete().eq('partner_id', id)

    const { error } = await supabaseAdmin.from('b2b_partners').delete().eq('id', id).eq('org_id', orgId)

    if (error) {
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Partner deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}