import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { pickClientFields } from '@/lib/clients/fields'
import { findClientByEmail } from '@/lib/clients/duplicates'
import { applyClientFilters, applyClientSort, parseClientListParams } from '@/lib/clients/list'
import { actorLabel } from '@/lib/clients/scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// What a list row carries. The money is per currency (revenue_by_currency =
// invoiced, collected_by_currency = paid); total_revenue_generated is only the
// client's largest single-currency figure, kept for sorting.
const LIST_COLUMNS = 'id, client_code, first_name, last_name, email, phone, status, nationality, preferred_language, internal_notes, client_type, vip_status, lead_source, total_bookings_count, total_revenue_generated, revenue_by_currency, collected_by_currency, last_contacted_at, created_at'

// GET /api/clients?search=&status=&client_type=&lead_source=&vip=1&date_from=&date_to=&sort=&page=&limit=
//
// One page of the active company's clients plus the exact number that match
// (`total`), so a screen can say "21–40 of 312" and page to the end. The
// filters, the order and the page are decided in lib/clients/list; the limit
// is clamped there (default 50, max 200) so a huge `?limit=` can't be used to
// pull the whole table. Callers that need every row walk `?page=`
// (lib/fetch-all-pages.ts).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = parseClientListParams(searchParams)
    const from = (params.page - 1) * params.limit

    // TENANT BOUNDARY. This route runs on the service-role client, which bypasses
    // RLS, so this filter is the only thing separating one operator's customer
    // list from another's — and until clients.org_id existed there was nothing
    // to filter on at all (see migrations/20260825_clients_org_id.sql).
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const base = supabase.from('clients').select(LIST_COLUMNS, { count: 'exact' }).eq('org_id', orgId)
    const { data: clients, error, count } = await applyClientSort(applyClientFilters(base, params), params.sort)
      .range(from, from + params.limit - 1)

    // A page past the last one: PostgREST refuses the range (PGRST103). That is
    // an empty page, with the real count.
    if (error && error.code === 'PGRST103') {
      const { count: total } = await applyClientFilters(
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId), params)
      return NextResponse.json({ clients: [], total: total ?? 0, page: params.page, limit: params.limit })
    }
    if (error) {
      throw error
    }

    // Transform to include combined name field
    const transformedClients = ((clients || []) as unknown as Array<Record<string, any>>).map(client => ({
      ...client,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
    }))

    return NextResponse.json({
      clients: transformedClients,
      total: count ?? transformedClients.length,
      page: params.page,
      limit: params.limit,
    })

  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

/** "a, b" or ["a", "b"] as the list a text[] column wants. */
function toList(value: unknown): string[] | null {
  const list = Array.isArray(value)
    ? value.map(v => String(v).trim())
    : typeof value === 'string' ? value.split(',').map(v => v.trim()) : []
  const clean = list.filter(Boolean)
  return clean.length ? clean : null
}

// POST /api/clients - Create new client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // The columns the forms write, cleaned (a blank is NULL, not ''). A first
    // name is required; there is no stand-in for a missing last name.
    const picked = pickClientFields(body, 'create')
    if (!picked.ok) {
      return NextResponse.json({ success: false, error: picked.error }, { status: 400 })
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The same address, in the same company, in any capitalisation, is the same
    // person. Nothing is merged: the caller is told who already holds it and
    // may create the second record anyway (allow_duplicate).
    const email = picked.data.email as string | null | undefined
    if (email && body.allow_duplicate !== true) {
      const existing = await findClientByEmail(supabase, orgId, email)
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            code: 'duplicate_email',
            error: `A client with this email already exists: ${existing.name} (${existing.client_code}).`,
            existing,
          },
          { status: 409 }
        )
      }
    }

    // Create client
    const clientData = {
      ...picked.data,
      org_id: orgId,
      preferred_accommodation_level: picked.data.preferred_accommodation_level ?? body.preferences?.accommodation_type ?? null,
      special_interests: picked.data.special_interests ?? toList(body.preferences?.interests),
      accessibility_needs: picked.data.accessibility_needs ?? toList(body.preferences?.special_needs),
      // Callers that send nothing (a WhatsApp lead, a web order) get these
      // defaults; a form that sends a blank gets NULL.
      nationality: 'nationality' in picked.data ? picked.data.nationality : 'Unknown',
      status: picked.data.status ?? 'prospect',
      client_type: picked.data.client_type ?? 'individual',
      passport_type: 'passport_type' in picked.data ? picked.data.passport_type : 'other',
      preferred_language: 'preferred_language' in picked.data ? picked.data.preferred_language : 'English',
      client_source: picked.data.client_source ?? (picked.data.lead_source ? null : 'whatsapp'),
    }

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
            preferred_activities: toList(body.preferences.interests),
            health_considerations: body.preferences.special_needs || null,
            typical_budget_range: body.preferences.tier || 'standard'
          })
      )
    }

    if (body.note) {
      const author = await actorLabel(supabase, await getCurrentUserId())
      await attempt('note', () =>
        supabase
          .from('client_notes')
          .insert({
            client_id: newClient.id,
            // note_text/is_internal are not columns; content is.
            content: body.note,
            note_type: 'general',
            created_by: author,
          })
      )
    }

    if (body.link_whatsapp_phone) {
      await attempt('whatsapp_link', () =>
        supabase
          .from('whatsapp_conversations')
          .update({
            client_id: newClient.id,
            client_name: `${newClient.first_name} ${newClient.last_name}`.trim()
          })
          // The org's own thread with that number — the same customer may also
          // be writing to another org, whose thread is not ours to relabel.
          .eq('org_id', orgId)
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
