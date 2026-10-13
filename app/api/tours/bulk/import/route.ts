import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'
import { parseTemplatesCsv, splitVirtualFields } from '@/lib/tours/template-csv'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { syncEnglishVersion } from '@/lib/tours/english-version'

const CODE_PAGE = 1000
type SavedTemplate = { id: string; template_name: string }
const codeKey = (code: string) => code.trim().toLowerCase()

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/tours/bulk/import
 * Body: { csvData: string, dryRun?: boolean }
 *
 * Upserts tour templates from a flat CSV, keyed on template_code. Only the
 * portable metadata columns are written; an existing template's itinerary,
 * hotels, variations and language rows are left untouched — re-importing a
 * summary sheet updates names/type/duration/cities/flags and never wipes the
 * day-by-day work. New codes are created as metadata shells (their itinerary is
 * built in the editor afterward).
 *
 * Keyed on (org_id, template_code), ignoring case: codes are unique per
 * company (20261207),
 * and both companies may hold the same one. A row matches ONLY the caller's
 * company's template — another company's programme with that code is never
 * updated; a new one is created in the caller's company.
 */
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()
    const { csvData, dryRun = false } = body
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }

    const { records, refused, parseError } = parseTemplatesCsv(csvData, (csv) => {
      const p = Papa.parse<Record<string, string>>(csv, {
        header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
      })
      return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
    })
    if (parseError) {
      return NextResponse.json({ success: false, error: `CSV parsing failed: ${parseError}` }, { status: 400 })
    }
    if (records.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid template rows found', refused }, { status: 400 })
    }

    // Which codes already exist here → update vs create. Matched ignoring
    // case, as the in-file duplicate check already was: an exact match made
    // `cai-day-001` a SECOND programme beside the stored `CAI-DAY-001` (the
    // unique constraint is case-sensitive). The company's whole code list is
    // read, a page at a time, because PostgREST has no case-insensitive IN.
    const existingByCode = new Map<string, { id: string; template_code: string }>()
    for (let from = 0; ; from += CODE_PAGE) {
      const { data: page, error: codesError } = await supabaseAdmin
        .from('tour_templates')
        .select('id, template_code')
        .eq('org_id', orgId)
        .order('template_code', { ascending: true })
        .range(from, from + CODE_PAGE - 1)
      if (codesError) {
        return NextResponse.json({ success: false, error: `Could not read existing codes: ${codesError.message}` }, { status: 500 })
      }
      for (const r of (page ?? []) as Array<{ id: string; template_code: string }>) {
        const key = codeKey(r.template_code)
        // Two stored codes differing only in case (made before this): the
        // exact spelling wins below, else the first.
        if (!existingByCode.has(key)) existingByCode.set(key, r)
        else if (records.some(rec => rec.template_code === r.template_code)) existingByCode.set(key, r)
      }
      if (!page || page.length < CODE_PAGE) break
    }
    const match = (code: string) => existingByCode.get(codeKey(code)) ?? null

    const preview = {
      totalRows: records.length + refused.length,
      willCreate: records.filter(r => !match(r.template_code)).length,
      willUpdate: records.filter(r => match(r.template_code)).length,
      refusedRows: refused.length,
      refused,
    }
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...preview })

    let created = 0, updated = 0
    const errors: Array<{ code: string; message: string }> = []
    // Rows whose template DID save but whose Japanese name did not. Kept apart
    // from `errors` because they must not flip `success` — the UI treated a
    // lost translation as a failed import and did not even refresh the list,
    // although the template was created or updated.
    const warnings: Array<{ code: string; message: string }> = []
    for (const rec of records) {
      // `rec` already holds only the non-empty portable fields, so an update
      // never nulls a description the sheet left blank.
      //
      // The virtual cells are split off FIRST. name_ja is not a column on
      // tour_templates, and writing it rejected the whole row — so any sheet
      // carrying a Japanese name failed to import, while the sample sheet
      // shipped with one filled in.
      const { row, virtual } = splitVirtualFields(rec as unknown as Record<string, unknown>)
      let templateId: string | null = null
      let saved: SavedTemplate | null = null
      const hit = match(rec.template_code)
      if (hit) {
        // The stored code's spelling is kept: a sheet typed in lower case
        // updates CAI-DAY-001, it does not rename it.
        const { template_code: _sheetCode, ...patch } = row as Record<string, unknown>
        void _sheetCode
        const { data, error } = await supabaseAdmin
          .from('tour_templates')
          .update({ ...patch, org_id: orgId } as never)
          .eq('org_id', orgId)
          .eq('id', hit.id)
          .select('*')
          .maybeSingle()
        if (error) errors.push({ code: rec.template_code, message: error.message })
        else { updated++; saved = data as SavedTemplate | null; templateId = saved?.id ?? null }
      } else {
        const { data, error } = await supabaseAdmin
          .from('tour_templates')
          .insert({ ...row, org_id: orgId } as never)
          .select('*')
          .maybeSingle()
        if (error) errors.push({ code: rec.template_code, message: error.message })
        else {
          created++
          saved = data as SavedTemplate | null
          templateId = saved?.id ?? null
          // A later row of the same sheet with this code (any case) updates it.
          if (saved) existingByCode.set(codeKey(rec.template_code), { id: saved.id, template_code: rec.template_code })
        }
      }

      // The 'en' version row: created for a new template (the Lang column
      // read empty, or JA only, for every imported programme) and kept in
      // step with an updated one (lib/tours/english-version). Best-effort,
      // like the Japanese name below.
      if (saved) {
        const enError = await syncEnglishVersion(supabaseAdmin, saved)
        if (enError) warnings.push({ code: rec.template_code, message: `English version not saved: ${enError.message}` })
      }

      // The Japanese name belongs on the ja version row, keyed by
      // (template_id, language). Best-effort: a template that imported must
      // not be reported as failed because its translation did not land.
      const nameJa = typeof virtual.name_ja === 'string' ? virtual.name_ja.trim() : ''
      if (templateId && nameJa) {
        const { error: jaError } = await supabaseAdmin
          .from('tour_template_versions')
          .upsert({ template_id: templateId, language: 'ja', template_name: nameJa } as never,
                  { onConflict: 'template_id,language' })
        if (jaError) warnings.push({ code: rec.template_code, message: `Japanese name not saved: ${jaError.message}` })
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      ...(errors.length ? { error: `Import failed for ${errors.length} row(s): ${errors[0].message}` } : {}),
      ...(warnings.length ? { warning: `${warnings.length} row(s) imported without a language version: ${warnings[0].message}` } : {}),
      created, updated, refusedRows: refused.length, refused, errors, warnings,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Import failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
