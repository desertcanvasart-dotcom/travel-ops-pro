// ============================================
// GET / POST /api/portal-chat/messages
// ============================================
// The unified inbox's view of a portal conversation, keyed on the THREAD —
// the inbox knows a conversation id, not which booking it belongs to.
//
// The booking page reaches the same conversations through
// /api/bookings/[id]/portal-messages, keyed on the booking. Both store a reply
// through lib/portal/chat-reply.ts, so the two surfaces cannot drift apart on
// the part that matters: telling the traveller.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { sendStaffReply } from '@/lib/portal/chat-reply'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** The thread, proven to be in this org. A conversation id from a query string
 *  is not authority to read it. */
async function ownedThread(orgId: string, threadId: string) {
  const { data } = await admin()
    .from('portal_message_threads')
    .select('id, booking_id, passenger_id, org_id')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}

export async function GET(request: NextRequest) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const threadId = request.nextUrl.searchParams.get('conversation_id') ?? ''
    const thread = await ownedThread(orgId, threadId)
    if (!thread) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const db = admin()
    const { data } = await db
      .from('portal_messages')
      .select('id, sender, sender_name, body, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .limit(500)

    // Opening a conversation is reading it.
    await db
      .from('portal_message_threads')
      .update({ staff_last_read_at: new Date().toISOString() })
      .eq('id', thread.id)

    return NextResponse.json({
      // Mapped into the shape the inbox already speaks: the traveller is
      // inbound, the office is outbound.
      messages: (data ?? []).map(m => ({
        id: m.id,
        direction: m.sender === 'customer' ? 'inbound' : 'outbound',
        message_body: m.body,
        created_at: m.created_at,
        from_address: m.sender === 'customer'
          ? 'Traveller'
          : m.sender === 'system' ? 'Automatic' : (m.sender_name || 'Office'),
        sender: m.sender,
      })),
    })
  } catch (error) {
    console.error('Error in portal-chat GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const payload = await request.json().catch(() => null)
    const thread = await ownedThread(orgId, String(payload?.conversationId ?? payload?.conversation_id ?? ''))
    if (!thread) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const result = await sendStaffReply(admin(), {
      thread,
      orgId,
      userId: await getCurrentUserId(),
      body: String(payload?.message ?? payload?.body ?? ''),
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })
    }
    return NextResponse.json({ success: true, emailed: result.emailed, message: result.message })
  } catch (error) {
    console.error('Error in portal-chat POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
