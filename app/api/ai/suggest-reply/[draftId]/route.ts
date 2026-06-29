// ============================================
// API: AI REPLY SUGGESTIONS — Regenerate
// ============================================
// POST /api/ai/suggest-reply/[draftId] — regenerate reply option(s) from an existing draft,
//   optionally steered by an operator instruction. New rows reference the original as parent.
//   body: { count?, instruction?, user_id? }
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateReplyOptions } from '@/lib/ai/reply-suggestions'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import type { CopilotChannel } from '@/types/copilot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params
    const body = await request.json().catch(() => ({}))

    // The draft we're regenerating from carries the thread + inbox linkage.
    const { data: parent, error: parentErr } = await supabase
      .from('communication_drafts')
      .select('id, thread_id, inbox_message_id')
      .eq('id', draftId)
      .single()
    if (parentErr || !parent) {
      return NextResponse.json({ success: false, error: 'Draft not found' }, { status: 404 })
    }

    // Channel comes from the thread.
    const { data: thread } = await supabase
      .from('communication_threads')
      .select('channel')
      .eq('id', parent.thread_id)
      .single()
    const channel: CopilotChannel = thread?.channel === 'email' ? 'email' : 'whatsapp'

    const result = await generateReplyOptions({
      supabase,
      threadId: parent.thread_id,
      inboxMessageId: parent.inbox_message_id,
      channel,
      count: body.count,
      instruction: body.instruction ?? null,
      reviewerUserId: body.user_id ?? null,
      parentDraftId: draftId,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 502 })
    }
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: getUserFriendlyError(error) },
      { status: 500 }
    )
  }
}
