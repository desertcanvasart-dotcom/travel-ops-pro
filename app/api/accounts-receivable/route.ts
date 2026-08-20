import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addToTotals, emptyTotals, type CurrencyTotals } from '@/lib/currency-totals'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AgingBucket {
  current: number
  days30: number
  days60: number
  days90Plus: number
}

interface ClientReceivable {
  client_id: string
  client_name: string
  client_email: string
  /** What this row is denominated in. A client billed in two currencies is two
   *  rows, because their outstanding balance is two amounts and not a sum. */
  currency: string
  total_invoiced: number
  total_paid: number
  total_outstanding: number
  invoice_count: number
  oldest_invoice_date: string
  aging: AgingBucket
  invoices: any[]
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get('clientId')
    const agingFilter = searchParams.get('aging') // current, 30, 60, 90

    // Fetch all unpaid/partially paid invoices
    let query = supabaseAdmin
      .from('invoices')
      .select('*')
      .gt('balance_due', 0)
      .not('status', 'eq', 'cancelled')
      .order('due_date', { ascending: true })

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data: invoices, error } = await query

    if (error) {
      console.error('Error fetching invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch receivables' }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Calculate aging for each invoice
    const invoicesWithAging = (invoices || []).map(inv => {
      const dueDate = new Date(inv.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      
      let agingBucket = 'current'
      if (daysPastDue > 90) agingBucket = '90plus'
      else if (daysPastDue > 60) agingBucket = '60'
      else if (daysPastDue > 30) agingBucket = '30'
      else if (daysPastDue > 0) agingBucket = 'overdue'

      return {
        ...inv,
        days_past_due: Math.max(0, daysPastDue),
        aging_bucket: agingBucket,
        is_overdue: daysPastDue > 0
      }
    })

    // Filter by aging if specified
    let filteredInvoices = invoicesWithAging
    if (agingFilter) {
      switch (agingFilter) {
        case 'current':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due <= 0)
          break
        case '30':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due > 0 && inv.days_past_due <= 30)
          break
        case '60':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due > 30 && inv.days_past_due <= 60)
          break
        case '90':
          filteredInvoices = invoicesWithAging.filter(inv => inv.days_past_due > 60)
          break
      }
    }

    // Group by client
    const clientMap = new Map<string, ClientReceivable>()

    filteredInvoices.forEach(inv => {
      const invoiceCurrency = (inv.currency || 'EUR').toUpperCase()
      // Grouped by client AND currency: adding a yen balance to a euro one
      // produces a number that is owed in neither.
      const clientKey = `${inv.client_id || inv.client_name || 'unknown'}::${invoiceCurrency}`

      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          client_id: inv.client_id,
          client_name: inv.client_name,
          client_email: inv.client_email,
          currency: invoiceCurrency,
          total_invoiced: 0,
          total_paid: 0,
          total_outstanding: 0,
          invoice_count: 0,
          oldest_invoice_date: inv.issue_date,
          aging: { current: 0, days30: 0, days60: 0, days90Plus: 0 },
          invoices: []
        })
      }

      const client = clientMap.get(clientKey)!
      client.total_invoiced += Number(inv.total_amount || 0)
      client.total_paid += Number(inv.amount_paid || 0)
      client.total_outstanding += Number(inv.balance_due || 0)
      client.invoice_count += 1
      client.invoices.push(inv)

      // Update aging buckets
      const balanceDue = Number(inv.balance_due || 0)
      if (inv.days_past_due <= 0) {
        client.aging.current += balanceDue
      } else if (inv.days_past_due <= 30) {
        client.aging.days30 += balanceDue
      } else if (inv.days_past_due <= 60) {
        client.aging.days60 += balanceDue
      } else {
        client.aging.days90Plus += balanceDue
      }

      // Track oldest invoice
      if (new Date(inv.issue_date) < new Date(client.oldest_invoice_date)) {
        client.oldest_invoice_date = inv.issue_date
      }
    })

    const clientReceivables = Array.from(clientMap.values())
      .sort((a, b) => b.total_outstanding - a.total_outstanding)

    // Summary totals stay SEPARATED BY CURRENCY for the same reason: the
    // tiles show "¥879,917" — or "¥879,917 + €1,200" — never a merged fiction.
    const sumField = (get: (c: ClientReceivable) => number): CurrencyTotals => {
      const totals = emptyTotals()
      for (const c of clientReceivables) addToTotals(totals, get(c), c.currency)
      return totals
    }
    const overdueAmount = emptyTotals()
    for (const inv of filteredInvoices.filter(i => i.is_overdue)) {
      addToTotals(overdueAmount, inv.balance_due, inv.currency)
    }

    // How many distinct clients, regardless of how many currencies each is
    // billed in — the row count would double-count someone billed in two.
    const clientCount = new Set(clientReceivables.map(c => c.client_id || c.client_name)).size

    const summary = {
      total_outstanding: sumField(c => c.total_outstanding),
      total_invoiced: sumField(c => c.total_invoiced),
      total_paid: sumField(c => c.total_paid),
      client_count: clientCount,
      invoice_count: filteredInvoices.length,
      aging: {
        current: sumField(c => c.aging.current),
        days30: sumField(c => c.aging.days30),
        days60: sumField(c => c.aging.days60),
        days90Plus: sumField(c => c.aging.days90Plus)
      },
      overdue_count: filteredInvoices.filter(inv => inv.is_overdue).length,
      overdue_amount: overdueAmount
    }

    return NextResponse.json({
      success: true,
      data: clientReceivables,
      invoices: filteredInvoices,
      summary
    })
  } catch (error) {
    console.error('Error in AR GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}