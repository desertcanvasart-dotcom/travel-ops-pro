import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { reassertClientId } from '@/lib/itineraries/reassert-client'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { newTripRow } from '@/lib/itineraries/new-trip'
import { foreignTripRef, TRIP_REF_LABELS } from '@/lib/itineraries/trip-refs'
import { insertItineraryWithCode, itineraryCode } from '@/lib/itineraries/itinerary-code'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'
import { ITINERARY_STATUSES } from '@/lib/itineraries/statuses'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()

    // Fetch itineraries with their language versions
    const { searchParams } = new URL(request.url)
    const includeB2B = searchParams.get('include_b2b') === 'true'

    // Clamp the caller-supplied limit to a sane range so a huge `?limit=` can't
    // be used to extract the whole table / exhaust memory. Default 100, max 1000.
    const requestedLimit = parseInt(searchParams.get('limit') || '100')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 100
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const from = (page - 1) * limit

    // Only the scalar columns the list/picker consumers actually render —
    // deliberately excludes the wide JSONB payloads (parsed data, generation
    // warnings, cabin allocation, ...) that made select('*') expensive here.
    // Two literals, never interpolated (see PR #38). The trip-owner columns are
    // split out because they arrive with migration 20260812: if this deploys
    // before the migration runs, PostgREST rejects the whole select and the
    // itineraries list — the app's main page — goes blank. Falling back to the
    // owner-less shape degrades one column instead of the page.
    const BASE_COLUMNS = 'id, itinerary_code, client_name, client_email, trip_name, start_date, end_date, total_days, num_adults, num_children, total_cost, total_paid, payment_status, currency, status, source, created_at, assigned_guide_id, assigned_vehicle_id'
    const OWNER_COLUMNS = 'id, itinerary_code, client_name, client_email, trip_name, start_date, end_date, total_days, num_adults, num_children, total_cost, total_paid, payment_status, currency, status, source, created_at, assigned_guide_id, assigned_vehicle_id, assigned_to, assignee:team_members!itineraries_assigned_to_fkey(id, name)'

    // ?assignedTo=<team_member_id> for one person's trips, or ?assignedTo=none
    // for the trips nobody owns — the query an ops lead actually wants.
    const assignedTo = searchParams.get('assignedTo')

    // The list page searches and filters on the server, so a search finds a
    // trip that is not among the rows loaded so far, and its status cards
    // count the whole company rather than the loaded page.
    const search = sanitizeSearchTerm(searchParams.get('search'))
    const statusParam = searchParams.get('status')
    const status = statusParam && (ITINERARY_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null
    const withCounts = searchParams.get('counts') === 'true'
    const searchFilter = search
      ? `client_name.ilike.%${search}%,trip_name.ilike.%${search}%,itinerary_code.ilike.%${search}%,client_email.ilike.%${search}%`
      : null

    // The two selects are written out separately rather than parameterised:
    // passing a `string` variable to .select() erases the row type and the
    // downstream .map() calls stop type-checking (the PR #38 regression).
    const withOwners = () => {
      let q = supabase
        .from('itineraries')
        .select(OWNER_COLUMNS, { count: 'exact' })
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1)
      if (!includeB2B) q = q.not('source', 'eq', 'b2b_custom')
      if (assignedTo === 'none') q = q.is('assigned_to', null)
      else if (assignedTo) q = q.eq('assigned_to', assignedTo)
      if (status) q = q.eq('status', status)
      if (searchFilter) q = q.or(searchFilter)
      return q
    }

    const withoutOwners = () => {
      let q = supabase
        .from('itineraries')
        .select(BASE_COLUMNS, { count: 'exact' })
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1)
      if (!includeB2B) q = q.not('source', 'eq', 'b2b_custom')
      if (status) q = q.eq('status', status)
      if (searchFilter) q = q.or(searchFilter)
      return q
    }

    // The two selects return different row shapes, so the result is held in one
    // loose local type — the same shape the .map() below already assumes.
    type ListRow = { id: string; [key: string]: any }
    const primary = await withOwners()
    let itineraries = primary.data as ListRow[] | null
    let count = primary.count
    let error = primary.error as { code?: string; message?: string } | null

    // 42703 = undefined column, PGRST200 = no such relationship. Either means
    // the trip-owner migration has not been applied here.
    if (error && (error.code === '42703' || error.code === 'PGRST200')) {
      console.warn(
        '⚠️ itineraries.assigned_to is absent — migration 20260812 has not been applied. ' +
          'Serving the list without trip owners.'
      )
      if (assignedTo) {
        // The caller explicitly asked to filter by owner and we cannot. Saying
        // so beats silently returning every trip as though it matched.
        return NextResponse.json(
          {
            success: false,
            error:
              'Filtering by trip owner needs migration 20260812_departments_assignees_pnl.sql, which has not been applied to this database.',
          },
          { status: 503 }
        )
      }
      const fallback = await withoutOwners()
      itineraries = fallback.data as ListRow[] | null
      count = fallback.count
      error = fallback.error as { code?: string; message?: string } | null
    }

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    // Fetch available languages for each itinerary
    const itineraryIds = itineraries?.map((i: { id: string }) => i.id) || []

    let versionsMap: Record<string, string[]> = {}

    if (itineraryIds.length > 0) {
      const { data: versions, error: versionsError } = await supabase
        .from('itinerary_versions')
        .select('itinerary_id, language')
        .in('itinerary_id', itineraryIds)

      if (!versionsError && versions) {
        // Group languages by itinerary_id
        versionsMap = versions.reduce((acc: Record<string, string[]>, v: { itinerary_id: string; language: string }) => {
          if (!acc[v.itinerary_id]) {
            acc[v.itinerary_id] = []
          }
          acc[v.itinerary_id].push(v.language)
          return acc
        }, {} as Record<string, string[]>)
      }
    }

    // Add available_languages to each itinerary
    const dataWithLanguages = itineraries?.map((itinerary: { id: string; [key: string]: any }) => ({
      ...itinerary,
      available_languages: versionsMap[itinerary.id] || []
    })) || []

    // ?counts=true: how many of the company's trips are in each status (the
    // list's cards), over every trip the list can show — not this page, and
    // not narrowed by the search or the status filter.
    let statusCounts: Record<string, number> | undefined
    if (withCounts) {
      const countOf = async (st: string | null) => {
        let q = supabase.from('itineraries').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
        if (!includeB2B) q = q.not('source', 'eq', 'b2b_custom')
        if (st) q = q.eq('status', st)
        const { count: n } = await q
        return n ?? 0
      }
      const [total, ...perStatus] = await Promise.all([countOf(null), ...ITINERARY_STATUSES.map(st => countOf(st))])
      statusCounts = { total }
      ITINERARY_STATUSES.forEach((st, i) => { statusCounts![st] = perStatus[i] })
    }

    return NextResponse.json({
      success: true,
      data: dataWithLanguages,
      count: count ?? dataWithLanguages.length,
      page,
      limit,
      ...(statusCounts ? { status_counts: statusCounts } : {}),
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }

    // Only the fields a new trip is made of (never id, payments, FX or
    // status), in the currency the company bills in when none is given.
    const built = newTripRow(body, { orgId, defaultCurrency: await getOrgDefaultCurrency(supabase, orgId) })
    if ('error' in built) return NextResponse.json({ success: false, error: built.error }, { status: 400 })
    const row = built.row

    // The client, programme and destination must be this company's own.
    const foreign = await foreignTripRef(supabase, orgId, {
      client_id: row.client_id,
      template_id: row.template_id,
      destination_id: row.destination_id,
    })
    if (foreign) {
      return NextResponse.json({ success: false, error: `${TRIP_REF_LABELS[foreign]} not found` }, { status: 404 })
    }

    // The code is unique: a clash draws another rather than failing.
    const year = new Date().getFullYear()
    const { data, error } = await insertItineraryWithCode<{ id: string; [key: string]: any }>(supabase, row, () => itineraryCode(year))

    if (error || !data) {
      console.error('Error creating itinerary:', error)
      throw error ?? new Error('The itinerary was not created')
    }

    // The database drops client_id on INSERT (prod-only rewrite, see the
    // helper) — re-assert it so a trip created from a client's page stays
    // on that client's page.
    await reassertClientId(supabase, data, row.client_id as string | null | undefined)

    // Create English version automatically
    const { error: versionError } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: data.id,
        language: 'en',
        trip_name: (row.trip_name as string) || 'Untitled Trip',
        notes: row.notes || null,
        pickup_location: row.pickup_location || null,
        guide_notes: row.guide_notes || null,
        vehicle_notes: row.vehicle_notes || null
      })

    if (versionError) {
      console.warn('Warning: Could not create English version:', versionError)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        available_languages: ['en']
      }
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
