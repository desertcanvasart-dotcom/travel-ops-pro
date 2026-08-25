// ============================================
// API: AI REPLY SUGGESTIONS — Email
// ============================================
// POST /api/ai/suggest-email-reply — generate N reply options for an email conversation
//   body: { email_conversation_id, count?, instruction?, user_id? }
// GET  /api/ai/suggest-email-reply?email_conversation_id=... — list existing pending drafts
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { guardAiRate } from '@/lib/rate-limit/ai-limit'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { generateReplyOptions } from '@/lib/ai/reply-suggestions'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolveThread(conversationId: string, orgId: string) {
  // Scoped to the caller's org: communication_threads carries org_id, so a
  // conversation id belonging to another organisation resolves to nothing
  // rather than exposing (POST) or mutating its drafts.
  const { data } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('email_conversation_id', conversationId)
    .eq('org_id', orgId)
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
    const limited = await guardAiRate()
    if (limited) return limited

    const body = await request.json()
    const conversationId: string | undefined = body.email_conversation_id
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'email_conversation_id is required' },
        { status: 400 }
      )
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const threadId = await resolveThread(conversationId, orgId)
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
      channel: 'email',
      count: body.count,
      instruction: body.instruction ?? null,
      // The reviewer is the signed-in user — never a client-supplied id.
      reviewerUserId: await getCurrentUserId(),
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
    const conversationId = request.nextUrl.searchParams.get('email_conversation_id')
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'email_conversation_id is required' },
        { status: 400 }
      )
    }
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const threadId = await resolveThread(conversationId, orgId)
    if (!threadId) return NextResponse.json({ success: true, drafts: [] })

    const { data, error } = await supabase
      .from('communication_drafts')
      .select('id, draft_body, operator_notes, ai_confidence, status, parent_draft_id, created_at')
      .eq('thread_id', threadId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    return NextResponse.json({ success: true, drafts: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: getUserFriendlyError(error) },
      { status: 500 }
    )
  }
}
