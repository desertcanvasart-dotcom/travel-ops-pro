// ============================================
// API: COPILOT DRAFTS
// ============================================
// POST /api/copilot/drafts — Generate a draft reply using Claude
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDraft } from '@/lib/ai/draft-generator'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import type { GenerateDraftRequest, CopilotTone } from '@/types/copilot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body: GenerateDraftRequest & { user_id?: string } = await request.json()

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
        ai_model: 'claude-sonnet-4-20250514',
        ai_confidence: result.output.confidence,
        ai_flags: result.output.flags,
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
    return NextResponse.json(
      { success: false, error: aiError.message },
      { status: aiError.status }
    )
  }
}
