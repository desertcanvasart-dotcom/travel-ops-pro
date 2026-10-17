import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { describePriceChanges, type CommissionPriceFlag, type CommissionRecalc } from '@/lib/commission-price-changes'
import { loadTripServices, syncCommissionPrices } from '@/lib/commission-price-sync'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A runaway guard, not a window: one press looks at this many trips. Trips are
// taken newest-commission-first, so the ones being worked on come first.
const MAX_TRIPS = 200

/**
 * "Recalculate from price" on the Commissions page.
 *
 * For one trip ({ itinerary_id }) or, with none, every trip that has a
 * generated commission: a pending commission whose service price changed since
 * it was made is recalculated; a paid, received, invoiced or disputed one is
 * never changed, only flagged ("price changed since paid"). Nothing is
 * generated here — that is the trip's Generate commissions.
 */
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const body = await request.json().catch(() => ({}))
    let tripIds: string[]
    if (typeof body?.itinerary_id === 'string' && body.itinerary_id) {
      tripIds = [body.itinerary_id]
    } else {
      const { data, error } = await supabaseAdmin
        .from('commissions')
        .select('itinerary_id')
        .eq('org_id', orgId)
        .not('service_id', 'is', null)
        .not('itinerary_id', 'is', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Error listing commissions to recalculate:', error)
        return NextResponse.json({ error: 'Failed to recalculate commissions' }, { status: 500 })
      }
      tripIds = Array.from(new Set((data ?? []).map((r: { itinerary_id: string }) => r.itinerary_id))).slice(0, MAX_TRIPS)
    }

    const recalculated: CommissionRecalc[] = []
    const priceChanged: CommissionPriceFlag[] = []
    const failed: string[] = []
    for (const id of tripIds) {
      const loaded = await loadTripServices(supabaseAdmin, orgId, id)
      if (!loaded.ok) {
        // A named trip that is not this company's is a 404; in a sweep it is just skipped.
        if (tripIds.length === 1) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
        continue
      }
      const result = await syncCommissionPrices(supabaseAdmin, orgId, loaded)
      recalculated.push(...result.recalculated)
      priceChanged.push(...result.flagged)
      failed.push(...result.failed)
    }

    return NextResponse.json({
      success: true,
      message: describePriceChanges({ recalculated, flagged: priceChanged }) || 'Every pending commission already matches its service price.',
      trips_checked: tripIds.length,
      recalculated,
      price_changed: priceChanged,
      failed,
    })
  } catch (error) {
    console.error('Error recalculating commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
