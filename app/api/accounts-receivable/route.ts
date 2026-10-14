import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { addToTotals, emptyTotals, type CurrencyTotals } from '@/lib/currency-totals'
import { ageInvoice, fetchAllRows, isReceivable, localToday, AGING_FILTER_KEYS, type AgingKey } from '@/lib/finance/receivables'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AgingBucket {
  current: number
  days30: number
  days60: number
  days90: number
  days90Plus: number
  noDueDate: number
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
    const agingFilter = searchParams.get('aging') // current, 30, 60, 90 (61-90), 90plus, nodate

    // TENANT BOUNDARY — invoices are org-scoped.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Every invoice with a balance, read page by page: one fixed row cap
    // silently dropped the newest invoices from every total past 1,000 open
    // ones. Drafts and cancelled invoices are filtered out below (a draft was
    // never sent, so it is not owed yet).
    const { rows: openInvoices, truncated, error } = await fetchAllRows<any>((from, to) => {
      let query = supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('org_id', orgId)
        .gt('balance_due', 0)
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      if (clientId) query = query.eq('client_id', clientId)
      return query
    })

    if (error) {
      console.error('Error fetching invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch receivables' }, { status: 500 })
    }

    const today = localToday()

    // Age each invoice once: the badge and the sums read the same bucket.
    const invoicesWithAging = openInvoices.filter(isReceivable).map(inv => ageInvoice(inv, today))

    // Filter by aging if specified
    let filteredInvoices = invoicesWithAging
    const filterKey = agingFilter ? AGING_FILTER_KEYS[agingFilter] : undefined
    if (filterKey) filteredInvoices = invoicesWithAging.filter(inv => inv.aging_key === filterKey)

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
          aging: { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0, noDueDate: 0 },
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
      client.aging[inv.aging_key as AgingKey] += Number(inv.balance_due || 0)

      // Track oldest invoice
      if (inv.issue_date && (!client.oldest_invoice_date || new Date(inv.issue_date) < new Date(client.oldest_invoice_date))) {
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
        days90: sumField(c => c.aging.days90),
        days90Plus: sumField(c => c.aging.days90Plus),
        noDueDate: sumField(c => c.aging.noDueDate)
      },
      overdue_count: filteredInvoices.filter(inv => inv.is_overdue).length,
      overdue_amount: overdueAmount,
      // True only if the page walk hit its ceiling: the figures are then a floor.
      truncated
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