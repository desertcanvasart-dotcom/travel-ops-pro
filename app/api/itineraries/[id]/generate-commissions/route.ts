import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { buildCommissions, summariseSkips, describeSkips } from '@/lib/commission-generation'
import { describePriceChanges } from '@/lib/commission-price-changes'
import { loadTripServices, syncCommissionPrices } from '@/lib/commission-price-sync'

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

    // The trip and its priced services (lib/commission-price-sync.ts). The
    // mapping to commission rows lives in lib/commission-generation.ts as a
    // pure function — see the tests there.
    //
    // THE BUG THAT MADE THIS ROUTE UNUSABLE: it filtered services on `day_id`,
    // which does not exist — the column is `itinerary_day_id`. PostgREST
    // answered 42703 and every call returned "Failed to fetch services".
    // Nothing in the app had ever created a commission.
    //
    // The supplier filter is deliberately NOT applied in SQL: a service with no
    // supplier is REPORTED as a skip rather than silently vanishing, because
    // "0 commissions" with no explanation is exactly what the broken version
    // looked like.
    const loaded = await loadTripServices(supabaseAdmin, orgId, itineraryId)
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    }
    const { trip: itinerary, services, ctx } = loaded

    // A cancelled trip earns and owes no commission. Generating them anyway
    // put receivables and agent payables on the books for a trip that never ran.
    if (itinerary.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This trip is cancelled — commissions are not generated for cancelled trips.' },
        { status: 409 }
      )
    }

    // A service repriced since its commission was made: the pending commission
    // follows the price, a paid one is left and flagged. Runs on every call, so
    // it also answers when there is nothing new to generate.
    const priceSync = await syncCommissionPrices(supabaseAdmin, orgId, { services, ctx })
    const priceNote = describePriceChanges(priceSync)
    const priceFields = {
      recalculated: priceSync.recalculated,
      price_changed: priceSync.flagged,
    }

    // "Recalculate from price" asks for exactly that and nothing else.
    const body = await request.json().catch(() => ({}))
    if (body?.action === 'recalculate') {
      return NextResponse.json({
        success: true,
        message: priceNote || 'Every pending commission already matches its service price.',
        generated: 0,
        ...priceFields,
      })
    }

    // Build the commission rows. It reads client_price / total_cost /
    // service_name; the previous code read selling_price / cost / description,
    // none of which exist on this table.
    const { pairs: commissionPairs, skipped } = buildCommissions(services, ctx)

    const skipSummary = summariseSkips(skipped)

    if (commissionPairs.length === 0) {
      // No bare "generated: 0" — that is indistinguishable from the broken
      // behaviour this replaces. Say which services were skipped and why.
      return NextResponse.json({
        success: true,
        message:
          (skipped.length === 0
            ? 'This itinerary has no services to generate commissions from.'
            : `No commissions generated. ${describeSkips(skipped) || `${skipped.length} service${skipped.length === 1 ? '' : 's'} skipped.`}`) +
          (priceNote ? ` ${priceNote}` : ''),
        generated: 0,
        skipped,
        skip_summary: skipSummary,
        ...priceFields,
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
    const candidateIds = Array.from(new Set(commissionPairs.map(p => p.serviceId)))

    // Flip claimed services back to pending (a failed insert, or a service
    // only partly generated).
    const releaseClaim = async (ids: string[]) => {
      const { error } = await supabaseAdmin
        .from('itinerary_services')
        .update({ commission_status: 'pending' })
        .in('id', ids)
      return error
    }

    const { data: claimedRows, error: claimError } = await supabaseAdmin
      .from('itinerary_services')
      .update({ commission_status: 'generated' })
      .in('id', candidateIds)
      // NULL is unclaimed too — eligibility (lib/commission-generation) treats
      // it so, and a pending-only claim reported such rows as "claimed by a
      // concurrent request" and never generated them (AUDIT M16).
      .or('commission_status.is.null,commission_status.eq.pending')
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
        generated: 0,
        ...priceFields,
      })
    }

    // A service whose commission already exists is not made twice. This is
    // what makes it safe to leave a service unmarked when only part of it could
    // be generated (below), and to regenerate one whose commission was deleted
    // while its sibling (seller / provider) was kept.
    const { data: existingForServices, error: existingError } = await supabaseAdmin
      .from('commissions')
      .select('service_id, description')
      .eq('org_id', orgId)
      .in('service_id', Array.from(claimedIds))
    if (existingError) {
      await releaseClaim(Array.from(claimedIds))
      console.error('Error reading existing commissions for generation:', existingError)
      return NextResponse.json({ error: 'Failed to check existing commissions' }, { status: 500 })
    }
    const alreadyMade = new Set((existingForServices || []).map(c => `${c.service_id}|${c.description}`))

    const commissionsForClaimed = commissionPairs
      .filter(p => claimedIds.has(p.serviceId))
      .filter(p => !alreadyMade.has(`${p.serviceId}|${p.commission.description}`))
      // The link back to the service: deleting the commission releases it.
      .map(p => ({ ...p.commission, service_id: p.serviceId }))

    // Insert commissions for the claimed rows.
    const { data: createdCommissions, error: createError } = commissionsForClaimed.length > 0
      ? await supabaseAdmin.from('commissions').insert(commissionsForClaimed).select()
      : { data: [], error: null }

    if (createError) {
      // Roll back the claim — flip the rows back to 'pending' so a retry
      // can succeed. If the rollback itself fails, log loudly: an operator
      // will need to manually reset commission_status='pending' on the
      // affected rows. Without the rollback, the original bug (services
      // marked 'generated' but no commission rows) would re-emerge.
      console.error('Commission insert failed; rolling back claim:', createError)
      const rollbackError = await releaseClaim(Array.from(claimedIds))
      if (rollbackError) {
        console.error(`[M16] CRITICAL: rollback failed for itinerary ${itineraryId} services ${Array.from(claimedIds).join(',')} — manual reset required:`, rollbackError)
      }
      return NextResponse.json({ error: 'Failed to create commissions' }, { status: 500 })
    }

    // Mark a service 'generated' only when EVERY commission it can give was
    // made. One that produced a seller commission but skipped the provider's
    // (no rate yet, no supplier cost…) was marked done, so fixing the provider
    // later never generated the rest. It goes back to pending; the commissions
    // it already has are not made twice (alreadyMade above).
    const partialIds = Array.from(claimedIds).filter(sid => skipped.some(sk => sk.service_id === sid))
    if (partialIds.length > 0) {
      const releaseError = await releaseClaim(partialIds)
      if (releaseError) {
        console.error(`[M16] services ${partialIds.join(',')} of itinerary ${itineraryId} stay marked generated although part was skipped — manual reset required:`, releaseError)
      }
    }

    return NextResponse.json({
      success: true,
      // Skips ride along with a successful run too: an operator who expected 8
      // commissions and got 3 needs to know what happened to the other 5.
      skipped,
      skip_summary: skipSummary,
      message: `Generated ${createdCommissions?.length || 0} commission records.${describeSkips(skipped) ? ` ${describeSkips(skipped)}` : ''}${priceNote ? ` ${priceNote}` : ''}`,
      generated: createdCommissions?.length || 0,
      commissions: createdCommissions,
      ...priceFields,
    })

  } catch (error) {
    console.error('Error generating commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}