-- ============================================
-- Rate/content tables: anon-readable → authenticated-only
-- Date: 2026-07-14. Idempotent (safe to re-run).
-- ============================================
-- Closes the last deliberately-open anon surface from the June RLS work.
-- Every legitimate reader is now authenticated: browser reads go through the
-- cookie-session client (PR #40), and all API routes use the service-role
-- client (anon-client migration + PR #47 follow-ups; the two inline-anon
-- tours routes were converted in the same PR as this migration).
--
-- Also fixes the `guides` VIEW leak: the view over suppliers(type='guide')
-- ran owner-privileged (no security_invoker), so it exposed supplier contact
-- data to anon EVEN THOUGH the suppliers table itself is RLS-locked.
--
-- After applying, the health probe (/api/health/system) treats all of these
-- as MUST_BE_LOCKED — any future regression fails the next E2E run.

-- ── 1. Rate/content tables → RLS on, ALL prior policies dropped,
--       one authenticated-only policy (matches the 20260630 hardening
--       convention). Dropping all policies matters: a leftover permissive
--       PUBLIC/anon policy would OR together with the new one and keep the
--       table open.
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transportation_rates',
    'accommodation_rates',
    'guide_rates',
    'meal_rates',
    'nile_cruises',
    'tour_templates',
    'airport_staff_rates',
    'hotel_staff_rates',
    'tipping_rates'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      END LOOP;
      EXECUTE format(
        'CREATE POLICY %I_authenticated_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t, t
      );
      RAISE NOTICE 'locked %', t;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'skip missing table %', t;
    END;
  END LOOP;
END $$;

-- ── 2. guides view: respect the querying role's RLS on suppliers.
--       anon → suppliers policies yield 0 rows → guides empty for anon.
--       authenticated → suppliers_authenticated policy applies as before.
--       Service-role callers (all /api/guides* routes) bypass RLS unchanged.
--       The INSTEAD OF triggers are unaffected (writes flow into suppliers,
--       where RLS/role rules already apply).
ALTER VIEW public.guides SET (security_invoker = on);

-- ── Verification (run after applying):
--   As anon (Supabase SQL editor: `set role anon;` or use the REST probe):
--     SELECT count(*) FROM transportation_rates;  -- expect 0
--     SELECT count(*) FROM guides;                -- expect 0
--   Or from the repo: the /api/health/system RLS probe, or
--     npm run test:e2e (the authed health test asserts zero exposure).
