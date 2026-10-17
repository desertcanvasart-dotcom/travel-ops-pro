// ============================================
// API: COPILOT DRAFT BY ID
// ============================================
// GET  /api/copilot/drafts/[id] — Fetch a draft with context
// PUT  /api/copilot/drafts/[id] — Approve or reject a draft
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { copilotThreadInOrg } from '@/lib/copilot/thread-access'
import type { ApproveDraftRequest } from '@/types/copilot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    const { data: draft, error } = await supabase
      .from('communication_drafts')
      .select('*')
      .eq('id', id)
      .single()

    // A draft is its thread's organisation's (lib/copilot/thread-access).
    const thread = draft ? await copilotThreadInOrg(supabase, orgId, draft.thread_id) : null
    if (error || !draft || !thread) {
      return NextResponse.json(
        { success: false, error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Also fetch the inbox message for display — the thread's own.
    const { data: inboxMessage } = await supabase
      .from('communication_inbox')
      .select('*')
      .eq('id', draft.inbox_message_id)
      .eq('thread_id', draft.thread_id)
      .single()

    return NextResponse.json({
      success: true,
      draft,
      inbox_message: inboxMessage,
      thread,
    })
  } catch (error: any) {
    console.error('Error fetching draft:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body: ApproveDraftRequest = await request.json()

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    // Fetch current draft
    const { data: draft, error: fetchError } = await supabase
      .from('communication_drafts')
      .select('id, status, thread_id')
      .eq('id', id)
      .single()

    if (fetchError || !draft || !(await copilotThreadInOrg(supabase, orgId, draft.thread_id, 'id'))) {
      return NextResponse.json(
        { success: false, error: 'Draft not found' },
        { status: 404 }
      )
    }

    if (draft.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Cannot ${body.action} a draft with status "${draft.status}"` },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = {
      status: body.action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: now,
      // Who approved or rejected it — never written before.
      reviewed_by: await getCurrentUserId(),
    }

    // If operator provided an edited body, store it
    if (body.action === 'approve' && body.edited_body !== undefined) {
      updateData.edited_body = body.edited_body
      updateData.was_edited = true
    }

    const { data: updated, error: updateError } = await supabase
      .from('communication_drafts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ success: true, draft: updated })
  } catch (error: any) {
    console.error('Error reviewing draft:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
