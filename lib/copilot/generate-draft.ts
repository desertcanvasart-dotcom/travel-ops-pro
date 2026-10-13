// ============================================
// Draft a reply to one Copilot inbox message
// ============================================
// The one place a Copilot draft is written, for both callers:
//   - POST /api/copilot/drafts — an operator pressing Generate on a thread;
//   - /api/cron/copilot-drafts — every new WhatsApp or email message that
//     arrived with status 'draft_pending' (lib/copilot-intake), drafted on
//     the server whether or not anyone has the Copilot screen open.
//
// Idempotent: an original (not regenerated) draft already pending or
// approved for the message is returned instead of writing another. On
// failure the inbox row is marked 'draft_failed' with the reason, so the
// scheduled job does not retry it forever, and the error is rethrown.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { generateDraft, draftFlags } from '@/lib/ai/draft-generator'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import type { CopilotTone } from '@/types/copilot'

export interface DraftForInboxInput {
  threadId: string
  inboxMessageId: string
  /** The thread's company — scopes the knowledge the draft is grounded in. */
  orgId: string | null
  tone: CopilotTone
  /** Drafted before an operator opened the thread (the scheduled job). */
  pregenerated: boolean
}

export type DraftForInboxResult =
  | { ok: true; draft: Record<string, unknown>; alreadyExisted: boolean }
  | { ok: false; notFound: true }

export async function draftForInboxMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  input: DraftForInboxInput
): Promise<DraftForInboxResult> {
  const { threadId, inboxMessageId } = input

  const { data: existingDraft } = await supabase
    .from('communication_drafts')
    .select('id')
    .eq('inbox_message_id', inboxMessageId)
    .eq('thread_id', threadId)
    .is('parent_draft_id', null) // Only original drafts, not regenerated
    .in('status', ['pending', 'approved'])
    .maybeSingle()

  if (existingDraft) {
    const { data: draft } = await supabase
      .from('communication_drafts')
      .select('*')
      .eq('id', existingDraft.id)
      .single()
    return { ok: true, draft, alreadyExisted: true }
  }

  const { data: inboxMessage, error: inboxError } = await supabase
    .from('communication_inbox')
    .select('*')
    .eq('id', inboxMessageId)
    .eq('thread_id', threadId)
    .single()
  if (inboxError || !inboxMessage) return { ok: false, notFound: true }

  try {
    await supabase
      .from('communication_inbox')
      .update({ status: 'draft_pending', processed_at: new Date().toISOString() })
      .eq('id', inboxMessageId)

    const result = await generateDraft(
      {
        inboxMessageId,
        threadId,
        channel: inboxMessage.channel,
        messageBody: inboxMessage.message_body,
        messageSubject: inboxMessage.subject,
        senderName: inboxMessage.sender_name,
        tone: input.tone,
        orgId: input.orgId,
      },
      supabase
    )

    const { data: draft, error: draftError } = await supabase
      .from('communication_drafts')
      .insert({
        thread_id: threadId,
        inbox_message_id: inboxMessageId,
        draft_body: result.output.draft_body,
        operator_notes: result.output.operator_notes,
        ai_model: MODEL_DRAFT,
        ai_confidence: result.output.confidence,
        ai_flags: draftFlags(result.output.flags, { tone: input.tone, pregenerated: input.pregenerated }),
        context_used: result.context,
        generation_time_ms: result.generationTimeMs,
        status: 'pending',
      })
      .select()
      .single()
    if (draftError) throw draftError

    await supabase.from('communication_inbox').update({ status: 'draft_ready' }).eq('id', inboxMessageId)
    await supabase.from('communication_threads').update({ last_draft_at: new Date().toISOString() }).eq('id', threadId)

    return { ok: true, draft, alreadyExisted: false }
  } catch (error) {
    // Terminal: the scheduled job only picks up 'draft_pending', so a failing
    // message is not retried every minute. Best-effort — never hides the
    // original error.
    try {
      await supabase
        .from('communication_inbox')
        .update({
          status: 'draft_failed',
          last_error: clientMessage(getUserFriendlyError(error), 'Internal server error'),
          processed_at: new Date().toISOString(),
        })
        .eq('id', inboxMessageId)
    } catch (markErr) {
      console.error('Failed to mark inbox draft_failed (non-fatal):', markErr)
    }
    throw error
  }
}
