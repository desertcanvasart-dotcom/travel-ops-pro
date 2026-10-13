-- ============================================
-- b2b_pricing_rules: only your organisation's rows, through RLS
-- ============================================
-- 20261206 replaced the open policy of every rate table with org-scoped ones
-- but left b2b_pricing_rules out of its list. Its only policy was still the
-- baseline's
--
--   b2b_pricing_rules_authenticated  TO authenticated USING (true) WITH CHECK (true)
--
-- so through PostgREST, with the public anon key and any session, a signed-in
-- user of either company — a viewer included — could read, insert, update
-- and delete every company's rules, or write a row carrying the other
-- company's org_id (Tours audit, Pricing Rules / Transport Packages, #1).
--
-- Nothing prices from the table any more (tiered activity pricing moved to
-- activity_rates.tiers, and the engine stopped reading it), and its API
-- (app/api/b2b/pricing-rules) is removed in the same change. The TABLE AND ITS
-- ROWS ARE KEPT: dropping data is a separate decision.
--
-- The table already has org_id NOT NULL (baseline; FK to organizations), so
-- no backfill is needed. Every policy on it is dropped by name, whatever it
-- was called — a policy added by hand in production would otherwise survive
-- beside these, and policies are OR'd — and replaced by the 20261206 root-
-- table set, TO authenticated only:
--
--   b2b_pricing_rules_org_select   user_is_in_org(org_id)
--   b2b_pricing_rules_org_insert   user_is_in_org(org_id) AND is_manager_or_above()
--   b2b_pricing_rules_org_update   the same, USING and WITH CHECK
--   b2b_pricing_rules_org_delete   the same
--
-- anon loses every table privilege (it matched no policy already; the revoke
-- makes that explicit). The service role bypasses RLS; no API route is
-- affected, and no browser code touches the table.
--
-- Idempotent (every policy dropped before it is created) and guarded on the
-- table existing (to_regclass).
BEGIN;

DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.b2b_pricing_rules') IS NULL THEN RETURN; END IF;

  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'b2b_pricing_rules' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.b2b_pricing_rules', pol.policyname);
  END LOOP;

  ALTER TABLE public.b2b_pricing_rules ENABLE ROW LEVEL SECURITY;

  CREATE POLICY b2b_pricing_rules_org_select ON public.b2b_pricing_rules FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id));
  CREATE POLICY b2b_pricing_rules_org_insert ON public.b2b_pricing_rules FOR INSERT TO authenticated
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY b2b_pricing_rules_org_update ON public.b2b_pricing_rules FOR UPDATE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY b2b_pricing_rules_org_delete ON public.b2b_pricing_rules FOR DELETE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());

  REVOKE ALL ON public.b2b_pricing_rules FROM anon;
END
$$;

COMMIT;
