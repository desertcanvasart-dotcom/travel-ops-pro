// ============================================
// API: COPILOT REGENERATE DRAFT
// ============================================
// POST /api/copilot/drafts/[id]/regenerate — Create a new draft
// linked to the old one via parent_draft_id (audit trail)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { generateDraft } from '@/lib/ai/draft-generator'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import type { RegenerateDraftRequest, CopilotTone } from '@/types/copilot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body: RegenerateDraftRequest & { user_id?: string } = await request.json()

    // Fetch the original draft
    const { data: originalDraft, error: fetchError } = await supabase
      .from('communication_drafts')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !originalDraft) {
      return NextResponse.json(
        { success: false, error: 'Original draft not found' },
        { status: 404 }
      )
    }

    // Fetch the inbox message
    const { data: inboxMessage } = await supabase
      .from('communication_inbox')
      .select('*')
      .eq('id', originalDraft.inbox_message_id)
      .single()

    if (!inboxMessage) {
      return NextResponse.json(
        { success: false, error: 'Inbox message not found' },
        { status: 404 }
      )
    }

    // Fetch the thread
    const { data: thread } = await supabase
      .from('communication_threads')
      .select('channel')
      .eq('id', originalDraft.thread_id)
      .single()

    if (!thread) {
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

    // Generate new draft with optional additional instructions
    const result = await generateDraft(
      {
        inboxMessageId: originalDraft.inbox_message_id,
        threadId: originalDraft.thread_id,
        channel: thread.channel,
        messageBody: inboxMessage.message_body,
        messageSubject: inboxMessage.subject,
        senderName: inboxMessage.sender_name,
        tone,
        additionalInstructions: body.additional_instructions,
      },
      supabase
    )

    // Store new draft with parent_draft_id
    const { data: newDraft, error: insertError } = await supabase
      .from('communication_drafts')
      .insert({
        thread_id: originalDraft.thread_id,
        inbox_message_id: originalDraft.inbox_message_id,
        parent_draft_id: id,
        draft_body: result.output.draft_body,
        operator_notes: result.output.operator_notes,
        ai_model: MODEL_DRAFT,
        ai_confidence: result.output.confidence,
        ai_flags: result.output.flags,
        context_used: result.context,
        generation_time_ms: result.generationTimeMs,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Only NOW expire the original — after the replacement is safely stored. If
    // generation or the insert above had failed, the original stays 'pending'
    // (was: expired before the AI call, so an AI failure lost it with no replacement).
    await supabase
      .from('communication_drafts')
      .update({ status: 'expired' })
      .eq('id', id)

    // Update thread last_draft_at
    await supabase
      .from('communication_threads')
      .update({ last_draft_at: new Date().toISOString() })
      .eq('id', originalDraft.thread_id)

    return NextResponse.json({ success: true, draft: newDraft })
  } catch (error: any) {
    console.error('Error regenerating draft:', error)
    const aiError = getUserFriendlyError(error)
    return NextResponse.json(
      { success: false, error: clientMessage(aiError, 'Internal server error') },
      { status: aiError.status }
    )
  }
}
