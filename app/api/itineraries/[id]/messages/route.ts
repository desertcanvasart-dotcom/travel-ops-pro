import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { cleanClientText } from '@/lib/itinerary-share'

/**
 * The trip thread, office side. GET returns the thread; PATCH marks the
 * traveller's messages read (fired when someone actually has the thread in
 * view, not on load); POST replies as the office. orgAuth's client is
 * service-role, so every query is scoped to the caller's org here, and the
 * direction is pinned to 'outbound' in code (the RLS insert policy pins it
 * for any session client too) — this route cannot forge a traveller message.
 * Ported from autoura-saas.
 */

const MAX_MESSAGE = 2000

async function auth(id: string) {
  const a = await orgAuth()
  if (a.error || !a.supabase || !a.org_id) {
    return { response: NextResponse.json({ success: false, error: a.error ?? 'Unauthorized' }, { status: a.status }) }
  }
  const { data: itinerary } = await a.supabase
    .from('itineraries').select('id').eq('id', id).eq('org_id', a.org_id).maybeSingle()
  if (!itinerary) return { response: NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 }) }
  return { supabase: a.supabase, orgId: a.org_id, user: a.user }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await auth(id)
    if ('response' in a) return a.response
    // The NEWEST 200, shown oldest first: an oldest-first limit would hide
    // new traveller messages once a thread outgrew the window.
    const { data: rows, error } = await a.supabase
      .from('trip_messages')
      .select('id, direction, content, sender_name, is_read, notify_outcome, created_at')
      .eq('itinerary_id', id)
      .eq('org_id', a.orgId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      console.error('[itinerary messages GET]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to load messages' }, { status: 500 })
    }
    return NextResponse.json({ success: true, messages: (rows ?? []).reverse() })
  } catch (err) {
    console.error('[itinerary messages GET]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await auth(id)
    if ('response' in a) return a.response
    const { error } = await a.supabase
      .from('trip_messages')
      .update({ is_read: true })
      .eq('itinerary_id', id)
      .eq('org_id', a.orgId)
      .eq('direction', 'inbound')
      .eq('is_read', false)
    if (error) {
      console.error('[itinerary messages PATCH]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to mark read' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[itinerary messages PATCH]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await auth(id)
    if ('response' in a) return a.response

    const body = await request.json().catch(() => null)
    const content = cleanClientText((body ?? {})?.message, MAX_MESSAGE)
    if (!content) return NextResponse.json({ success: false, error: 'Please write a message.' }, { status: 400 })

    // Who is speaking, by name — the traveller sees it on the share page.
    let teamMemberId: string | null = null
    let senderName: string | null = null
    if (a.user?.id) {
      try {
        const { data: me } = await a.supabase
          .from('team_members').select('id, name').eq('user_id', a.user.id).maybeSingle()
        teamMemberId = me?.id ?? null
        senderName = me?.name ?? null
      } catch { /* no directory row — the reply goes out unsigned */ }
    }

    const { data: inserted, error } = await a.supabase
      .from('trip_messages')
      .insert({
        org_id: a.orgId,
        itinerary_id: id,
        direction: 'outbound',
        content,
        sender_name: senderName,
        team_member_id: teamMemberId,
        is_read: true,
      })
      .select('id, direction, content, sender_name, is_read, notify_outcome, created_at')
      .single()
    if (error) {
      console.error('[itinerary messages POST]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to send' }, { status: 500 })
    }
    return NextResponse.json({ success: true, message: inserted })
  } catch (err) {
    console.error('[itinerary messages POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
