// ============================================
// API: /api/financial-reports — monthly/quarterly P&L, cashflow, tax, commission
// ============================================
// FX POLICY (added 2026-08-11): this report is org-wide, so it has no single
// natural currency — it converts every invoice, expense and trip into ONE
// reporting currency (EUR by default, ?currency= to override) at the rate on
// each line's own date. A line with no usable rate is EXCLUDED from every total
// and listed in `fx_holes`, with `complete:false` on the response, rather than
// being summed at face value (adding 1,000 EGP to a EUR total as "1,000" is a
// ~56x overstatement).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadFxIndex, convertLine, buildFxMeta, emptyFxSummary, type FxHole } from '@/lib/fx-report'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate-api'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface MonthlyData {
  month: string
  year: number
  month_num: number
  revenue: number
  invoiced: number
  collected: number
  expenses: number
  expenses_paid: number
  net_profit: number
  trip_count: number
  invoice_count: number
  expense_count: number
}

interface QuarterlyData {
  quarter: string
  year: number
  revenue: number
  expenses: number
  net_profit: number
  margin: number
}

interface CategoryExpense {
  category: string
  amount: number
  percentage: number
}

interface CommissionData {
  name: string
  type: string
  total_earned: number
  total_paid: number
  total_pending: number
  trip_count: number
  expenses: any[]
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const reportType = searchParams.get('type') || 'overview' // overview, revenue, cashflow, tax, commission
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const quarter = searchParams.get('quarter') // Q1, Q2, Q3, Q4
    const month = searchParams.get('month') // 1-12

    // Every figure in this response is stated in ONE currency. EUR is the
    // default because rates are stored EUR-based, so most lines need no
    // conversion at all.
    const requestedCurrency = (searchParams.get('currency') || 'EUR').toUpperCase()
    const reportingCurrency = (SUPPORTED_CURRENCIES as readonly string[]).includes(requestedCurrency)
      ? requestedCurrency
      : 'EUR'

    // M2: push the year range down to the queries instead of pulling every
    // row of these tables on every report request. The route needs THIS year
    // and the prior year (for YoY), so the bounded window is
    //   [prevYear-01-01, year-12-31].
    // `availableYears` used to come from a full-table scan; it's now derived
    // from a min/max probe per table (4 single-row queries) and the year
    // range is generated from those bounds — bounded irrespective of how
    // long the business has been operating.
    const prevYear = year - 1
    const rangeStart = `${prevYear}-01-01`
    const rangeEnd = `${year}-12-31`

    const { data: invoices, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('invoice_number, issue_date, total_amount, amount_paid, balance_due, currency')
      .gte('issue_date', rangeStart)
      .lte('issue_date', rangeEnd)
      .order('issue_date', { ascending: true })

    if (invError) {
      console.error('Error fetching invoices:', invError)
    }

    const { data: expenses, error: expError } = await supabaseAdmin
      .from('expenses')
      .select('expense_number, expense_date, amount, status, category, supplier_name, currency')
      .gte('expense_date', rangeStart)
      .lte('expense_date', rangeEnd)
      .order('expense_date', { ascending: true })

    if (expError) {
      console.error('Error fetching expenses:', expError)
    }

    const { data: itineraries, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('id, start_date, status, total_cost, currency')
      .gte('start_date', rangeStart)
      .lte('start_date', rangeEnd)

    if (itinError) {
      console.error('Error fetching itineraries:', itinError)
    }

    // ---------- FX normalisation ----------
    // This report is org-wide, so unlike the per-trip P&L it has no single
    // "natural" currency: it must pick one and convert everything into it, or
    // else it is adding EGP to EUR. Each line converts at the rate on its OWN
    // date; a line with no usable rate is dropped from every total below and
    // reported as a hole, so a shortfall is visible instead of silently
    // flattering the margin.
    const fxIndex = await loadFxIndex(supabaseAdmin)
    const fx = emptyFxSummary()
    const fxHoles: FxHole[] = []

    const allInvoices = (invoices || [])
      .map(inv => {
        const total = convertLine(fxIndex, fx, {
          amount: inv.total_amount,
          fromCurrency: inv.currency,
          toCurrency: reportingCurrency,
          date: inv.issue_date,
          kind: 'invoice',
          reference: inv.invoice_number || 'invoice',
        })
        if (total.hole) {
          fxHoles.push(total.hole)
          return null
        }
        // amount_paid shares the invoice's currency and issue date; a paid
        // figure converted at a different rate than its own invoice would make
        // collected > invoiced on the same document.
        const paid = convertLine(fxIndex, fx, {
          amount: inv.amount_paid,
          fromCurrency: inv.currency,
          toCurrency: reportingCurrency,
          date: inv.issue_date,
          kind: 'invoice',
          reference: inv.invoice_number || 'invoice',
        })
        return {
          ...inv,
          total_amount: total.amount ?? 0,
          amount_paid: paid.amount ?? 0,
        }
      })
      .filter((inv): inv is NonNullable<typeof inv> => inv !== null)

    const allExpenses = (expenses || [])
      .map(exp => {
        const converted = convertLine(fxIndex, fx, {
          amount: exp.amount,
          fromCurrency: exp.currency,
          toCurrency: reportingCurrency,
          date: exp.expense_date,
          kind: 'expense',
          reference: exp.expense_number || exp.category || 'expense',
        })
        if (converted.hole) {
          fxHoles.push(converted.hole)
          return null
        }
        return { ...exp, amount: converted.amount ?? 0 }
      })
      .filter((exp): exp is NonNullable<typeof exp> => exp !== null)

    const allItineraries = (itineraries || [])
      .map(itin => {
        const converted = convertLine(fxIndex, fx, {
          amount: itin.total_cost,
          fromCurrency: itin.currency,
          toCurrency: reportingCurrency,
          date: itin.start_date,
          kind: 'trip',
          reference: itin.id,
        })
        if (converted.hole) {
          fxHoles.push(converted.hole)
          return null
        }
        return { ...itin, total_cost: converted.amount ?? 0 }
      })
      .filter((itin): itin is NonNullable<typeof itin> => itin !== null)

    // Cheap min/max probe — replaces the full-table scan that produced
    // availableYears in the old code. Two tiny queries per table.
    const [invMinRes, invMaxRes, expMinRes, expMaxRes] = await Promise.all([
      supabaseAdmin.from('invoices').select('issue_date').order('issue_date', { ascending: true }).limit(1).maybeSingle(),
      supabaseAdmin.from('invoices').select('issue_date').order('issue_date', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('expenses').select('expense_date').order('expense_date', { ascending: true }).limit(1).maybeSingle(),
      supabaseAdmin.from('expenses').select('expense_date').order('expense_date', { ascending: false }).limit(1).maybeSingle(),
    ])
    const dateCandidates: (string | undefined | null)[] = [
      invMinRes.data?.issue_date,
      invMaxRes.data?.issue_date,
      expMinRes.data?.expense_date,
      expMaxRes.data?.expense_date,
    ]
    const minYear = Math.min(...dateCandidates.filter(Boolean).map(d => new Date(d as string).getFullYear()))
    const maxYear = Math.max(...dateCandidates.filter(Boolean).map(d => new Date(d as string).getFullYear()))
    const availableYears = Number.isFinite(minYear) && Number.isFinite(maxYear)
      ? Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i)
      : [year]

    // Filter by year
    const yearInvoices = allInvoices.filter(inv => {
      const invYear = new Date(inv.issue_date).getFullYear()
      return invYear === year
    })

    const yearExpenses = allExpenses.filter(exp => {
      const expYear = new Date(exp.expense_date).getFullYear()
      return expYear === year
    })

    const yearTrips = allItineraries.filter(itin => {
      const tripYear = new Date(itin.start_date).getFullYear()
      return tripYear === year
    })

    // Generate monthly data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthlyData: MonthlyData[] = monthNames.map((monthName, index) => {
      const monthNum = index + 1
      
      const monthInvoices = yearInvoices.filter(inv => {
        const invMonth = new Date(inv.issue_date).getMonth() + 1
        return invMonth === monthNum
      })

      const monthExpenses = yearExpenses.filter(exp => {
        const expMonth = new Date(exp.expense_date).getMonth() + 1
        return expMonth === monthNum
      })

      const monthTrips = yearTrips.filter(itin => {
        const tripMonth = new Date(itin.start_date).getMonth() + 1
        return tripMonth === monthNum
      })

      const invoiced = monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
      const collected = monthInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)
      const totalExpenses = monthExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)
      const expensesPaid = monthExpenses
        .filter(exp => exp.status === 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

      return {
        month: monthName,
        year,
        month_num: monthNum,
        revenue: invoiced,
        invoiced,
        collected,
        expenses: totalExpenses,
        expenses_paid: expensesPaid,
        net_profit: invoiced - totalExpenses,
        trip_count: monthTrips.length,
        invoice_count: monthInvoices.length,
        expense_count: monthExpenses.length
      }
    })

    // Generate quarterly data
    const quarterlyData: QuarterlyData[] = [
      { quarter: 'Q1', months: [1, 2, 3] },
      { quarter: 'Q2', months: [4, 5, 6] },
      { quarter: 'Q3', months: [7, 8, 9] },
      { quarter: 'Q4', months: [10, 11, 12] }
    ].map(q => {
      const qMonths = monthlyData.filter(m => q.months.includes(m.month_num))
      const revenue = qMonths.reduce((sum, m) => sum + m.revenue, 0)
      const expenses = qMonths.reduce((sum, m) => sum + m.expenses, 0)
      const netProfit = revenue - expenses
      return {
        quarter: q.quarter,
        year,
        revenue,
        expenses,
        net_profit: netProfit,
        margin: revenue > 0 ? (netProfit / revenue) * 100 : 0
      }
    })

    // Cash flow data
    const cashInflows = yearInvoices
      .filter(inv => inv.amount_paid > 0)
      .reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

    const cashOutflows = yearExpenses
      .filter(exp => exp.status === 'paid')
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const pendingReceivables = yearInvoices
      .reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0)

    const pendingPayables = yearExpenses
      .filter(exp => exp.status !== 'paid' && exp.status !== 'rejected')
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const cashFlow = {
      inflows: cashInflows,
      outflows: cashOutflows,
      net_cash_flow: cashInflows - cashOutflows,
      pending_receivables: pendingReceivables,
      pending_payables: pendingPayables,
      projected_cash: (cashInflows - cashOutflows) + pendingReceivables - pendingPayables,
      monthly_cash_flow: monthlyData.map(m => ({
        month: m.month,
        inflow: m.collected,
        outflow: m.expenses_paid,
        net: m.collected - m.expenses_paid
      }))
    }

    // Tax summary (expense categories that might be deductible)
    const taxCategories = ['office', 'software', 'marketing', 'fuel', 'permits', 'toll', 'parking']
    const deductibleExpenses = yearExpenses.filter(exp => taxCategories.includes(exp.category))
    const deductibleTotal = deductibleExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    // Group expenses by category for tax
    const expensesByCategory: Record<string, number> = {}
    yearExpenses.forEach(exp => {
      const cat = exp.category || 'other'
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(exp.amount || 0)
    })

    const categoryBreakdown: CategoryExpense[] = Object.entries(expensesByCategory)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: yearExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) > 0
          ? (amount / yearExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)) * 100
          : 0
      }))
      .sort((a, b) => b.amount - a.amount)

    const totalRevenue = yearInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    const totalExpensesAmount = yearExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const taxSummary = {
      gross_revenue: totalRevenue,
      total_expenses: totalExpensesAmount,
      deductible_expenses: deductibleTotal,
      taxable_income: totalRevenue - deductibleTotal,
      expense_breakdown: categoryBreakdown,
      // Estimated tax (simplified - would need actual tax rates)
      estimated_vat_collected: totalRevenue * 0.14, // 14% Egypt VAT example
      estimated_vat_paid: totalExpensesAmount * 0.14,
      net_vat: (totalRevenue - totalExpensesAmount) * 0.14
    }

    // Commission reports (for guides, drivers, etc.)
    const commissionCategories = ['guide', 'driver', 'airport_staff', 'hotel_staff', 'ground_handler']
    const commissionExpenses = yearExpenses.filter(exp => commissionCategories.includes(exp.category))

    // Group by supplier name
    const commissionMap = new Map<string, CommissionData>()
    commissionExpenses.forEach(exp => {
      const key = exp.supplier_name || `Unknown ${exp.category}`
      if (!commissionMap.has(key)) {
        commissionMap.set(key, {
          name: key,
          type: exp.category || 'other',
          total_earned: 0,
          total_paid: 0,
          total_pending: 0,
          trip_count: 0,
          expenses: []
        })
      }
      const data = commissionMap.get(key)!
      data.total_earned += Number(exp.amount || 0)
      if (exp.status === 'paid') {
        data.total_paid += Number(exp.amount || 0)
      } else {
        data.total_pending += Number(exp.amount || 0)
      }
      data.trip_count += 1
      data.expenses.push(exp)
    })

    const commissionData = Array.from(commissionMap.values())
      .sort((a, b) => b.total_earned - a.total_earned)

    const commissionSummary = {
      total_commissions: commissionExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
      total_paid: commissionExpenses
        .filter(exp => exp.status === 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
      total_pending: commissionExpenses
        .filter(exp => exp.status !== 'paid')
        .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
      by_type: commissionCategories.map(cat => ({
        type: cat,
        amount: commissionExpenses
          .filter(exp => exp.category === cat)
          .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
        count: commissionExpenses.filter(exp => exp.category === cat).length
      })),
      recipients: commissionData
    }

    // Year-over-year comparison (prevYear already declared above for the
    // M2 query range).
    const prevYearInvoices = allInvoices.filter(inv => {
      const invYear = new Date(inv.issue_date).getFullYear()
      return invYear === prevYear
    })
    const prevYearExpenses = allExpenses.filter(exp => {
      const expYear = new Date(exp.expense_date).getFullYear()
      return expYear === prevYear
    })

    const prevYearRevenue = prevYearInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    const prevYearExpenseTotal = prevYearExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    const yearOverYear = {
      current_year: year,
      previous_year: prevYear,
      revenue_change: totalRevenue - prevYearRevenue,
      revenue_change_percent: prevYearRevenue > 0 ? ((totalRevenue - prevYearRevenue) / prevYearRevenue) * 100 : 0,
      expense_change: totalExpensesAmount - prevYearExpenseTotal,
      expense_change_percent: prevYearExpenseTotal > 0 ? ((totalExpensesAmount - prevYearExpenseTotal) / prevYearExpenseTotal) * 100 : 0
    }

    // Overall summary
    const summary = {
      year,
      total_revenue: totalRevenue,
      total_collected: cashInflows,
      total_expenses: totalExpensesAmount,
      total_expenses_paid: cashOutflows,
      gross_profit: totalRevenue - totalExpensesAmount,
      profit_margin: totalRevenue > 0 ? ((totalRevenue - totalExpensesAmount) / totalRevenue) * 100 : 0,
      trip_count: yearTrips.length,
      invoice_count: yearInvoices.length,
      expense_count: yearExpenses.length,
      average_trip_value: yearTrips.length > 0 ? totalRevenue / yearTrips.length : 0,
      collection_rate: totalRevenue > 0 ? (cashInflows / totalRevenue) * 100 : 0
    }

    return NextResponse.json({
      success: true,
      summary,
      monthly: monthlyData,
      quarterly: quarterlyData,
      cashFlow,
      taxSummary,
      commissionSummary,
      yearOverYear,
      availableYears,
      // Which currency every figure above is stated in, and how much of it
      // rests on exact rates. complete:false means at least one line was
      // excluded or approximated — see fx_holes for exactly which.
      ...buildFxMeta(reportingCurrency, fx, fxHoles),
    })
  } catch (error) {
    console.error('Error in Financial Reports GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}