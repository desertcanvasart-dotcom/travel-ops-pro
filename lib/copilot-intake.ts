// ============================================
// COPILOT INTAKE HELPER
// ============================================
// Shared by the WhatsApp webhook and email sync to
// create copilot thread + inbox entries for inbound messages.
// Draft generation is triggered by the frontend poller,
// NOT by fire-and-forget internal fetch.
// ============================================

import { SupabaseClient } from '@supabase/supabase-js'
import { getDefaultOrgId } from '@/lib/auth/default-org'

interface CopilotIntakeParams {
  channel: 'whatsapp' | 'email'
  whatsappConversationId?: string | null
  emailConversationId?: string | null
  sourceMessageId: string
  senderName: string | null
  senderContact: string
  messageBody: string
  subject?: string | null
  receivedAt: string
  clientId: string | null
  clientName: string | null
}

interface CopilotIntakeResult {
  threadId: string
  inboxId: string
  created: boolean // false if duplicate was detected
}

/**
 * Create or update a copilot thread and insert an inbox entry
 * for an inbound message. Idempotent — skips if source_message_id
 * already exists (dedup via unique constraint).
 */
export async function createCopilotInboxEntry(
  params: CopilotIntakeParams,
  supabase: SupabaseClient
): Promise<CopilotIntakeResult | null> {
  // 1. Check for duplicate by source_message_id
  const { data: existing } = await supabase
    .from('communication_inbox')
    .select('id, thread_id')
    .eq('channel', params.channel)
    .eq('source_message_id', params.sourceMessageId)
    .single()

  if (existing) {
    return { threadId: existing.thread_id, inboxId: existing.id, created: false }
  }

  // 2. Find or create thread
  const threadId = await findOrCreateThread(params, supabase)
  if (!threadId) return null

  // 3. Create inbox entry with status draft_pending
  const snippet = params.messageBody.length > 150
    ? params.messageBody.substring(0, 150) + '...'
    : params.messageBody

  const { data: inbox, error: inboxError } = await supabase
    .from('communication_inbox')
    .insert({
      thread_id: threadId,
      channel: params.channel,
      source_message_id: params.sourceMessageId,
      sender_name: params.senderName,
      sender_contact: params.senderContact,
      message_body: params.messageBody,
      message_snippet: snippet,
      subject: params.subject,
      status: 'draft_pending',
      received_at: params.receivedAt,
    })
    .select('id')
    .single()

  if (inboxError) {
    // Handle unique constraint violation (race condition)
    if (inboxError.code === '23505') {
      const { data: dup } = await supabase
        .from('communication_inbox')
        .select('id, thread_id')
        .eq('channel', params.channel)
        .eq('source_message_id', params.sourceMessageId)
        .single()
      if (dup) return { threadId: dup.thread_id, inboxId: dup.id, created: false }
    }
    console.error('Failed to create copilot inbox entry:', inboxError)
    return null
  }

  // 4. Update thread metadata
  await supabase
    .from('communication_threads')
    .update({
      last_message_at: params.receivedAt,
      message_count: await getThreadMessageCount(threadId, supabase),
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId)

  return { threadId, inboxId: inbox.id, created: true }
}

// ============================================
// HELPERS
// ============================================

async function findOrCreateThread(
  params: CopilotIntakeParams,
  supabase: SupabaseClient
): Promise<string | null> {
  // Try to find existing thread by conversation ID
  if (params.channel === 'whatsapp' && params.whatsappConversationId) {
    const { data: existing } = await supabase
      .from('communication_threads')
      .select('id')
      .eq('whatsapp_conversation_id', params.whatsappConversationId)
      .single()

    if (existing) {
      // Update client info if newly linked
      if (params.clientId) {
        await supabase
          .from('communication_threads')
          .update({
            client_id: params.clientId,
            client_name: params.clientName,
          })
          .eq('id', existing.id)
          .is('client_id', null)
      }
      return existing.id
    }
  }

  if (params.channel === 'email' && params.emailConversationId) {
    const { data: existing } = await supabase
      .from('communication_threads')
      .select('id')
      .eq('email_conversation_id', params.emailConversationId)
      .single()

    if (existing) {
      if (params.clientId) {
        await supabase
          .from('communication_threads')
          .update({
            client_id: params.clientId,
            client_name: params.clientName,
          })
          .eq('id', existing.id)
          .is('client_id', null)
      }
      return existing.id
    }
  }

  // Phase 2 — stamp org_id at intake. Webhook context (no operator session)
  // so we use the default-org placeholder. Per-channel resolution comes with
  // the G1 gate flip (see DEFERRED_GATES.md).
  const orgId = await getDefaultOrgId(supabase)

  // Create new thread
  const { data: newThread, error } = await supabase
    .from('communication_threads')
    .insert({
      channel: params.channel,
      org_id: orgId,
      whatsapp_conversation_id: params.whatsappConversationId || null,
      email_conversation_id: params.emailConversationId || null,
      client_id: params.clientId,
      client_name: params.clientName,
      contact_info: params.senderContact,
      subject: params.subject,
      status: 'open',
      urgency: 'normal',
      last_message_at: params.receivedAt,
      message_count: 0,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create copilot thread:', error)
    return null
  }

  return newThread.id
}

async function getThreadMessageCount(
  threadId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { count } = await supabase
    .from('communication_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId)

  return count || 0
}
