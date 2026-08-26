// ============================================
// GET /api/rates/bulk/periods/export?entity=accommodation|cruise
// ============================================
// The rate periods as a spreadsheet: one row per dated block, which is the
// shape a supplier's contract already has. The wide rate CSV can only express
// three seasons, so a six-period contract had nowhere to go.
//
// Rates that have no period list yet export the periods DERIVED from their old
// low/high/peak columns, so this is also the migration path: export, edit in
// the spreadsheet, import back.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import Papa from 'papaparse'
import { PERIOD_SHEETS, periodHeaders, periodsToRows } from '@/lib/rates/period-csv'
import { seasonsForRow } from '@/lib/rates/rate-seasons'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const entity = request.nextUrl.searchParams.get('entity')
    if (entity !== 'accommodation' && entity !== 'cruise') {
      return NextResponse.json(
        { success: false, error: 'entity must be accommodation or cruise' },
        { status: 400 }
      )
    }

    const config = PERIOD_SHEETS[entity]
    const supabase = createServerClient()

    // `*` rather than a column list: the legacy-column fallback reads a dozen
    // per-season columns that differ by table, and this is a small catalog —
    // the same plain select the wide export uses.
    const { data, error } = config.table === 'accommodation_rates'
      ? await supabase.from('accommodation_rates').select('*').order('property_name')
      : await supabase.from('nile_cruises').select('*').order('ship_name')

    if (error) {
      console.error('[periods-export] fetch failed:', error.message)
      return NextResponse.json({ success: false, error: 'Export failed' }, { status: 500 })
    }
    const rows = data ?? []

    const csvRows = rows.flatMap((row: Record<string, unknown>) => {
      const seasons = seasonsForRow(row, config.entity)
      if (seasons.length === 0) return []
      return periodsToRows(config, {
        key: String(row[config.keyColumn] ?? ''),
        displayName: String(row[config.displayColumn] ?? ''),
        seasons,
      })
    })

    const csv = Papa.unparse({ fields: periodHeaders(config), data: csvRows })
    const stamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${entity}-rate-periods-${stamp}.csv"`,
      },
    })
  } catch (error) {
    console.error('[periods-export] failed:', error)
    return NextResponse.json({ success: false, error: 'Export failed' }, { status: 500 })
  }
}
