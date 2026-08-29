import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId, requireRole } from '@/lib/auth/current-org'
import type { EmailConversation } from '@/types/unified'

// Use service role for API routes to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/email/conversations - List email conversations
//
// Role-gated to match the /inbox page (middleware only gates PAGES, so
// without this any authenticated account — viewer included — could read
// every stored email body straight off the API).
export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const search = sanitizeSearchTerm(searchParams.get('search')) || ''
    const includeHidden = searchParams.get('include_hidden') === 'true'
    const agentId = searchParams.get('agent_id')
    const unassignedOnly = searchParams.get('unassigned_only') === 'true'
    const userId = searchParams.get('user_id')
    const clientId = searchParams.get('client_id')

    let query = supabase
      .from('email_conversations')
      .select(`
        *,
        client:clients (
          id,
          first_name,
          last_name,
          email,
          client_code
        ),
        assigned_agent:team_members!email_conversations_assigned_team_member_id_fkey (
          id,
          name,
          email,
          avatar_url,
          is_available,
          current_conversations,
          max_conversations
        )
      `)
      .eq('status', status)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    // Filter by user_id (Gmail account owner)
    if (userId) {
      query = query.eq('user_id', userId)
    }

    // Filter by client_id
    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    // Hidden conversations belong to the person whose mailbox this is.
    // Hiding is how personal mail is kept personal (and how the pre-scoping
    // backlog was cleaned up), so include_hidden must not become the loophole
    // that shows a colleague what was hidden — it reveals only YOUR hidden
    // threads, alongside everything shared.
    if (!includeHidden) {
      query = query.or('is_hidden.is.null,is_hidden.eq.false')
    } else {
      const sessionUserId = await getCurrentUserId()
      query = sessionUserId
        ? query.or(
            `is_hidden.is.null,is_hidden.eq.false,and(is_hidden.eq.true,user_id.eq.${sessionUserId})`
          )
        : query.or('is_hidden.is.null,is_hidden.eq.false')
    }

    // Filter by assigned agent
    if (agentId) {
      query = query.eq('assigned_team_member_id', agentId)
    }

    // Filter unassigned only
    if (unassignedOnly) {
      query = query.is('assigned_team_member_id', null)
    }

    // Search by email or subject
    if (search) {
      query = query.or(`client_email.ilike.%${search}%,client_name.ilike.%${search}%,subject.ilike.%${search}%`)
    }

    const { data, error } = await query.limit(50)

    if (error) throw error

    // Map to include full_name for convenience
    const conversations = (data || []).map((conv: any) => ({
      ...conv,
      client: conv.client ? {
        ...conv.client,
        full_name: `${conv.client.first_name || ''} ${conv.client.last_name || ''}`.trim()
      } : null
    }))

    return NextResponse.json({ conversations, success: true })
  } catch (error: any) {
    console.error('Error fetching email conversations:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// POST /api/email/conversations - Create or update email conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      thread_id,
      user_id,
      client_email,
      subject,
      last_message_snippet,
      last_message_at,
      gmail_history_id
    } = body

    if (!thread_id) {
      return NextResponse.json({ error: 'Thread ID required', success: false }, { status: 400 })
    }

    if (!user_id) {
      return NextResponse.json({ error: 'User ID required', success: false }, { status: 400 })
    }

    // Check if conversation exists — including hidden ones, which STAY hidden.
    const { data: existing } = await supabase
      .from('email_conversations')
      .select('*')
      .eq('thread_id', thread_id)
      .single()

    if (existing) {
      // Update existing conversation
      const updates: any = {
        updated_at: new Date().toISOString()
      }

      // Deliberately NOT un-hiding on activity. Hiding is how personal mail
      // is kept personal (hidden threads are owner-only), so a new message
      // arriving must not resurface the thread for the whole team — a 2FA
      // sender writes again every time the operator logs into something.
      // Un-hiding is an explicit action (PATCH action: 'unhide'), a decision,
      // not a side effect. The removed block was also broken in fact: it
      // wrote hidden_at/hidden_by, columns email_conversations does not have,
      // so PostgREST rejected the WHOLE update with PGRST204 — the same bug
      // class as the delete fix (#193), on the opposite path.

      if (subject && subject !== existing.subject) updates.subject = subject
      if (last_message_snippet) updates.last_message_snippet = last_message_snippet
      if (last_message_at) updates.last_message_at = last_message_at
      if (gmail_history_id) updates.gmail_history_id = gmail_history_id
      updates.last_sync_at = new Date().toISOString()

      const { data: updated, error } = await supabase
        .from('email_conversations')
        .update(updates)
        .eq('id', existing.id)
        .select(`
          *,
          client:clients (
            id,
            first_name,
            last_name,
            email,
            client_code
          ),
          assigned_agent:team_members!email_conversations_assigned_team_member_id_fkey (*)
        `)
        .single()

      if (error) throw error
      return NextResponse.json({ conversation: updated, created: false, success: true })
    }

    // Create new conversation - client linking happens via trigger
    const { data: newConversation, error } = await supabase
      .from('email_conversations')
      .insert({
        thread_id,
        user_id,
        client_email: client_email || null,
        subject: subject || null,
        last_message_snippet: last_message_snippet || null,
        last_message_at: last_message_at || null,
        gmail_history_id: gmail_history_id || null,
        is_hidden: false,
        status: 'active',
        last_sync_at: new Date().toISOString()
      })
      .select(`
        *,
        client:clients (
          id,
          first_name,
          last_name,
          email,
          client_code
        ),
        assigned_agent:team_members!email_conversations_assigned_team_member_id_fkey (*)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ conversation: newConversation, created: true, success: true })
  } catch (error: any) {
    console.error('Error creating/updating email conversation:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// PATCH /api/email/conversations - Update conversation status, assignment, etc.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversation_id, action, agent_id, ...updates } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID required', success: false }, { status: 400 })
    }

    let updateData: any = { updated_at: new Date().toISOString() }

    if (action === 'mark_read') {
      updateData.unread_count = 0
    } else if (action === 'archive') {
      updateData.status = 'archived'
    } else if (action === 'unarchive') {
      updateData.status = 'active'
    } else if (action === 'unhide') {
      // is_hidden only — hidden_at/hidden_by do not exist on this table, and
      // writing them made PostgREST reject the whole update (PGRST204), so
      // explicit un-hide has never actually worked. See the DELETE handler's
      // note; #193 fixed the hide half of this same defect.
      updateData.is_hidden = false
    } else if (action === 'assign') {
      updateData.assigned_team_member_id = updates.assigned_team_member_id
      updateData.assigned_at = new Date().toISOString()
    } else if (action === 'unassign') {
      updateData.assigned_team_member_id = null
      updateData.assigned_at = null
    } else {
      updateData = { ...updateData, ...updates }
    }

    const { data, error } = await supabase
      .from('email_conversations')
      .update(updateData)
      .eq('id', conversation_id)
      .select(`
        *,
        client:clients (
          id,
          first_name,
          last_name,
          email,
          client_code
        ),
        assigned_agent:team_members!email_conversations_assigned_team_member_id_fkey (*)
      `)
      .single()

    if (error) throw error

    // Log activity if agent provided
    if (agent_id && action) {
      await supabase
        .from('conversation_activity')
        .insert({
          conversation_id,
          agent_id,
          team_member_id: agent_id,
          action_type: action === 'mark_read' ? 'viewed' : 'status_changed',
          action_details: { action, updates, channel: 'email' }
        })
    }

    return NextResponse.json({ conversation: data, success: true })
  } catch (error: any) {
    console.error('Error updating email conversation:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// DELETE /api/email/conversations - Hide (soft delete) a conversation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required', success: false }, { status: 400 })
    }

    // Soft delete — hide the conversation. NOTE: email_conversations has only an
    // is_hidden column (no hidden_at/hidden_by, unlike whatsapp_conversations).
    // Writing those non-existent columns made PostgREST reject the whole UPDATE
    // with PGRST204, so this endpoint always 500'd and the delete did nothing.
    const { data, error } = await supabase
      .from('email_conversations')
      .update({
        is_hidden: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Email conversation hidden successfully',
      conversation: data
    })
  } catch (error: any) {
    console.error('Error hiding email conversation:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}
