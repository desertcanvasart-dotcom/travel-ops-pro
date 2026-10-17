import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { CLIENT_STATUSES } from '@/lib/clients/status'
import { collectedTotals, invoicedTotals, sumCurrencyMaps } from '@/lib/clients/stats'
import { businessToday } from '@/lib/today'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAFF = ['admin', 'manager', 'agent']
const MONEY_PAGE = 1000

// GET /api/clients/stats - the cards at the top of the Clients page, for the
// active company.
//
// The counts are count-only queries (head: true), exact however many clients
// there are. They used to be tallied in the browser from the rows it happened
// to receive, and PostgREST caps a response at 1000 rows, so past that the
// totals were silently short. The money cannot be counted, only summed, so it
// walks every client's per-currency figures a page at a time.
export async function GET() {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const monthStart = `${businessToday().slice(0, 7)}-01`
    const count = async (narrow: (q: any) => any = q => q) => {
      const { count: n, error } = await narrow(
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
      )
      if (error) throw error
      return (n as number | null) ?? 0
    }

    const [total, vip, newThisMonth, ...byStatus] = await Promise.all([
      count(),
      count(q => q.eq('vip_status', true)),
      count(q => q.gte('created_at', monthStart)),
      ...CLIENT_STATUSES.map(s => count(q => q.eq('status', s))),
    ])

    const invoiced: Array<Record<string, number>> = []
    const collected: Array<Record<string, number>> = []
    for (let from = 0; ; from += MONEY_PAGE) {
      const { data, error } = await supabase
        .from('clients')
        .select('revenue_by_currency, collected_by_currency, total_revenue_generated, revenue_currency')
        .eq('org_id', orgId)
        .order('id', { ascending: true })
        .range(from, from + MONEY_PAGE - 1)
      if (error) throw error
      for (const row of data ?? []) {
        invoiced.push(invoicedTotals(row))
        collected.push(collectedTotals(row))
      }
      if (!data || data.length < MONEY_PAGE) break
    }

    return NextResponse.json({
      total,
      vip,
      newThisMonth,
      byStatus: Object.fromEntries(CLIENT_STATUSES.map((s, i) => [s, byStatus[i]])),
      invoiced: sumCurrencyMaps(invoiced),
      collected: sumCurrencyMaps(collected),
    })
  } catch (error) {
    console.error('Error in GET /api/clients/stats:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
