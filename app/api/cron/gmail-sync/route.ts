// ============================================
// API: /api/cron/gmail-sync — keep the shared inbox current
// ============================================
// Syncs every connected Gmail mailbox (today: the office's one address) into
// the shared inbox every 10 minutes (lib/cron/scheduler.ts). Until 2026-09-17
// mail was synced only when someone pressed Sync — prod was last synced on
// 2026-09-03 — so nothing could say whether a customer was still waiting for
// an answer, and a reply sent from Gmail directly never reached the app.
//
// A short window each run (the last 3 days, 50 messages): the manual Sync
// button still does the 30-day catch-up. One mailbox failing (a revoked
// token) never stops the next.
//
// Bearer-auth like the other crons (CRON_SECRET; open when unset).

import { NextRequest, NextResponse } from 'next/server'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { syncMailbox } from '@/lib/email/sync-mailbox'

export const dynamic = 'force-dynamic'

async function getHandler(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const { data: mailboxes, error } = await db.from('gmail_tokens').select('user_id').not('user_id', 'is', null)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: Array<{ user_id: string; ok: boolean; messages_created?: number; error?: string }> = []
  for (const { user_id } of (mailboxes ?? []) as { user_id: string }[]) {
    try {
      const r = await syncMailbox(user_id, { full_sync: false, max_results: 50, days_back: 3 })
      results.push({ user_id, ok: true, messages_created: r.messages_created })
    } catch (e) {
      results.push({ user_id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const failed = results.filter(r => !r.ok)
  return NextResponse.json({ ok: failed.length === 0, mailboxes: results.length, results }, { status: failed.length && failed.length === results.length ? 500 : 200 })
}

export const GET = withJobRun('gmail-sync', () => createServerClient(), getHandler)
