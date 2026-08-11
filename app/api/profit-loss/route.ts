// ============================================
// API: /api/profit-loss — per-trip and aggregate P&L
// ============================================
// FX POLICY (added 2026-08-11): an expense carries its OWN currency and its own
// expense_date, and a trip carries its own currency. Summing an EGP expense
// into a EUR trip as a raw number overstates cost ~56x; converting it at
// today's rate reports a margin the operator never earned. So each expense is
// converted at the rate on ITS date (lib/fx-report.ts), and an expense with no
// usable rate is EXCLUDED and reported as an FX hole with the trip marked
// incomplete — never summed at face value.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadFxIndex, convertLine, buildFxMeta, emptyFxSummary, type FxHole } from '@/lib/fx-report'
import { mergeFxSummary } from '@/lib/fx-conversion'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TripPnL {
  itinerary_id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  status: string
  currency: string
  quoted_amount: number
  total_revenue: number
  total_paid: number
  supplier_cost: number      // Cost from itinerary services (hotels, transport, guides, etc.)
  manual_expenses: number    // Additional manual expenses
  total_expenses: number     // supplier_cost + manual_expenses
  expenses_paid: number
  expenses_pending: number
  gross_profit: number
  profit_margin: number
  expense_breakdown: Record<string, number>
  invoice_count: number
  expense_count: number
  /** Expenses excluded from this trip's totals for want of a rate. */
  fx_holes: FxHole[]
  /** False when at least one cost is missing or approximated. */
  fx_complete: boolean
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')

    // Fetch itineraries - include supplier_cost which is calculated during pricing
    let itineraryQuery = supabaseAdmin
      .from('itineraries')
      .select('id, itinerary_code, trip_name, client_name, start_date, end_date, status, currency, total_cost, supplier_cost')
      .order('start_date', { ascending: false })

    if (itineraryId) {
      itineraryQuery = itineraryQuery.eq('id', itineraryId)
    }

    if (status) {
      itineraryQuery = itineraryQuery.eq('status', status)
    }

    if (startDate) {
      itineraryQuery = itineraryQuery.gte('start_date', startDate)
    }

    if (endDate) {
      itineraryQuery = itineraryQuery.lte('start_date', endDate)
    }

    const { data: itineraries, error: itinError } = await itineraryQuery

    if (itinError) {
      console.error('Error fetching itineraries:', itinError)
      return NextResponse.json({ error: 'Failed to fetch itineraries' }, { status: 500 })
    }

    if (!itineraries || itineraries.length === 0) {
      return NextResponse.json([])
    }

    // Fetch all invoices
    const { data: invoices, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('itinerary_id, total_amount, amount_paid, status')

    if (invError) {
      console.error('Error fetching invoices:', invError)
    }

    // Fetch all expenses. currency + expense_date are load-bearing: they decide
    // WHICH rate converts this line, so a missing date means no historical rate.
    const { data: expenses, error: expError } = await supabaseAdmin
      .from('expenses')
      .select('itinerary_id, amount, category, status, currency, expense_date, expense_number')

    if (expError) {
      console.error('Error fetching expenses:', expError)
    }

    // Rate history, loaded once for every trip in this response.
    const fxIndex = await loadFxIndex(supabaseAdmin)

    // Accuracy tally across every trip, folded into the response-level meta.
    const overallFx = emptyFxSummary()
    const allHoles: FxHole[] = []

    // Build P&L for each itinerary
    const pnlData: TripPnL[] = itineraries.map(itinerary => {
      // Get invoices for this itinerary
      const itinInvoices = (invoices || []).filter(inv => inv.itinerary_id === itinerary.id)
      const totalRevenue = itinInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
      const totalPaid = itinInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

      // Get manual expenses for this itinerary (additional costs beyond services)
      const itinExpenses = (expenses || []).filter(exp => exp.itinerary_id === itinerary.id)

      // Convert every expense into the TRIP's currency at the rate on its own
      // expense_date. An expense we cannot convert is excluded from all four
      // sums below and recorded as a hole — never added at face value.
      const tripCurrency = (itinerary.currency || 'EUR').toUpperCase()
      const tripFx = emptyFxSummary()
      const tripHoles: FxHole[] = []

      let manualExpenses = 0
      let expensesPaid = 0
      let expensesPending = 0
      const expenseBreakdown: Record<string, number> = {}

      for (const exp of itinExpenses) {
        const { amount, hole } = convertLine(fxIndex, tripFx, {
          amount: exp.amount,
          fromCurrency: exp.currency,
          toCurrency: tripCurrency,
          date: exp.expense_date,
          kind: 'expense',
          reference: exp.expense_number || exp.category || 'expense',
        })

        if (hole) {
          tripHoles.push(hole)
          continue
        }

        const value = amount ?? 0
        manualExpenses += value
        if (exp.status === 'paid') expensesPaid += value
        if (exp.status !== 'paid' && exp.status !== 'rejected') expensesPending += value

        const cat = exp.category || 'other'
        expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + value
      }

      // supplier_cost is stored in the itinerary's own currency, so it needs no
      // conversion — it is already the trip currency by construction.
      const supplierCost = Number(itinerary.supplier_cost || 0)
      const totalExpenses = supplierCost + manualExpenses

      if (supplierCost > 0) {
        expenseBreakdown['supplier_services'] = supplierCost
      }

      // Fold this trip's accuracy into the response-level tally.
      mergeFxSummary(overallFx, tripFx)
      allHoles.push(...tripHoles)

      // Calculate profit
      // Use totalRevenue if invoices exist, otherwise use quoted amount
      const revenueForCalc = totalRevenue > 0 ? totalRevenue : Number(itinerary.total_cost || 0)
      const grossProfit = revenueForCalc - totalExpenses
      const profitMargin = revenueForCalc > 0 ? (grossProfit / revenueForCalc) * 100 : 0

      return {
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itinerary.trip_name,
        client_name: itinerary.client_name,
        start_date: itinerary.start_date,
        end_date: itinerary.end_date,
        status: itinerary.status,
        currency: itinerary.currency || 'EUR',
        quoted_amount: Number(itinerary.total_cost || 0),
        total_revenue: totalRevenue,
        total_paid: totalPaid,
        supplier_cost: supplierCost,
        manual_expenses: manualExpenses,
        total_expenses: totalExpenses,
        expenses_paid: expensesPaid,
        expenses_pending: expensesPending,
        gross_profit: grossProfit,
        profit_margin: profitMargin,
        expense_breakdown: expenseBreakdown,
        invoice_count: itinInvoices.length,
        expense_count: itinExpenses.length,
        fx_holes: tripHoles,
        fx_complete: tripHoles.length === 0 && tripFx.unconverted === 0,
      }
    })

    // Calculate summary stats
    const totalRevenue = pnlData.reduce((sum, p) => sum + (p.total_revenue || p.quoted_amount), 0)
    const totalSupplierCost = pnlData.reduce((sum, p) => sum + p.supplier_cost, 0)
    const totalManualExpenses = pnlData.reduce((sum, p) => sum + p.manual_expenses, 0)
    const totalExpenses = totalSupplierCost + totalManualExpenses
    const totalProfit = totalRevenue - totalExpenses

    // Currency-aware breakdown: each itinerary can carry a different currency
    // (EUR/USD/GBP/EGP). Summing them directly is meaningless, so expose a
    // per-currency breakdown and flag when more than one currency is present.
    // Flat totals below are retained for backward compatibility but should only
    // be treated as authoritative when mixed_currency is false.
    const byCurrency: Record<string, { revenue: number; supplier_cost: number; manual_expenses: number; total_expenses: number; profit: number; trips: number }> = {}
    for (const p of pnlData) {
      const cur = p.currency || 'EUR'
      const b = byCurrency[cur] || (byCurrency[cur] = { revenue: 0, supplier_cost: 0, manual_expenses: 0, total_expenses: 0, profit: 0, trips: 0 })
      const rev = p.total_revenue || p.quoted_amount
      const exp = p.supplier_cost + p.manual_expenses
      b.revenue += rev
      b.supplier_cost += p.supplier_cost
      b.manual_expenses += p.manual_expenses
      b.total_expenses += exp
      b.profit += rev - exp
      b.trips += 1
    }
    const currencies = Object.keys(byCurrency)
    const mixedCurrency = currencies.length > 1

    const summary = {
      total_trips: pnlData.length,
      currency: mixedCurrency ? null : (currencies[0] || 'EUR'),
      mixed_currency: mixedCurrency,
      by_currency: byCurrency,
      total_revenue: totalRevenue,
      total_supplier_cost: totalSupplierCost,
      total_manual_expenses: totalManualExpenses,
      total_expenses: totalExpenses,
      total_profit: totalProfit,
      average_margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      profitable_trips: pnlData.filter(p => p.gross_profit > 0).length,
      loss_trips: pnlData.filter(p => p.gross_profit < 0).length,
      // How much of the arithmetic above rests on exact rates. `complete:false`
      // means at least one cost is excluded or approximated, so the margin is a
      // floor on cost (and a ceiling on profit), not a settled figure.
      ...buildFxMeta(mixedCurrency ? 'mixed' : (currencies[0] || 'EUR'), overallFx, allHoles),
    }

    return NextResponse.json({
      success: true,
      data: pnlData,
      summary
    })
  } catch (error) {
    console.error('Error in P&L GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}