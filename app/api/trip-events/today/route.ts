import { NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

/**
 * The ops-board seed: every trip ON THE GROUND today (start_date <= today <=
 * end_date, not cancelled), with its latest checkpoint. One call, one board —
 * the office sees all running tours at a glance. orgAuth's client is service-
 * role, so every query is explicitly scoped by org_id.
 *
 * NOTE: the unread-traveller-message badge is a follow-up (it bridges this
 * app's portal_messages) — this route returns trips + latest checkpoint only.
 */
export async function GET() {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, org_id } = auth

    const today = new Date().toISOString().slice(0, 10)
    const { data: trips, error: tripsErr } = await supabase
      .from('itineraries')
      .select('id, trip_name, client_name, start_date, end_date, status')
      .eq('org_id', org_id)
      .lte('start_date', today)
      .gte('end_date', today)
      .neq('status', 'cancelled')
      .is('cancelled_at', null)
      .order('start_date', { ascending: true })
      .limit(50)
    if (tripsErr) {
      console.error('[trip-events today]', tripsErr.message)
      return NextResponse.json({ success: false, error: 'Failed to load trips' }, { status: 500 })
    }
    if (!trips || trips.length === 0) {
      return NextResponse.json({ success: true, trips: [] })
    }

    const { data: events, error: evErr } = await supabase
      .from('trip_events')
      .select('itinerary_id, event_kind, occurred_at, actor_name, lat, lng')
      .eq('org_id', org_id)
      .in('itinerary_id', trips.map(t => t.id))
      .order('occurred_at', { ascending: false })
      .limit(200)
    if (evErr) {
      console.error('[trip-events today]', evErr.message)
      return NextResponse.json({ success: false, error: 'Failed to load events' }, { status: 500 })
    }

    const latest = new Map<string, NonNullable<typeof events>[number]>()
    for (const e of events ?? []) {
      if (!latest.has(e.itinerary_id)) latest.set(e.itinerary_id, e)
    }

    return NextResponse.json({
      success: true,
      trips: trips.map(t => ({ ...t, latest_event: latest.get(t.id) ?? null })),
    })
  } catch (err) {
    console.error('[trip-events today]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
