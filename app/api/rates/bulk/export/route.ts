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

    // select('*'), NOT select(headers.join(',')): naming the columns makes the
    // export FAIL OUTRIGHT whenever a config gains a column before its
    // migration reaches a given database — which is exactly the deploy-safe
    // in-either-order contract every rate_currency change shipped under, and
    // exactly how the hotels/cruises Currency column broke this export on the
    // unmigrated CI project. A column the table does not have yet simply
    // exports blank; the headers keep the sheet's full shape.
    const { data, error } = await supabase
      .from(config.tableName)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(`[bulk-export] Error fetching ${table}:`, error)
      return NextResponse.json(
        { success: false, error: `Failed to fetch data: ${error.message}` },
        { status: 500 }
      )
    }

    // supplier_code is a portable key that lives on suppliers, not on the rate
    // row, so fill it in by joining: one query for the codes of every supplier
    // referenced here, keyed back onto each row. This is what lets the export
    // link to a supplier across installs (the sibling has different UUIDs). A
    // separate lookup, not a PostgREST embed, so a table without a supplier FK
    // relationship can't fail the whole export (PGRST200).
    if (headers.includes('supplier_code')) {
      const supplierIds = Array.from(
        new Set((data || []).map((r: Record<string, unknown>) => r.supplier_id).filter(Boolean))
      ) as string[]
      const codeById = new Map<string, string>()
      if (supplierIds.length > 0) {
        const { data: sup } = await supabase
          .from('suppliers')
          .select('id, supplier_code')
          .in('id', supplierIds)
        for (const s of sup || []) if (s.supplier_code) codeById.set(s.id, s.supplier_code)
      }
      for (const r of data || []) {
        ;(r as Record<string, unknown>).supplier_code = r.supplier_id ? codeById.get(r.supplier_id as string) ?? '' : ''
      }
    }

    // The { fields, data } form, NOT unparse(rows, { columns }): the latter
    // returns an empty string for zero rows — no headers either — so exporting
    // an empty rate table handed back a completely blank file, at exactly the
    // moment somebody most needs to see the column names.
    const rows = (data || []).map((row: Record<string, unknown>) =>
      headers.map(h => row[h] ?? '')
    )
    const csv = Papa.unparse({ fields: headers, data: rows })

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
