import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { teamMemberInOrg } from '@/lib/whatsapp-org'
import { pickConversationUpdates } from '@/lib/email/conversation-updates'
import { moveThreadInGmail, labelThreadInGmail, type ThreadLabelAction } from '@/lib/email/conversation-trash'
import { scopedToConnectedMailboxes } from '@/lib/email/connected-mailboxes'
import { emailConversationInOrg } from '@/lib/email/conversation-access'
import { notifyEmailAssignee } from '@/lib/email/assignment-notice'
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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

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
      .eq('org_id', orgId)
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

    // Only mail of the org's Gmail addresses connected now (lib/email/connected-mailboxes).
    const { data, error } = await scopedToConnectedMailboxes(supabase, orgId, (mailboxFilter) =>
      query.or(mailboxFilter).limit(50)
    )

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

// POST (create or update a conversation for any caller-chosen user_id) was
// removed: nothing called it — conversations are created by the Gmail sync
// (lib/email/sync-mailbox.ts, /api/gmail/poll) — and it let any signed-in
// account file a thread into any company's mailbox.

// The PATCH actions that are also a label change on the Gmail thread.
const GMAIL_LABEL_ACTIONS: Record<string, ThreadLabelAction | undefined> = {
  archive: 'archive',
  unarchive: 'unarchive',
  mark_read: 'markRead',
  mark_unread: 'markUnread',
}

// PATCH /api/email/conversations - Update conversation status, assignment, etc.
export async function PATCH(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()
    const { conversation_id, action, agent_id, ...updates } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID required', success: false }, { status: 400 })
    }

    // Only this organisation's conversation (lib/email/conversation-access):
    // any id was updated — and restored in its owner's real Gmail — whichever
    // company it belonged to.
    const existing = await emailConversationInOrg(supabase, orgId, String(conversation_id))
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
    }
    // Restore is for Communicate's Trash only (status 'trashed', see DELETE).
    // is_hidden alone is how personal and machine mail is kept out of the
    // shared inbox (scripts/scope-inbox); 'unhide' put that back in front of
    // the whole team and pulled it out of Gmail's Trash.
    if (action === 'unhide' && existing.status !== 'trashed') {
      return NextResponse.json({ error: 'Conversation is not in Trash', success: false }, { status: 404 })
    }

    // A client or team member set here must be this organisation's own: the
    // service-role update would otherwise link the conversation to another
    // agency's client (and embed that client below) or hand it to another
    // agency's agent. A plain 404, as for a missing id.
    if (!(await recordsInOrg(supabase, orgId, { client_id: updates.client_id }))) {
      return NextResponse.json({ error: 'Client not found', success: false }, { status: 404 })
    }
    const assignee = updates.assigned_team_member_id
    if (assignee !== undefined && assignee !== null) {
      if (typeof assignee !== 'string' || !(await teamMemberInOrg(supabase, assignee, orgId))) {
        return NextResponse.json({ error: 'Team member not found', success: false }, { status: 404 })
      }
    }

    // Who held it before, read before the update (for the assignment notice).
    const previousAssigneeId = existing.assigned_team_member_id ?? null
    let updateData: any = { updated_at: new Date().toISOString() }

    if (action === 'mark_read') {
      updateData.unread_count = 0
    } else if (action === 'mark_unread') {
      updateData.unread_count = 1
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
      updateData.status = 'active' // out of Trash (see DELETE)
    } else if (action === 'assign') {
      updateData.assigned_team_member_id = updates.assigned_team_member_id
      updateData.assigned_at = new Date().toISOString()
    } else if (action === 'unassign') {
      updateData.assigned_team_member_id = null
      updateData.assigned_at = null
    } else {
      // Only the fields a client of this route sets. The body was spread
      // into the update whole, so a caller could rewrite user_id (moving the
      // conversation into another mailbox), thread_id or anything else.
      const picked = pickConversationUpdates(updates)
      if (!picked) {
        return NextResponse.json({ error: 'Invalid update', success: false }, { status: 400 })
      }
      updateData = { ...updateData, ...picked }
      if ('assigned_team_member_id' in picked) {
        updateData.assigned_at = picked.assigned_team_member_id ? new Date().toISOString() : null
      }
    }

    let updateQuery = supabase
      .from('email_conversations')
      .update(updateData)
      .eq('id', existing.id)
      .eq('org_id', orgId)
    if (action === 'unhide') updateQuery = updateQuery.eq('status', 'trashed')
    const { data, error } = await updateQuery
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

    // Restored from Trash: back out of Gmail's Trash too (see DELETE).
    let warning: string | undefined
    if (action === 'unhide' && data) {
      const gmail = await moveThreadInGmail(data.user_id, data.thread_id, 'untrash', orgId)
      if (!gmail.ok) warning = 'Restored here, but the email could not be taken out of Trash in Gmail. Reconnect Gmail in Settings and try again.'
    }
    // Archive and read state follow into the conversation's own mailbox
    // (lib/email/conversation-trash labelThreadInGmail). Changed here
    // regardless: a mailbox that needs reconnecting must not stop it.
    const labelAction = typeof action === 'string' && Object.hasOwn(GMAIL_LABEL_ACTIONS, action) ? GMAIL_LABEL_ACTIONS[action] : undefined
    if (labelAction && data) {
      const gmail = await labelThreadInGmail(data.user_id, data.thread_id, labelAction, orgId)
      if (!gmail.ok) warning = 'Done here, but Gmail could not be updated. An admin or manager can reconnect Gmail in Settings › Email.'
    }

    // The new assignee hears about it, as for WhatsApp (lib/email/
    // assignment-notice). A failed notice never fails the assignment.
    if (data && 'assigned_team_member_id' in updateData) {
      try {
        await notifyEmailAssignee(supabase, {
          orgId,
          conversationId: existing.id,
          previousAssigneeId,
          newAssigneeId: updateData.assigned_team_member_id,
          actorUserId: await getCurrentUserId(),
          clientName: data.client_name,
          clientEmail: data.client_email,
          subject: data.subject,
        })
      } catch (e) {
        console.error('Email assignment notification failed:', e)
      }
    }

    // No conversation_activity row: that log belongs to WhatsApp
    // conversations (its conversation_id references whatsapp_conversations),
    // so writing an email conversation's id there always failed the foreign
    // key.

    return NextResponse.json({ conversation: data, success: true, ...(warning ? { warning } : {}) })
  } catch (error: any) {
    console.error('Error updating email conversation:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// DELETE /api/email/conversations - Move a conversation to Communicate's Trash
// (is_hidden) and its thread to Gmail's Trash. Restore: PATCH action 'unhide'.
export async function DELETE(request: NextRequest) {
  try {
    // The same roles as reading the inbox (GET): this was open to any
    // signed-in account.
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required', success: false }, { status: 400 })
    }

    // Only this organisation's conversation: any id was trashed here AND in
    // its owner's real Gmail, whichever company's.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const existing = await emailConversationInOrg(supabase, orgId, conversationId)
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
    }

    // NOTE: email_conversations has only an is_hidden column (no
    // hidden_at/hidden_by, unlike whatsapp_conversations). Writing those
    // non-existent columns made PostgREST reject the whole UPDATE with
    // PGRST204, so this endpoint always 500'd and the delete did nothing.
    const { data, error } = await supabase
      .from('email_conversations')
      .update({
        is_hidden: true,
        // In Communicate's Trash — not the same as hidden: is_hidden alone is
        // also how personal and machine mail is kept out of the shared inbox
        // (scripts/scope-inbox), and the Trash must never list that.
        status: 'trashed',
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
    }

    // The thread follows it into Gmail's Trash. Moved here regardless: a
    // mailbox that needs reconnecting must not stop the delete — it says so.
    const gmail = await moveThreadInGmail(data.user_id, data.thread_id, 'trash', orgId)

    return NextResponse.json({
      success: true,
      message: 'Moved to Trash',
      ...(gmail.ok ? {} : { warning: 'Moved to Trash here, but the email could not be moved to Trash in Gmail. Reconnect Gmail in Settings and try again.' }),
      conversation: data
    })
  } catch (error: any) {
    console.error('Error deleting email conversation:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}
