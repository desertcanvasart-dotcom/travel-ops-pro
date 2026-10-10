import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// GET: Fetch all reminder history across all invoices
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)

    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const invoiceId = searchParams.get('invoiceId')
    const status = searchParams.get('status') // 'sent', 'failed', 'all'

    // invoice_reminders is a child without org_id — every read goes through an
    // inner join on its invoice, filtered to this org. (The org's invoice ids
    // used to be listed first: capped at 1000 rows, and a 1000-id .in() made
    // a URL the gateway refuses.)
    if (invoiceId) {
      const { data: parent } = await supabase
        .from('invoices')
        .select('id')
        .eq('id', invoiceId)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!parent) {
        return NextResponse.json(
          { success: false, error: 'Invoice not found' },
          { status: 404 }
        )
      }
    }

    const scoped = (select: string, opts?: { count: 'exact'; head: true }) => {
      let q = supabase
        .from('invoice_reminders')
        .select(select, opts)
        .eq('invoices.org_id', orgId)
      if (invoiceId) q = q.eq('invoice_id', invoiceId)
      return q
    }

    let query = scoped(`
        *,
        invoices:invoice_id!inner (
          invoice_number,
          client_name,
          client_email,
          total_amount,
          balance_due,
          currency,
          status,
          org_id
        )
      `)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: reminders, error } = await query

    if (error) throw error

    const countOf = async (onlyStatus?: string) => {
      let q = scoped('id, invoices:invoice_id!inner(org_id)', { count: 'exact', head: true })
      if (onlyStatus) q = q.eq('status', onlyStatus)
      const { count } = await q
      return count || 0
    }

    const [totalCount, allCount, sentCount, failedCount] = await Promise.all([
      countOf(status && status !== 'all' ? status : undefined),
      countOf(),
      countOf('sent'),
      countOf('failed'),
    ])

    return NextResponse.json({
      success: true,
      reminders: reminders || [],
      pagination: {
        total: totalCount || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (totalCount || 0)
      },
      stats: {
        total: allCount,
        sent: sentCount,
        failed: failedCount
      }
    })

  } catch (error: any) {
    console.error('Error fetching reminder history:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
