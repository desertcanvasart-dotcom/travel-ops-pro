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

// Per currency: an operator that owes suppliers in dollars and egyptian pounds
// owes two amounts, not one sum. Every money figure is a CurrencyTotals.
interface SupplierPayable {
  supplier_name: string
  supplier_type: string
  total_expenses: CurrencyTotals
  total_paid: CurrencyTotals
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
    const status = searchParams.get('status') // pending, approved, paid

    // Fetch all unpaid expenses (pending or approved but not paid)
    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .in('status', ['pending', 'approved'])
      .order('expense_date', { ascending: true })

    if (supplierName) {
      query = query.ilike('supplier_name', `%${supplierName}%`)
    }

    if (supplierType) {
      query = query.eq('supplier_type', supplierType)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: expenses, error } = await query

    if (error) {
      console.error('Error fetching expenses:', error)
      return NextResponse.json({ error: 'Failed to fetch payables' }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Calculate aging for each expense (based on expense_date, not due_date since expenses don't have due dates)
    const expensesWithAging = (expenses || []).map(exp => {
      const expenseDate = new Date(exp.expense_date)
      expenseDate.setHours(0, 0, 0, 0)
      const daysOutstanding = Math.floor((today.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24))
      
      let agingBucket = 'current'
      if (daysOutstanding > 90) agingBucket = '90plus'
      else if (daysOutstanding > 60) agingBucket = '60'
      else if (daysOutstanding > 30) agingBucket = '30'
      else if (daysOutstanding > 14) agingBucket = 'overdue'

      return {
        ...exp,
        days_outstanding: Math.max(0, daysOutstanding),
        aging_bucket: agingBucket,
        is_overdue: daysOutstanding > 14 // Consider overdue after 2 weeks
      }
    })

    // Filter by aging if specified
    let filteredExpenses = expensesWithAging
    if (agingFilter) {
      switch (agingFilter) {
        case 'current':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding <= 14)
          break
        case '30':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding > 14 && exp.days_outstanding <= 30)
          break
        case '60':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding > 30 && exp.days_outstanding <= 60)
          break
        case '90':
          filteredExpenses = expensesWithAging.filter(exp => exp.days_outstanding > 60)
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
          total_paid: emptyTotals(),
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
      supplier.expense_count += 1
      supplier.expenses.push(exp)

      // Update aging buckets
      const bucket = exp.days_outstanding <= 14 ? 'current' : exp.days_outstanding <= 30 ? 'days30' : exp.days_outstanding <= 60 ? 'days60' : 'days90Plus'
      addToTotals(supplier.aging[bucket], amount, cur)

      // Track oldest expense
      if (new Date(exp.expense_date) < new Date(supplier.oldest_expense_date)) {
        supplier.oldest_expense_date = exp.expense_date
      }
    })

    const supplierPayables = Array.from(supplierMap.values())
      // Ordering only — magnitudes across currencies, never shown as a sum.
      .sort((a, b) => sumAll(b.total_outstanding) - sumAll(a.total_outstanding))

    // Fetch paid expenses for payment history
    const { data: paidExpenses } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('status', 'paid')
      .order('payment_date', { ascending: false })
      .limit(50)

    // Calculate summary
    const totalsOf = (rows: any[]) => { const t = emptyTotals(); for (const e of rows) addToTotals(t, Number(e.amount || 0), e.currency || 'EUR'); return t }
    const mergeAll = (pick: (s: SupplierPayable) => CurrencyTotals) => { const t = emptyTotals(); for (const s of supplierPayables) for (const [c, v] of Object.entries(pick(s))) addToTotals(t, v, c); return t }
    const summary = {
      total_outstanding: mergeAll(s => s.total_outstanding),
      supplier_count: supplierPayables.length,
      expense_count: filteredExpenses.length,
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

    // Group expenses by category for breakdown
    const categoryBreakdown: Record<string, number> = {}
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'other'
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Number(exp.amount || 0)
    })

    // Group by supplier type
    const supplierTypeBreakdown: Record<string, number> = {}
    filteredExpenses.forEach(exp => {
      const type = exp.supplier_type || 'other'
      supplierTypeBreakdown[type] = (supplierTypeBreakdown[type] || 0) + Number(exp.amount || 0)
    })

    return NextResponse.json({
      success: true,
      data: supplierPayables,
      expenses: filteredExpenses,
      recentPayments: paidExpenses || [],
      summary,
      categoryBreakdown,
      supplierTypeBreakdown
    })
  } catch (error) {
    console.error('Error in AP GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}