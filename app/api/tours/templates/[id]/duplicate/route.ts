import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { insertWithTemplateCode } from '@/lib/tours/template-code'
import { syncEnglishVersion } from '@/lib/tours/english-version'

// ============================================
// POST /api/tours/templates/[id]/duplicate — copy a whole programme
// ============================================
// Tour Manager's Duplicate used to POST the template's metadata back to
// /api/tours/templates: the copy had no variations (so it could not be
// priced), no day activities and no Japanese version, and its code came from
// whatever the form last held — a Luxor multi-day copy could come out as
// EGY-DAY-123. Here the server copies, in the caller's company:
//   - the template, named "<name> (Copy)", under a fresh code built from the
//     SOURCE's first city and tour type (drawn again on a clash);
//   - its language versions (the 'en' one written from the copy, so it carries
//     the new name) and day activities;
//   - every variation, with its language versions, costed services
//     (tour_variation_services), day-by-day itinerary, pricing rows and
//     variation_services.
// Partner prices, quotes, departures and trips are sales records of the
// SOURCE and are not copied. If any step fails, the half-made copy is
// deleted again (its children cascade with it) and the error is reported.
//
// Manager-and-above, like every catalogue write.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Row = Record<string, any>

/** A child row ready to insert under a new parent: its own id and stamps go. */
function childCopy(row: Row, fk: string, parentId: string): Row {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, ...rest } = row
  return { ...rest, [fk]: parentId }
}

/** Templates carry a cached "from" price; the copy earns its own. */
const NOT_COPIED = ['id', 'created_at', 'updated_at', 'template_code', 'cached_starting_price', 'cached_starting_tier', 'cached_price_updated_at']

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(['admin', 'manager'])
  if (denied) return denied
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  const { data: source } = await supabaseAdmin
    .from('tour_templates')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!source) {
    return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
  }

  const base: Row = { ...source }
  for (const k of NOT_COPIED) delete base[k]
  const name = `${source.template_name} (Copy)`

  const inserted = await insertWithTemplateCode<Row>(
    (template_code) => supabaseAdmin
      .from('tour_templates')
      .insert({ ...base, org_id: orgId, template_name: name, template_code })
      .select()
      .single(),
    { cities: source.cities_covered, tourType: source.tour_type }
  )
  if (inserted.error || !inserted.data) {
    console.error('Duplicate: template insert failed:', inserted.error)
    return NextResponse.json(
      { success: false, error: inserted.clash ? 'Could not find a free template code' : 'Failed to duplicate template' },
      { status: inserted.clash ? 409 : 500 }
    )
  }
  const copy = inserted.data

  const undo = async (step: string, err: { message?: string } | null) => {
    console.error(`Duplicate of ${id} — ${step}:`, err)
    await supabaseAdmin.from('tour_templates').delete().eq('id', copy.id).eq('org_id', orgId)
    return NextResponse.json(
      { success: false, error: `Failed to duplicate ${step}: ${err?.message ?? 'unknown error'}`, step },
      { status: 500 }
    )
  }

  // Copy the rows of `table` whose `fk` is `fromId` under `toId`.
  const copyChildren = async (table: string, fk: string, fromId: string, toId: string, patch?: (r: Row) => Row) => {
    const { data, error } = await supabaseAdmin.from(table).select('*').eq(fk, fromId)
    if (error) return error
    const rows = ((data ?? []) as Row[]).map(r => {
      const c = childCopy(r, fk, toId)
      return patch ? patch(c) : c
    })
    if (rows.length === 0) return null
    const { error: insErr } = await supabaseAdmin.from(table).insert(rows)
    return insErr ?? null
  }

  // The other languages as they are; the 'en' row is written from the copy
  // itself, so it carries the new name and the template's current text.
  const { data: versions, error: verErr } = await supabaseAdmin
    .from('tour_template_versions').select('*').eq('template_id', id).neq('language', 'en')
  if (verErr) return undo('language versions', verErr)
  if ((versions ?? []).length > 0) {
    const { error: insErr } = await supabaseAdmin.from('tour_template_versions')
      .insert((versions as Row[]).map(r => childCopy(r, 'template_id', copy.id)))
    if (insErr) return undo('language versions', insErr)
  }
  let err = await syncEnglishVersion(supabaseAdmin, copy as { id: string; template_name: string })
  if (err) return undo('English version', err)
  err = await copyChildren('tour_day_activities', 'template_id', id, copy.id)
  if (err) return undo('day activities', err)
  err = await copyChildren('tour_template_defaults', 'template_id', id, copy.id)
  if (err) return undo('template defaults', err)

  const { data: variations, error: varErr } = await supabaseAdmin
    .from('tour_variations')
    .select('*')
    .eq('template_id', id)
    .eq('org_id', orgId)
  if (varErr) return undo('variations', varErr)

  let copied = 0
  for (const v of (variations ?? []) as Row[]) {
    // The source's code prefix swapped for the copy's (CAI-DAY-482-STANDARD
    // → CAI-DAY-731-STANDARD); a code that does not start with it keeps its
    // tail under the copy's code.
    const tail = typeof v.variation_code === 'string' && v.variation_code.startsWith(source.template_code)
      ? v.variation_code.slice(source.template_code.length)
      : `-${String(v.tier ?? 'VAR').toUpperCase()}`
    const { data: newVar, error: vErr } = await supabaseAdmin
      .from('tour_variations')
      .insert({ ...childCopy(v, 'template_id', copy.id), org_id: orgId, variation_code: `${copy.template_code}${tail}` })
      .select()
      .single()
    if (vErr || !newVar) return undo('variations', vErr)
    for (const table of ['tour_variation_versions', 'tour_variation_services', 'variation_daily_itinerary', 'variation_pricing', 'variation_services']) {
      const e = await copyChildren(table, 'variation_id', v.id, newVar.id)
      if (e) return undo(table.replace(/_/g, ' '), e)
    }
    copied++
  }

  return NextResponse.json({
    success: true,
    data: { ...copy, variations_copied: copied },
    message: `Duplicated as ${copy.template_code}`,
  }, { status: 201 })
}
