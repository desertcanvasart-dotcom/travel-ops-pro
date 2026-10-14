// ============================================
// API: /api/profit-loss/tax — VAT recorded on issued invoices
// ============================================
// Reads ONLY what each invoice recorded (vat_applied, tax_rate, tax_amount,
// vat_base) and groups it per currency and rate — lib/vat-report.ts. VAT is
// never worked out here from the company rate or from revenue: the rate is
// copied onto a document when it is issued and a later change to the setting
// must not move it. Extras and insurance carry no VAT; an invoice that left
// them out records the base it taxed in vat_base.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { buildVatReport } from '@/lib/vat-report'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Issued invoices of this company, by issue date. Paged: the default
    // PostgREST cap would silently cut a long year short.
    const PAGE = 1000
    const rows: Array<Record<string, unknown>> = []
    for (let from = 0; ; from += PAGE) {
      let query = supabaseAdmin
        .from('invoices')
        .select('currency, status, total_amount, tax_amount, tax_rate, vat_applied, vat_base, issue_date')
        .eq('org_id', orgId)
        .not('status', 'in', '(draft,cancelled)')
        .order('issue_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (startDate) query = query.gte('issue_date', startDate)
      if (endDate) query = query.lte('issue_date', endDate)
      const { data, error } = await query
      if (error) {
        console.error('Error fetching invoices for the tax report:', error)
        return NextResponse.json({ error: 'Failed to load invoices — the tax report was not computed.' }, { status: 500 })
      }
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }

    return NextResponse.json({ success: true, data: buildVatReport(rows) })
  } catch (error) {
    console.error('Error in P&L tax GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
