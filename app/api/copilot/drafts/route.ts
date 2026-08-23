// ============================================
// API: COPILOT DRAFTS
// ============================================
// POST /api/copilot/drafts — Generate a draft reply using Claude
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { generateDraft, draftFlags } from '@/lib/ai/draft-generator'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import type { GenerateDraftRequest, CopilotTone } from '@/types/copilot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  // Hoisted so the catch block can mark this inbox row terminally failed.
  let inboxMessageIdForFailure: string | undefined
  try {
    const body: GenerateDraftRequest & { user_id?: string } = await request.json()
    inboxMessageIdForFailure = body.inbox_message_id

    if (!body.inbox_message_id || !body.thread_id) {
      return NextResponse.json(
        { success: false, error: 'inbox_message_id and thread_id are required' },
        { status: 400 }
      )
    }

    // Check if a draft already exists for this inbox message (idempotency)
    const { data: existingDraft } = await supabase
      .from('communication_drafts')
      .select('id')
      .eq('inbox_message_id', body.inbox_message_id)
      .is('parent_draft_id', null) // Only check original drafts, not regenerated
      .in('status', ['pending', 'approved'])
      .single()

    if (existingDraft) {
      // Draft already exists — return it instead of generating a new one
      const { data: draft } = await supabase
        .from('communication_drafts')
        .select('*')
        .eq('id', existingDraft.id)
        .single()

      return NextResponse.json({ success: true, draft, already_existed: true })
    }

    // Fetch the inbox message
    const { data: inboxMessage, error: inboxError } = await supabase
      .from('communication_inbox')
      .select('*')
      .eq('id', body.inbox_message_id)
      .single()

    if (inboxError || !inboxMessage) {
      return NextResponse.json(
        { success: false, error: 'Inbox message not found' },
        { status: 404 }
      )
    }

    // Fetch the thread
    const { data: thread, error: threadError } = await supabase
      .from('communication_threads')
      .select('*')
      .eq('id', body.thread_id)
      .single()

    if (threadError || !thread) {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      )
    }

    // Fetch user's tone preference
    let tone: CopilotTone = 'professional'
    if (body.user_id) {
      const { data: settings } = await supabase
        .from('copilot_settings')
        .select('tone')
        .eq('user_id', body.user_id)
        .single()
      if (settings?.tone) tone = settings.tone as CopilotTone
    }

    // Update inbox status to draft_pending
    await supabase
      .from('communication_inbox')
      .update({ status: 'draft_pending', processed_at: new Date().toISOString() })
      .eq('id', body.inbox_message_id)

    // Generate the draft
    const result = await generateDraft(
      {
        inboxMessageId: body.inbox_message_id,
        threadId: body.thread_id,
        channel: inboxMessage.channel,
        messageBody: inboxMessage.message_body,
        messageSubject: inboxMessage.subject,
        senderName: inboxMessage.sender_name,
        tone,
        orgId: thread.org_id ?? null, // scope RAG retrieval to the thread's org
      },
      supabase
    )

    // Store the draft
    const { data: draft, error: draftError } = await supabase
      .from('communication_drafts')
      .insert({
        thread_id: body.thread_id,
        inbox_message_id: body.inbox_message_id,
        draft_body: result.output.draft_body,
        operator_notes: result.output.operator_notes,
        ai_model: MODEL_DRAFT,
        ai_confidence: result.output.confidence,
        ai_flags: draftFlags(result.output.flags, { tone, pregenerated: body.pregenerated === true }),
        context_used: result.context,
        generation_time_ms: result.generationTimeMs,
        status: 'pending',
      })
      .select()
      .single()

    if (draftError) throw draftError

    // Update inbox status to draft_ready
    await supabase
      .from('communication_inbox')
      .update({ status: 'draft_ready' })
      .eq('id', body.inbox_message_id)

    // Update thread with last_draft_at
    await supabase
      .from('communication_threads')
      .update({ last_draft_at: new Date().toISOString() })
      .eq('id', body.thread_id)

    return NextResponse.json({ success: true, draft })
  } catch (error: any) {
    console.error('Error generating copilot draft:', error)

    // Use AI-specific error handling if it's an Anthropic error
    const aiError = getUserFriendlyError(error)

    // Mark the inbox row terminally failed so the auto-draft poller stops
    // retrying this row (poller gates on status === 'draft_pending'; anything
    // else is skipped). Without this the same failing request loops forever
    // and the operator sees an eternal spinner. Best-effort — never block the
    // error response on this update.
    if (inboxMessageIdForFailure) {
      try {
        await supabase
          .from('communication_inbox')
          .update({
            status: 'draft_failed',
            last_error: clientMessage(aiError, 'Internal server error'),
            processed_at: new Date().toISOString(),
          })
          .eq('id', inboxMessageIdForFailure)
      } catch (markErr) {
        console.error('Failed to mark inbox draft_failed (non-fatal):', markErr)
      }
    }

    return NextResponse.json(
      { success: false, error: clientMessage(aiError, 'Internal server error') },
      { status: aiError.status }
    )
  }
}
