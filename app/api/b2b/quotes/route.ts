import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { clientMessage } from '@/lib/api-errors'
import { quoteRefsInOrg, quoteRefNotFound } from '@/lib/b2b/quote-scope'
import { enginePricingRequest, quoteColumnsFromEngine, priceMoved } from '@/lib/b2b/quote-pricing'
import { updateB2bQuote } from '@/lib/b2b/update-quote'
import { deleteQuote } from '@/lib/quotes/delete-quote'
import { statusFilter, todayIso, withEffectiveStatus } from '@/lib/quotes/validity'
import { normaliseMargin } from '@/lib/org-default-margin'
import { formatMoney } from '@/lib/currency-totals'
import { POST as priceWithEngine } from '@/app/api/b2b/calculate-price/route'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B QUOTES API
// File: app/api/b2b/quotes/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // TENANT BOUNDARY. Every read below runs on the service-role client, so
    // this filter is the only thing separating one operator's B2B quotes —
    // partner margins, net rates, customer contacts — from another's.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const partner_id = searchParams.get('partner_id')
    const status = searchParams.get('status')
    // Clamp: an unbounded ?limit extracts the whole table / exhausts memory.
    const rawLimit = parseInt(searchParams.get('limit') || '50')
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50

    // Get single quote by ID
    if (id) {
      const { data: firstTry, error } = await supabaseAdmin
        .from('tour_quotes')
        .select(`
          *,
          tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code, duration_days)),
          b2b_partners (company_name, partner_code, contact_name, email),
          itineraries (id, trip_name, itinerary_code, total_days, tier, start_date, end_date)
        `)
        .eq('id', id)
        .eq('org_id', orgId)
        .single()
      let data = firstTry

      // Fallback without itineraries join if schema cache is stale
      if (error) {
        const fallback = await supabaseAdmin
          .from('tour_quotes')
          .select(`
            *,
            tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code, duration_days)),
            b2b_partners (company_name, partner_code, contact_name, email)
          `)
          .eq('id', id)
          .eq('org_id', orgId)
          .single()
        if (fallback.error) throw fallback.error
        data = { ...fallback.data, itineraries: null }
      }

      // Fetch language versions
      const { data: versions, error: versionsError } = await supabaseAdmin
        .from('quote_versions')
        .select('*')
        .eq('quote_id', id)

      // Build versions object keyed by language
      const versionsMap: Record<string, any> = {}
      if (!versionsError && versions) {
        versions.forEach(v => {
          versionsMap[v.language] = v
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          ...withEffectiveStatus(data),
          available_languages: Object.keys(versionsMap),
          versions: versionsMap
        }
      })
    }

    // List quotes
    let query = supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code)),
        b2b_partners (company_name, partner_code),
        itineraries (trip_name, itinerary_code, total_days, tier)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // The dropdown filters on the status as shown: an open offer past its
    // valid-until date is "Expired" (lib/quotes/validity.ts).
    const today = todayIso()
    const byStatus = <Q extends { eq: (c: string, v: string) => Q; or: (e: string) => Q }>(q: Q): Q => {
      if (!status || status === 'all') return q
      const f = statusFilter(status, today)
      let out = f.eq ? q.eq('status', f.eq) : q
      for (const expr of f.or) out = out.or(expr)
      return out
    }
    if (partner_id) query = query.eq('partner_id', partner_id)
    query = byStatus(query)

    const { data: firstTry, error } = await query
    let data = firstTry

    // Fallback without itineraries join if schema cache is stale
    if (error) {
      let fallbackQuery = supabaseAdmin
        .from('tour_quotes')
        .select(`
          *,
          tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code)),
          b2b_partners (company_name, partner_code)
        `)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (partner_id) fallbackQuery = fallbackQuery.eq('partner_id', partner_id)
      fallbackQuery = byStatus(fallbackQuery)

      const fallback = await fallbackQuery
      if (fallback.error) throw fallback.error
      data = (fallback.data || []).map(q => ({ ...q, itineraries: null }))
    }

    // Fetch language versions for all quotes
    const quoteIds = (data || []).map(q => q.id)
    let versionsMap: Record<string, string[]> = {}

    if (quoteIds.length > 0) {
      const { data: versions, error: versionsError } = await supabaseAdmin
        .from('quote_versions')
        .select('quote_id, language')
        .in('quote_id', quoteIds)

      if (!versionsError && versions) {
        versionsMap = versions.reduce((acc, v) => {
          if (!acc[v.quote_id]) {
            acc[v.quote_id] = []
          }
          acc[v.quote_id].push(v.language)
          return acc
        }, {} as Record<string, string[]>)
      }
    }

    // Attach available_languages to each quote
    const quotesWithLanguages = (data || []).map(quote => ({
      ...withEffectiveStatus(quote, today),
      available_languages: versionsMap[quote.id] || []
    }))

    // The stat tiles: the company's whole book, whatever page or filter is
    // showing. They were counted over the 100 rows loaded, after the status
    // filter — so with "Sent" chosen the Draft tile read 0.
    const count = async (s?: string) => {
      let q = supabaseAdmin.from('tour_quotes').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
      if (s) {
        const f = statusFilter(s, today)
        if (f.eq) q = q.eq('status', f.eq)
        for (const expr of f.or) q = q.or(expr)
      }
      const { count: n } = await q
      return n ?? 0
    }
    const [total, draft, sent, accepted, expired, converted] = await Promise.all([
      count(), count('draft'), count('sent'), count('accepted'), count('expired'), count('converted'),
    ])

    return NextResponse.json({ success: true, data: quotesWithLanguages, counts: { total, draft, sent, accepted, expired, converted } })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      variation_id,
      itinerary_id,
      partner_id,
      client_name,
      client_email,
      client_phone,
      client_nationality,
      travel_date,
      num_adults = 2,
      num_children = 0,
      tour_leader_included = false,
      // Which guide model priced this quote (migration 20260904_guide_mode_on
      // _quotes). Stored only when non-default, so NULL always reads as the
      // defaults and an unmigrated database still saves.
      guide_grade,
      guide_mode,
      is_eur_passport = true,
      valid_days = 30,
      notes,
    } = body

    // A quote from a trip is priced from that trip by
    // /api/b2b/quote-from-itinerary. This route prices from a tour variation
    // and its rates; nothing in the app posts a trip here.
    if (!variation_id) {
      return NextResponse.json({ success: false, error: 'variation_id is required (a quote from an itinerary is made with /api/b2b/quote-from-itinerary)' }, { status: 400 })
    }
    if (body.margin_percent !== undefined && body.margin_percent !== null && normaliseMargin(body.margin_percent) === null) {
      return NextResponse.json({ success: false, error: 'margin_percent must be between 0 and 100' }, { status: 400 })
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await quoteRefsInOrg(supabaseAdmin, orgId, { itinerary_id, partner_id, variation_id }))) return quoteRefNotFound()

    // The price is the server's: the same engine the calculator ran, on the
    // inputs it ran with (lib/b2b/quote-pricing.ts). Prices in the body are
    // never stored; the one the operator was shown is only compared.
    const engine = await priceWithEngine(new NextRequest(new URL('/api/b2b/calculate-price', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enginePricingRequest(body)),
    }))
    const priced = await engine.json().catch(() => null)
    if (!engine.ok || !priced?.success || !priced.data) {
      return NextResponse.json({ success: false, error: priced?.error || 'The quote could not be priced' }, { status: engine.ok ? 422 : engine.status })
    }
    const price = quoteColumnsFromEngine(priced.data)
    const currency = price.currency || await getOrgRateCurrency(supabaseAdmin, orgId)
    if (!(price.selling_price > 0)) {
      return NextResponse.json({ success: false, error: 'The quote priced at nothing; check the programme\'s rates in the calculator.' }, { status: 422 })
    }
    if (priceMoved(body.selling_price, price.selling_price, currency)) {
      return NextResponse.json({
        success: false,
        error: `The price has changed since it was calculated (now ${formatMoney(price.selling_price, currency)}). Calculate again, then save.`,
        selling_price: price.selling_price,
      }, { status: 409 })
    }

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (Math.max(1, Math.floor(Number(valid_days) || 30))))
    // Authorship is the signed-in user, never a body field.
    const actor = await getCurrentUserId()

    // quote_number is minted by the database, per company
    // (migrations/20261211_quote_numbers_per_company.sql).
    const { data: quote, error } = await supabaseAdmin
      .from('tour_quotes')
      .insert({
        org_id: orgId,
        variation_id,
        trip_name: body.trip_name || null,
        source: 'b2b_template',
        partner_id: partner_id || null,
        client_name: client_name || null,
        client_email: client_email || null,
        client_phone: client_phone || null,
        client_nationality: client_nationality || null,
        travel_date: travel_date || null,
        num_adults,
        num_children,
        ...price,
        currency,
        tour_leader_included: tour_leader_included === true,
        ...(guide_grade === 'senior' ? { guide_grade } : {}),
        ...(guide_mode === 'throughout' ? { guide_mode } : {}),
        is_eur_passport: is_eur_passport !== false,
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        notes: notes || null,
        created_by: actor,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Auto-create English version
    if (quote) {
      const { error: versionError } = await supabaseAdmin
        .from('quote_versions')
        .insert({
          quote_id: quote.id,
          language: 'en',
          title: `Quote ${quote.quote_number}`,
          notes: notes || null
        })

      if (versionError) {
        console.warn('Warning: Could not create English version:', versionError)
      }

      // Initial revision snapshot (best-effort — never blocks creation).
      try {
        await supabaseAdmin.rpc('create_quote_revision', {
          p_quote_id: quote.id,
          p_changed_by: actor,
          p_change_reason: 'Quote created',
        })
      } catch (revErr) {
        console.warn('create_quote_revision (initial) failed (non-fatal):', revErr)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...quote,
        available_languages: ['en']
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/b2b/quotes:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT { id, …fields } — the same edit as PUT /api/b2b/quotes/[id], with the
// same rules (lib/b2b/update-quote.ts). It used to write any column given.
export async function PUT(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    if (!body?.id || typeof body.id !== 'string') {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }
    const result = await updateB2bQuote(supabaseAdmin, { orgId, id: body.id, body, actor: await getCurrentUserId() })
    return NextResponse.json(result.body, { status: result.status })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
  }

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // Manager and above, and never a converted or booked quote (lib/quotes/delete-quote.ts).
    return await deleteQuote(supabaseAdmin, { kind: 'b2b', orgId, id, role: await getCurrentUserRole() })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
