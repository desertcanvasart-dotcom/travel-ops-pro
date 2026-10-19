// ============================================
// /api/extras-catalogue — the extras that are not attractions
// ============================================
// Airport fast-track, extra luggage, a late check-out: things the office sells
// that no rate table models. Org-scoped, unlike the shared entrance_fees
// catalogue, because these are one agency's commercial offers.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg } from '@/lib/api/org-scope'
import { foreignTemplates, linksForExtras, parseProgrammePicks, replaceProgrammeLinks } from '@/lib/extras/programme-links'
import { extraInputError } from './validate'
import { loadOfferedExtras } from '@/lib/extras/offered'

export const dynamic = 'force-dynamic'

// '*' on purpose: rate_currency arrives by migration (20260902) and the page
// must keep loading on a database that has not run it yet.
const COLS = '*'

const WRITABLE = [
  'name', 'description', 'category', 'supplier_cost', 'supplier_id',
  'selling_price', 'unit', 'is_active',
  // 20270107: every booking or only the linked programmes; the Activities
  // rate the cost comes from (NULL = the typed supplier_cost).
  'offered_with', 'activity_rate_id',
  // Only ever sent when the user picked a currency or cleared one
  // (rateCurrencyPatch), so an unmigrated database still saves.
  'rate_currency',
] as const

/** A blank number field means "not priced", never 0 — the unpriced-rates rule. */
function numberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pickWritable(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of WRITABLE) {
    if (!(k in body)) continue
    out[k] = k === 'supplier_cost' || k === 'selling_price' ? numberOrNull(body[k])
      : k === 'rate_currency' || k === 'activity_rate_id' ? (body[k] || null)
      : body[k]
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const params = request.nextUrl.searchParams

    // What a trip of this programme is offered (the B2B calculator's picker):
    // every-booking extras plus this programme's, at its price.
    const templateId = params.get('template_id')
    if (templateId) {
      if (!(await rowInOrg(supabase, 'tour_templates', templateId, orgId))) {
        return NextResponse.json({ success: false, error: 'Programme not found' }, { status: 404 })
      }
      const { extras, activities } = await loadOfferedExtras(supabase, orgId, templateId)
      const data = extras
        .map(x => ({ ...x, activity_name: x.activity_rate_id ? activities.get(x.activity_rate_id)?.activity_name ?? null : null }))
        .sort((a, b) => String(a.category ?? '').localeCompare(String(b.category ?? '')) || a.name.localeCompare(b.name))
      return NextResponse.json({ success: true, data })
    }

    let query = supabase
      .from('extras_catalogue')
      .select(COLS)
      .eq('org_id', orgId)
      .order('category', { ascending: true, nullsFirst: false })
      .order('name')
    if (params.get('active_only') === 'true') {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error
    const rows = (data || []) as { id: string; activity_rate_id?: string | null }[]

    // Each extra's programmes and the Activities rate it costs from, for the
    // Extras page.
    const links = await linksForExtras(supabase, orgId, rows.map(r => r.id))
    const activityIds = [...new Set(rows.map(r => r.activity_rate_id).filter((v): v is string => !!v))]
    const activityNames = new Map<string, { activity_name: string; city: string | null }>()
    if (activityIds.length) {
      const { data: acts } = await supabase.from('activity_rates').select('id, activity_name, city').eq('org_id', orgId).in('id', activityIds)
      for (const a of (acts ?? []) as { id: string; activity_name: string; city: string | null }[]) activityNames.set(a.id, a)
    }
    return NextResponse.json({
      success: true,
      data: rows.map(r => ({
        ...r,
        programmes: links.filter(l => l.extra_id === r.id),
        activity_name: r.activity_rate_id ? activityNames.get(r.activity_rate_id)?.activity_name ?? null : null,
        activity_city: r.activity_rate_id ? activityNames.get(r.activity_rate_id)?.city ?? null : null,
      })),
    })
  } catch (error) {
    console.error('GET extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to load extras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    const body = await request.json()
    const invalid = extraInputError(body)
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })
    const record = pickWritable(body)
    const name = String(record.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }

    // One of this company's suppliers (suppliers.org_id, 20261205).
    if (typeof record.supplier_id === 'string' && record.supplier_id &&
        !(await rowInOrg(supabase, 'suppliers', record.supplier_id, orgId))) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
    }
    // One of this company's Activities rates (activity_rates.org_id, 20261206).
    if (typeof record.activity_rate_id === 'string' &&
        !(await rowInOrg(supabase, 'activity_rates', record.activity_rate_id, orgId))) {
      return NextResponse.json({ success: false, error: 'Activity not found' }, { status: 404 })
    }
    // The programmes it is offered with, each with its own price (optional).
    const { picks, error: picksError } = parseProgrammePicks(body.programmes)
    if (picksError) return NextResponse.json({ success: false, error: picksError }, { status: 400 })
    if (picks && record.offered_with === 'programmes' && picks.length === 0) {
      return NextResponse.json({ success: false, error: 'Pick at least one programme, or offer it with every booking' }, { status: 400 })
    }
    if (picks && (await foreignTemplates(supabase, orgId, picks.map(p => p.template_id))).length) {
      return NextResponse.json({ success: false, error: 'Programme not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('extras_catalogue')
      .insert({ ...record, name, org_id: orgId })
      .select(COLS)
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: `An extra named "${name}" already exists` }, { status: 409 })
      }
      throw error
    }
    if (picks) await replaceProgrammeLinks(supabase, orgId, data.id, picks)
    const programmes = await linksForExtras(supabase, orgId, [data.id])
    return NextResponse.json({ success: true, data: { ...data, programmes } }, { status: 201 })
  } catch (error) {
    console.error('POST extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to create the extra' }, { status: 500 })
  }
}
