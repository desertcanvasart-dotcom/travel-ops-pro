// ============================================
// B2C QUOTES API — single offer
// GET    /api/b2c/quotes/[id]
// PUT    /api/b2c/quotes/[id]   margin_percent (re-prices from the itinerary),
//                               status, client_notes, internal_notes, valid_until;
//                               snapshots a revision. Notes only once booked.
// DELETE /api/b2c/quotes/[id]   manager+; never a booked offer
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { notFoundInOrg } from '@/lib/api/org-scope'
import { priceB2cQuote } from '@/lib/b2c/quote-price'
import { itineraryPax, offerCostBase, OFFER_ITINERARY_COLUMNS, pickB2cQuoteUpdates, resolveTravellers } from '@/lib/b2c/quote-updates'
import { bookingsFromQuote, MANAGER_ROLES, quoteLockReason } from '@/lib/quotes/lock'
import { deleteQuote } from '@/lib/quotes/delete-quote'
import { withEffectiveStatus } from '@/lib/quotes/validity'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('b2c_quotes')
      .select('*, itineraries (id, trip_name, itinerary_code, client_name, client_email, client_phone, total_cost)')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
    // locked: 'booked' once a booking was made from it — the page then offers
    // only the notes (the PUT refuses the rest).
    const locked = quoteLockReason(data, await bookingsFromQuote(supabaseAdmin, 'b2c', id))
    return NextResponse.json({ success: true, data: { ...withEffectiveStatus(data), locked } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data: current } = await supabaseAdmin
      .from('b2c_quotes')
      .select('id, itinerary_id, status, valid_until, margin_percent, num_travelers, season_uplift_percent, currency')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!current) return notFoundInOrg('Quote')

    const body = await request.json().catch(() => ({}))
    // Only what a person edits (lib/b2c/quote-updates.ts); the cost, the
    // derived prices, the currency, the number and the authorship are never
    // taken from the body. A booked offer keeps all but its notes.
    const lock = quoteLockReason(current, await bookingsFromQuote(supabaseAdmin, 'b2c', id))
    const picked = pickB2cQuoteUpdates(body, { valid_until: current.valid_until, lock })
    if (!picked.ok) return NextResponse.json({ success: false, error: picked.error }, { status: picked.status })
    const updates: Record<string, unknown> = { ...picked.updates }
    // Changing a margin is manager and above (owner decision, 2026-10-13).
    if (picked.updates.margin_percent !== undefined && !MANAGER_ROLES.includes((await getCurrentUserRole()) ?? '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Changing the margin requires manager role or higher.' }, { status: 403 })
    }

    // Re-price (the margin, or the traveller count, was sent): from the
    // itinerary as it stands now — its supplier cost, its party and its
    // currency — with the offer's season premium, as on create.
    if (body.margin_percent !== undefined || body.num_travelers !== undefined) {
      const { data: itinerary } = await supabaseAdmin
        .from('itineraries')
        .select(OFFER_ITINERARY_COLUMNS)
        .eq('id', current.itinerary_id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
      const party = resolveTravellers(body.num_travelers, itineraryPax(itinerary))
      if ('error' in party) return NextResponse.json({ success: false, error: party.error }, { status: 422 })
      const currency = (itinerary.currency || current.currency || 'EUR').toUpperCase()
      const totalCost = offerCostBase(itinerary)
      const marginPercent = picked.updates.margin_percent ?? (Number(current.margin_percent) || 0)
      Object.assign(updates, { total_cost: totalCost, margin_percent: marginPercent, num_travelers: party.travellers, currency }, priceB2cQuote({
        totalCost,
        marginPercent,
        travelers: party.travellers,
        seasonUpliftPercent: Number(current.season_uplift_percent ?? 0),
        currency,
      }))
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to change: an offer\'s margin, status, notes and valid-until date can be edited.' }, { status: 400 })
    }
    const actor = await getCurrentUserId()
    updates.updated_at = new Date().toISOString()
    updates.last_modified_by = actor

    const { data, error } = await supabaseAdmin
      .from('b2c_quotes')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    try {
      await supabaseAdmin.rpc('create_b2c_quote_revision', {
        p_quote_id: id,
        p_changed_by: actor,
        p_change_reason: typeof body.change_reason === 'string' && body.change_reason ? body.change_reason : 'Quote updated',
      })
    } catch (revErr) {
      console.warn('create_b2c_quote_revision failed (non-fatal):', revErr)
    }

    return NextResponse.json({ success: true, data: withEffectiveStatus(data) })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// Manager and above, and never a booked offer (lib/quotes/delete-quote.ts).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    return await deleteQuote(supabaseAdmin, { kind: 'b2c', orgId, id, role: await getCurrentUserRole() })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
