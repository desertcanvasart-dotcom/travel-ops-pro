import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/clients?userId=xxx&search=xxx&limit=100&page=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = sanitizeSearchTerm(searchParams.get('search'))
    // Clamp the caller-supplied limit to a sane range so a huge `?limit=` can't
    // be used to extract the whole table / exhaust memory. Default 50, max 200.
    // Callers that need the full set walk `?page=` (lib/fetch-all-pages.ts).
    const requestedLimit = parseInt(searchParams.get('limit') || '50')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const from = (page - 1) * limit

    // TENANT BOUNDARY. This route runs on the service-role client, which bypasses
    // RLS, so this filter is the only thing separating one operator's customer
    // list from another's — and until clients.org_id existed there was nothing
    // to filter on at all (see migrations/20260825_clients_org_id.sql).
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone, status, nationality, preferred_language, internal_notes')
      .eq('org_id', orgId)
      // Secondary sort on id keeps page boundaries stable when names tie.
      .order('first_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + limit - 1)

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: clients, error } = await query

    if (error) {
      throw error
    }

    // Transform to include combined name field
    const transformedClients = (clients || []).map(client => ({
      id: client.id,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      email: client.email,
      phone: client.phone,
      status: client.status,
      nationality: client.nationality,
      preferred_language: client.preferred_language,
      internal_notes: client.internal_notes
    }))

    return NextResponse.json({ clients: transformedClients })

  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST /api/clients - Create new client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.first_name) {
      return NextResponse.json(
        { success: false, error: 'First name is required' },
        { status: 400 }
      )
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Create client
    const clientData = {
      preferred_accommodation_level: body.preferences?.accommodation_type || null,
      special_interests: body.preferences?.interests || null,
      accessibility_needs: body.preferences?.special_needs || null,
      org_id: orgId,
      first_name: body.first_name,
      last_name: body.last_name || body.first_name,
      email: body.email || null,
      phone: body.phone || null,
      nationality: body.nationality || 'Unknown',
      status: body.status || 'prospect',
      client_type: body.client_type || 'individual',
      passport_type: body.passport_type || 'other',
      preferred_language: body.preferred_language || 'English',
      client_source: body.client_source || 'whatsapp',
      vip_status: body.vip_status || false
    }

    console.log('📝 Creating client:', clientData)

    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single()

    if (clientError) {
      console.error('❌ Client insert error:', clientError)
      return NextResponse.json(
        { success: false, error: clientMessage(clientError, 'Internal server error') },
        { status: 500 }
      )
    }

    console.log('✅ Client created:', newClient.id)

    // ============================================
    // Optional companion records
    // ============================================
    // Each of these was wrapped in try/catch and awaited without ever reading
    // the result. supabase-js REPORTS a failed write by resolving with `{error}`
    // — it does not throw — so the catch could never fire, every one of them
    // logged "✅ saved" unconditionally, and the route returned 201 for a client
    // whose preferences, notes and WhatsApp link had all silently gone nowhere.
    // The error is read now, and what actually failed is reported to the caller.
    const failures: string[] = []

    const attempt = async (label: string, run: () => PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await run()
        if (error) {
          console.error(`❌ Could not save ${label}:`, error)
          failures.push(label)
          return
        }
        console.log(`✅ ${label} saved`)
      } catch (e) {
        console.error(`❌ Could not save ${label}:`, e)
        failures.push(label)
      }
    }

    if (body.preferences) {
      await attempt('preferences', () =>
        supabase
          .from('client_preferences')
          // Every column here previously named fields the table does not have
          // (preferred_accommodation_type, tour_pace_preference, interests,
          // special_needs, preferred_tier) — the insert 400'd on every client
          // created with preferences, silently, since the wizard shipped.
          // Mapped onto the columns that exist; accommodation level, interests
          // and accessibility needs live on the clients row itself (below).
          .insert({
            client_id: newClient.id,
            preferred_activities: body.preferences.interests || null,
            health_considerations: body.preferences.special_needs || null,
            typical_budget_range: body.preferences.tier || 'standard'
          })
      )
    }

    if (body.note) {
      await attempt('note', () =>
        supabase
          .from('client_notes')
          .insert({
            client_id: newClient.id,
            // note_text/is_internal are not columns; content is.
            content: body.note,
            note_type: 'general'
          })
      )
    }

    if (body.link_whatsapp_phone) {
      await attempt('whatsapp_link', () =>
        supabase
          .from('whatsapp_conversations')
          .update({
            client_id: newClient.id,
            client_name: `${clientData.first_name} ${clientData.last_name}`.trim()
          })
          .eq('phone_number', body.link_whatsapp_phone)
      )
    }

    // The client itself was created, so this is still a 201 — but a caller that
    // sent notes and got back "success" with no mention of them would have no
    // way to know they were lost.
    return NextResponse.json({
      success: true,
      data: newClient,
      ...(failures.length
        ? { partial: true, failed_to_save: failures }
        : {}),
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to create client') },
      { status: 500 }
    )
  }
}