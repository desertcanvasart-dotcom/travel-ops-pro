-- ============================================
-- job_runs — proof that a scheduled job actually ran
-- ============================================
-- T4 of docs/plans/self-hosting.md. Ported from autoura-saas migration
-- 307_job_runs.sql, adapted to this product.
--
-- WHAT THIS ANSWERS. Eight cron routes exist under app/api/cron. The
-- in-process scheduler (lib/cron/scheduler.ts) schedules four. The other four
-- are triggered by something outside this repository: on 2026-08-29 production
-- exchange rates had been fetched at 01:00 that morning, so
-- refresh-exchange-rates demonstrably runs — but nothing here schedules it and
-- nothing recorded that it had.
--
-- That could only be established because exchange rates happen to stamp
-- api_fetched_at on the data they write. send-reminders, task-reminders and
-- dispatch-scheduled-sends leave no trace at all. If they stopped a year ago,
-- nothing in this product would say so.
--
-- It matters beyond tidiness: without refresh-exchange-rates every historical
-- conversion in the P&L falls back to a stored rate. The report does not break;
-- it quietly stops being true. And purge-traveller-documents is the retention
-- job that destroys passport scans after a trip — a job whose silence is a
-- compliance problem, not an inconvenience.
--
-- NOT ORG-SCOPED, deliberately. These are INSTALL-level jobs: one scheduler
-- runs them for the whole deployment, so an org_id here would be a lie about
-- what the row describes. It is also why the table is service-role only — no
-- organization has business reading job history, including its own.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The job's stable name, not its route: lib/support/job-names.mjs owns the
  -- vocabulary so the scheduler, the bundle and the doctor cannot drift apart.
  job_name TEXT NOT NULL,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL with a started_at in the past is itself a finding: the job began and
  -- the process died before it could say how it went.
  finished_at TIMESTAMPTZ,

  outcome TEXT CHECK (outcome IN ('ok', 'failed')),
  -- A short, ALREADY-REDACTED summary. Never a payload, never a stack trace —
  -- this table is read into a file customers send us.
  detail TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query anyone runs: the latest run of a given job.
CREATE INDEX IF NOT EXISTS idx_job_runs_recent
  ON public.job_runs (job_name, started_at DESC);

-- Deny by default. Reached only by the service role, inside the cron routes and
-- the support bundle.
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.job_runs IS
  'One row per scheduled-job run. Install-level, not organization-level. Read by the support bundle to answer "have the jobs ever run here?".';

COMMIT;
