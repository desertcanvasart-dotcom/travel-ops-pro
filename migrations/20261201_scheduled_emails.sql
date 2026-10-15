-- ============================================================================
-- 20261201 — emails scheduled to send later
-- ============================================================================
--
-- "Send later — at 9:00 Japan time" (operator, 2026-10-15). Gmail's API has
-- no scheduled send, so the app keeps the schedule: the message is a Gmail
-- draft in the organisation's mailbox (so it can still be opened and edited in
-- Drafts), and this row says which draft goes when. The in-process scheduler
-- (lib/cron/scheduler.ts, send-scheduled-emails, every minute) sends each due
-- draft with Gmail's drafts.send and records the outcome.
--
-- status: scheduled → sending (claimed by a run) → sent | failed;
--         cancelled when someone cancels it (the draft stays in Drafts).
--
-- Reads are the organisation's (RLS); every write goes through the API on the
-- service role. Additive and replay-safe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Who scheduled it, and whose Gmail connection holds the draft.
  created_by UUID,
  mailbox_user_id UUID NOT NULL,
  draft_id TEXT NOT NULL,
  thread_id TEXT,
  -- For the Scheduled list; the draft itself is the message.
  to_summary TEXT,
  subject TEXT,
  send_at TIMESTAMPTZ NOT NULL,
  -- The zone the time was chosen in (e.g. Asia/Tokyo), to show it back.
  time_zone TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_message_id TEXT,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The scheduler's question: what is due now.
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due
  ON public.scheduled_emails (send_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_org
  ON public.scheduled_emails (org_id, send_at DESC);
-- One live schedule per draft.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_emails_live_draft
  ON public.scheduled_emails (mailbox_user_id, draft_id)
  WHERE status IN ('scheduled', 'sending');

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_emails_org_read ON public.scheduled_emails;
CREATE POLICY scheduled_emails_org_read ON public.scheduled_emails
  FOR SELECT TO authenticated
  USING (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS scheduled_emails_service_role ON public.scheduled_emails;
CREATE POLICY scheduled_emails_service_role ON public.scheduled_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
