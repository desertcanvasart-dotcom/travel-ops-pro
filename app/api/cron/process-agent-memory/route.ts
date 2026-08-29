// ============================================================
// app/api/cron/process-agent-memory/route.ts
//
// Agent Memory Feedback Loop — nightly cron.
// Ported from the sibling app (autoura-saas), adapted to ORG multi-tenancy
// and this app's Bearer cron-auth pattern.
//
// What it does:
//   1. Finds successful itinerary agent_runs not yet processed for memory
//      (and >5 min old, so the itinerary is fully written)
//   2. Calls processRunForMemory() for each, then marks it processed
//   3. Purges expired memories
//   4. Returns a summary
//
// Scheduling (Vercel cron — add to vercel.json):
//   { "crons": [{ "path": "/api/cron/process-agent-memory", "schedule": "0 2 * * *" }] }
// Vercel sends the CRON_SECRET as `Authorization: Bearer <secret>`.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { processRunForMemory } from '@/lib/agent-memory'

// Lazy-init admin client (same pattern as other cron routes). Typed loosely
// because agent_runs / the purge RPC aren't in the generated Database types yet.
let _supabaseAdmin: any = null
function getSupabaseAdmin(): any {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

async function getHandler(request: NextRequest) {
  // Verify cron secret — same Bearer pattern as the other cron routes.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const supabaseAdmin = getSupabaseAdmin()

  // STEP 1: find unprocessed successful itinerary runs, >5 min old (so the
  // itinerary + services + days are fully written before we analyse them).
  const cutoffTime = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  type AgentRun = { id: string; org_id: string; itinerary_id: string }
  const { data: runsToProcess, error: fetchError } = await supabaseAdmin
    .from('agent_runs')
    .select('id, org_id, itinerary_id')
    .eq('status', 'success')
    .eq('agent_type', 'itinerary')
    .eq('processed_for_memory', false)
    .not('itinerary_id', 'is', null)
    .lte('created_at', cutoffTime)
    .order('created_at', { ascending: true })
    .limit(100)

  if (fetchError) {
    console.error('🧠 Memory cron: failed to fetch runs:', fetchError)
    return NextResponse.json({ success: false, error: clientMessage(fetchError, 'Internal server error') }, { status: 500 })
  }

  const runs = (runsToProcess || []) as unknown as AgentRun[]

  // STEP 2: process each run, then mark it processed (idempotent — a re-run
  // would only reinforce existing memories, but the flag avoids the work).
  let totalMemoriesWritten = 0
  let runsProcessed = 0
  let runsFailed = 0
  const processedIds: string[] = []

  for (const run of runs) {
    try {
      const result = await processRunForMemory({
        supabaseAdmin,
        org_id: run.org_id,
        itinerary_id: run.itinerary_id,
      })
      totalMemoriesWritten += result.memories_written
      runsProcessed++
      processedIds.push(run.id)
    } catch (err) {
      console.error(`🧠 Failed to process run ${run.id}:`, err)
      runsFailed++
    }
  }

  if (processedIds.length > 0) {
    const { error: markErr } = await supabaseAdmin
      .from('agent_runs')
      .update({ processed_for_memory: true })
      .in('id', processedIds)
    if (markErr) console.error('🧠 Failed to mark runs processed:', markErr)
  }

  // STEP 3: purge expired memories
  let memoriesPurged = 0
  try {
    const { data: purgeResult } = await supabaseAdmin.rpc('purge_expired_agent_memories')
    memoriesPurged = Number(purgeResult) || 0
  } catch (err) {
    console.error('🧠 Memory purge failed:', err)
  }

  return NextResponse.json({
    success: true,
    runs_found: runs.length,
    runs_processed: runsProcessed,
    runs_failed: runsFailed,
    memories_written: totalMemoriesWritten,
    memories_purged: memoriesPurged,
    duration_ms: Date.now() - startTime,
  })
}

// Recorded in job_runs so the support bundle can answer "has this job ever run
// here?". Wrapping the ROUTE covers both the in-process scheduler (which calls
// this handler directly) and any external caller. Fail-open: if the recording
// cannot happen, the job still runs — see lib/support/job-runs.ts.
export const GET = withJobRun('process-agent-memory', () => createServerClient(), getHandler)
