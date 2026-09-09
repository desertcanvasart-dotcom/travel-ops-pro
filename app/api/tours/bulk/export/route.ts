import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATE_CSV_COLUMNS, serializeTemplatesCsv } from '@/lib/tours/template-csv'

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
    const cols = TEMPLATE_CSV_COLUMNS.map(c => c.name).join(', ')
    const { data, error } = await supabaseAdmin
      .from('tour_templates')
      .select(cols)
      .order('template_code', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, error: `Failed to fetch templates: ${error.message}` }, { status: 500 })
    }

    const csv = serializeTemplatesCsv((data as unknown as Array<Record<string, unknown>>) || [])
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
