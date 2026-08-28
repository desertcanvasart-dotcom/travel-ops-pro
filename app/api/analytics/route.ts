import { NextRequest, NextResponse } from 'next/server'
import { partitionDemoRows } from '@/lib/demo-data'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { loadFxIndex, convertLine, buildFxMeta, emptyFxSummary, type FxHole } from '@/lib/fx-report'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate-api'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Every query below ran on the service-role client with no org filter and no
// error check: `.data || []`. Two separate ways to be quietly wrong, and this
// route was both at once.
//
// UNSCOPED: on a deployment with more than one organisation, one operator's
// dashboard summed another's trips and customers.
//
// UNCHECKED: a failed query is indistinguishable from an empty one after
// `|| []`, so the page rendered zeros and confident-looking growth percentages
// instead of an error. That was not hypothetical — it was the live state. The
// revenue queries selected `itineraries.total_price`, a column that does not
// exist (it is `total_cost`), and the pipeline count read `follow_ups`, a table
// that does not exist (it is `client_followups`). Both errors were discarded, so
// total revenue and follow-up count have been reported as 0 for every range.
// The names are corrected here; more importantly, a query that fails now says so.
function firstError(...results: Array<{ error: unknown }>): unknown {
  return results.map(r => r.error).find(Boolean) ?? null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const range = searchParams.get('range') || '30d'

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // ---------- Reporting currency ----------
    // This dashboard is org-wide, so it has no single natural currency: this
    // org holds JPY, EUR and USD trips. It used to SUM total_cost raw across
    // all of them and the page then stamped the org's billing symbol on the
    // result — ¥ on a number that was part euros. Same policy as
    // /api/financial-reports now: pick one currency, convert every line at the
    // rate on its own date, and exclude what cannot be converted rather than
    // adding it at face value.
    //
    // Default is the ORG's billing currency, which is what the page displays,
    // and the response states which currency it used so the two can never
    // disagree.
    const { data: org } = await supabase
      .from('organizations')
      .select('default_currency')
      .eq('id', orgId)
      .maybeSingle()

    const requested = (searchParams.get('currency') || org?.default_currency || 'EUR').toUpperCase()
    const reportingCurrency = (SUPPORTED_CURRENCIES as readonly string[]).includes(requested)
      ? requested
      : 'EUR'

    // Calculate date range
    const now = new Date()
    let startDate: Date
    
    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const startDateStr = startDate.toISOString()

    // Fetch all data in parallel
    const [
      itinerariesResult,
      clientsResult,
      leadsResult,
      followUpsResult,
      revenueByWeekResult
    ] = await Promise.all([
      // Itineraries (bookings) in date range
      supabase
        .from('itineraries')
        .select('id, itinerary_code, status, total_cost, currency, start_date, destinations, created_at')
        .eq('org_id', orgId)
        .gte('created_at', startDateStr),

      // All clients with status
      supabase
        .from('clients')
        .select('id, status, created_at')
        .eq('org_id', orgId)
        .gte('created_at', startDateStr),

      // Leads count (clients with status = 'lead')
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'lead'),

      // Follow-ups count. client_followups carries no org_id of its own, so it
      // is scoped through the customer it belongs to.
      supabase
        .from('client_followups')
        .select('id, clients!inner(org_id)', { count: 'exact', head: true })
        .eq('clients.org_id', orgId)
        .eq('status', 'pending'),

      // Revenue by week for trend chart
      supabase
        .from('itineraries')
        .select('itinerary_code, total_cost, currency, start_date, created_at')
        .eq('org_id', orgId)
        .in('status', ['confirmed', 'completed'])
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: true })
    ])

    // Fail loudly. A dashboard that cannot read its own numbers must not print
    // a confident zero.
    const queryError = firstError(
      itinerariesResult,
      clientsResult,
      leadsResult,
      followUpsResult,
      revenueByWeekResult
    )
    if (queryError) {
      console.error('Analytics query failed:', queryError)
      return NextResponse.json(
        { success: false, error: clientMessage(queryError, 'Could not load analytics') },
        { status: 500 }
      )
    }

    // Seeded demo fixtures are real rows with real money on them and were
    // being counted as revenue and as clients (see lib/demo-data.ts).
    const { real: itineraries, exclusion: demoExcluded } = partitionDemoRows(
      itinerariesResult.data,
      row => row.itinerary_code,
    )
    const clients = clientsResult.data || []
    const leadsCount = leadsResult.count || 0
    const followUpsCount = followUpsResult.count || 0

    // ---------- FX normalisation ----------
    // A trip's money date is its START date, matching /api/financial-reports —
    // so the same trip converts identically in both, and the dashboard cannot
    // disagree with the P&L.
    //
    // COUNTS are deliberately NOT affected: a trip whose rate is missing is
    // still a booking and still belongs in the pipeline. Only its MONEY is
    // withheld, and the response says so via fx_holes / complete:false.
    const fxIndex = await loadFxIndex(supabase)
    const fx = emptyFxSummary()
    const fxHoles: FxHole[] = []

    const toReporting = (row: {
      total_cost?: unknown
      currency?: string | null
      start_date?: string | null
      created_at?: string | null
      itinerary_code?: string | null
      id?: string
    }): number | null => {
      const converted = convertLine(fxIndex, fx, {
        amount: row.total_cost,
        fromCurrency: row.currency,
        toCurrency: reportingCurrency,
        date: row.start_date ?? row.created_at ?? null,
        kind: 'trip',
        reference: row.itinerary_code || row.id || 'trip',
      })
      if (converted.hole) {
        fxHoles.push(converted.hole)
        return null
      }
      return converted.amount ?? 0
    }

    // One converted amount per trip, reused by the revenue total and the
    // destination breakdown so they can never disagree.
    const revenueById = new Map<string, number | null>()
    for (const itin of itineraries) revenueById.set(itin.id, toReporting(itin))

    const revenueData = partitionDemoRows(
      revenueByWeekResult.data,
      row => row.itinerary_code,
    ).real.map(row => ({
      ...row,
      total_cost: toReporting(row),
    }))

    // Calculate booking stats
    const bookingStats = {
      total: itineraries.length,
      confirmed: itineraries.filter(i => i.status === 'confirmed').length,
      pending: itineraries.filter(i => i.status === 'pending' || i.status === 'quoted').length,
      cancelled: itineraries.filter(i => i.status === 'cancelled').length,
      completed: itineraries.filter(i => i.status === 'completed').length
    }

    // Calculate revenue
    const confirmedItineraries = itineraries.filter(i => 
      i.status === 'confirmed' || i.status === 'completed'
    )
    // null = no usable rate; it is already recorded as a hole and must not be
    // folded in at face value.
    const totalRevenue = confirmedItineraries.reduce(
      (sum, i) => sum + (revenueById.get(i.id) ?? 0), 0
    )

    // Calculate client stats
    const totalClients = clients.length
    const newClients = clients.filter(c => c.status === 'lead' || c.status === 'prospect').length
    const returningClients = clients.filter(c => c.status === 'customer').length

    // Calculate conversion rate (confirmed / total inquiries)
    const conversionRate = bookingStats.total > 0 
      ? (bookingStats.confirmed / bookingStats.total) * 100 
      : 0

    // Calculate average deal size
    const avgDealSize = confirmedItineraries.length > 0
      ? totalRevenue / confirmedItineraries.length
      : 0

    // Group revenue by week for trend chart
    const weeklyRevenue = groupByWeek(revenueData, range)

    // Calculate destination stats from itineraries.
    // The column is `destinations`, and it is TEXT — a comma-separated list, not
    // an array. This read `itinerary.cities`, a column that does not exist, and
    // then guarded it with Array.isArray, so the condition was false for every
    // row and the "top destinations" panel has always been empty.
    const destinationMap = new Map<string, { bookings: number; revenue: number }>()
    itineraries.forEach(itinerary => {
      const raw = itinerary.destinations
      const cityNames: string[] = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === 'string'
          ? raw.split(',').map(c => c.trim()).filter(Boolean)
          : []

      cityNames.forEach(city => {
        const existing = destinationMap.get(city) || { bookings: 0, revenue: 0 }
        existing.bookings += 1
        if (itinerary.status === 'confirmed' || itinerary.status === 'completed') {
          existing.revenue += revenueById.get(itinerary.id) ?? 0
        }
        destinationMap.set(city, existing)
      })
    })

    const destinations = Array.from(destinationMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5)

    // Calculate growth (compare to previous period)
    const previousStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()))
    const { data: previousItineraries, error: previousError } = await supabase
      .from('itineraries')
      .select('itinerary_code, total_cost, currency, start_date, status')
      .eq('org_id', orgId)
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDateStr)
      .in('status', ['confirmed', 'completed'])

    if (previousError) {
      console.error('Analytics comparison query failed:', previousError)
      return NextResponse.json(
        { success: false, error: clientMessage(previousError, 'Could not load analytics') },
        { status: 500 }
      )
    }

    // Converted too — comparing a raw mixed-currency sum against a converted
    // one would invent growth out of nothing but exchange rates.
    // Filtered the same way as the current period: comparing a filtered total
    // against an unfiltered one would invent a growth figure.
    const previousRevenue = partitionDemoRows(
      previousItineraries,
      row => row.itinerary_code,
    ).real.reduce(
      (sum, i) => sum + (toReporting(i) ?? 0), 0
    )
    
    const revenueGrowth = previousRevenue > 0 
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : totalRevenue > 0 ? 100 : 0

    // Build response
    const analyticsData = {
      revenue: {
        total: totalRevenue,
        growth: revenueGrowth,
        monthlyData: weeklyRevenue
      },
      bookings: bookingStats,
      clients: {
        total: totalClients,
        new: newClients,
        returning: returningClients
      },
      destinations,
      conversionRate,
      avgDealSize,
      // Which currency these figures are stated in, plus what had to be left
      // out to state them honestly. The page formats with reporting_currency
      // rather than guessing, so the symbol always matches the arithmetic.
      ...buildFxMeta(reportingCurrency, fx, fxHoles),
      // Pipeline specific data
      pipeline: {
        leads: leadsCount,
        followups: followUpsCount,
        pending: bookingStats.pending,
        cancelled: bookingStats.cancelled,
        confirmed: bookingStats.confirmed,
        completed: bookingStats.completed
      }
    }

    return NextResponse.json({ success: true, data: analyticsData, demo_excluded: demoExcluded })
  } catch (error: any) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// Helper to group revenue by week
function groupByWeek(data: any[], range: string): { month: string; revenue: number }[] {
  if (data.length === 0) {
    // Return empty weeks based on range
    const weeks = range === '7d' ? 1 : range === '30d' ? 4 : range === '90d' ? 12 : 52
    return Array.from({ length: Math.min(weeks, 5) }, (_, i) => ({
      month: `Week ${i + 1}`,
      revenue: 0
    }))
  }

  const weekMap = new Map<string, number>()
  
  data.forEach(item => {
    const date = new Date(item.created_at)
    const weekStart = getWeekStart(date)
    const weekKey = weekStart.toISOString().split('T')[0]
    
    const existing = weekMap.get(weekKey) || 0
    // total_cost, not total_price. The rename reached the three call sites in
    // the handler but not this helper, so every week summed `undefined` to 0 and
    // the trend chart auto-scaled to an empty axis while the headline figure
    // above it was correct.
    weekMap.set(weekKey, existing + (parseFloat(item.total_cost) || 0))
  })

  // Convert to array and sort
  const weeks = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-5) // Last 5 weeks
    .map((entry, index) => ({
      month: `Week ${index + 1}`,
      revenue: entry[1]
    }))

  // Ensure at least some data points
  if (weeks.length === 0) {
    return [{ month: 'Week 1', revenue: 0 }]
  }

  return weeks
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}