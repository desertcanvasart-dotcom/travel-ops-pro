// ============================================
// Rate-change digest — every 15 minutes (railway.toml)
// ============================================
// Reads rate_audit_log since the last run, groups by actor × table, and
// tells each org's owners/admins/managers ONCE per group (the actor is not
// told about their own edit). A bulk import of 79 entrance fees is one
// notification, not 79. The org chooses in-app / in-app + e-mail / off on
// the Company Profile (organizations.rate_change_alerts).
//
// Catches every write path — the app, imports, the SQL editor — because it
// reads the trigger-written audit log, not the API.
// ============================================
import { NextRequest, NextResponse } from 'next/server'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { groupChanges, describeGroup, type AuditRow } from '@/lib/rate-change-digest'
import { notifyOrgManagers } from '@/lib/notify-managers'

const JOB = 'rate-change-digest'
const FIRST_RUN_LOOKBACK_MS = 15 * 60 * 1000
const SETTLE_MS = 30 * 1000          // rows younger than this wait for the next run
const MAX_ROWS = 2000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getHandler(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const until = new Date(now - SETTLE_MS).toISOString()
  const { data: wm } = await supabase.from('cron_watermarks').select('last_run_at').eq('job', JOB).maybeSingle()
  const since = wm?.last_run_at ?? new Date(now - FIRST_RUN_LOOKBACK_MS).toISOString()

  const { data: rows, error } = await supabase
    .from('rate_audit_log')
    .select('id, table_name, record_id, action, changed_fields, full_old_record, full_new_record, changed_by, changed_at')
    .gt('changed_at', since)
    .lte('changed_at', until)
    .order('changed_at', { ascending: true })
    .limit(MAX_ROWS)
  if (error) {
    console.error('[rate-change-digest] audit read failed:', error.message)
    return NextResponse.json({ error: 'audit read failed' }, { status: 500 })
  }
  const audit = (rows ?? []) as AuditRow[]
  const truncated = audit.length === MAX_ROWS
  if (truncated) console.warn(`[rate-change-digest] window ${since}..${until} hit the ${MAX_ROWS}-row cap; later rows wait for the next run`)

  // Watermark: to the last row we processed when capped, else to `until`.
  const nextWatermark = truncated ? audit[audit.length - 1].changed_at : until

  const groups = groupChanges(audit)
  const stats = { since, until, rows: audit.length, groups: groups.length, notified: 0, orgs: 0, truncated }

  if (groups.length) {
    const actorIds = [...new Set(groups.map(g => g.actorId).filter((x): x is string => !!x))]
    const names = new Map<string, string>()
    if (actorIds.length) {
      const { data: profiles } = await supabase.from('user_profiles').select('id, full_name, email').in('id', actorIds)
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        names.set(p.id, p.full_name?.trim() || p.email || p.id.slice(0, 8))
      }
    }
    const { data: orgs } = await supabase.from('organizations').select('id, rate_change_alerts').neq('rate_change_alerts', 'off')
    for (const org of (orgs ?? []) as Array<{ id: string; rate_change_alerts: string }>) {
      stats.orgs++
      for (const g of groups) {
        const n = describeGroup(g, g.actorId ? names.get(g.actorId) ?? null : null)
        const r = await notifyOrgManagers(supabase, org.id, {
          ...n,
          type: 'rate_changed',
          excludeUserId: g.actorId,
          send_email: org.rate_change_alerts === 'in_app_email',
        })
        stats.notified += r.created
      }
    }
  }

  await supabase.from('cron_watermarks').upsert({ job: JOB, last_run_at: nextWatermark, updated_at: new Date().toISOString() })
  return NextResponse.json({ success: true, ...stats })
}

// Recorded in job_runs so the support bundle can answer "has this job ever run
// here?". Wrapping the ROUTE covers both the in-process scheduler (which calls
// this handler directly) and any external caller. Fail-open: if the recording
// cannot happen, the job still runs — see lib/support/job-runs.ts.
export const GET = withJobRun('rate-change-digest', () => createServerClient(), getHandler)
