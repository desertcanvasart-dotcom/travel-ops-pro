-- ============================================
-- Lock the public schema against the anonymous key (deny-by-default)
-- ============================================
-- 2026-08-21. The `guides` view exposure led to a full audit of what PostgREST
-- actually publishes: 171 resources, of which 47 returned real rows to the
-- anon key — a key that ships in every browser bundle. Among them:
-- unified_conversations (131), whatsapp_messages (61), v_daily_services (41),
-- _deprecated_guides (34), the four *_contacts tables (84 together),
-- team_members (7), invoice_payments, high_value_clients, and the whole cost
-- structure (service_fees, flight_rates, profit_margins, discount_rules …).
-- A further 52 read zero only because they are EMPTY, including
-- accounting_tokens and client_documents — those leak on first insert.
--
-- The old health probe checked a hand-maintained list of 39 names, which is
-- why one view was caught and 46 resources were not. This migration inverts
-- the default at the GRANT layer, where a missing list entry cannot matter.
--
-- Deliberately schema-driven rather than a list of 171 names: a list is the
-- thing that failed. Anything in `public` is covered, including tables added
-- after this was written.
--
-- What it does NOT do: it never widens an existing policy. A table that
-- already has policies keeps exactly those; only tables with none get a
-- permissive authenticated policy, which preserves today's app behaviour
-- (any logged-in user sees what they see now) while removing anon entirely.
-- Org-scoping is a separate question and is not addressed here.
--
-- Safe for the public pages: /share/[token] and /portal/[token] read with the
-- SERVICE ROLE key, and the anon-key API routes pass the user's session
-- cookies, so they act as `authenticated`, not `anon`.
-- ============================================

BEGIN;

DO $$
DECLARE
  r            record;
  n_rls        int := 0;
  n_policy     int := 0;
  n_view       int := 0;
  n_matview    int := 0;
  n_revoked    int := 0;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')   -- table, partitioned, view, matview
    ORDER BY c.relname
  LOOP
    -- 1. The hammer: the anonymous role loses every privilege on every object.
    --    This alone closes the exposure; the rest is defence in depth.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    n_revoked := n_revoked + 1;

    IF r.relkind IN ('r', 'p') THEN
      -- 2. A table with RLS on and no policy denies everyone (service role
      --    excepted), which would break the app. Give policy-less tables a
      --    permissive authenticated policy FIRST, then switch RLS on.
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.relname
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
          left(r.relname, 55) || '_authenticated', r.relname
        );
        n_policy := n_policy + 1;
      END IF;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
      n_rls := n_rls + 1;

    ELSIF r.relkind = 'v' THEN
      -- 3. Views run as their DEFINER unless told otherwise, which is how
      --    `guides` bypassed RLS on suppliers. Caller's rights, always.
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', r.relname);
      n_view := n_view + 1;

    ELSIF r.relkind = 'm' THEN
      -- Materialised views cannot take security_invoker; the REVOKE above is
      -- the whole protection, so they are reported separately.
      n_matview := n_matview + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'anon revoked on % objects | RLS enabled on % tables (% new policies) | % views set caller-rights | % matviews revoke-only',
    n_revoked, n_rls, n_policy, n_view, n_matview;
END $$;

-- 4. New tables must be born locked. Without this, the next CREATE TABLE picks
--    up the schema's default grants and quietly rejoins the anon surface —
--    exactly how most of the 47 got there.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;

-- Verify: with the ANON key (not service role), every one of these must return
-- zero rows or a permission error. /api/health/system now probes the full
-- PostgREST surface on every E2E run and fails on any anon-visible row.
--   select count(*) from whatsapp_messages;
--   select count(*) from content_library;
--   select count(*) from _deprecated_guides;
