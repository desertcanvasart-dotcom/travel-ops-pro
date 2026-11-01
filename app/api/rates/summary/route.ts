import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { SHEET_TABLES } from '@/lib/rates/sheet-tables'

// ============================================
// GET /api/rates/summary — how many rows each rate sheet holds
// ============================================
// For the Rates menu and overview. Managers and above, as the rate sheets
// are (middleware ROUTE_PERMISSIONS '/rates'). One head-only count per sheet,
// this company's rows. A count that fails is null — shown as no number,
// never as 0.
export async function GET() {
  try {
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const entries = await Promise.all(
      Object.entries(SHEET_TABLES).map(async ([href, sheet]) => {
        if (!sheet) return [href, null] as const
        const { count, error } = await supabase
          .from(sheet.table)
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
        return [href, error ? null : count ?? 0] as const
      })
    )
    return NextResponse.json({ success: true, data: Object.fromEntries(entries) })
  } catch (error) {
    console.error('Error counting rate rows:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to count rates') }, { status: 500 })
  }
}
