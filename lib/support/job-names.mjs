// ============================================
// The scheduled-job vocabulary — RUNTIME CORE
// ============================================
// Plain JavaScript for the same reason as migrate-core.mjs: scripts/doctor.mjs
// is a bare node script and cannot import .ts. Two lists of job names is
// exactly how one of them stops matching what actually runs.
//
// EVERY cron route is here, not just the ones lib/cron/scheduler.ts schedules.
// That gap is the point. Measured 2026-08-29: eight routes exist under
// app/api/cron, and the in-process scheduler's registry names four. The other
// four are triggered by something outside this repository — refresh-exchange-
// rates demonstrably runs (production rates were fetched at 01:00 that day),
// but nothing here schedules it, and nothing in the app records that it ran.
//
// The only reason that could be established at all is that exchange rates
// happen to stamp `api_fetched_at` on the data they write. send-reminders,
// task-reminders and dispatch-scheduled-sends leave no trace whatsoever: if
// they stopped a year ago, nothing in this product would say so.
//
// Listing all eight means a job that never runs is REPORTED as never having
// run, instead of being quietly absent from the report.

/** Every scheduled job in this product, exactly once. */
export const JOB_NAMES = [
  'rate-change-digest',
  'process-agent-memory',
  'data-invariants',
  'purge-traveller-documents',
  'refresh-exchange-rates',
  'send-reminders',
  'task-reminders',
  'dispatch-scheduled-sends',
]

/** The subset lib/cron/scheduler.ts actually schedules in-process. Anything
 *  outside this set depends on a caller this repository does not control. */
export const SCHEDULED_IN_PROCESS = [
  'rate-change-digest',
  'process-agent-memory',
  'data-invariants',
  'purge-traveller-documents',
]
