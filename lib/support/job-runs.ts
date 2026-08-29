// ============================================
// Recording that a scheduled job ran
// ============================================
// T4 of docs/plans/self-hosting.md. Ported from autoura-saas
// lib/support/job-runs.ts.
//
// THE QUESTION THIS ANSWERS. Eight cron routes exist under app/api/cron. The
// in-process scheduler's registry names four. The other four are triggered by
// something outside this repository — on 2026-08-29 production's exchange
// rates had been fetched at 01:00 that morning, so refresh-exchange-rates
// demonstrably runs, but nothing here schedules it and nothing records it.
//
// That could only be established because exchange rates happen to stamp
// `api_fetched_at` on the data they write. send-reminders, task-reminders and
// dispatch-scheduled-sends leave no trace at all: if they stopped a year ago,
// nothing in this product would say so. One insert per run turns "the
// reminders look like they stopped" from a conversation into a line in the
// support bundle.
//
// FAIL-OPEN, ALWAYS. Losing a bookkeeping row must never fail the work it was
// describing — a support feature that breaks the retention purge would be
// worse than no support feature. Every write here is wrapped and swallowed.

import { redactText, STALE_AFTER_HOURS } from './bundle-core.mjs'
import { JOB_NAMES as NAMES, SCHEDULED_IN_PROCESS as IN_PROCESS } from './job-names.mjs'

/** The vocabulary, owned by job-names.mjs so the scheduler, the bundle and the
 *  doctor script cannot drift apart. Every scheduled job appears exactly once. */
export const JOB_NAMES: readonly string[] = NAMES
export const SCHEDULED_IN_PROCESS: readonly string[] = IN_PROCESS
export type JobName = string

export { STALE_AFTER_HOURS }

/** Rows older than this are removed as each job runs. The table answers "when
 *  did this last run?" and nothing else; a year of history serves no reader. */
const KEEP_DAYS = 30

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface JobRunSummary {
  name: string
  lastRun: string | null
  lastOutcome: string | null
  /** False means nothing in this repository schedules it — see job-names.mjs. */
  scheduledInProcess: boolean
}

function safeDb(getDb: () => DbClient): DbClient | null {
  try {
    return getDb()
  } catch {
    return null
  }
}

/**
 * The latest run of every known job, for the support bundle.
 *
 * A job that has never run appears with nulls rather than being left out —
 * "never ran" is the finding, and a missing row would hide it.
 */
export async function latestJobRuns(db: DbClient): Promise<JobRunSummary[]> {
  const latest = new Map<string, { lastRun: string | null; lastOutcome: string | null }>()
  try {
    const { data } = await db
      .from('job_runs')
      .select('job_name, started_at, outcome')
      .order('started_at', { ascending: false })
      .limit(200)
    for (const row of data ?? []) {
      if (latest.has(row.job_name)) continue
      latest.set(row.job_name, {
        lastRun: row.started_at,
        lastOutcome: row.outcome ?? 'unfinished',
      })
    }
  } catch {
    // No table, no rows — every job reports as never run, which is true enough
    // for the reader: nothing here has recorded a run.
  }

  return JOB_NAMES.map(name => ({
    name,
    lastRun: latest.get(name)?.lastRun ?? null,
    lastOutcome: latest.get(name)?.lastOutcome ?? null,
    scheduledInProcess: SCHEDULED_IN_PROCESS.includes(name),
  }))
}

/** Has this job gone quiet? Null lastRun is "never", handled separately. */
export function isStale(lastRun: string | null, now: Date = new Date()): boolean {
  if (!lastRun) return false
  const then = Date.parse(lastRun)
  if (!Number.isFinite(then)) return false
  return now.getTime() - then > STALE_AFTER_HOURS * 3600000
}

/**
 * Wrap a cron route handler so that running it is recorded.
 *
 * One line per route, and the handler's body is untouched — which matters
 * because these jobs are the ones nobody notices when they stop, and a
 * refactor is exactly how that starts.
 *
 * Wrapping the ROUTE rather than the scheduler is deliberate: the in-process
 * scheduler invokes these handlers directly, so a route-level wrapper records
 * both the scheduled path AND any external caller. Wrapping the scheduler
 * would have recorded only the four jobs it knows about, which is precisely
 * the blind spot this table exists to remove.
 *
 * The outcome comes from the RESPONSE STATUS, not from whether the handler
 * threw: these routes report failure as a 500 body rather than by throwing, and
 * a run that answered 500 is a failed run.
 *
 * An unauthenticated probe (401) is not a run and leaves nothing behind — the
 * start row is removed again. A run that never answers at all keeps its start
 * row with no finish, which reads correctly as "began, never reported".
 */
export function withJobRun<A extends unknown[]>(
  name: JobName,
  getDb: () => DbClient,
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    let runId: string | null = null
    const db = safeDb(getDb)
    if (db) {
      try {
        const { data } = await db
          .from('job_runs')
          .insert({ job_name: name, started_at: new Date().toISOString() })
          .select('id')
          .single()
        runId = (data?.id as string) ?? null
      } catch {
        // Table absent (migration unapplied), or the database is down. The job
        // must still run — that is the whole fail-open rule.
      }
    }

    const discard = async () => {
      if (!db || !runId) return
      try {
        await db.from('job_runs').delete().eq('id', runId)
      } catch {
        /* bookkeeping only */
      }
    }

    const finish = async (outcome: 'ok' | 'failed', detail?: unknown) => {
      if (!db || !runId) return
      try {
        await db
          .from('job_runs')
          .update({
            finished_at: new Date().toISOString(),
            outcome,
            // Already redacted, and short: this table is read into a file the
            // customer sends us.
            detail: detail == null ? null : redactText(detail).slice(0, 300),
          })
          .eq('id', runId)
        await db
          .from('job_runs')
          .delete()
          .eq('job_name', name)
          .lt('started_at', new Date(Date.now() - KEEP_DAYS * 86400000).toISOString())
      } catch {
        /* bookkeeping only */
      }
    }

    try {
      const res = await handler(...args)
      if (res.status === 401 || res.status === 403) {
        // A rejected probe is not a run. Recording it would make an attacker's
        // curl look like a healthy scheduler.
        await discard()
        return res
      }
      if (res.ok) await finish('ok')
      else await finish('failed', `HTTP ${res.status}`)
      return res
    } catch (err) {
      await finish('failed', err instanceof Error ? err.message : err)
      throw err
    }
  }
}
