// ============================================
// API: AI REPLY SUGGESTIONS — WhatsApp
// ============================================
// POST /api/ai/suggest-reply — generate N reply options for a WhatsApp conversation
//   body: { whatsapp_conversation_id, count?, instruction?, user_id? }
// GET  /api/ai/suggest-reply?whatsapp_conversation_id=... — list existing pending drafts
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateReplyOptions } from '@/lib/ai/reply-suggestions'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolveThread(conversationId: string) {
  const { data } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('whatsapp_conversation_id', conversationId)
    .maybeSingle()
  return data?.id ?? null
}

async function latestInbox(threadId: string) {
  const { data } = await supabase
    .from('communication_inbox')
    .select('id')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const conversationId: string | undefined = body.whatsapp_conversation_id
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'whatsapp_conversation_id is required' },
        { status: 400 }
      )
    }

    const threadId = await resolveThread(conversationId)
    if (!threadId) {
      return NextResponse.json({ success: false, error: 'No thread for this conversation' }, { status: 404 })
    }
    const inboxId = await latestInbox(threadId)
    if (!inboxId) {
      return NextResponse.json({ success: false, error: 'No inbound message to reply to' }, { status: 404 })
    }

    const result = await generateReplyOptions({
      supabase,
      threadId,
      inboxMessageId: inboxId,
      channel: 'whatsapp',
      count: body.count,
      instruction: body.instruction ?? null,
      reviewerUserId: body.user_id ?? null,
      skipIfPendingExists: body.skip_if_pending_exists === true,
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

export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get('whatsapp_conversation_id')
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'whatsapp_conversation_id is required' },
        { status: 400 }
      )
    }
    const threadId = await resolveThread(conversationId)
    if (!threadId) return NextResponse.json({ success: true, drafts: [] })

    const { data, error } = await supabase
      .from('communication_drafts')
      .select('id, draft_body, operator_notes, ai_confidence, status, parent_draft_id, created_at')
      .eq('thread_id', threadId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, drafts: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: getUserFriendlyError(error) },
      { status: 500 }
    )
  }
}
