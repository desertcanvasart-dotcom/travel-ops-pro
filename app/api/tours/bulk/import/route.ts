import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'
import { parseTemplatesCsv } from '@/lib/tours/template-csv'

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
 */
export async function POST(request: NextRequest) {
  try {
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

    // Which codes already exist here → update vs create.
    const codes = records.map(r => r.template_code)
    const { data: existing } = await supabaseAdmin
      .from('tour_templates')
      .select('template_code')
      .in('template_code', codes)
    const existingCodes = new Set((existing || []).map((r: any) => r.template_code))

    const preview = {
      totalRows: records.length + refused.length,
      willCreate: records.filter(r => !existingCodes.has(r.template_code)).length,
      willUpdate: records.filter(r => existingCodes.has(r.template_code)).length,
      refusedRows: refused.length,
      refused,
    }
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...preview })

    let created = 0, updated = 0
    const errors: Array<{ code: string; message: string }> = []
    for (const rec of records) {
      // `rec` already holds only the non-empty portable fields, so an update
      // never nulls a description the sheet left blank.
      if (existingCodes.has(rec.template_code)) {
        const { error } = await supabaseAdmin
          .from('tour_templates')
          .update(rec as never)
          .eq('template_code', rec.template_code)
        if (error) errors.push({ code: rec.template_code, message: error.message })
        else updated++
      } else {
        const { error } = await supabaseAdmin.from('tour_templates').insert(rec as never)
        if (error) errors.push({ code: rec.template_code, message: error.message })
        else created++
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      ...(errors.length ? { error: `Import failed for ${errors.length} row(s): ${errors[0].message}` } : {}),
      created, updated, refusedRows: refused.length, refused, errors,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Import failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
