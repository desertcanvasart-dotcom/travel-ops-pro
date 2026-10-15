// ============================================
// API: /api/cron/send-scheduled-emails — send what was scheduled for now
// ============================================
// Every minute (lib/cron/scheduler.ts). The rules are in
// lib/email/send-scheduled.ts. Auth: lib/cron/auth (fails closed).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { jobRunHeaders, withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedGmail } from '@/lib/gmail'
import { createNotification } from '@/lib/notifications'
import { sendDueScheduledEmails } from '@/lib/email/send-scheduled'

export const dynamic = 'force-dynamic'

async function getHandler(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await sendDueScheduledEmails({
    db: createServerClient(),
    gmailFor: async (mailboxUserId) => (await getAuthenticatedGmail(mailboxUserId)).gmail,
    notify: (n) => createNotification({ ...n, type: 'email_failed', link: '/inbox', send_email: false }),
  })
  const summary = `${result.sent} sent, ${result.retried} to retry, ${result.failed} failed`
  return NextResponse.json(
    { ok: result.failed === 0, ...result },
    { headers: jobRunHeaders(result.failed ? 'failed' : 'ok', summary) },
  )
}

export const GET = withJobRun('send-scheduled-emails', () => createServerClient(), getHandler)
