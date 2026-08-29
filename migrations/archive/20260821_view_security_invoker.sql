-- ============================================
-- RLS: every compatibility/convenience VIEW must run as the CALLER
-- ============================================
-- Found 2026-08-21 by the /api/health/system anon probe in E2E: the `guides`
-- view returned 19 rows to the anonymous internet while `suppliers` (its only
-- source table) correctly returned 0.
--
-- Cause: `CREATE OR REPLACE VIEW` does not preserve the view's reloptions.
-- 20260714_rate_tables_authenticated_only.sql set security_invoker on
-- `guides`; 20260821_supplier_multi_type.sql later re-issued CREATE OR REPLACE
-- without the WITH clause, so the view silently reverted to DEFINER rights and
-- began bypassing RLS on suppliers. Same defect in 20260821_retire_staff_tables
-- (airport_staff/hotel_staff), and the 20260203 language views never had it at
-- all.
--
-- Exposed at the time of this migration (anon count / real count):
--   guides 19/19, airport_staff 6/6, itineraries_with_languages 7/7,
--   tour_templates_with_languages 26/26, client_summary 1/1
--   (hotel_staff 0, quotes_with_languages 0 — empty, not locked)
--
-- Rule going forward: any CREATE OR REPLACE VIEW must carry
-- `WITH (security_invoker = on)` inline. __tests__/migrations/
-- view-security-invoker.test.ts fails the build otherwise.
-- ============================================

BEGIN;

-- 1. Caller's rights, so the source tables' RLS actually applies.
ALTER VIEW public.guides                        SET (security_invoker = on);
ALTER VIEW public.airport_staff                 SET (security_invoker = on);
ALTER VIEW public.hotel_staff                   SET (security_invoker = on);
ALTER VIEW public.itineraries_with_languages    SET (security_invoker = on);
ALTER VIEW public.quotes_with_languages         SET (security_invoker = on);
ALTER VIEW public.tour_templates_with_languages SET (security_invoker = on);

-- client_summary is not defined by any migration in this repo (created in the
-- dashboard). Fix it if present, stay quiet if not.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'client_summary'
  ) THEN
    EXECUTE 'ALTER VIEW public.client_summary SET (security_invoker = on)';
  END IF;
END $$;

-- 2. Belt and braces: the anonymous role has no business reading any of these
--    even if a future definition slips back to definer rights.
REVOKE SELECT ON public.guides                        FROM anon;
REVOKE SELECT ON public.airport_staff                 FROM anon;
REVOKE SELECT ON public.hotel_staff                   FROM anon;
REVOKE SELECT ON public.itineraries_with_languages    FROM anon;
REVOKE SELECT ON public.quotes_with_languages         FROM anon;
REVOKE SELECT ON public.tour_templates_with_languages FROM anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'client_summary'
  ) THEN
    EXECUTE 'REVOKE SELECT ON public.client_summary FROM anon';
  END IF;
END $$;

COMMIT;

-- Verify (expect 0 rows / permission denied for every view, as anon):
--   select count(*) from guides;   -- with the anon key, not service role
