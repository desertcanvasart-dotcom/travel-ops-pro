import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidStaffToken, STAFF_EVENT_KINDS, type StaffEventKind } from '@/lib/staff-link'
import { sendPushToOrg } from '@/lib/push'

/**
 * The tap. Token-authenticated (no session — the driver has no login), on the
 * middleware self-auth allowlist. The token resolves to exactly one active
 * assignment; everything about the event is derived server-side from that row
 * — org, itinerary, assignment, actor name — so the request body can only say
 * WHAT happened (kind) and WHERE (an optional tap-time lat/lng pair).
 * occurred_at is server time: a checkpoint log takes no client clocks.
 *
 * NOTE: office push notification is added in a follow-up PR (the /ops board +
 * web-push infra); this route records the event only.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Best-effort: resolve the tapping person's team_members id so the event log
 * records WHO, not just a display string. A 'driver' assignment references the
 * directory row directly; other kinds carry a link column when present. Any
 * miss falls back to the actor_name string. Queries defensively (select '*')
 * so a column that only exists in one app can never error the tap.
 */
async function resolveActorId(
  supabase: ReturnType<typeof admin>,
  resource: { resource_type?: string | null; resource_id?: string | null } | null
): Promise<string | null> {
  try {
    const type = resource?.resource_type
    const rid = resource?.resource_id
    if (!type || !rid) return null
    if (type === 'driver') return rid
    if (type === 'vehicle') {
      const { data } = await supabase.from('vehicles').select('*').eq('id', rid).maybeSingle()
      const dd = data?.default_driver_id
      return typeof dd === 'string' ? dd : null
    }
    const table = type === 'guide' ? 'suppliers'
      : type === 'airport_staff' ? 'airport_staff'
      : type === 'hotel_staff' ? 'hotel_staff'
      : null
    if (!table) return null
    const { data } = await supabase.from(table).select('*').eq('id', rid).maybeSingle()
    const tm = data?.team_member_id
    return typeof tm === 'string' ? tm : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidStaffToken(token)) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const supabase = admin()

    const { data: link } = await supabase
      .from('staff_links')
      .select('org_id, itinerary_id, itinerary_resource_id')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const { data: resource } = await supabase
      .from('itinerary_resources')
      .select('id, resource_type, resource_id, resource_name, status')
      .eq('id', link.itinerary_resource_id)
      .maybeSingle()
    if (!resource || resource.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const { event_kind, lat, lng } = body
    if (!STAFF_EVENT_KINDS.includes(event_kind as StaffEventKind)) {
      return NextResponse.json({ success: false, error: 'Invalid event kind' }, { status: 400 })
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

    // A tap-link in the wrong hands must not flood the log: cap the last hour
    // per assignment. 60 checkpoints in an hour is not a trip, it is an incident.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('trip_events')
      .select('id', { count: 'exact', head: true })
      .eq('itinerary_resource_id', link.itinerary_resource_id)
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= 60) {
      return NextResponse.json({ success: false, error: 'Too many events, slow down' }, { status: 429 })
    }

    const { data: event, error: insErr } = await supabase
      .from('trip_events')
      .insert({
        org_id: link.org_id,
        itinerary_id: link.itinerary_id,
        itinerary_resource_id: link.itinerary_resource_id,
        actor_team_member_id: await resolveActorId(supabase, resource),
        event_kind,
        occurred_at: new Date().toISOString(),
        lat: hasLat ? Number(lat) : null,
        lng: hasLat ? Number(lng) : null,
        actor_name: resource.resource_name ?? null,
      })
      .select('event_kind, occurred_at')
      .single()
    if (insErr) {
      console.error('[staff events POST]', insErr.message)
      return NextResponse.json({ success: false, error: 'Failed to record the event' }, { status: 500 })
    }

    // Alert the office — fire-and-forget by contract: the tap is already
    // recorded, and a push failure must never turn into a 500 here.
    const KIND_LABEL: Record<string, string> = {
      departed: 'Departed', en_route: 'En route', arrived: 'Arrived',
      picked_up: 'Picked up', dropped_off: 'Dropped off',
      checked_in: 'Checked in', checked_out: 'Checked out',
      completed: 'Completed', delayed: 'Running late',
    }
    const { data: itin } = await supabase
      .from('itineraries').select('trip_name').eq('id', link.itinerary_id).maybeSingle()
    void sendPushToOrg(link.org_id, {
      title: `${resource.resource_name ?? 'Team member'} — ${KIND_LABEL[event_kind] ?? event_kind}`,
      body: itin?.trip_name ?? 'Trip checkpoint',
      url: '/ops',
      tag: `trip-${link.itinerary_id}`,
    })

    return NextResponse.json({ success: true, event })
  } catch (err) {
    console.error('[staff events POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
