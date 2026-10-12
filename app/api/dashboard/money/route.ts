import { NextRequest, NextResponse } from 'next/server'
import { todayFromRequest } from '@/lib/today'
import { excludeDemoLinked, loadDemoItineraryIds, type DemoLookupClient } from '@/lib/demo-data'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { addTo, billsWithoutExpenses, netReceived, receivableTotals, type CurrencyTotals } from '@/lib/dashboard/figures'

// ============================================
// DASHBOARD MONEY ROW — manager/owner only
// ============================================
// Gated by the middleware financial-API prefix list ('/api/dashboard/money'),
// same as /api/accounts-receivable et al. Money is summed PER CURRENCY and
// never across currencies — an org that bills JPY and pays USD owes two
// amounts, not one sum (house rule from accounts-payable). The arithmetic
// lives in lib/dashboard/figures.

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The caller's calendar date, not the UTC server's (see todayFromRequest).
    const today = todayFromRequest(request.url)
    const monthStart = `${today.slice(0, 7)}-01`

    // Seeded fixtures carry real money on real rows (lib/demo-data.ts). The
    // portal demo alone is ¥1,099,897 across two invoices, one marked paid with
    // no payment behind it — which is most of what the QA audit read as the
    // Dashboard contradicting Invoices and Payments.
    // Cast: the Supabase generic chain is deep enough that inference here trips
    // TS2589. The helper only ever reads id + itinerary_code.
    const demoItineraryIds = await loadDemoItineraryIds(
      supabase as unknown as DemoLookupClient,
      orgId,
    )

    const [receivableInvoices, unpaidExpenses, unpaidBills, monthPayments, monthPaidExpenses] = await Promise.all([
      // Outstanding receivables — same filter as /api/accounts-receivable
      supabase.from('invoices')
        .select('balance_due, currency, due_date, itinerary_id')
        .eq('org_id', orgId)
        .gt('balance_due', 0)
        .not('status', 'eq', 'cancelled')
        .limit(1000),
      // Unpaid expenses — same filter as /api/accounts-payable
      supabase.from('expenses')
        .select('amount, currency, itinerary_id')
        .eq('org_id', orgId)
        .in('status', ['pending', 'approved']),
      // Supplier bills not yet settled (those matched to an expense are
      // dropped below — the expense already carries that money)
      supabase.from('supplier_invoices')
        .select('id, amount, currency')
        .eq('org_id', orgId)
        .in('status', ['received', 'matched', 'approved']),
      // Money that actually arrived this month, refunds netted out below
      supabase.from('payments')
        .select('amount, currency, itinerary_id, payment_type')
        .eq('org_id', orgId)
        .gte('payment_date', monthStart.slice(0, 10)),
      // Money that actually left this month (expenses marked paid this month)
      supabase.from('expenses')
        .select('amount, currency, itinerary_id')
        .eq('org_id', orgId)
        .eq('status', 'paid')
        .gte('payment_date', monthStart.slice(0, 10)),
    ])
    for (const r of [receivableInvoices, unpaidExpenses, unpaidBills, monthPayments, monthPaidExpenses]) {
      if (r.error) throw r.error
    }

    // Which open bills are matched to expenses. The junction has no org_id;
    // it is keyed on bill ids this org's query just returned.
    const billIds = (unpaidBills.data || []).map(b => b.id)
    const billLinks = billIds.length
      ? await supabase.from('supplier_invoice_expenses')
          .select('supplier_invoice_id')
          .in('supplier_invoice_id', billIds)
      : { data: [], error: null }
    if (billLinks.error) throw billLinks.error
    const billsUnlinked = billsWithoutExpenses(unpaidBills.data || [], billLinks.data || [])

    // Hold back rows belonging to a seeded fixture. Reported below, not silent.
    const invoicesReal = excludeDemoLinked(receivableInvoices.data, demoItineraryIds)
    const unpaidExpensesReal = excludeDemoLinked(unpaidExpenses.data, demoItineraryIds)
    const monthPaymentsReal = excludeDemoLinked(monthPayments.data, demoItineraryIds)
    const monthPaidExpensesReal = excludeDemoLinked(monthPaidExpenses.data, demoItineraryIds)
    const demoExcluded = {
      excluded:
        invoicesReal.exclusion.excluded +
        unpaidExpensesReal.exclusion.excluded +
        monthPaymentsReal.exclusion.excluded +
        monthPaidExpensesReal.exclusion.excluded,
      codes: [],
    }

    const receivables = receivableTotals(invoicesReal.real, today)

    const expenseTotals: CurrencyTotals = {}
    for (const e of unpaidExpensesReal.real) addTo(expenseTotals, e.currency, e.amount)

    const billTotals: CurrencyTotals = {}
    for (const b of billsUnlinked) addTo(billTotals, b.currency, b.amount)

    const received = netReceived(monthPaymentsReal.real)

    const spentThisMonth: CurrencyTotals = {}
    for (const e of monthPaidExpensesReal.real) addTo(spentThisMonth, e.currency, e.amount)

    return NextResponse.json({
      success: true,
      data: {
        receivables: {
          totals: receivables.totals,
          overdue: receivables.overdue,
          count: invoicesReal.real.length,
        },
        payables: {
          expenseTotals,
          expenseCount: unpaidExpensesReal.real.length,
          billTotals,
          billCount: billsUnlinked.length,
        },
        month: {
          received: received.totals,
          receivedCount: received.count,
          refundCount: received.refundCount,
          spent: spentThisMonth,
          spentCount: monthPaidExpensesReal.real.length,
        },
        demo_excluded: demoExcluded,
      },
    })
  } catch (error: any) {
    console.error('Error building money summary:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
