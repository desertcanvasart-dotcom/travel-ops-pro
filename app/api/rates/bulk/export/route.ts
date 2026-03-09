import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, getExportHeaders } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'

const supabase = createServerClient()

/**
 * GET /api/rates/bulk/export?table=accommodation_rates
 * Exports all rows from a rate table as CSV.
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

    // Convert to CSV
    const csv = Papa.unparse(data || [], {
      columns: headers,
    })

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
