import { NextResponse } from 'next/server'
import { excludeDemoLinked, loadDemoItineraryIds, type DemoLookupClient } from '@/lib/demo-data'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// ============================================
// DASHBOARD MONEY ROW — manager/owner only
// ============================================
// Gated by the middleware financial-API prefix list ('/api/dashboard/money'),
// same as /api/accounts-receivable et al. Money is summed PER CURRENCY and
// never across currencies — an org that bills JPY and pays USD owes two
// amounts, not one sum (house rule from accounts-payable).

type CurrencyTotals = Record<string, number>

const add = (t: CurrencyTotals, currency: string | null | undefined, amount: number | null | undefined) => {
  const c = currency || 'EUR'
  t[c] = (t[c] || 0) + Number(amount || 0)
}

export async function GET() {
  try {
    const supabase = createServerClient()
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const today = new Date().toISOString().slice(0, 10)
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

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
      // Supplier bills not yet settled
      supabase.from('supplier_invoices')
        .select('amount, currency')
        .eq('org_id', orgId)
        .in('status', ['received', 'matched', 'approved']),
      // Money that actually arrived this month
      supabase.from('payments')
        .select('amount, currency, itinerary_id')
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

    const receivableTotals: CurrencyTotals = {}
    const receivableOverdue: CurrencyTotals = {}
    for (const inv of invoicesReal.real) {
      add(receivableTotals, inv.currency, inv.balance_due)
      if (inv.due_date && inv.due_date <= today) add(receivableOverdue, inv.currency, inv.balance_due)
    }

    const expenseTotals: CurrencyTotals = {}
    for (const e of unpaidExpensesReal.real) add(expenseTotals, e.currency, e.amount)

    const billTotals: CurrencyTotals = {}
    for (const b of unpaidBills.data || []) add(billTotals, b.currency, b.amount)

    const receivedThisMonth: CurrencyTotals = {}
    for (const p of monthPaymentsReal.real) add(receivedThisMonth, p.currency, p.amount)

    const spentThisMonth: CurrencyTotals = {}
    for (const e of monthPaidExpensesReal.real) add(spentThisMonth, e.currency, e.amount)

    return NextResponse.json({
      success: true,
      data: {
        receivables: {
          totals: receivableTotals,
          overdue: receivableOverdue,
          count: invoicesReal.real.length,
        },
        payables: {
          expenseTotals,
          expenseCount: unpaidExpensesReal.real.length,
          billTotals,
          billCount: unpaidBills.data?.length || 0,
        },
        month: {
          received: receivedThisMonth,
          receivedCount: monthPaymentsReal.real.length,
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
