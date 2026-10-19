// PUT/DELETE one catalogue extra. Scoped by org as well as id, so an extra can
// never be edited across organisations.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg } from '@/lib/api/org-scope'
import { foreignTemplates, linksForExtras, parseProgrammePicks, replaceProgrammeLinks } from '@/lib/extras/programme-links'
import { extraInputError } from '../validate'

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

function numberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params

    const body = await request.json()
    // The same checks as create: a bad unit was a bare 500 from the
    // database, a negative price was saved.
    const invalid = extraInputError(body)
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })
    const record: Record<string, unknown> = {}
    for (const k of WRITABLE) {
      if (!(k in body)) continue
      record[k] = k === 'supplier_cost' || k === 'selling_price' ? numberOrNull(body[k])
        : k === 'rate_currency' || k === 'activity_rate_id' ? (body[k] || null)
        : body[k]
    }
    if ('name' in record) {
      record.name = String(record.name ?? '').trim()
      if (!record.name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
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
    record.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('extras_catalogue')
      .update(record)
      .eq('id', id)
      .eq('org_id', orgId)
      .select(COLS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'An extra with that name already exists' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Extra not found' }, { status: 404 })
    if (picks) await replaceProgrammeLinks(supabase, orgId, id, picks)
    const programmes = await linksForExtras(supabase, orgId, [id])
    return NextResponse.json({ success: true, data: { ...data, programmes } })
  } catch (error) {
    console.error('PUT extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the extra' }, { status: 500 })
  }
}

/** The services_snapshot line a calculator quote stores for a catalogue
 *  extra — matched with jsonb containment (@>), so any line of the array. */
export function extraLineFilter(id: string): string {
  return JSON.stringify([{ rate_source: 'extras_catalogue', service_id: id }])
}

export interface ExtraInUse { count: number; quote_numbers: string[] }

/** This company's quotes that sell the extra: how many, and the newest few. */
async function quotesUsingExtra(supabase: ReturnType<typeof createServerClient>, orgId: string, id: string): Promise<ExtraInUse> {
  const { data, count, error } = await supabase
    .from('tour_quotes')
    .select('quote_number', { count: 'exact' })
    .eq('org_id', orgId)
    .contains('services_snapshot', extraLineFilter(id))
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return { count: count ?? (data ?? []).length, quote_numbers: (data ?? []).map((q: { quote_number: string }) => q.quote_number) }
}

export function extraInUseMessage(u: ExtraInUse): string {
  const more = u.count > u.quote_numbers.length ? ` and ${u.count - u.quote_numbers.length} more` : ''
  return `This extra is used by ${u.count} saved quote${u.count === 1 ? '' : 's'} (${u.quote_numbers.join(', ')}${more}). Deactivate it instead, so those quotes keep it.`
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params

    // Extras already added to a booking keep their own copy of title and
    // price (booking_extras stores them), so deleting a catalogue row cannot
    // rewrite history — it only stops the extra being offered again.
    //
    // A saved B2B quote is different: it names the extra only by id, in a
    // services_snapshot line (lib/pricing/extras-pricing), and every re-price
    // of it looks the id up again — so the line came back "not found". Such
    // an extra is refused, with the quotes that use it; the page offers to
    // stop offering it instead (is_active = false keeps the row).
    const inUse = await quotesUsingExtra(supabase, orgId, id)
    if (inUse.count > 0) {
      return NextResponse.json({
        success: false,
        error: extraInUseMessage(inUse),
        in_use: inUse,
      }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('extras_catalogue')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Extra not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the extra' }, { status: 500 })
  }
}
