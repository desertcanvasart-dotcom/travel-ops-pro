// ============================================
// /api/extras-catalogue/programmes — the extras one programme offers
// ============================================
// For a programme's own page (Tours → a programme → Extras): which extras are
// linked to it, at what price, and which others could be. One link =
// extras_catalogue_programmes (20270107). Every-booking extras are offered
// anyway; linking one here only gives it this programme's price.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg } from '@/lib/api/org-scope'
import { parseProgrammePicks } from '@/lib/extras/programme-links'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const templateId = request.nextUrl.searchParams.get('template_id')
    if (!templateId || !(await rowInOrg(supabase, 'tour_templates', templateId, orgId))) {
      return NextResponse.json({ success: false, error: 'Programme not found' }, { status: 404 })
    }

    const [{ data: extras, error }, { data: links, error: linkError }] = await Promise.all([
      supabase.from('extras_catalogue').select('*').eq('org_id', orgId).order('name'),
      supabase.from('extras_catalogue_programmes').select('id, extra_id, selling_price').eq('org_id', orgId).eq('template_id', templateId),
    ])
    if (error) throw error
    if (linkError) throw linkError
    const linkOf = new Map(((links ?? []) as { id: string; extra_id: string; selling_price: number | null }[]).map(l => [l.extra_id, l]))
    const rows = (extras ?? []) as { id: string; is_active?: boolean; offered_with?: string | null }[]

    return NextResponse.json({
      success: true,
      data: {
        // Linked to this programme (active or not, so a withdrawn one can be unlinked).
        linked: rows.filter(x => linkOf.has(x.id)).map(x => ({
          ...x,
          link_id: linkOf.get(x.id)!.id,
          programme_price: linkOf.get(x.id)!.selling_price,
        })),
        // Offered with every booking, so on this programme too unless it says otherwise.
        everyBooking: rows.filter(x => !linkOf.has(x.id) && x.is_active !== false && x.offered_with !== 'programmes'),
        // Active programme-only extras of other programmes, which could be linked here.
        others: rows.filter(x => !linkOf.has(x.id) && x.is_active !== false && x.offered_with === 'programmes'),
      },
    })
  } catch (error) {
    console.error('GET extras-catalogue/programmes:', error)
    return NextResponse.json({ success: false, error: 'Failed to load this programme’s extras' }, { status: 500 })
  }
}

/** Link an extra to a programme: { extra_id, template_id, selling_price? }. */
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()
    const extraId = typeof body?.extra_id === 'string' ? body.extra_id : ''
    const { picks, error: pickError } = parseProgrammePicks([{ template_id: body?.template_id, selling_price: body?.selling_price }])
    if (pickError || !picks?.length) return NextResponse.json({ success: false, error: pickError || 'template_id is required' }, { status: 400 })
    const pick = picks[0]
    if (!extraId || !(await rowInOrg(supabase, 'extras_catalogue', extraId, orgId))) {
      return NextResponse.json({ success: false, error: 'Extra not found' }, { status: 404 })
    }
    if (!(await rowInOrg(supabase, 'tour_templates', pick.template_id, orgId))) {
      return NextResponse.json({ success: false, error: 'Programme not found' }, { status: 404 })
    }
    const { data, error } = await supabase
      .from('extras_catalogue_programmes')
      .upsert({ org_id: orgId, extra_id: extraId, template_id: pick.template_id, selling_price: pick.selling_price }, { onConflict: 'extra_id,template_id' })
      .select('id, extra_id, template_id, selling_price')
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST extras-catalogue/programmes:', error)
    return NextResponse.json({ success: false, error: 'Failed to add the extra to this programme' }, { status: 500 })
  }
}
