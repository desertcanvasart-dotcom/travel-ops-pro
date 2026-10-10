// ============================================
// B2C QUOTES API — single offer
// GET    /api/b2c/quotes/[id]
// PUT    /api/b2c/quotes/[id]   (re-prices margin/travelers if supplied; snapshots a revision)
// DELETE /api/b2c/quotes/[id]
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { recordsInOrg } from '@/lib/org-refs'
import { priceB2cQuote } from '@/lib/b2c/quote-price'
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
    return NextResponse.json({ success: true, data })
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
    if (!(await rowInOrg(supabaseAdmin, 'b2c_quotes', id, orgId))) return notFoundInOrg('Quote')

    const body = await request.json()
    // `org_id` is stripped: a caller must not be able to move their quote to
    // another organisation. `changed_by` is IGNORED — the audit actor is the
    // signed-in user, not a client-supplied field (forgeable authorship).
    const { id: _drop, org_id: _dropOrg, change_reason, changed_by: _dropActor, ...updates } = body
    const actor = await getCurrentUserId()

    // A trip or client of another org on the quote put that org's client
    // contact and trip cost in our quote (the GET joins them) and sent our
    // offer to their client.
    if (!(await recordsInOrg(supabaseAdmin, orgId, { itinerary_id: updates.itinerary_id, client_id: updates.client_id }))) {
      return NextResponse.json({ success: false, error: 'Itinerary or client not found' }, { status: 404 })
    }
    // Derived prices are computed here, never taken from the body.
    delete updates.margin_amount
    delete updates.selling_price
    delete updates.price_per_person
    delete updates.season_uplift_amount

    // If margin/travelers/total_cost change, recompute the derived prices so the
    // offer stays internally consistent — season premium included, as on create.
    if (updates.total_cost != null || updates.margin_percent != null || updates.num_travelers != null) {
      const { data: existing } = await supabaseAdmin
        .from('b2c_quotes')
        .select('total_cost, margin_percent, num_travelers, season_uplift_percent, currency')
        .eq('id', id)
        .eq('org_id', orgId)
        .single()
      Object.assign(updates, priceB2cQuote({
        totalCost: Number(updates.total_cost ?? existing?.total_cost ?? 0),
        marginPercent: Number(updates.margin_percent ?? existing?.margin_percent ?? 0),
        travelers: Number(updates.num_travelers ?? existing?.num_travelers ?? 1),
        seasonUpliftPercent: Number(updates.season_uplift_percent ?? existing?.season_uplift_percent ?? 0),
        currency: updates.currency ?? existing?.currency,
      }))
    }

    updates.updated_at = new Date().toISOString()

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
        p_change_reason: change_reason ?? 'Quote updated',
      })
    } catch (revErr) {
      console.warn('create_b2c_quote_revision failed (non-fatal):', revErr)
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('b2c_quotes')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')
    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    if (!data?.length) return notFoundInOrg('Quote')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
