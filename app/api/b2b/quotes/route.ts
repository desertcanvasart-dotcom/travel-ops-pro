import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
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
      let { data, error } = await supabaseAdmin
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
          ...data,
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

    if (partner_id) query = query.eq('partner_id', partner_id)
    if (status) query = query.eq('status', status)

    let { data, error } = await query

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
      if (status) fallbackQuery = fallbackQuery.eq('status', status)

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
      ...quote,
      available_languages: versionsMap[quote.id] || []
    }))

    return NextResponse.json({ success: true, data: quotesWithLanguages })

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
      trip_name,
      partner_id,
      client_name,
      client_email,
      client_phone,
      client_nationality,
      travel_date,
      num_adults = 2,
      num_children = 0,
      // Pre-calculated pricing from UI
      services_snapshot,
      total_cost,
      margin_percent,
      margin_amount,
      selling_price,
      price_per_person,
      // New fields
      tour_leader_included = false,
      tour_leader_cost,
      single_supplement,
      is_eur_passport = true,
      season,
      // Other
      currency = 'EUR',
      valid_days = 30,
      notes,
      created_by
    } = body

    if (!variation_id && !itinerary_id) {
      return NextResponse.json({ success: false, error: 'variation_id or itinerary_id is required' }, { status: 400 })
    }

    if (!total_cost || !selling_price) {
      return NextResponse.json({ success: false, error: 'Pricing data is required' }, { status: 400 })
    }

    // Calculate valid_until date
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + valid_days)

    // Insert quote - quote_number is auto-generated by trigger
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data: quote, error } = await supabaseAdmin
      .from('tour_quotes')
      .insert({
        org_id: orgId,
        variation_id: variation_id || null,
        itinerary_id: itinerary_id || null,
        trip_name: trip_name || null,
        source: itinerary_id ? 'whatsapp_b2b' : 'b2b_template',
        partner_id: partner_id || null,
        client_name,
        client_email,
        client_phone,
        client_nationality,
        travel_date,
        num_adults,
        num_children,
        services_snapshot,
        total_cost,
        margin_percent,
        margin_amount,
        selling_price,
        price_per_person,
        currency,
        tour_leader_included,
        tour_leader_cost,
        single_supplement,
        is_eur_passport,
        season,
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        notes,
        created_by
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
          p_changed_by: created_by ?? null,
          p_change_reason: 'Quote created',
        })
      } catch (revErr) {
        console.warn('create_quote_revision (initial) failed (non-fatal):', revErr)
      }
    }

    console.log('✅ Quote created:', quote.quote_number)
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

export async function PUT(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { id, org_id: _ignored, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })

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

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')

    if (error) throw error
    if (!data?.length) return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}