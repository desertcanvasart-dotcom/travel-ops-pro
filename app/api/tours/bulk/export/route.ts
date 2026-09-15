import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATE_CSV_DB_COLUMNS, serializeTemplatesCsv } from '@/lib/tours/template-csv'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/tours/bulk/export
 *
 * Exports the tour templates as a flat CSV of their portable metadata (the
 * columns in TEMPLATE_CSV_COLUMNS). The nested itinerary/hotels/variations and
 * the install-local UUID links are deliberately left out — this is a summary
 * sheet, and the shape that can move to another install.
 */
export async function GET() {
  try {
    // The REAL columns only. Naming a virtual one here made PostgREST refuse
    // the whole query — `42703 column tour_templates.name_ja does not exist` —
    // so this export returned a 500 to everyone for as long as that column
    // was on the sheet.
    const cols = TEMPLATE_CSV_DB_COLUMNS.map(c => c.name).join(', ')
    const { data, error } = await supabaseAdmin
      .from('tour_templates')
      .select(`id, ${cols}`)
      .order('template_code', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, error: `Failed to fetch templates: ${error.message}` }, { status: 500 })
    }

    // The Japanese name lives in tour_template_versions, one row per language.
    // Looked up separately rather than embedded so a template with no JA
    // version simply exports a blank cell.
    const rows = (data as unknown as Array<Record<string, unknown>>) || []
    const ids = rows.map(r => r.id).filter(Boolean) as string[]
    if (ids.length > 0) {
      const { data: versions, error: versionsError } = await supabaseAdmin
        .from('tour_template_versions')
        .select('template_id, template_name')
        .eq('language', 'ja')
        .in('template_id', ids)
      // Refused outright rather than exported with every Japanese name blank:
      // a sheet like that looks complete, gets edited, and is re-imported —
      // which would only be harmless because the importer skips empty cells.
      if (versionsError) {
        return NextResponse.json({ success: false, error: `Failed to fetch Japanese names: ${versionsError.message}` }, { status: 500 })
      }
      const jaByTemplate = new Map((versions || []).map((v: { template_id: string; template_name: string }) => [v.template_id, v.template_name]))
      for (const r of rows) r.name_ja = jaByTemplate.get(r.id as string) ?? ''
    }

    const csv = serializeTemplatesCsv(rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tour-templates-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Export failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
