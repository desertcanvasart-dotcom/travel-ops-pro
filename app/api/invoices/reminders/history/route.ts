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

    // invoice_reminders is a child without org_id — gate every read on the
    // set of invoice ids that belong to this org. If a specific invoiceId is
    // requested, verify it belongs to the org; otherwise enumerate the org's
    // invoice ids and scope all queries through .in('invoice_id', ...).
    let allowedInvoiceIds: string[] | null = null
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
      allowedInvoiceIds = [invoiceId]
    } else {
      const { data: orgInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('org_id', orgId)
      allowedInvoiceIds = (orgInvoices || []).map((r: any) => r.id)
    }

    // If the org has no invoices at all, short-circuit with empty result.
    if (allowedInvoiceIds.length === 0) {
      return NextResponse.json({
        success: true,
        reminders: [],
        pagination: { total: 0, limit, offset, hasMore: false },
        stats: { total: 0, sent: 0, failed: 0 }
      })
    }

    let query = supabase
      .from('invoice_reminders')
      .select(`
        *,
        invoices:invoice_id (
          invoice_number,
          client_name,
          client_email,
          total_amount,
          balance_due,
          currency,
          status
        )
      `)
      .in('invoice_id', allowedInvoiceIds)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: reminders, error } = await query

    if (error) throw error

    // Get total count
    let countQuery = supabase
      .from('invoice_reminders')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', allowedInvoiceIds)

    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status)
    }

    const { count: totalCount } = await countQuery

    // Get stats
    const { data: stats } = await supabase
      .from('invoice_reminders')
      .select('status')
      .in('invoice_id', allowedInvoiceIds)

    const sentCount = stats?.filter((r: any) => r.status === 'sent').length || 0
    const failedCount = stats?.filter((r: any) => r.status === 'failed').length || 0

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
        total: stats?.length || 0,
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
