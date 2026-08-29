-- One row per scheduled job: the last minute-slot that was claimed. The
-- in-process scheduler (lib/cron/scheduler.ts) claims a slot before running
-- a job so two containers never run the same slot.
CREATE TABLE IF NOT EXISTS public.cron_locks (
  job text PRIMARY KEY,
  slot timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_locks ENABLE ROW LEVEL SECURITY;
-- service role only; no policies on purpose.
