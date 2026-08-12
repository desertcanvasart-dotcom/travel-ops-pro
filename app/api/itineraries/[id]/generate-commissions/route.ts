import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { buildCommissions, summariseSkips } from '@/lib/commission-generation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Generating commissions is a privileged financial action. The middleware
    // prefix gate can't match this nested route, so gate it here.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id: itineraryId } = await params

    // Get itinerary details
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('*, client:clients(id, first_name, last_name, email)')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Get all services with suppliers for this itinerary
    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', itineraryId)

    if (daysError || !days) {
      return NextResponse.json({ error: 'Failed to fetch itinerary days' }, { status: 500 })
    }

    const dayIds = days.map(d => d.id)

    // THE BUG THAT MADE THIS ROUTE UNUSABLE: this filtered on `day_id`, which
    // does not exist — the column is `itinerary_day_id`. PostgREST answered
    // 42703 and every call returned "Failed to fetch services". Nothing in the
    // app has ever created a commission.
    //
    // The supplier filter is deliberately NOT applied in SQL any more: a
    // service with no supplier is now REPORTED as a skip rather than silently
    // vanishing, because "0 commissions" with no explanation is exactly what
    // the broken version looked like.
    const { data: services, error: servicesError } = await supabaseAdmin
      .from('itinerary_services')
      .select('id, service_type, service_name, client_price, total_cost, supplier_id, commission_rate, commission_status, supplier:suppliers(id, name, commission_type, default_commission_rate)')
      .in('itinerary_day_id', dayIds)

    if (servicesError) {
      console.error('Error fetching services for commission generation:', servicesError)
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
    }

    // Build the commission rows. The mapping lives in
    // lib/commission-generation.ts as a pure function — see the tests there.
    //
    // It reads client_price / total_cost / service_name; the previous code read
    // selling_price / cost / description, none of which exist on this table.
    const { pairs: commissionPairs, skipped } = buildCommissions(
      (services || []).map(s => ({
        ...s,
        // PostgREST types an embedded row as an array; take the single row.
        supplier: Array.isArray(s.supplier) ? s.supplier[0] : s.supplier,
      })),
      {
        orgId,
        itineraryId,
        itineraryCode: itinerary.itinerary_code,
        clientId: itinerary.client?.id || null,
        startDate: itinerary.start_date,
        currency: itinerary.currency,
      }
    )

    const skipSummary = summariseSkips(skipped)

    if (commissionPairs.length === 0) {
      // No bare "generated: 0" — that is indistinguishable from the broken
      // behaviour this replaces. Say which services were skipped and why.
      return NextResponse.json({
        success: true,
        message:
          skipped.length === 0
            ? 'This itinerary has no services to generate commissions from.'
            : `No commissions generated. ${skipped.length} service${skipped.length === 1 ? '' : 's'} skipped — see "skipped" for the reason on each.`,
        generated: 0,
        skipped,
        skip_summary: skipSummary,
      })
    }

    // M16: claim the services first via a CONDITIONAL update, then insert
    // commissions ONLY for the rows we actually claimed.
    //
    // The original implementation inserted commissions, then ran a separate
    // non-error-checked update to mark services 'generated'. Two concurrent
    // requests on the same itinerary both passed the 'eligible' filter and each
    // ran the insert — every commission was duplicated. A re-run after a partial
    // failure (commissions inserted but the trailing update failed) did the same.
    //
    // Flipping the service rows from 'pending' → 'generated' with a WHERE clause
    // turns the row state itself into the claim lock: PostgreSQL serializes the
    // row update, the second writer's commission_status='pending' predicate
    // matches 0 rows, RETURNING gives back just the rows THIS request won. We
    // claim exactly the services that produce a commission (so base ≤ 0 rows are
    // never falsely marked 'generated').
    const candidateIds = commissionPairs.map(p => p.serviceId)

    const { data: claimedRows, error: claimError } = await supabaseAdmin
      .from('itinerary_services')
      .update({ commission_status: 'generated' })
      .in('id', candidateIds)
      .eq('commission_status', 'pending')
      .select('id')

    if (claimError) {
      console.error('Error claiming services for commission generation:', claimError)
      return NextResponse.json({ error: 'Failed to claim services for commission generation' }, { status: 500 })
    }

    const claimedIds = new Set((claimedRows || []).map(r => r.id))
    if (claimedIds.size === 0) {
      // Another concurrent request already claimed every eligible service.
      return NextResponse.json({
        success: true,
        message: 'No new commissions to generate (already claimed by a concurrent request)',
        generated: 0
      })
    }

    const commissionsForClaimed = commissionPairs
      .filter(p => claimedIds.has(p.serviceId))
      .map(p => p.commission)

    // Insert commissions for the claimed rows.
    const { data: createdCommissions, error: createError } = await supabaseAdmin
      .from('commissions')
      .insert(commissionsForClaimed)
      .select()

    if (createError) {
      // Roll back the claim — flip the rows back to 'pending' so a retry
      // can succeed. If the rollback itself fails, log loudly: an operator
      // will need to manually reset commission_status='pending' on the
      // affected rows. Without the rollback, the original bug (services
      // marked 'generated' but no commission rows) would re-emerge.
      console.error('Commission insert failed; rolling back claim:', createError)
      const { error: rollbackError } = await supabaseAdmin
        .from('itinerary_services')
        .update({ commission_status: 'pending' })
        .in('id', Array.from(claimedIds))
      if (rollbackError) {
        console.error(`[M16] CRITICAL: rollback failed for itinerary ${itineraryId} services ${Array.from(claimedIds).join(',')} — manual reset required:`, rollbackError)
      }
      return NextResponse.json({ error: 'Failed to create commissions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      // Skips ride along with a successful run too: an operator who expected 8
      // commissions and got 3 needs to know what happened to the other 5.
      skipped,
      skip_summary: skipSummary,
      message: `Generated ${createdCommissions?.length || 0} commission records`,
      generated: createdCommissions?.length || 0,
      commissions: createdCommissions
    })

  } catch (error) {
    console.error('Error generating commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}