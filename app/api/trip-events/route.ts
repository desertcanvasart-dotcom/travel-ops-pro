import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

// ============================================
// TRIP EVENTS — the checkpoint log (execution layer)
// ============================================
// POST records "picked up at CAI 14:32"; GET lists a trip's timeline for the
// office. The table is append-only for authenticated users (no update/delete
// policies), so there is deliberately no PUT/DELETE — corrections are new
// events. orgAuth's client is service-role, so queries are explicitly org-scoped.

const EVENT_KINDS = [
  'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
  'checked_in', 'checked_out', 'completed', 'delayed', 'note',
] as const
type EventKind = (typeof EVENT_KINDS)[number]

export async function POST(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, org_id, user } = auth

    const body = await request.json()
    const { itinerary_id, event_kind, itinerary_resource_id, lat, lng, note, actor_name, occurred_at } = body

    if (!itinerary_id || !event_kind) {
      return NextResponse.json({ success: false, error: 'itinerary_id and event_kind are required' }, { status: 400 })
    }
    if (!EVENT_KINDS.includes(event_kind as EventKind)) {
      return NextResponse.json(
        { success: false, error: `event_kind must be one of: ${EVENT_KINDS.join(', ')}` },
        { status: 400 }
      )
    }
    const hasLat = lat !== undefined && lat !== null
    const hasLng = lng !== undefined && lng !== null
    if (hasLat !== hasLng) {
      return NextResponse.json({ success: false, error: 'lat and lng must be provided together' }, { status: 400 })
    }
    if (hasLat && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))
        || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) {
      return NextResponse.json({ success: false, error: 'lat/lng out of range' }, { status: 400 })
    }

    // The itinerary must be the caller's own org.
    const { data: itin } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', itinerary_id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (!itin) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // If the event names an assignment, it must belong to this itinerary.
    if (itinerary_resource_id) {
      const { data: res } = await supabase
        .from('itinerary_resources')
        .select('id')
        .eq('id', itinerary_resource_id)
        .eq('itinerary_id', itinerary_id)
        .maybeSingle()
      if (!res) {
        return NextResponse.json(
          { success: false, error: 'itinerary_resource_id does not belong to this itinerary' },
          { status: 400 }
        )
      }
    }

    // Best-effort: the session user's directory row, so the log records WHO.
    let actorTeamMemberId: string | null = null
    try {
      const { data: me } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      actorTeamMemberId = me?.id ?? null
    } catch { /* team_members shape differs — fall back to actor_name */ }

    const { data: event, error: insertErr } = await supabase
      .from('trip_events')
      .insert({
        org_id,
        itinerary_id,
        actor_team_member_id: actorTeamMemberId,
        itinerary_resource_id: itinerary_resource_id || null,
        event_kind,
        occurred_at: occurred_at || new Date().toISOString(),
        lat: hasLat ? Number(lat) : null,
        lng: hasLat ? Number(lng) : null,
        note: note || null,
        actor_name: actor_name || null,
      })
      .select('id, event_kind, occurred_at')
      .single()
    if (insertErr) {
      console.error('[trip-events POST]', insertErr.message)
      return NextResponse.json({ success: false, error: 'Failed to record the event' }, { status: 500 })
    }
    return NextResponse.json({ success: true, event })
  } catch (err) {
    console.error('[trip-events POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
    }
    const itineraryId = request.nextUrl.searchParams.get('itinerary_id')
    if (!itineraryId) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }
    const { data: events, error } = await auth.supabase
      .from('trip_events')
      .select('id, event_kind, occurred_at, actor_name, lat, lng, note, itinerary_resource_id')
      .eq('org_id', auth.org_id)
      .eq('itinerary_id', itineraryId)
      .order('occurred_at', { ascending: false })
      .limit(200)
    if (error) {
      console.error('[trip-events GET]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to load events' }, { status: 500 })
    }
    return NextResponse.json({ success: true, events: events ?? [] })
  } catch (err) {
    console.error('[trip-events GET]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
