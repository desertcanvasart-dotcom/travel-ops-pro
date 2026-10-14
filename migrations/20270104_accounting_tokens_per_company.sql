-- ============================================
-- Accounting connections and email signatures: each company's own
-- ============================================
-- ACCOUNTING_TOKENS. The Xero / QuickBooks connection was one row per PERSON
-- per provider (UNIQUE (user_id, provider)), stamped with the company the
-- person had active when they connected. With two companies on the install:
--   - a person in both who connected Xero in the second company MOVED the
--     row (the callback upserted on user_id,provider): the first company's
--     sync stopped, and its Integrations tab showed the other company's Xero;
--   - the Integrations tab and Disconnect read the caller's OWN row, so a
--     second admin saw "Connect Xero" while a colleague's connection was
--     live, and connecting again silently switched the company's books to
--     the newer file (the sync takes the newest active row);
--   - nothing stopped a company having Xero AND QuickBooks active; the sync
--     pushed to whichever was connected last.
-- Now the connection belongs to the COMPANY whose books it writes:
--   UNIQUE (org_id, provider)          one Xero and one QuickBooks row per
--                                      company; user_id stays as "who
--                                      connected it".
--   accounting_tokens_one_active_per_org (partial unique index on org_id
--                                      WHERE is_active): one accounting
--                                      provider per company. Connecting the
--                                      other provider deactivates this one
--                                      (app/api/auth/accounting/callback).
-- The old UNIQUE (user_id, provider) is dropped: a person in both companies
-- may connect each company's books.
--
-- Backfill (org_id has been NOT NULL since the baseline, so on the live
-- install only the guarded branches below that find rows do anything):
--   1. org_id added if missing; a row without one goes to its connecting
--      person's company when they belong to exactly ONE
--      (org_backfill_user_org). A row that cannot be traced that way cannot
--      sync anywhere (the sync reads by org_id) and is removed, listed in
--      org_backfill_review with the person and provider so an admin of the
--      right company reconnects it.
--   2. Two rows for one (company, provider) — two admins each connected —
--      keep the one the sync was using (active first, then newest); the
--      others are removed and listed.
--   3. A company with both providers active keeps the newest (the one the
--      sync was using); the other is deactivated, kept, and listed.
--   4. Every row connected by a person who belongs to more than one company
--      is listed for the owner to check ("connected by a person in both
--      companies — check it is this company's books"): the stamp came from
--      the company they had active, which may have been the wrong one.
--
-- RLS: the four policies let ANY member of the company read, insert,
-- update or delete the company's tokens straight through PostgREST — around
-- the admin-only connect / disconnect routes. No browser code touches the
-- table (the routes use the service role), so the policies are dropped: RLS
-- stays on, and only the service role reads or writes it.
--
-- EMAIL_SIGNATURES had no org_id: someone in both companies signed one
-- company's customer mail with the other company's signature (the default
-- signature is inserted by Compose and the Inbox). Now:
--   org_id uuid REFERENCES organizations ON DELETE CASCADE.
--   Backfill: the owner's company when they belong to exactly ONE. Anyone
--   else's signature (both companies, or none) is NOT guessed: org_id stays
--   NULL, the row is listed in org_backfill_review, and it shows in neither
--   company until the owner sets org_id (or the person writes it again).
--   The column stays nullable for those rows; the API always stamps it.
--   Policy: own row AND in that company (was own row in any company).
--
-- REVIEW:
--   SELECT * FROM org_backfill_review
--    WHERE table_name IN ('accounting_tokens', 'email_signatures') ORDER BY id;
--
-- Idempotent and replay-safe: every table guarded with to_regclass; ADD
-- COLUMN IF NOT EXISTS; every UPDATE / DELETE only touches rows still in
-- the state it fixes; review rows ON CONFLICT DO NOTHING; constraints and
-- policies dropped by name before they are added. Applying it twice changes
-- nothing the second time. On a bare replay the helpers return NULL and the
-- tables are empty: nothing is written.
BEGIN;

-- ── accounting_tokens ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.accounting_tokens') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.accounting_tokens ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

  -- 1. Rows with no company: the connecting person's one company.
  UPDATE public.accounting_tokens t
     SET org_id = public.org_backfill_user_org(t.user_id)
   WHERE t.org_id IS NULL
     AND public.org_backfill_user_org(t.user_id) IS NOT NULL;

  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'accounting_tokens', t.id::text, NULL,
         CASE WHEN (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = t.user_id) > 1
              THEN 'connected by a person in both companies (user ' || t.user_id || ', ' || t.provider || ') — removed; an admin reconnects it from the right company'
              ELSE 'connected by a person in no company (user ' || t.user_id || ', ' || t.provider || ') — removed; an admin reconnects it from the right company' END
    FROM public.accounting_tokens t
   WHERE t.org_id IS NULL
  ON CONFLICT DO NOTHING;
  DELETE FROM public.accounting_tokens WHERE org_id IS NULL;

  ALTER TABLE public.accounting_tokens ALTER COLUMN org_id SET NOT NULL;

  -- 2. One row per (company, provider): keep the one the sync used.
  WITH ranked AS (
    SELECT id, org_id, provider,
           row_number() OVER (PARTITION BY org_id, provider
                              ORDER BY coalesce(is_active, false) DESC, created_at DESC NULLS LAST, id DESC) AS rn
      FROM public.accounting_tokens
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'accounting_tokens', r.id::text, r.org_id,
         'second ' || r.provider || ' connection in the same company — removed; the one the sync was using is kept'
    FROM ranked r WHERE r.rn > 1
  ON CONFLICT DO NOTHING;
  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY org_id, provider
                              ORDER BY coalesce(is_active, false) DESC, created_at DESC NULLS LAST, id DESC) AS rn
      FROM public.accounting_tokens
  )
  DELETE FROM public.accounting_tokens t USING ranked r WHERE t.id = r.id AND r.rn > 1;

  -- 3. One active provider per company: keep the newest active.
  WITH ranked AS (
    SELECT id, org_id, provider,
           row_number() OVER (PARTITION BY org_id ORDER BY created_at DESC NULLS LAST, id DESC) AS rn
      FROM public.accounting_tokens
     WHERE is_active
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'accounting_tokens', r.id::text, r.org_id,
         'company had two accounting providers active — ' || r.provider || ' deactivated; the sync keeps the newest'
    FROM ranked r WHERE r.rn > 1
  ON CONFLICT DO NOTHING;
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY created_at DESC NULLS LAST, id DESC) AS rn
      FROM public.accounting_tokens
     WHERE is_active
  )
  UPDATE public.accounting_tokens t SET is_active = false, updated_at = now()
    FROM ranked r WHERE t.id = r.id AND r.rn > 1;

  -- 4. For the owner to check: stamped from a person in both companies.
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'accounting_tokens', t.id::text, t.org_id,
         'connected by a person in both companies — check it is this company''s books'
    FROM public.accounting_tokens t
   WHERE (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = t.user_id) > 1
  ON CONFLICT DO NOTHING;

  ALTER TABLE public.accounting_tokens DROP CONSTRAINT IF EXISTS accounting_tokens_user_id_provider_key;
  ALTER TABLE public.accounting_tokens DROP CONSTRAINT IF EXISTS accounting_tokens_org_id_provider_key;
  ALTER TABLE public.accounting_tokens ADD CONSTRAINT accounting_tokens_org_id_provider_key UNIQUE (org_id, provider);
  CREATE UNIQUE INDEX IF NOT EXISTS accounting_tokens_one_active_per_org
    ON public.accounting_tokens (org_id) WHERE is_active;
  CREATE INDEX IF NOT EXISTS idx_accounting_tokens_org_id ON public.accounting_tokens (org_id);

  ALTER TABLE public.accounting_tokens ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS accounting_tokens_org_select ON public.accounting_tokens;
  DROP POLICY IF EXISTS accounting_tokens_org_insert ON public.accounting_tokens;
  DROP POLICY IF EXISTS accounting_tokens_org_update ON public.accounting_tokens;
  DROP POLICY IF EXISTS accounting_tokens_org_delete ON public.accounting_tokens;
END
$$;

-- ── email_signatures ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.email_signatures') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.email_signatures
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

  UPDATE public.email_signatures s
     SET org_id = public.org_backfill_user_org(s.user_id)
   WHERE s.org_id IS NULL AND s.user_id IS NOT NULL
     AND public.org_backfill_user_org(s.user_id) IS NOT NULL;

  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'email_signatures', s.id::text, NULL,
         CASE WHEN (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = s.user_id) > 1
              THEN 'signature of a person in both companies — not assigned; set org_id to the company it signs for'
              ELSE 'signature of a person in no company — not assigned' END
    FROM public.email_signatures s
   WHERE s.org_id IS NULL
  ON CONFLICT DO NOTHING;

  CREATE INDEX IF NOT EXISTS idx_email_signatures_user_org ON public.email_signatures (user_id, org_id);

  DROP POLICY IF EXISTS "Users can manage their own signatures" ON public.email_signatures;
  DROP POLICY IF EXISTS email_signatures_own_in_org ON public.email_signatures;
  CREATE POLICY email_signatures_own_in_org ON public.email_signatures TO authenticated
    USING (auth.uid() = user_id AND org_id IS NOT NULL AND public.user_is_in_org(org_id))
    WITH CHECK (auth.uid() = user_id AND org_id IS NOT NULL AND public.user_is_in_org(org_id));
END
$$;

COMMIT;
