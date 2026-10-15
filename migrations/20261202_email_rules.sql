-- ============================================================================
-- 20261202 — inbox rules (filters) kept by the app
-- ============================================================================
--
-- "Filters and rules" (operator, 2026-10-15), chosen to live in the app
-- rather than as Gmail filters: they need no new Google permission and no
-- reconnecting. A rule is a few conditions (from / to / subject / words) and
-- what to do with a match (file in a folder, skip the inbox, mark read, star,
-- trash, spam). After each mail sync (gmail-sync, every 10 minutes) every new
-- inbound message is checked against the organisation's rules once
-- (email_messages.rules_checked_at) and the matching actions are applied in
-- Gmail. "Apply to existing" on a rule is a Gmail search, done by the API.
--
-- Mail already stored is marked checked now: rules act on new mail unless
-- asked to apply to what is already there. Reads are the organisation's
-- (RLS); writes go through the API on the service role. Replay-safe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- { from?, to?, subject?, has_words? } — each a case-insensitive "contains";
  -- every condition given must match.
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { label_id?, skip_inbox?, mark_read?, star?, trash?, spam? }
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_rules_org ON public.email_rules (org_id) WHERE enabled;

ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_rules_org_read ON public.email_rules;
CREATE POLICY email_rules_org_read ON public.email_rules
  FOR SELECT TO authenticated
  USING (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS email_rules_service_role ON public.email_rules;
CREATE POLICY email_rules_service_role ON public.email_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS rules_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.email_messages.rules_checked_at IS
  'When this inbound message was checked against the inbox rules (lib/email/rules). NULL = not yet.';

-- What is already stored is not re-filed by a rule made later.
UPDATE public.email_messages
   SET rules_checked_at = now()
 WHERE rules_checked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_rules_pending
  ON public.email_messages (sent_at)
  WHERE rules_checked_at IS NULL AND direction = 'inbound';

COMMIT;
