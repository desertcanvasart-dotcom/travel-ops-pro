import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { todayFromRequest } from '@/lib/today'
import { addToTotals, emptyTotals, type CurrencyTotals } from '@/lib/currency-totals'
import { OWED_BILL_STATUSES, PAYABLE_BUCKET_OF_KEY, payableAgingKey, payableDueDate, unmatchedBillRows } from '@/lib/finance/payables'

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

// Per currency: an operator that owes suppliers in dollars and egyptian pounds
// owes two amounts, not one sum. Every money figure is a CurrencyTotals.
interface SupplierPayable {
  supplier_name: string
  supplier_type: string
  total_expenses: CurrencyTotals
  total_outstanding: CurrencyTotals
  expense_count: number
  oldest_expense_date: string
  aging: { current: CurrencyTotals; days30: CurrencyTotals; days60: CurrencyTotals; days90Plus: CurrencyTotals }
  expenses: any[]
}
const sumAll = (t: CurrencyTotals) => Object.values(t).reduce((a, b) => a + Math.abs(b), 0)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierName = searchParams.get('supplierName')
    const supplierType = searchParams.get('supplierType')
    const agingFilter = searchParams.get('aging')
    const status = searchParams.get('status') // pending, approved, or bill (unmatched supplier bills only)

    // TENANT BOUNDARY — expenses are org-scoped; the service-role client
    // bypasses RLS, so without this every organisation's payables were pooled.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Fetch all unpaid expenses (pending or approved but not paid)
    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('org_id', orgId)
      .in('status', status === 'approved' ? ['approved'] : ['pending', 'approved'])
      .order('expense_date', { ascending: true })

    if (supplierName) {
      query = query.ilike('supplier_name', `%${supplierName}%`)
    }

    if (supplierType) {
      query = query.eq('supplier_type', supplierType)
    }

    if (status === 'pending') {
      query = query.eq('status', 'pending')
    }

    // 'bill' asks for the unmatched supplier bills alone.
    const { data: expenseRows, error } = status === 'bill' ? { data: [] as any[], error: null } : await query

    if (error) {
      console.error('Error fetching expenses:', error)
      return NextResponse.json({ error: 'Failed to fetch payables' }, { status: 500 })
    }

    // Supplier bills with no expense behind them are owed too, and Payables read
    // expenses only, so they were missing from "Total Payable" while the
    // dashboard (which adds them) showed them. A bill matched to an expense is
    // already counted through that expense, so only unmatched ones come in.
    // They have no supplier type: they sit under 'other'.
    let billRows: ReturnType<typeof unmatchedBillRows> = []
    const wantBills = (!status || status === 'bill') && (!supplierType || supplierType === 'other')
    if (wantBills) {
      const { data: bills, error: billErr } = await supabaseAdmin
        .from('supplier_invoices')
        .select('id, internal_reference, supplier_invoice_number, supplier_name, invoice_date, due_date, amount, currency, status, description')
        .eq('org_id', orgId)
        .in('status', [...OWED_BILL_STATUSES])
      if (billErr) console.error('[accounts-payable] unmatched bills:', billErr.message)
      const billIds = (bills || []).map(b => b.id as string)
      const { data: billLinks } = billIds.length
        ? await supabaseAdmin.from('supplier_invoice_expenses').select('supplier_invoice_id').in('supplier_invoice_id', billIds)
        : { data: [] as { supplier_invoice_id: string }[] }
      billRows = unmatchedBillRows((bills || []) as any, billLinks || [])
      if (supplierName) {
        const needle = supplierName.toLowerCase()
        billRows = billRows.filter(b => b.supplier_name.toLowerCase().includes(needle))
      }
    }
    const expenses = [...(expenseRows || []), ...billRows] as any[]

    // Calendar dates as UTC midnights, so the day maths is the same on a
    // server in Tokyo as on one in UTC (local midnights shifted every date a
    // day early east of UTC). "Today" is the office's, not the server's.
    const DAY = 1000 * 60 * 60 * 24
    const dateOnly = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`)
    const today = dateOnly(todayFromRequest(request.url))

    // When a supplier's bill is matched to an expense, the bill's due date is
    // when the money is owed. Without one, an expense is due 14 days after it
    // was incurred (the long-standing default). Aging counts days PAST DUE,
    // so Payables and Supplier Invoices agree on what is overdue.
    // (Ported from autoura-saas.)
    const dueByExpense = new Map<string, { due_date: string; supplier_invoice_number: string | null }>()
    const expenseIds = (expenseRows || []).map(e => e.id as string)
    if (expenseIds.length) {
      const { data: links, error: linkErr } = await supabaseAdmin
        .from('supplier_invoice_expenses')
        .select('expense_id, supplier_invoices(due_date, status, supplier_invoice_number, org_id)')
        .in('expense_id', expenseIds)
      if (linkErr) console.error('[accounts-payable] supplier invoice due dates:', linkErr.message)
      for (const link of (links || []) as any[]) {
        const inv = Array.isArray(link.supplier_invoices) ? link.supplier_invoices[0] : link.supplier_invoices
        if (!inv?.due_date || inv.status === 'cancelled' || inv.org_id !== orgId) continue
        // An expense split across bills is due on the earliest of them.
        const prev = dueByExpense.get(link.expense_id)
        if (!prev || inv.due_date < prev.due_date) {
          dueByExpense.set(link.expense_id, { due_date: inv.due_date, supplier_invoice_number: inv.supplier_invoice_number ?? null })
        }
      }
    }

    const expensesWithAging = (expenses || []).map(exp => {
      const expenseDate = dateOnly(exp.expense_date)
      const daysOutstanding = Math.floor((today.getTime() - expenseDate.getTime()) / DAY)
      // A bill row is its own bill: its due date, else 14 days after its date.
      const fromInvoice = exp.kind === 'bill'
        ? { due_date: exp.bill_due_date || payableDueDate(exp.expense_date), supplier_invoice_number: exp.supplier_invoice_number as string | null }
        : dueByExpense.get(exp.id)
      const dueDate = fromInvoice ? dateOnly(fromInvoice.due_date) : new Date(expenseDate.getTime() + 14 * DAY)
      const daysPastDue = Math.round((today.getTime() - dueDate.getTime()) / DAY)

      const agingBucket = PAYABLE_BUCKET_OF_KEY[payableAgingKey(daysPastDue)]

      return {
        ...exp,
        days_outstanding: Math.max(0, daysOutstanding),
        due_date: fromInvoice ? fromInvoice.due_date : dueDate.toISOString().slice(0, 10),
        // The bill the due date came from (its number), or null for the 14-day default.
        due_from_invoice: fromInvoice && exp.kind !== 'bill' ? (fromInvoice.supplier_invoice_number || 'supplier invoice') : null,
        days_past_due: daysPastDue,
        aging_bucket: agingBucket,
        is_overdue: daysPastDue > 0,
      }
    })

    // Filter by aging if specified (days past due)
    let filteredExpenses = expensesWithAging
    if (agingFilter) {
      switch (agingFilter) {
        case 'current':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_past_due <= 0)
          break
        case '30':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_past_due > 0 && exp.days_past_due <= 30)
          break
        case '60':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_past_due > 30 && exp.days_past_due <= 60)
          break
        case '90':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_past_due > 60)
          break
      }
    }

    // Group by supplier
    const supplierMap = new Map<string, SupplierPayable>()

    filteredExpenses.forEach(exp => {
      const supplierKey = exp.supplier_name || 'Unknown Supplier'
      
      if (!supplierMap.has(supplierKey)) {
        supplierMap.set(supplierKey, {
          supplier_name: exp.supplier_name || 'Unknown Supplier',
          supplier_type: exp.supplier_type || 'other',
          total_expenses: emptyTotals(),
          total_outstanding: emptyTotals(),
          expense_count: 0,
          oldest_expense_date: exp.expense_date,
          aging: { current: emptyTotals(), days30: emptyTotals(), days60: emptyTotals(), days90Plus: emptyTotals() },
          expenses: []
        })
      }

      const supplier = supplierMap.get(supplierKey)!
      const amount = Number(exp.amount || 0)
      const cur = exp.currency || 'EUR'
      addToTotals(supplier.total_expenses, amount, cur)
      addToTotals(supplier.total_outstanding, amount, cur)
      supplier.expense_count += 1 // expenses and unmatched bills alike
      supplier.expenses.push(exp)

      // Update aging buckets
      const bucket = payableAgingKey(exp.days_past_due)
      addToTotals(supplier.aging[bucket], amount, cur)

      // Track oldest expense
      if (new Date(exp.expense_date) < new Date(supplier.oldest_expense_date)) {
        supplier.oldest_expense_date = exp.expense_date
      }
    })

    const supplierPayables = Array.from(supplierMap.values())
      // Ordering only — magnitudes across currencies, never shown as a sum.
      .sort((a, b) => sumAll(b.total_outstanding) - sumAll(a.total_outstanding))

    // Payment history: the 50 most recent payments (the page says so), within
    // the supplier-type filter. Aging and status do not apply to a paid expense.
    let paidQuery = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'paid')
      .order('payment_date', { ascending: false })
      .limit(50)
    if (supplierType) paidQuery = paidQuery.eq('supplier_type', supplierType)
    const { data: paidExpenses } = await paidQuery

    // Calculate summary
    const totalsOf = (rows: any[]) => { const t = emptyTotals(); for (const e of rows) addToTotals(t, Number(e.amount || 0), e.currency || 'EUR'); return t }
    const mergeAll = (pick: (s: SupplierPayable) => CurrencyTotals) => { const t = emptyTotals(); for (const s of supplierPayables) for (const [c, v] of Object.entries(pick(s))) addToTotals(t, v, c); return t }
    const summary = {
      total_outstanding: mergeAll(s => s.total_outstanding),
      supplier_count: supplierPayables.length,
      expense_count: filteredExpenses.filter(e => e.kind !== 'bill').length,
      bill_count: filteredExpenses.filter(e => e.kind === 'bill').length,
      bill_amount: totalsOf(filteredExpenses.filter(e => e.kind === 'bill')),
      aging: {
        current: mergeAll(s => s.aging.current),
        days30: mergeAll(s => s.aging.days30),
        days60: mergeAll(s => s.aging.days60),
        days90Plus: mergeAll(s => s.aging.days90Plus),
      },
      pending_count: filteredExpenses.filter(e => e.status === 'pending').length,
      pending_amount: totalsOf(filteredExpenses.filter(e => e.status === 'pending')),
      approved_count: filteredExpenses.filter(e => e.status === 'approved').length,
      approved_amount: totalsOf(filteredExpenses.filter(e => e.status === 'approved')),
      overdue_count: filteredExpenses.filter(e => e.is_overdue).length,
      overdue_amount: totalsOf(filteredExpenses.filter(e => e.is_overdue)),
    }

    return NextResponse.json({
      success: true,
      data: supplierPayables,
      expenses: filteredExpenses,
      recentPayments: paidExpenses || [],
      summary
    })
  } catch (error) {
    console.error('Error in AP GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}