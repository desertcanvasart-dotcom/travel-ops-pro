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
//
// THREE LAYERS (added 2026-08-12). The route used to report one number, and it
// quietly mixed estimates with facts. It now reports each layer separately
// because they answer different questions and have different reliability:
//
//   quoted    — what we told the client. total_cost. An intention.
//   accrued   — what we have invoiced and what we owe. Includes supplier_cost,
//               which is a PRICING ESTIMATE, not a bill anyone has sent.
//   realized  — money that actually moved: payments received, expenses paid,
//               commissions paid. No estimates in it at all.
//
// AGENT COMMISSIONS. A trip sold through an agent pays that agent out of our
// margin, so a margin quoted before commission is not the margin we keep. Every
// payable commission is subtracted (net_profit / net_margin); receivable
// commissions — what suppliers owe US — are reported alongside but NOT added,
// because money owed is not money earned and adding it would flatter the trip.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadFxIndex, buildFxMeta, emptyFxSummary, type FxHole } from '@/lib/fx-report'
import { computeTripPnL, type TripPnL, type PnLExtra } from '@/lib/trip-pnl'
import { mergeFxSummary } from '@/lib/fx-conversion'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The per-trip shape and the math both live in lib/trip-pnl.ts.

/**
 * PostgREST puts filter values in the URL, so a single `.in()` over thousands
 * of ids blows the request line. Everything here is filtered in batches.
 */
const ID_BATCH = 200

function chunk<T>(items: T[], size = ID_BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * The summary for an org with no trips.
 *
 * Every numeric key the populated summary carries must appear here: the page
 * reads them straight into `.toLocaleString()` / `.toFixed()`, so a missing key
 * renders "undefined" or throws rather than showing a zero.
 */
function emptySummary() {
  return {
    total_trips: 0,
    currency: 'EUR' as string | null,
    mixed_currency: false,
    by_currency: {} as Record<string, unknown>,
    total_revenue: 0,
    total_supplier_cost: 0,
    total_manual_expenses: 0,
    total_expenses: 0,
    total_profit: 0,
    average_margin: 0,
    total_agent_commissions: 0,
    total_net_profit: 0,
    average_net_margin: 0,
    total_realized_revenue: 0,
    total_realized_cost: 0,
    total_realized_profit: 0,
    average_realized_margin: 0,
    profitable_trips: 0,
    loss_trips: 0,
    ...buildFxMeta('EUR', emptyFxSummary(), []),
  }
}

export async function GET(request: NextRequest) {
  try {
    // TENANCY GATE. This route reads with the service-role key, which bypasses
    // RLS, and until now it filtered by NOTHING — every organisation's
    // itineraries, invoices, payments, expenses and commissions came back to
    // whoever asked. It was the only financial route missing the gate its
    // siblings all have, and it was observable: the seeded E2E org is a second
    // org, and its user's P&L listed the real operator's trips.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const searchParams = request.nextUrl.searchParams
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')

    // Fetch itineraries - include supplier_cost which is calculated during pricing
    let itineraryQuery = supabaseAdmin
      .from('itineraries')
      .select('id, itinerary_code, trip_name, client_name, start_date, end_date, status, currency, total_cost, supplier_cost')
      .eq('org_id', orgId)
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
      // Was a bare `[]`, which has no `success` key — the page checks for one,
      // so an org with no trips got a permanently-loading screen rather than an
      // empty report. Return the same shape as every other path.
      return NextResponse.json({ success: true, data: [], summary: emptySummary() })
    }

    const itineraryIds = itineraries.map(i => i.id)

    // Every child query below is scoped BY ITINERARY, not merely by org_id.
    // Two reasons: invoice_payments has no org_id column at all, and scoping to
    // the trips actually in this response is both the tighter gate and far less
    // data than the previous unfiltered full-table reads.
    const invoices: Array<Record<string, any>> = []
    for (const ids of chunk(itineraryIds)) {
      const { data, error } = await supabaseAdmin
        .from('invoices')
        .select('id, itinerary_id, total_amount, amount_paid, status, currency')
        .eq('org_id', orgId)
        .in('itinerary_id', ids)
      if (error) console.error('Error fetching invoices:', error)
      if (data) invoices.push(...data)
    }

    // Actual payments received, for the realized layer. amount_paid on the
    // invoice is a running total with no date, so it cannot be converted at a
    // historical rate; the payment rows carry their own currency AND date,
    // which is exactly what the FX policy needs.
    const invoiceIdToItinerary = new Map<string, string>()
    for (const inv of invoices) {
      if (inv.id && inv.itinerary_id) invoiceIdToItinerary.set(inv.id, inv.itinerary_id)
    }

    // invoice_payments has NO org_id, so its only tenancy boundary is the
    // invoice it belongs to — and those are org-scoped above.
    const invoicePayments: Array<Record<string, any>> = []
    for (const ids of chunk([...invoiceIdToItinerary.keys()])) {
      const { data, error } = await supabaseAdmin
        .from('invoice_payments')
        .select('invoice_id, amount, currency, payment_date, transaction_reference')
        .in('invoice_id', ids)
      if (error) console.error('Error fetching invoice payments:', error)
      if (data) invoicePayments.push(...data)
    }

    // Commissions. commission_type says which direction the money goes:
    // 'payable' is ours to pay an agent, 'receivable' is a supplier's to pay us.
    const commissions: Array<Record<string, any>> = []
    for (const ids of chunk(itineraryIds)) {
      const { data, error } = await supabaseAdmin
        .from('commissions')
        .select('itinerary_id, commission_type, commission_amount, currency, transaction_date, status, description, category')
        .eq('org_id', orgId)
        .in('itinerary_id', ids)
      if (error) console.error('Error fetching commissions:', error)
      if (data) commissions.push(...data)
    }

    // Expenses. currency + expense_date are load-bearing: they decide WHICH
    // rate converts this line, so a missing date means no historical rate.
    const expenses: Array<Record<string, any>> = []
    for (const ids of chunk(itineraryIds)) {
      const { data, error } = await supabaseAdmin
        .from('expenses')
        .select('itinerary_id, amount, category, status, currency, expense_date, expense_number')
        .eq('org_id', orgId)
        .in('itinerary_id', ids)
      if (error) console.error('Error fetching expenses:', error)
      if (data) expenses.push(...data)
    }

    // Extras and upgrades sold after the trip was priced. They live on the
    // BOOKING, not the itinerary, so they are reached through it — and only the
    // confirmed ones, which are the only ones that are money.
    const extrasByItinerary = new Map<string, PnLExtra[]>()
    for (const ids of chunk(itineraryIds)) {
      const { data, error } = await supabaseAdmin
        .from('booking_extras')
        .select('title, quantity, unit_price, currency, supplier_cost, supplier_currency, confirmed_at, bookings!inner(itinerary_id, org_id)')
        .eq('status', 'confirmed')
        .eq('org_id', orgId)
        .in('bookings.itinerary_id', ids)
      // A database without migration 20260828_booking_extras answers with an
      // error here. The report is still true about everything else, so it
      // carries on without them rather than 500ing.
      if (error) console.error('Error fetching booking extras:', error)
      for (const row of data ?? []) {
        const itinId = (row.bookings as { itinerary_id?: string } | null)?.itinerary_id
        if (!itinId) continue
        const list = extrasByItinerary.get(itinId) ?? []
        list.push(row as unknown as PnLExtra)
        extrasByItinerary.set(itinId, list)
      }
    }

    // Rate history, loaded once for every trip in this response.
    const fxIndex = await loadFxIndex(supabaseAdmin)

    // Accuracy tally across every trip, folded into the response-level meta.
    const overallFx = emptyFxSummary()
    const allHoles: FxHole[] = []

    // Build P&L for each itinerary
    // Build P&L for each itinerary. The math lives in lib/trip-pnl.ts as a
    // pure function so it can be tested without a database — see
    // __tests__/lib/trip-pnl.test.ts.
    const pnlData: TripPnL[] = []
    for (const itinerary of itineraries) {
      const { pnl, fx } = computeTripPnL(fxIndex, {
        itinerary,
        invoices: invoices.filter(inv => inv.itinerary_id === itinerary.id),
        payments: invoicePayments.filter(
          p => invoiceIdToItinerary.get(p.invoice_id) === itinerary.id
        ),
        expenses: expenses.filter(exp => exp.itinerary_id === itinerary.id),
        commissions: commissions.filter(c => c.itinerary_id === itinerary.id),
        extras: extrasByItinerary.get(itinerary.id) ?? [],
      })

      // Fold this trip's accuracy into the response-level tally.
      mergeFxSummary(overallFx, fx)
      allHoles.push(...pnl.fx_holes)
      pnlData.push(pnl)
    }

    // Calculate summary stats
    const totalRevenue = pnlData.reduce((sum, p) => sum + (p.total_revenue || p.quoted_amount), 0)
    const totalSupplierCost = pnlData.reduce((sum, p) => sum + p.supplier_cost, 0)
    const totalManualExpenses = pnlData.reduce((sum, p) => sum + p.manual_expenses, 0)
    const totalExpenses = totalSupplierCost + totalManualExpenses
    const totalProfit = totalRevenue - totalExpenses
    const totalAgentCommissions = pnlData.reduce((sum, p) => sum + p.agent_commissions, 0)
    const totalNetProfit = totalProfit - totalAgentCommissions
    const totalRealizedRevenue = pnlData.reduce((sum, p) => sum + p.realized_revenue, 0)
    const totalRealizedCost = pnlData.reduce((sum, p) => sum + p.realized_cost, 0)
    const totalRealizedProfit = totalRealizedRevenue - totalRealizedCost

    // Currency-aware breakdown: each itinerary can carry a different currency
    // (EUR/USD/GBP/EGP). Summing them directly is meaningless, so expose a
    // per-currency breakdown and flag when more than one currency is present.
    // Flat totals below are retained for backward compatibility but should only
    // be treated as authoritative when mixed_currency is false.
    const byCurrency: Record<string, { revenue: number; supplier_cost: number; manual_expenses: number; total_expenses: number; profit: number; agent_commissions: number; net_profit: number; realized_revenue: number; realized_cost: number; realized_profit: number; trips: number }> = {}
    for (const p of pnlData) {
      const cur = p.currency || 'EUR'
      const b = byCurrency[cur] || (byCurrency[cur] = { revenue: 0, supplier_cost: 0, manual_expenses: 0, total_expenses: 0, profit: 0, agent_commissions: 0, net_profit: 0, realized_revenue: 0, realized_cost: 0, realized_profit: 0, trips: 0 })
      const rev = p.total_revenue || p.quoted_amount
      const exp = p.supplier_cost + p.manual_expenses
      b.revenue += rev
      b.supplier_cost += p.supplier_cost
      b.manual_expenses += p.manual_expenses
      b.total_expenses += exp
      b.profit += rev - exp
      b.agent_commissions += p.agent_commissions
      b.net_profit += p.net_profit
      b.realized_revenue += p.realized_revenue
      b.realized_cost += p.realized_cost
      b.realized_profit += p.realized_profit
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

      // Net of what agents take. This, not total_profit, is what the business
      // keeps on trips sold through an agent.
      total_agent_commissions: totalAgentCommissions,
      total_net_profit: totalNetProfit,
      average_net_margin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,

      // Cash that actually moved, no estimates.
      total_realized_revenue: totalRealizedRevenue,
      total_realized_cost: totalRealizedCost,
      total_realized_profit: totalRealizedProfit,
      average_realized_margin:
        totalRealizedRevenue > 0 ? (totalRealizedProfit / totalRealizedRevenue) * 100 : 0,

      // Counted on net, not gross: a trip whose whole margin goes to the agent
      // is not a profitable trip, however good the gross looks.
      profitable_trips: pnlData.filter(p => p.net_profit > 0).length,
      loss_trips: pnlData.filter(p => p.net_profit < 0).length,
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