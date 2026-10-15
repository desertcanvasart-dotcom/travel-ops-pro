// ============================================
// API: /api/gmail/scheduled — send a saved draft later
// ============================================
// POST   { draftId, sendAt, timeZone?, toSummary?, subject?, threadId? }
//        schedules the draft (it must be in the mailbox the inbox uses).
// GET    the organisation's scheduled emails, soonest first, with recent
//        failures so nobody assumes a failed one went out.
// DELETE ?id= cancels one that has not gone yet; its draft stays in Drafts.
//
// The sending is the scheduler's (app/api/cron/send-scheduled-emails).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ID = /^[A-Za-z0-9_-]{1,200}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000

async function caller() {
  const forbidden = await requireRole(['admin', 'manager', 'agent'])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { orgId, userId }
}

export async function GET() {
  try {
    const who = await caller()
    if (who instanceof NextResponse) return who
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('scheduled_emails')
      .select('id, draft_id, thread_id, to_summary, subject, send_at, time_zone, status, error, sent_at, created_by')
      .eq('org_id', who.orgId)
      .or(`status.in.(scheduled,sending),and(status.eq.failed,updated_at.gte.${since})`)
      .order('send_at', { ascending: true })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ scheduled: data ?? [] })
  } catch (err) {
    console.error('List scheduled emails error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await caller()
    if (who instanceof NextResponse) return who
    const { draftId, sendAt, timeZone, toSummary, subject, threadId } = await request.json()

    if (typeof draftId !== 'string' || !ID.test(draftId)) {
      return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
    }
    const when = new Date(typeof sendAt === 'string' ? sendAt : NaN)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'Pick a date and time to send it' }, { status: 400 })
    }
    if (when.getTime() < Date.now() + 60 * 1000) {
      return NextResponse.json({ error: 'Pick a time at least a minute from now' }, { status: 400 })
    }
    if (when.getTime() > Date.now() + MAX_AHEAD_MS) {
      return NextResponse.json({ error: 'Pick a time within a year' }, { status: 400 })
    }
    let zone: string | null = null
    if (typeof timeZone === 'string' && timeZone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone })
        zone = timeZone
      } catch {
        return NextResponse.json({ error: 'Unknown time zone' }, { status: 400 })
      }
    }

    // The draft must be in the mailbox the scheduler will send from.
    let mailboxUserId: string
    try {
      const mailbox = await getMailboxGmail(who.userId)
      mailboxUserId = mailbox.mailboxUserId
      await mailbox.gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'minimal' })
    } catch (err) {
      if (err instanceof GmailAuthError) return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('scheduled_emails')
      .insert({
        org_id: who.orgId,
        created_by: who.userId,
        mailbox_user_id: mailboxUserId,
        draft_id: draftId,
        thread_id: typeof threadId === 'string' && ID.test(threadId) ? threadId : null,
        to_summary: typeof toSummary === 'string' ? toSummary.slice(0, 500) : null,
        subject: typeof subject === 'string' ? subject.slice(0, 500) : null,
        send_at: when.toISOString(),
        time_zone: zone,
      })
      .select('id, send_at, time_zone')
      .single()
    if (error) {
      // The live-draft unique index: this draft is already scheduled.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'This draft is already scheduled' }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ scheduled: data })
  } catch (err) {
    console.error('Schedule email error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const who = await caller()
    if (who instanceof NextResponse) return who
    const id = request.nextUrl.searchParams.get('id') || ''
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    // Only one that has not started sending; a run that claimed it meanwhile wins.
    const { data, error } = await supabase
      .from('scheduled_emails')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', who.orgId)
      .in('status', ['scheduled', 'failed'])
      .select('id, draft_id')
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'It is already sending or sent' }, { status: 409 })
    }
    return NextResponse.json({ success: true, draftId: data[0].draft_id })
  } catch (err) {
    console.error('Cancel scheduled email error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
