import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { buildFrozenFx, computeFxReprice, parseFrozenFx } from '@/lib/itinerary-fx'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { roundToCurrency } from '@/lib/currency-totals'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// POST — re-price a confirmed itinerary at today's exchange rates
// ============================================
// The ONLY way an approved file's FX moves. Confirming froze the rates
// (itineraries.fx_frozen); this replaces the snapshot with today's and
// recomputes every converted service line from its PRESERVED original
// (supplier_cost_original × new rate — the original is never touched), then
// restates the itinerary's supplier_cost and profit. The client price
// (total_cost) deliberately does NOT move: what the customer was quoted is a
// commercial commitment; what the trip costs the operator is a fact that a
// person has chosen to restate. The action lands in the activity log via
// middleware with this user attached, and the new snapshot records
// source:'reprice' and frozen_by.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const { data: itinerary, error } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()
    if (error || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }
    if (!('fx_frozen' in itinerary)) {
      return NextResponse.json(
        { success: false, error: 'FX freeze is not available yet — apply migration 20260827_itinerary_fx_freeze first.' },
        { status: 409 }
      )
    }
    if (itinerary.status !== 'confirmed') {
      // An unconfirmed quotation already follows the live rate; there is
      // nothing frozen to move.
      return NextResponse.json(
        { success: false, error: 'Only a confirmed itinerary can be re-priced — a draft already uses current rates.' },
        { status: 409 }
      )
    }

    const previous = parseFrozenFx(itinerary.fx_frozen)
    const rateCurrency = await getOrgRateCurrency(supabaseAdmin, orgId)
    const fresh = await buildFrozenFx(rateCurrency, await getCurrentUserId(), 'reprice')

    const { data: lines } = await supabaseAdmin
      .from('itinerary_services')
      .select('id, supplier_currency, supplier_cost_original, exchange_rate_used, total_cost')
      .eq('itinerary_id', id)

    const currency = itinerary.currency || 'EUR'
    const result = computeFxReprice(lines ?? [], currency, fresh)

    // Apply the recomputed lines. Sequential singles rather than a bulk
    // upsert: each carries different values and the set is small.
    for (const change of result.changes) {
      const { error: lineError } = await supabaseAdmin
        .from('itinerary_services')
        .update({ exchange_rate_used: change.new_rate, total_cost: change.new_total })
        .eq('id', change.id)
        .eq('itinerary_id', id)
      if (lineError) {
        return NextResponse.json(
          { success: false, error: `Re-price stopped at a line that would not save: ${lineError.message}. No snapshot was replaced.` },
          { status: 500 }
        )
      }
    }

    const oldSupplierCost = Number(itinerary.supplier_cost) || 0
    const totalCost = Number(itinerary.total_cost) || 0
    const update: Record<string, unknown> = {
      fx_frozen: fresh,
      supplier_cost: result.newSupplierCost,
      profit: roundToCurrency(totalCost - result.newSupplierCost, currency),
      updated_at: new Date().toISOString(),
    }
    const { error: updateError } = await supabaseAdmin
      .from('itineraries')
      .update(update)
      .eq('id', id)
      .eq('org_id', orgId)
    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      repriced: {
        lines_changed: result.changes.length,
        unconvertible: result.unconvertible,
        supplier_cost: { old: oldSupplierCost, new: result.newSupplierCost },
        profit: { old: Number(itinerary.profit) || 0, new: roundToCurrency(totalCost - result.newSupplierCost, currency) },
        previous_snapshot: previous,
        new_snapshot: fresh,
      },
    })
  } catch (error) {
    console.error('Error in reprice-fx POST:', error)
    return NextResponse.json({ success: false, error: 'Failed to re-price' }, { status: 500 })
  }
}
