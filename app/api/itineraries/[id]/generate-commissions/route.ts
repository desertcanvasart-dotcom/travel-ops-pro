import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itineraryId } = await params

    // Get itinerary details
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('*, client:clients(id, first_name, last_name, email)')
      .eq('id', itineraryId)
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

    const { data: services, error: servicesError } = await supabaseAdmin
      .from('itinerary_services')
      .select(`
        *,
        supplier:suppliers(*)
      `)
      .in('day_id', dayIds)
      .not('supplier_id', 'is', null)

    if (servicesError) {
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
    }

    // Filter services that haven't had commissions generated
    const eligibleServices = (services || []).filter(
      s => s.commission_status === 'pending' || !s.commission_status
    )

    if (eligibleServices.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No new commissions to generate',
        generated: 0 
      })
    }

    // Map service types to commission categories
    const typeToCategory: Record<string, string> = {
      hotel: 'hotel',
      transport: 'transport',
      restaurant: 'restaurant',
      cruise: 'cruise',
      entrance: 'attraction',
      activity: 'activity',
      shopping: 'shopping',
      other: 'other'
    }

    // Generate commission records
    const commissionsToCreate = eligibleServices
      .filter(s => s.supplier && (s.commission_rate || s.supplier.default_commission_rate))
      .map(s => {
        const rate = s.commission_rate || s.supplier.default_commission_rate || 0
        const baseAmount = Number(s.selling_price || s.cost || 0)
        const commissionAmount = (baseAmount * rate) / 100

        return {
          itinerary_id: itineraryId,
          supplier_id: s.supplier_id,
          client_id: itinerary.client?.id || null,
          commission_type: s.supplier.commission_type || 'receivable',
          category: typeToCategory[s.service_type] || 'other',
          source_name: s.supplier.name,
          description: `${s.description || s.service_type} - ${itinerary.itinerary_code}`,
          base_amount: baseAmount,
          commission_rate: rate,
          commission_amount: commissionAmount,
          currency: 'EUR',
          status: 'pending',
          transaction_date: itinerary.start_date || new Date().toISOString().split('T')[0],
          notes: `Auto-generated from itinerary ${itinerary.itinerary_code}`
        }
      })

    if (commissionsToCreate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No services with commission rates found',
        generated: 0
      })
    }

    // M16: claim the eligible services first via a CONDITIONAL update,
    // then insert commissions ONLY for the rows we actually claimed.
    //
    // The original implementation inserted commissions, then ran a
    // separate non-error-checked update to mark services 'generated'.
    // Two concurrent requests on the same itinerary both passed the
    // 'eligible' filter and each ran the insert — every commission was
    // duplicated. A re-run after a partial failure (commissions inserted
    // but the trailing update failed) did the same.
    //
    // Flipping the service rows from 'pending' → 'generated' with a
    // WHERE clause turns the row state itself into the claim lock:
    // PostgreSQL serializes the row update, the second writer's
    // commission_status='pending' predicate matches 0 rows, RETURNING
    // gives back just the rows THIS request won. We then insert
    // commissions only for those. The error check that was missing
    // before is now the very first thing we do.
    const candidateServices = eligibleServices.filter(
      s => s.supplier && (s.commission_rate || s.supplier.default_commission_rate)
    )
    const candidateIds = candidateServices.map(s => s.id)

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

    const commissionsForClaimed = commissionsToCreate.filter((_, i) => claimedIds.has(candidateServices[i].id))

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
      message: `Generated ${createdCommissions?.length || 0} commission records`,
      generated: createdCommissions?.length || 0,
      commissions: createdCommissions
    })

  } catch (error) {
    console.error('Error generating commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}