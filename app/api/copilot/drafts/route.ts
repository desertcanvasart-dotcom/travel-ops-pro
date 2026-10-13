// ============================================
// API: COPILOT DRAFTS
// ============================================
// POST /api/copilot/drafts — Generate a draft reply using Claude
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { copilotToneFor } from '@/lib/copilot/tone'
import { copilotThreadInOrg } from '@/lib/copilot/thread-access'
import { draftForInboxMessage } from '@/lib/copilot/generate-draft'
import { getUserFriendlyError } from '@/lib/ai/anthropic-client'
import type { GenerateDraftRequest } from '@/types/copilot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body: GenerateDraftRequest = await request.json()

    if (!body.inbox_message_id || !body.thread_id) {
      return NextResponse.json(
        { success: false, error: 'inbox_message_id and thread_id are required' },
        { status: 400 }
      )
    }

    // Only a thread of this organisation's, and an inbox message of that
    // thread (lib/copilot/thread-access): any ids returned another company's
    // draft or drafted against its customer's message.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const thread = await copilotThreadInOrg<{ id: string; org_id: string | null }>(supabase, orgId, body.thread_id)
    if (!thread) {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      )
    }

    // The signed-in user's tone — never a user_id from the request body.
    const tone = await copilotToneFor(supabase, await getCurrentUserId())

    // Idempotent, and marks the message failed if drafting fails
    // (lib/copilot/generate-draft — shared with /api/cron/copilot-drafts).
    const result = await draftForInboxMessage(supabase, {
      threadId: body.thread_id,
      inboxMessageId: body.inbox_message_id,
      orgId: thread.org_id ?? null, // scope RAG retrieval to the thread's org
      tone,
      pregenerated: body.pregenerated === true,
    })
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: 'Inbox message not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      draft: result.draft,
      ...(result.alreadyExisted ? { already_existed: true } : {}),
    })
  } catch (error: any) {
    console.error('Error generating copilot draft:', error)
    const aiError = getUserFriendlyError(error)
    return NextResponse.json(
      { success: false, error: clientMessage(aiError, 'Internal server error') },
      { status: aiError.status }
    )
  }
}
