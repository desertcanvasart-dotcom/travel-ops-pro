// ============================================
// API: /api/cron/copilot-drafts — draft replies on the server
// ============================================
// Every new customer WhatsApp message or email lands in the Copilot inbox as
// 'draft_pending' (lib/copilot-intake). Drafts used to be written by a poller
// in the browser (lib/hooks/use-copilot-poller): only while someone had the
// Copilot screen open, and only for the 10 most recently active threads — a
// message that arrived overnight, or in an older thread, waited undrafted.
//
// This job runs every minute (lib/cron/scheduler.ts) and drafts the pending
// messages of every company, oldest first, up to BATCH per run, so a burst is
// worked through over the next minutes and one run never holds the
// scheduler for long. Messages older than MAX_AGE_HOURS are left alone: a
// first run must not draft a backlog nobody will read (an operator can still
// press Generate on one).
//
// Each draft is written in the 'professional' tone: no one is signed in. An
// operator who prefers their own tone presses Regenerate. Drafting itself,
// its idempotency and its failure marking are lib/copilot/generate-draft's.
//
// Auth: lib/cron/auth (fails closed).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { draftForInboxMessage } from '@/lib/copilot/generate-draft'

export const dynamic = 'force-dynamic'

const BATCH = 5
const MAX_AGE_HOURS = 48
// No new draft is started after this long, so a run ends before the next
// minute's begins and two runs never draft the same message at once.
const TIME_BUDGET_MS = 40_000
let running = false

async function getHandler(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (running) return NextResponse.json({ ok: true, skipped: 'previous run still going' })
  running = true
  try {
    return await draftPending()
  } finally {
    running = false
  }
}

async function draftPending() {
  const started = Date.now()
  const db = createServerClient()
  const since = new Date(Date.now() - MAX_AGE_HOURS * 3_600_000).toISOString()
  const { data: pending, error } = await db
    .from('communication_inbox')
    .select('id, thread_id')
    .eq('status', 'draft_pending')
    .gte('received_at', since)
    .order('received_at', { ascending: true })
    .limit(BATCH)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (pending ?? []) as { id: string; thread_id: string }[]
  if (rows.length === 0) return NextResponse.json({ ok: true, drafted: 0, failed: 0 })

  // Each thread's company scopes the knowledge its draft is grounded in.
  const { data: threads, error: threadError } = await db
    .from('communication_threads')
    .select('id, org_id')
    .in('id', [...new Set(rows.map(r => r.thread_id))])
  if (threadError) return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 })
  const orgOf = new Map(((threads ?? []) as { id: string; org_id: string | null }[]).map(t => [t.id, t.org_id]))

  let drafted = 0
  let failed = 0
  for (const row of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break
    if (!orgOf.has(row.thread_id)) continue
    try {
      const r = await draftForInboxMessage(db, {
        threadId: row.thread_id,
        inboxMessageId: row.id,
        orgId: orgOf.get(row.thread_id) ?? null,
        tone: 'professional',
        pregenerated: true,
      })
      if (r.ok && !r.alreadyExisted) drafted++
    } catch (e) {
      failed++
      console.error('[copilot-drafts] drafting failed for inbox message', row.id, e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ ok: true, drafted, failed })
}

export const GET = withJobRun('copilot-drafts', () => createServerClient(), getHandler)
