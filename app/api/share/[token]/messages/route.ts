import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidShareToken, toClientTripMessages, cleanClientText } from '@/lib/itinerary-share'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { notifyTripMessage } from '@/lib/trip-message-notify'

/**
 * The trip thread, traveller side. The unrevoked share token IS the
 * credential (middleware self-auth allowlist, like the share page itself):
 * GET returns the thread through the toClientTripMessages allowlist; POST
 * writes an inbound row with every identity derived server-side from the
 * share, then tells the office (lib/trip-message-notify). Ported from
 * autoura-saas.
 */

const MAX_MESSAGE = 2000
const MAX_NAME = 120
// Behind the in-memory limiter: 60 traveller messages in an hour is not a chat.
const MAX_MESSAGES_PER_HOUR = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function resolveShare(token: string) {
  if (!isValidShareToken(token)) return null
  const supabase = admin()
  const { data: share } = await supabase
    .from('itinerary_shares')
    .select('itinerary_id, org_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (!share || share.revoked_at) return null
  return { supabase, share: share as { itinerary_id: string; org_id: string } }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const resolved = await resolveShare(token)
    if (!resolved) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    const { supabase, share } = resolved
    const { data: rows } = await supabase
      .from('trip_messages')
      .select('direction, content, sender_name, created_at')
      .eq('itinerary_id', share.itinerary_id)
      .order('created_at', { ascending: false })
      .limit(50)
    return NextResponse.json({ success: true, messages: toClientTripMessages((rows ?? []) as Array<Record<string, unknown>>) })
  } catch (err) {
    console.error('[share messages GET]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const ip = getClientIdentifier(request)
    if (!checkRateLimit(`share-msg:${ip}`, 'chat').success || !checkRateLimit(`share-msg:${token}`, 'chat').success) {
      return NextResponse.json({ success: false, error: 'Too many messages — please slow down.' }, { status: 429 })
    }

    const resolved = await resolveShare(token)
    if (!resolved) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    const { supabase, share } = resolved

    const body = await request.json().catch(() => null)
    const { message: rawMessage, name: rawName } = (body ?? {}) as Record<string, unknown>
    const content = cleanClientText(rawMessage, MAX_MESSAGE)
    if (!content) return NextResponse.json({ success: false, error: 'Please write a message.' }, { status: 400 })
    const name = cleanClientText(rawName, MAX_NAME)

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('trip_messages')
      .select('id', { count: 'exact', head: true })
      .eq('itinerary_id', share.itinerary_id)
      .eq('direction', 'inbound')
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= MAX_MESSAGES_PER_HOUR) {
      return NextResponse.json({ success: false, error: 'Too many messages this hour — please contact your operator directly.' }, { status: 429 })
    }

    const { data: itinerary } = await supabase
      .from('itineraries').select('trip_name, client_name').eq('id', share.itinerary_id).maybeSingle()

    const { data: inserted, error } = await supabase
      .from('trip_messages')
      .insert({
        org_id: share.org_id,
        itinerary_id: share.itinerary_id,
        direction: 'inbound',
        content,
        sender_name: name ?? itinerary?.client_name ?? null,
        notify_outcome: 'pending',
      })
      .select('id, direction, content, sender_name, created_at')
      .single()
    if (error || !inserted) {
      console.error('[share messages POST] insert failed:', error?.message)
      return NextResponse.json({ success: false, error: 'Could not send — please try again.' }, { status: 500 })
    }

    // The traveller's send never waits on the office being told; after() keeps
    // the notification alive once the response has gone.
    after(() => notifyTripMessage({
      orgId: share.org_id,
      itineraryId: share.itinerary_id,
      messageId: inserted.id as string,
      senderName: name ?? itinerary?.client_name ?? 'Traveller',
      tripName: itinerary?.trip_name ?? 'trip message',
      content,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    }))

    return NextResponse.json({ success: true, message: toClientTripMessages([inserted as Record<string, unknown>])[0] ?? null })
  } catch (err) {
    console.error('[share messages POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
