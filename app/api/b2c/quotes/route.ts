// ============================================
// B2C QUOTES API — priced offers over an itinerary
// GET  /api/b2c/quotes              list offers (newest first)
// POST /api/b2c/quotes              create an offer FROM an itinerary
//   body: { itinerary_id, num_travelers?, tier?, margin_percent?, valid_days?,
//           currency?, client_id?, internal_notes?, client_notes? }
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { loadSeasonWindows } from '@/lib/auto-pricing-service'
import { computeUplift, seasonForDate } from '@/lib/pricing/season-uplift'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const itineraryId = searchParams.get('itinerary_id')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    let query = supabaseAdmin
      .from('b2c_quotes')
      .select('*, itineraries (id, trip_name, itinerary_code, client_name, client_email)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status && status !== 'all') query = query.eq('status', status)
    if (itineraryId) query = query.eq('itinerary_id', itineraryId)

    const { data, error } = await query
    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      itinerary_id,
      num_travelers = 2,
      tier = null,
      margin_percent = 25,
      valid_days = 30,
      currency,
      client_id = null,
      internal_notes = null,
      client_notes = null,
      created_by = null,
    } = body

    if (!itinerary_id) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }

    // The itinerary is the source of truth for cost + org + client.
    const { data: itinerary, error: itinErr } = await supabaseAdmin
      .from('itineraries')
      .select('id, org_id, start_date, total_cost, supplier_cost, currency, client_name, client_email')
      .eq('id', itinerary_id)
      .single()

    if (itinErr || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const travelers = Math.max(1, Number(num_travelers) || 1)
    // Margin must be applied to the SUPPLIER cost. itineraries.total_cost is
    // the CLIENT price (margin already included — both generate-itinerary and
    // the editor save write it that way), so margining total_cost here
    // compounded margins (~(1+m)² at equal rates). Fall back to total_cost
    // only for legacy rows that never had supplier_cost populated.
    const totalCost = Number(itinerary.supplier_cost) || Number(itinerary.total_cost) || 0
    const marginPct = Number(margin_percent) || 0
    const marginAmount = totalCost * (marginPct / 100)
    const baseSellingPrice = totalCost + marginAmount

    // The operator's own high dates, on the DEPARTURE — the same calendar and
    // the same rule the B2B paths follow, because a trip leaving in Golden Week
    // is worth what it is worth whoever it is sold to. The org comes from the
    // itinerary rather than the session: a quote belongs to the trip's owner.
    const departureDate: string | null = itinerary.start_date
      ? String(itinerary.start_date).slice(0, 10)
      : null
    const season = seasonForDate(
      await loadSeasonWindows(itinerary.org_id ?? undefined, departureDate ?? undefined),
      departureDate
    )
    const seasonUplift = Math.round(computeUplift({ sellingPrice: baseSellingPrice, season }).amount * 100) / 100
    const sellingPrice = Math.round((baseSellingPrice + seasonUplift) * 100) / 100
    const pricePerPerson = travelers > 0 ? Math.round((sellingPrice / travelers) * 100) / 100 : 0

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (Number(valid_days) || 30))

    const { data: quote, error } = await supabaseAdmin
      .from('b2c_quotes')
      .insert({
        org_id: itinerary.org_id ?? null,
        itinerary_id,
        client_id,
        quote_number: `B2C-${Date.now().toString(36).toUpperCase()}`,
        num_travelers: travelers,
        tier,
        total_cost: totalCost,
        margin_percent: marginPct,
        margin_amount: marginAmount,
        selling_price: sellingPrice,
        price_per_person: pricePerPerson,
        season_name: season?.name ?? null,
        season_uplift_percent: season?.upliftPercent ?? 0,
        season_uplift_amount: seasonUplift,
        currency: currency || itinerary.currency || 'EUR',
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        internal_notes,
        client_notes,
        created_by,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating B2C quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Initial revision snapshot (best-effort).
    try {
      await supabaseAdmin.rpc('create_b2c_quote_revision', {
        p_quote_id: quote.id,
        p_changed_by: created_by ?? null,
        p_change_reason: 'Quote created from itinerary',
      })
    } catch (revErr) {
      console.warn('create_b2c_quote_revision (initial) failed (non-fatal):', revErr)
    }

    return NextResponse.json({ success: true, data: quote })
  } catch (error: any) {
    console.error('Error in POST /api/b2c/quotes:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
