import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { buildCommissions, summariseSkips, describeSkips } from '@/lib/commission-generation'

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

    // A cancelled trip earns and owes no commission. Generating them anyway
    // put receivables and agent payables on the books for a trip that never ran.
    if (itinerary.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This trip is cancelled — commissions are not generated for cancelled trips.' },
        { status: 409 }
      )
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
      // Two FKs point at suppliers (provider + seller) since
      // 20260822_service_sold_by.sql, so each embed names its column — an
      // unhinted `suppliers(...)` is PGRST201 (ambiguous) from then on. ONE
      // literal string: supabase-js types the result by parsing it, and a
      // concatenated or interpolated expression collapses to an error type.
      .select('id, service_type, service_name, client_price, total_cost, supplier_id, commission_rate, commission_status, sold_by_supplier_id, supplier:suppliers!supplier_id(id, name, org_id, commission_type, default_commission_rate), seller:suppliers!sold_by_supplier_id(id, name, org_id, commission_type, default_commission_rate)')
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
      (services || []).map(s => {
        // PostgREST types an embedded row as an array; take the single row.
        const supplier = Array.isArray(s.supplier) ? s.supplier[0] : s.supplier
        const seller = Array.isArray(s.seller) ? s.seller[0] : s.seller
        // A supplier that is not this company's is treated as absent: a
        // commission must never carry another company's supplier, name or rate.
        const own = <T extends { org_id?: string | null }>(row: T | null | undefined) => (row && row.org_id === orgId ? row : null)
        return { ...s, supplier: own(supplier), seller: own(seller) }
      }),
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
            : `No commissions generated. ${describeSkips(skipped) || `${skipped.length} service${skipped.length === 1 ? '' : 's'} skipped.`}`,
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
      message: `Generated ${createdCommissions?.length || 0} commission records.${describeSkips(skipped) ? ` ${describeSkips(skipped)}` : ''}`,
      generated: createdCommissions?.length || 0,
      commissions: createdCommissions
    })

  } catch (error) {
    console.error('Error generating commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}