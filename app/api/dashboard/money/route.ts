import { NextResponse } from 'next/server'
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

    const [receivableInvoices, unpaidExpenses, unpaidBills, monthPayments, monthPaidExpenses] = await Promise.all([
      // Outstanding receivables — same filter as /api/accounts-receivable
      supabase.from('invoices')
        .select('balance_due, currency, due_date')
        .eq('org_id', orgId)
        .gt('balance_due', 0)
        .not('status', 'eq', 'cancelled')
        .limit(1000),
      // Unpaid expenses — same filter as /api/accounts-payable
      supabase.from('expenses')
        .select('amount, currency')
        .eq('org_id', orgId)
        .in('status', ['pending', 'approved']),
      // Supplier bills not yet settled
      supabase.from('supplier_invoices')
        .select('amount, currency')
        .eq('org_id', orgId)
        .in('status', ['received', 'matched', 'approved']),
      // Money that actually arrived this month
      supabase.from('payments')
        .select('amount, currency')
        .eq('org_id', orgId)
        .gte('payment_date', monthStart.slice(0, 10)),
      // Money that actually left this month (expenses marked paid this month)
      supabase.from('expenses')
        .select('amount, currency')
        .eq('org_id', orgId)
        .eq('status', 'paid')
        .gte('payment_date', monthStart.slice(0, 10)),
    ])
    for (const r of [receivableInvoices, unpaidExpenses, unpaidBills, monthPayments, monthPaidExpenses]) {
      if (r.error) throw r.error
    }

    const receivableTotals: CurrencyTotals = {}
    const receivableOverdue: CurrencyTotals = {}
    for (const inv of receivableInvoices.data || []) {
      add(receivableTotals, inv.currency, inv.balance_due)
      if (inv.due_date && inv.due_date <= today) add(receivableOverdue, inv.currency, inv.balance_due)
    }

    const expenseTotals: CurrencyTotals = {}
    for (const e of unpaidExpenses.data || []) add(expenseTotals, e.currency, e.amount)

    const billTotals: CurrencyTotals = {}
    for (const b of unpaidBills.data || []) add(billTotals, b.currency, b.amount)

    const receivedThisMonth: CurrencyTotals = {}
    for (const p of monthPayments.data || []) add(receivedThisMonth, p.currency, p.amount)

    const spentThisMonth: CurrencyTotals = {}
    for (const e of monthPaidExpenses.data || []) add(spentThisMonth, e.currency, e.amount)

    return NextResponse.json({
      success: true,
      data: {
        receivables: {
          totals: receivableTotals,
          overdue: receivableOverdue,
          count: receivableInvoices.data?.length || 0,
        },
        payables: {
          expenseTotals,
          expenseCount: unpaidExpenses.data?.length || 0,
          billTotals,
          billCount: unpaidBills.data?.length || 0,
        },
        month: {
          received: receivedThisMonth,
          receivedCount: monthPayments.data?.length || 0,
          spent: spentThisMonth,
          spentCount: monthPaidExpenses.data?.length || 0,
        },
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
