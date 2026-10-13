import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { todayFromRequest } from '@/lib/today'
import { followupFieldsError, followupTitle, snoozeDate } from '@/lib/followups'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAFF = ['admin', 'manager', 'agent']

/** The follow-up, if its client is the active company's (see lib/followups). */
async function ownFollowup(orgId: string, id: string) {
  const { data } = await supabaseAdmin
    .from('client_followups')
    .select('id, due_date, clients!inner(org_id)')
    .eq('id', id)
    .eq('clients.org_id', orgId)
    .maybeSingle()
  return data as { id: string; due_date: string } | null
}

// PATCH - one of:
//   { action: 'complete' }            — done, stamped with who and when
//   { action: 'snooze', days }        — later by N days (lib/followups snoozeDate)
//   { followup_type, due_date, priority, description, title } — the modal's edit
// A new due date clears reminder_sent, so the reminder fires on the new day.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const current = await ownFollowup(orgId, id)
    if (!current) return NextResponse.json({ success: false, error: 'Follow-up not found' }, { status: 404 })

    const now = new Date().toISOString()
    let update: Record<string, unknown>
    if (body.action === 'complete') {
      update = { status: 'completed', completed_at: now, completed_by: await getCurrentUserId() }
    } else if (body.action === 'snooze') {
      const days = Number(body.days)
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return NextResponse.json({ success: false, error: 'days must be a whole number from 1 to 365' }, { status: 400 })
      }
      update = { due_date: snoozeDate(current.due_date, todayFromRequest(request.url), days), reminder_sent: false }
    } else {
      const invalid = followupFieldsError(body, false)
      if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })
      update = {}
      if (body.followup_type !== undefined) update.followup_type = body.followup_type
      if (body.priority !== undefined) update.priority = body.priority
      if (body.description !== undefined) update.description = typeof body.description === 'string' && body.description.trim() ? body.description : null
      if (body.title !== undefined) update.title = followupTitle(body)
      if (body.due_date !== undefined && body.due_date !== String(current.due_date).slice(0, 10)) {
        update.due_date = body.due_date
        update.reminder_sent = false
      }
    }
    update.updated_at = now

    const { data, error } = await supabaseAdmin
      .from('client_followups')
      .update(update)
      .eq('id', id)
      .select('id, due_date, status')
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating follow-up:', error)
    return NextResponse.json({ success: false, error: 'Failed to update follow-up' }, { status: 500 })
  }
}

// DELETE - remove one of the company's follow-ups.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    if (!(await ownFollowup(orgId, id))) {
      return NextResponse.json({ success: false, error: 'Follow-up not found' }, { status: 404 })
    }
    const { error } = await supabaseAdmin.from('client_followups').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting follow-up:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete follow-up' }, { status: 500 })
  }
}
