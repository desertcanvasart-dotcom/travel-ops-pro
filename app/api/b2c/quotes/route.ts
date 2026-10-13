// ============================================
// B2C QUOTES API — priced offers over an itinerary
// GET  /api/b2c/quotes              list offers (newest first)
// POST /api/b2c/quotes              create an offer FROM an itinerary
//   body: { itinerary_id, margin_percent?, valid_days?, tier?, client_id?,
//           internal_notes?, client_notes?, vat_applied? } — the party (num_travelers) and
//           the currency are the itinerary's; naming others is refused.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { priceB2cQuote } from '@/lib/b2c/quote-price'
import { clientMessage } from '@/lib/api-errors'
import { loadSeasonWindows } from '@/lib/auto-pricing-service'
import { seasonForDate } from '@/lib/pricing/season-uplift'
import { recordsInOrg } from '@/lib/org-refs'
import { NextRequest, NextResponse } from 'next/server'
import { getOrgDefaultMargin, normaliseMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { MANAGER_ROLES } from '@/lib/quotes/lock'
import { itineraryPax, offerCostBase, OFFER_ITINERARY_COLUMNS, resolveOfferCurrency, resolveTravellers } from '@/lib/b2c/quote-updates'
import { statusFilter, todayIso, withEffectiveStatus } from '@/lib/quotes/validity'
import { getOrgVatRate, parseVatApplied, vatColumns, vatInsertColumns } from '@/lib/vat'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // TENANT BOUNDARY — the service-role client bypasses RLS, so this filter is
    // all that separates one operator's B2C quotes from another's.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const itineraryId = searchParams.get('itinerary_id')
    // Clamp the caller-supplied limit; an unbounded ?limit extracts the whole
    // table and exhausts memory.
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100

    let query = supabaseAdmin
      .from('b2c_quotes')
      .select('*, itineraries (id, trip_name, itinerary_code, client_name, client_email)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // The status as shown: an open offer past its valid-until date reads
    // "Expired" (lib/quotes/validity.ts), and the filter agrees.
    const today = todayIso()
    if (status && status !== 'all') {
      const f = statusFilter(status, today)
      if (f.eq) query = query.eq('status', f.eq)
      for (const expr of f.or) query = query.or(expr)
    }
    if (itineraryId) query = query.eq('itinerary_id', itineraryId)

    const { data, error } = await query
    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    return NextResponse.json({ success: true, data: (data || []).map((q) => withEffectiveStatus(q, today)) })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      itinerary_id,
      num_travelers = null,   // the itinerary's party; another number is refused
      tier = null,
      margin_percent: requestedMargin = null,  // resolved below: request → org default → 25
      valid_days = 30,
      currency: requestedCurrency = null,      // the itinerary's; another is refused
      client_id = null,
      internal_notes = null,
      client_notes = null,
    } = body

    if (!itinerary_id) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }
    // An out-of-range margin is refused, not quietly swapped for the default.
    if (requestedMargin !== null && requestedMargin !== '' && normaliseMargin(requestedMargin) === null) {
      return NextResponse.json({ success: false, error: 'margin_percent must be between 0 and 100' }, { status: 400 })
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // Setting a margin other than the default is manager and above (owner
    // decision, 2026-10-13).
    if (requestedMargin !== null && requestedMargin !== '' && !MANAGER_ROLES.includes((await getCurrentUserRole()) ?? '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Setting the margin requires manager role or higher; leave it empty for the company default.' }, { status: 403 })
    }
    // No margin given: the company's default (Settings), else 25.
    const marginPct = resolveMarginPercent({ requested: requestedMargin, orgDefault: await getOrgDefaultMargin(supabaseAdmin, orgId) })

    // The itinerary is the source of truth for cost + party + currency + org +
    // client — and it is fetched WITHIN the caller's org, so a quote cannot be
    // built against another organisation's trip.
    const { data: itinerary, error: itinErr } = await supabaseAdmin
      .from('itineraries')
      .select(OFFER_ITINERARY_COLUMNS)
      .eq('id', itinerary_id)
      .eq('org_id', orgId)
      .single()

    if (itinErr || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // The client must be this org's: the quote is sent to and booked for them.
    if (!(await recordsInOrg(supabaseAdmin, orgId, { client_id }))) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    // The party and the currency are the itinerary's (lib/b2c/quote-updates).
    const party = resolveTravellers(num_travelers, itineraryPax(itinerary))
    if ('error' in party) return NextResponse.json({ success: false, error: party.error }, { status: 422 })
    const cur = resolveOfferCurrency(requestedCurrency, itinerary.currency)
    if ('error' in cur) return NextResponse.json({ success: false, error: cur.error }, { status: 422 })
    const travelers = party.travellers
    const quoteCurrency = cur.currency
    const totalCost = offerCostBase(itinerary)

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
    // One computation with the re-price on edit (lib/b2c/quote-price), in the
    // quote currency's own units.
    const priced = priceB2cQuote({
      totalCost, marginPercent: marginPct, travelers,
      seasonUpliftPercent: season?.upliftPercent ?? 0, currency: quoteCurrency,
    })

    // VAT on top of the offer's price, when asked (lib/vat.ts): the company's
    // rate today, the amount ours, both recorded on the offer.
    const vat = vatColumns({
      applied: parseVatApplied(body.vat_applied) === true,
      net: priced.selling_price,
      rate: await getOrgVatRate(supabaseAdmin, orgId),
      currency: quoteCurrency,
    })

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (Math.max(1, Math.floor(Number(valid_days) || 30))))
    // Authorship is the signed-in user, never a body field.
    const actor = await getCurrentUserId()

    // quote_number is minted by the database, per company and unique there
    // (migrations/20261211_quote_numbers_per_company.sql).
    const { data: quote, error } = await supabaseAdmin
      .from('b2c_quotes')
      .insert({
        org_id: itinerary.org_id ?? null,
        itinerary_id,
        client_id,
        num_travelers: travelers,
        tier,
        total_cost: totalCost,
        margin_percent: marginPct,
        margin_amount: priced.margin_amount,
        selling_price: priced.selling_price,
        price_per_person: priced.price_per_person,
        season_name: season?.name ?? null,
        season_uplift_percent: season?.upliftPercent ?? 0,
        season_uplift_amount: priced.season_uplift_amount,
        currency: quoteCurrency,
        ...vatInsertColumns(vat),
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        internal_notes,
        client_notes,
        created_by: actor,
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
        p_changed_by: actor,
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
