import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { orgMemberUserIds } from '@/lib/auth/org-members'
import { emailConversationInOrg } from '@/lib/email/conversation-access'

// Use service role for API routes to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/email/messages - Get messages for a conversation
//
// Full stored bodies of the operator's mail. Role-gated to match the /inbox
// page — middleware only gates pages, and this is the rawest read there is.
export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const threadId = searchParams.get('thread_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before') // Pagination cursor (sent_at)

    if (!conversationId && !threadId) {
      return NextResponse.json({
        error: 'Either conversation_id or thread_id required',
        success: false
      }, { status: 400 })
    }

    // Only the messages of a conversation in one of this organisation's
    // mailboxes (lib/email/conversation-access): any conversation or thread
    // id returned its full bodies, whichever company's mail it was.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    let query = supabase
      .from('email_messages')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (conversationId) {
      const conv = await emailConversationInOrg(supabase, orgId, conversationId)
      if (!conv) return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
      query = query.eq('conversation_id', conv.id)
    } else if (threadId) {
      // A Gmail thread id is per mailbox: the org's conversations with it.
      const memberIds = await orgMemberUserIds(supabase, orgId)
      const { data: convs } = memberIds.length
        ? await supabase.from('email_conversations').select('id').eq('thread_id', threadId).in('user_id', memberIds)
        : { data: [] }
      const ids = ((convs ?? []) as { id: string }[]).map(c => c.id)
      if (ids.length === 0) return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
      query = query.eq('thread_id', threadId).in('conversation_id', ids)
    }

    if (before) {
      query = query.lt('sent_at', before)
    }

    const { data, error } = await query

    if (error) throw error

    // Reverse to show in chronological order (oldest first)
    const messages = (data || []).reverse()

    return NextResponse.json({ messages, success: true })
  } catch (error: any) {
    console.error('Error fetching email messages:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// POST (store one message), PUT (store a batch) and PATCH (update a message,
// spreading any field of the body into it) were removed: nothing called them
// — messages are stored by the Gmail sync (lib/email/sync-mailbox.ts,
// /api/gmail/poll) — and none checked whose conversation it was, so any
// signed-in account could write into, or rewrite, another company's mail.
