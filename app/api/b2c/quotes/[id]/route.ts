// ============================================
// B2C QUOTES API — single offer
// GET    /api/b2c/quotes/[id]
// PUT    /api/b2c/quotes/[id]   (re-prices margin/travelers if supplied; snapshots a revision)
// DELETE /api/b2c/quotes/[id]
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
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
    const { data, error } = await supabaseAdmin
      .from('b2c_quotes')
      .select('*, itineraries (id, trip_name, itinerary_code, client_name, client_email, total_cost)')
      .eq('id', id)
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
    const body = await request.json()
    const { id: _drop, change_reason, changed_by, ...updates } = body

    // If margin/travelers/total_cost change, recompute the derived prices so the
    // offer stays internally consistent.
    if (updates.total_cost != null || updates.margin_percent != null || updates.num_travelers != null) {
      const { data: existing } = await supabaseAdmin
        .from('b2c_quotes')
        .select('total_cost, margin_percent, num_travelers')
        .eq('id', id)
        .single()
      const totalCost = Number(updates.total_cost ?? existing?.total_cost ?? 0)
      const marginPct = Number(updates.margin_percent ?? existing?.margin_percent ?? 0)
      const travelers = Math.max(1, Number(updates.num_travelers ?? existing?.num_travelers ?? 1))
      const marginAmount = totalCost * (marginPct / 100)
      const sellingPrice = totalCost + marginAmount
      updates.margin_amount = marginAmount
      updates.selling_price = sellingPrice
      updates.price_per_person = sellingPrice / travelers
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('b2c_quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    try {
      await supabaseAdmin.rpc('create_b2c_quote_revision', {
        p_quote_id: id,
        p_changed_by: changed_by ?? null,
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
    const { error } = await supabaseAdmin.from('b2c_quotes').delete().eq('id', id)
    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
