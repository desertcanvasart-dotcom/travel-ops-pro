// ============================================
// API: /api/cron/gmail-sync — keep the shared inbox current
// ============================================
// Syncs every connected Gmail mailbox (today: the office's one address) into
// the shared inbox every 10 minutes (lib/cron/scheduler.ts). Until 2026-09-17
// mail was synced only when someone pressed Sync — prod was last synced on
// 2026-09-03 — so nothing could say whether a customer was still waiting for
// an answer, and a reply sent from Gmail directly never reached the app.
//
// After syncing: stored mail from the office's own addresses is repaired, and
// new travel requests become Leads (lib/email/email-leads).
//
// Each run replays Gmail's history since the last one and downloads only
// mail not stored yet (lib/email/sync-mailbox); without a usable history id it
// lists a short window instead (the last 3 days, 50 messages). The manual Sync
// button still does the 30-day catch-up. One mailbox failing (a revoked
// token) never stops the next.
//
// Auth: lib/cron/auth (fails closed).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { jobRunHeaders, withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { syncMailbox } from '@/lib/email/sync-mailbox'
import { applyOfficeRuleWhenDue, loadOfficeRule } from '@/lib/email/office-addresses-server'
import { processNewEmailLeads } from '@/lib/email/email-leads'

export const dynamic = 'force-dynamic'

async function getHandler(request: NextRequest) {
  // Fails closed: see lib/cron/auth.
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const { data: mailboxes, error } = await db.from('gmail_tokens').select('user_id').not('user_id', 'is', null)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: Array<{
    user_id: string; ok: boolean; messages_created?: number
    messages_fetched?: number; messages_already_stored?: number; sync_mode?: string; error?: string
  }> = []
  for (const { user_id } of (mailboxes ?? []) as { user_id: string }[]) {
    try {
      const r = await syncMailbox(user_id, { full_sync: false, max_results: 50, days_back: 3, use_history: true })
      results.push({
        user_id, ok: true, messages_created: r.messages_created,
        messages_fetched: r.messages_fetched, messages_already_stored: r.messages_already_stored, sync_mode: r.sync_mode,
      })
    } catch (e) {
      results.push({ user_id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  // Mail already stored as a customer writing that is really the office's own
  // reply (a colleague's address, an address added in Settings) — fixed on the
  // run the rule changed (and six-hourly as a safety net), so the rule reaches
  // what was synced before it (lib/email/office-addresses-server). Null when
  // not due — the scan reads every inbound message, so not every 10 minutes.
  let reclassified: { messages: number; conversations: number } | null = null
  try {
    reclassified = await applyOfficeRuleWhenDue(db, await loadOfficeRule(db))
  } catch (e) {
    console.error('[gmail-sync] office-address re-classify failed:', e)
  }

  // New travel requests by email become Leads (lib/email/email-leads).
  let leads: Array<{ conversationId: string; outcome: string }> = []
  try {
    leads = await processNewEmailLeads(db)
  } catch (e) {
    console.error('[gmail-sync] lead detection failed:', e)
  }

  const failed = results.filter(r => !r.ok)
  const leadsCreated = leads.filter(l => l.outcome === 'lead_created').length
  // One line for job_runs: how much was downloaded vs already stored says at a
  // glance whether the incremental sync is working.
  const sum = (k: 'messages_fetched' | 'messages_already_stored' | 'messages_created') =>
    results.reduce((n, r) => n + (r[k] ?? 0), 0)
  const modes = [...new Set(results.filter(r => r.sync_mode).map(r => r.sync_mode))].join('+') || 'none'
  const summary = `${results.length} mailbox(es), ${failed.length} failed (${modes}): fetched ${sum('messages_fetched')} new, `
    + `${sum('messages_already_stored')} already stored, ${sum('messages_created')} stored; `
    + `office repair ${reclassified ? `${reclassified.messages} msg(s)` : 'not due'}; ${leadsCreated} lead(s)`
  return NextResponse.json(
    { ok: failed.length === 0, mailboxes: results.length, results, reclassified, leads_created: leadsCreated },
    {
      status: failed.length && failed.length === results.length ? 500 : 200,
      headers: jobRunHeaders(failed.length ? 'failed' : 'ok', summary),
    },
  )
}

export const GET = withJobRun('gmail-sync', () => createServerClient(), getHandler)
