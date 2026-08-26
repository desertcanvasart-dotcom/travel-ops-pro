// ============================================
// In-process cron scheduler
// ============================================
// Railway has no `[[cron]]` config — only `deploy.cronSchedule`, which runs a
// SERVICE's start command on a schedule (a separate cron service). The
// `[[cron]]` blocks that lived in railway.toml were never read, so the
// nightly jobs never fired. This scheduler runs inside the always-on web
// container instead (started from instrumentation.ts), ticking once a
// minute and invoking each due job's route handler in-process with the
// same bearer secret the route expects.
//
// Two containers (a deploy overlap, a future second replica) must not both
// run a slot: a job claims its slot in cron_locks first, and only the
// claimant runs. A crash mid-run simply loses that slot; the digest's own
// data watermark means nothing is skipped, only delayed.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { matchesCron, minuteSlot } from './schedule'

export interface CronJob {
  name: string
  schedule: string
  /** Loaded lazily so importing the scheduler never pulls every route in. */
  handler: () => Promise<(req: NextRequest) => Promise<Response>>
}

/** The registry. Keep in step with the routes under app/api/cron. */
export const CRON_JOBS: CronJob[] = [
  { name: 'rate-change-digest', schedule: '*/15 * * * *', handler: () => import('@/app/api/cron/rate-change-digest/route').then(m => m.GET) },
  { name: 'process-agent-memory', schedule: '0 2 * * *', handler: () => import('@/app/api/cron/process-agent-memory/route').then(m => m.GET) },
  { name: 'data-invariants', schedule: '15 3 * * *', handler: () => import('@/app/api/cron/data-invariants/route').then(m => m.GET) },
  // Retention: destroy traveller passport scans once their trip has ended.
  { name: 'purge-traveller-documents', schedule: '45 3 * * *', handler: () => import('@/app/api/cron/purge-traveller-documents/route').then(m => m.GET) },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

/**
 * Claim `slot` for `job`. True for exactly one caller per (job, slot):
 * insert wins when no row exists; otherwise an update guarded by
 * `slot < :slot` wins only once.
 */
export async function claimSlot(db: Db, job: string, slot: Date): Promise<boolean> {
  const iso = slot.toISOString()
  const ins = await db.from('cron_locks').insert({ job, slot: iso })
  if (!ins.error) return true
  if (ins.error.code !== '23505') { console.warn(`[cron] claim insert failed for ${job}: ${ins.error.message}`); return false }
  const upd = await db.from('cron_locks').update({ slot: iso }).eq('job', job).lt('slot', iso).select('job')
  if (upd.error) { console.warn(`[cron] claim update failed for ${job}: ${upd.error.message}`); return false }
  return (upd.data?.length ?? 0) > 0
}

export function dueJobs(jobs: CronJob[], slot: Date): CronJob[] {
  return jobs.filter(j => matchesCron(j.schedule, slot))
}

async function invoke(job: CronJob): Promise<void> {
  const handler = await job.handler()
  const headers: Record<string, string> = {}
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await handler(new NextRequest(`${base}/api/cron/${job.name}`, { headers }))
  const text = await res.text().catch(() => '')
  console.log(`[cron] ${job.name} → ${res.status} ${text.slice(0, 200)}`)
}

export async function tick(db: Db, now = new Date(), jobs = CRON_JOBS): Promise<string[]> {
  const slot = minuteSlot(now)
  const ran: string[] = []
  for (const job of dueJobs(jobs, slot)) {
    try {
      if (!(await claimSlot(db, job.name, slot))) continue
      ran.push(job.name)
      await invoke(job)
    } catch (e) {
      console.error(`[cron] ${job.name} failed:`, e instanceof Error ? e.message : e)
    }
  }
  return ran
}

let started = false

/** Start ticking once per minute, aligned to the minute. Idempotent. */
export function startScheduler(): void {
  if (started) return
  started = true
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const msToNextMinute = 60_000 - (Date.now() % 60_000)
  setTimeout(() => {
    void tick(db)
    setInterval(() => { void tick(db) }, 60_000).unref()
  }, msToNextMinute + 500).unref()
  console.log(`[cron] in-process scheduler armed: ${CRON_JOBS.map(j => `${j.name} (${j.schedule})`).join(', ')}`)
}
