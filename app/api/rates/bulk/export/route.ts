import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import {
  RATE_TABLE_CONFIGS,
  getExportHeaders,
  getTemplateHeaders,
  buildTemplateRow,
} from '@/lib/bulk-rate-service'
import Papa from 'papaparse'

const supabase = createServerClient()

/**
 * GET /api/rates/bulk/export?table=accommodation_rates[&template=1]
 *
 * Exports a rate table as CSV. `template=1` returns the headers plus one
 * filled-in example row instead of the data — the sheet to start from when
 * there is nothing to export yet.
 */
export async function GET(request: NextRequest) {
  try {
    const table = request.nextUrl.searchParams.get('table')

    if (!table || !RATE_TABLE_CONFIGS[table]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid table. Supported tables: ${Object.keys(RATE_TABLE_CONFIGS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    const config = RATE_TABLE_CONFIGS[table]
    const wantsTemplate = request.nextUrl.searchParams.get('template') === '1'

    if (wantsTemplate) {
      const csv = Papa.unparse({
        fields: getTemplateHeaders(config),
        data: [buildTemplateRow(config)],
      })
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${table}_template.csv"`,
        },
      })
    }

    const headers = getExportHeaders(config)

    // Fetch all rows from the table
    const { data, error } = await supabase
      .from(table)
      .select(headers.join(','))
      .order('created_at', { ascending: false })

    if (error) {
      console.error(`[bulk-export] Error fetching ${table}:`, error)
      return NextResponse.json(
        { success: false, error: `Failed to fetch data: ${error.message}` },
        { status: 500 }
      )
    }

    // The { fields, data } form, NOT unparse(rows, { columns }): the latter
    // returns an empty string for zero rows — no headers either — so exporting
    // an empty rate table handed back a completely blank file, at exactly the
    // moment somebody most needs to see the column names.
    const csv = Papa.unparse({ fields: headers, data: data || [] })

    // Return CSV as a downloadable file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${table}_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    console.error('[bulk-export] Error:', error)
    return NextResponse.json(
      { success: false, error: `Export failed: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}
