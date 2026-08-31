// ============================================
// /api/cron/dispatch-scheduled-sends
// Dispatches due rows from scheduled_sends (status='pending', scheduled_for<=now).
// Email → /api/send-email (Gmail, same path the reminder cron uses);
// WhatsApp → sendWhatsAppMessage (Twilio). Each result is logged to
// template_send_log and the scheduled_sends row is marked sent/failed.
//
// This is the dispatcher the sibling app never built — without it, scheduled
// sends would sit pending forever. Bearer-auth like our other crons; OPEN when
// CRON_SECRET is unset (matches existing convention).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { businessIdentity } from '@/lib/org-identity'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { sendEmailInternal } from '@/lib/email-send'

const CRON_SECRET = process.env.CRON_SECRET
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH = 50

async function dispatchOne(row: any): Promise<{ ok: boolean; error?: string }> {
  if (row.channel === 'whatsapp') {
    const r = await sendWhatsAppMessage({ to: row.recipient_contact, body: row.body })
    return { ok: r.success, error: r.error }
  }
  if (row.channel === 'email') {
    const brand = businessIdentity()
    const subject = row.subject || (brand.name ? `Message from ${brand.name}` : 'Message from your travel agency')
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;white-space:pre-wrap;line-height:1.6">${
      String(row.body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</div>`
    const result = await sendEmailInternal({ to: row.recipient_contact, subject, html })
    if (result.success) return { ok: true }
    return { ok: false, error: result.error || 'send-email failed' }
  }
  // No SMS provider wired — fail explicitly rather than silently drop.
  return { ok: false, error: `Unsupported channel: ${row.channel}` }
}

async function run() {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabaseAdmin
    .from('scheduled_sends')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH)

  if (error) {
    return { success: false, error: clientMessage(error, 'Internal server error'), processed: 0, sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0
  for (const row of due || []) {
    const result = await dispatchOne(row)
    if (result.ok) sent++
    else failed++

    await supabaseAdmin
      .from('scheduled_sends')
      .update({
        status: result.ok ? 'sent' : 'failed',
        sent_at: result.ok ? new Date().toISOString() : null,
        error_message: result.ok ? null : (result.error || 'Send failed'),
      })
      .eq('id', row.id)

    await supabaseAdmin.from('template_send_log').insert({
      template_id: row.template_id,
      client_id: row.recipient_type === 'client' ? row.recipient_id : null,
      channel: row.channel,
      recipient_email: row.channel === 'email' ? row.recipient_contact : null,
      recipient_phone: row.channel === 'whatsapp' ? row.recipient_contact : null,
      subject: row.subject,
      body_preview: String(row.body).substring(0, 500),
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : (result.error || 'Send failed'),
    })
  }

  return { success: true, processed: (due || []).length, sent, failed }
}

function authed(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return !(CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`)
}

async function getHandler(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await run())
}

async function postHandler(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await run())
}

// Recorded in job_runs so the support bundle can answer "has this job ever run
// here?". Wrapping the ROUTE covers both the in-process scheduler (which calls
// this handler directly) and any external caller. Fail-open: if the recording
// cannot happen, the job still runs — see lib/support/job-runs.ts.
export const GET = withJobRun('dispatch-scheduled-sends', () => createServerClient(), getHandler)
export const POST = withJobRun('dispatch-scheduled-sends', () => createServerClient(), postHandler)
