// ============================================
// API: /api/financial-reports — monthly/quarterly P&L, cashflow, tax, commission
// ============================================
// FX POLICY (added 2026-08-11): this report is org-wide, so it has no single
// natural currency — it converts every invoice, payment and expense into ONE
// reporting currency (EUR by default, ?currency= to override) at the rate on
// each line's own date. A line with no usable rate is EXCLUDED from every total
// and listed in `fx_holes`, with `complete:false` on the response, rather than
// being summed at face value (adding 1,000 EGP to a EUR total as "1,000" is a
// ~56x overstatement).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { partitionDemoRows, loadDemoItineraryIds, excludeDemoLinked, type DemoLookupClient } from '@/lib/demo-data'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { loadFxIndex, convertLine, buildFxMeta, emptyFxSummary, type FxHole } from '@/lib/fx-report'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate-api'
import {
  invoiceCountsAsRevenue,
  tripCounts,
  yearOf,
  monthOf,
  availableYearRange,
  sumByMonth,
  distinctTripCount,
} from '@/lib/financial-report'

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
    // TENANT BOUNDARY. supabaseAdmin is the service-role client and bypasses
    // RLS, so without this filter the P&L, cashflow, tax and commission reports
    // summed every organisation on the deployment into one set of totals and
    // handed them to whichever manager asked. invoices, expenses and itineraries
    // all carry org_id and are scoped everywhere else in the app; this route
    // simply never applied it.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const searchParams = request.nextUrl.searchParams
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

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
      .select('invoice_number, issue_date, total_amount, amount_paid, balance_due, currency, status, itinerary_id')
      .eq('org_id', orgId)
      .gte('issue_date', rangeStart)
      .lte('issue_date', rangeEnd)
      .order('issue_date', { ascending: true })

    const { data: expenses, error: expError } = await supabaseAdmin
      .from('expenses')
      .select('expense_number, expense_date, amount, status, category, supplier_name, currency, itinerary_id')
      .eq('org_id', orgId)
      .gte('expense_date', rangeStart)
      .lte('expense_date', rangeEnd)
      .order('expense_date', { ascending: true })

    // Trips are only COUNTED here (trip_count, average_trip_value), never
    // summed, so no money columns and no FX conversion: a trip with no rate on
    // file used to become an fx_hole, mark the report incomplete and drop out
    // of the count — for a figure that has no currency at all.
    const { data: itineraryRows, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('id, itinerary_code, start_date, status')
      .eq('org_id', orgId)
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', rangeEnd)

    // Cash in is what was actually RECEIVED in the year, dated by the payment
    // — not invoices.amount_paid filed under the invoice's issue date, which
    // put a December deposit for a January invoice in the wrong year.
    // invoice_payments has no org_id: its tenancy boundary is the invoice.
    const { data: paymentRows, error: payError } = await supabaseAdmin
      .from('invoice_payments')
      .select('amount, currency, payment_date, invoices!inner(org_id, invoice_number, currency, itinerary_id)')
      .eq('invoices.org_id', orgId)
      .gte('payment_date', `${year}-01-01`)
      .lte('payment_date', rangeEnd)

    // These three used to be logged and then stepped over, and the report was
    // built from `invoices || []`. A failed expenses query therefore did not
    // produce an error — it produced a P&L with no costs in it and a net profit
    // equal to revenue, presented with the same authority as a correct one.
    // This route already refuses to publish a number it cannot state honestly
    // when an FX rate is missing (see fx_holes / complete:false below); a
    // missing QUERY is strictly worse than a missing rate.
    const loadError = invError || expError || itinError || payError
    if (loadError) {
      console.error('Financial report source query failed:', { invError, expError, itinError, payError })
      return NextResponse.json(
        { error: 'Could not load financial data', detail: loadError.message },
        { status: 500 }
      )
    }

    // Seeded demo fixtures carry real money and were being reported as revenue
    // (see lib/demo-data.ts). Held back here, and reported below rather than
    // silently dropped.
    // Invoices, expenses and payments carry no code, only an itinerary_id, so
    // they are matched against the org's fixture ids; trips by their own code.
    const { real: itineraries, exclusion: demoTrips } = partitionDemoRows(
      itineraryRows,
      row => row.itinerary_code,
    )
    const demoItineraryIds = await loadDemoItineraryIds(
      supabaseAdmin as unknown as DemoLookupClient,
      orgId,
    )

    // A draft invoice has not been sent and a cancelled one is not owed — neither
    // is revenue, a receivable, VAT or a YoY figure. A rejected or cancelled
    // expense is not a cost. Dropped BEFORE demo filtering (so demo_excluded
    // counts only rows that would otherwise have counted) and before
    // conversion (so a document that no longer counts can't raise an fx_hole
    // and mark the whole report incomplete either).
    const demoInvoices = excludeDemoLinked(
      (invoices || []).filter(inv => invoiceCountsAsRevenue(inv.status)),
      demoItineraryIds,
    )
    const demoExpenses = excludeDemoLinked(
      (expenses || []).filter(exp => exp.status !== 'rejected' && exp.status !== 'cancelled'),
      demoItineraryIds,
    )
    // Flatten the joined invoice so the payment carries its own itinerary_id.
    const demoPayments = excludeDemoLinked(
      (paymentRows || []).map(p => {
        const inv = (Array.isArray(p.invoices) ? p.invoices[0] : p.invoices) as
          { invoice_number?: string | null; currency?: string | null; itinerary_id?: string | null } | null
        return {
          amount: p.amount,
          // A payment is in its INVOICE's currency: the payments route
          // enforces it (lib/payment-currency) and the balance trigger sums
          // amounts on that basis. The column itself defaults to 'EUR', so an
          // older row on a yen invoice may say EUR — trust the invoice.
          currency: inv?.currency || p.currency || null,
          payment_date: p.payment_date,
          invoice_number: inv?.invoice_number ?? null,
          itinerary_id: inv?.itinerary_id ?? null,
        }
      }),
      demoItineraryIds,
    )
    const demoExcluded = {
      excluded:
        demoTrips.excluded +
        demoInvoices.exclusion.excluded +
        demoExpenses.exclusion.excluded +
        demoPayments.exclusion.excluded,
      codes: demoTrips.codes,
      trips: demoTrips.excluded,
      invoices: demoInvoices.exclusion.excluded,
      expenses: demoExpenses.exclusion.excluded,
      payments: demoPayments.exclusion.excluded,
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

    const allInvoices = demoInvoices.real
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
        // balance_due is left in the invoice's own currency — never sum it;
        // pendingReceivables derives the balance from the converted pair.
        return {
          ...inv,
          total_amount: total.amount ?? 0,
          amount_paid: paid.amount ?? 0,
        }
      })
      .filter((inv): inv is NonNullable<typeof inv> => inv !== null)

    const allExpenses = demoExpenses.real
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

    // Each payment converts at the rate on the day it was RECEIVED.
    const yearPayments = demoPayments.real
      .map(pay => {
        const converted = convertLine(fxIndex, fx, {
          amount: pay.amount,
          fromCurrency: pay.currency,
          toCurrency: reportingCurrency,
          date: pay.payment_date,
          kind: 'invoice',
          reference: `${pay.invoice_number || 'invoice'} payment ${String(pay.payment_date || '').slice(0, 10)}`,
        })
        if (converted.hole) {
          fxHoles.push(converted.hole)
          return null
        }
        return { ...pay, amount: converted.amount ?? 0 }
      })
      .filter((pay): pay is NonNullable<typeof pay> => pay !== null)
      .filter(pay => yearOf(pay.payment_date) === year)

    // A trip counts once it is sold: confirmed or completed. Drafts, sent
    // quotes and cancelled trips are not trips the business ran.
    const yearTrips = (itineraries || [])
      .filter(itin => tripCounts(itin.status) && yearOf(itin.start_date) === year)

    // Cheap min/max probe — replaces the full-table scan that produced
    // availableYears in the old code. Two tiny queries per table.
    const [invMinRes, invMaxRes, expMinRes, expMaxRes] = await Promise.all([
      supabaseAdmin.from('invoices').select('issue_date').eq('org_id', orgId).order('issue_date', { ascending: true }).limit(1).maybeSingle(),
      supabaseAdmin.from('invoices').select('issue_date').eq('org_id', orgId).order('issue_date', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('expenses').select('expense_date').eq('org_id', orgId).order('expense_date', { ascending: true }).limit(1).maybeSingle(),
      supabaseAdmin.from('expenses').select('expense_date').eq('org_id', orgId).order('expense_date', { ascending: false }).limit(1).maybeSingle(),
    ])
    const dateCandidates: (string | undefined | null)[] = [
      invMinRes.data?.issue_date,
      invMaxRes.data?.issue_date,
      expMinRes.data?.expense_date,
      expMaxRes.data?.expense_date,
    ]
    const availableYears = availableYearRange(dateCandidates, year)

    // Filter by year. Dates are bucketed by the string, not new Date(): see
    // yearOf in lib/financial-report.ts.
    const yearInvoices = allInvoices.filter(inv => yearOf(inv.issue_date) === year)
    const yearExpenses = allExpenses.filter(exp => yearOf(exp.expense_date) === year)

    const monthlyCollected = sumByMonth(yearPayments, year, p => p.payment_date, p => p.amount)

    // Generate monthly data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthlyData: MonthlyData[] = monthNames.map((monthName, index) => {
      const monthNum = index + 1
      
      const monthInvoices = yearInvoices.filter(inv => monthOf(inv.issue_date) === monthNum)
      const monthExpenses = yearExpenses.filter(exp => monthOf(exp.expense_date) === monthNum)
      const monthTrips = yearTrips.filter(itin => monthOf(itin.start_date) === monthNum)

      const invoiced = monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
      // Money received in this month, by payment date — not paid amounts filed
      // under the month their invoice was issued.
      const collected = monthlyCollected[index]
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

    // Cash flow data. Inflows are invoice payments received in the year (any
    // invoice the payment belongs to — cash received is cash received).
    // Outflows are expenses with status 'paid', dated by expense_date: an
    // expense carries no separate settlement date this report can rely on.
    const cashInflows = yearPayments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0)

    const cashOutflows = yearExpenses
      .filter(exp => exp.status === 'paid')
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)

    // From the CONVERTED total and paid figures: balance_due is still in the
    // invoice's own currency, so summing it added yen to euros as if equal.
    const pendingReceivables = yearInvoices
      .reduce((sum, inv) => sum + Math.max(0, Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)), 0)

    // Rejected and cancelled expenses were already dropped above.
    const pendingPayables = yearExpenses
      .filter(exp => exp.status !== 'paid')
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
      data.expenses.push(exp)
    })

    // "Trips" is distinct itineraries the recipient was paid on, not the
    // number of expense lines (a guide on a 5-day trip may have five).
    const commissionData = Array.from(commissionMap.values())
      .map(rec => ({ ...rec, trip_count: distinctTripCount(rec.expenses) }))
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
    const prevYearInvoices = allInvoices.filter(inv => yearOf(inv.issue_date) === prevYear)
    const prevYearExpenses = allExpenses.filter(exp => yearOf(exp.expense_date) === prevYear)

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
      // Same principle as fx_holes above: say what was left out — trips by
      // code, and the invoices, expenses and payments linked to them.
      demo_excluded: demoExcluded,
    })
  } catch (error) {
    console.error('Error in Financial Reports GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}