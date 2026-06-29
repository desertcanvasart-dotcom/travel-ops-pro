-- ============================================================
-- RLS hardening — close anon-key data exposure + fix recursive policies
-- ============================================================
-- Applied to production 2026-06-30 after a live audit (probing each table with
-- the public anon key vs the service-role key and comparing row counts).
--
-- Findings: many tables with live data were readable by the PUBLIC anon key
-- (which ships in the browser bundle) because RLS was disabled or a policy
-- granted `{public}`. Two tables had RLS enabled but a self-recursive policy
-- (42P17). This migration records the exact remediation that was run.
--
-- Verification: after applying, an anon-key SELECT returns 0 rows for every
-- table below while service-role still sees all rows, and the 42P17 errors are
-- gone. (All statements are idempotent / safe to re-run.)
-- ============================================================

-- ── Stage 1: server-only tables (reached only via service-role API routes,
--    which bypass RLS) — enable RLS with no policy = deny-all for anon/auth. ──
ALTER TABLE tour_quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_partners             ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_day_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_template_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrance_fee_versions    ENABLE ROW LEVEL SECURITY;

-- ── Stage 2: browser-read tables (read by 'use client' pages via the anon
--    client WITH the logged-in user's session) — allow authenticated, block
--    anon. FOR ALL preserves current read+write behaviour for logged-in users.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','entrance_fees','itinerary_services','itinerary_days','activity_rates','user_preferences']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_authenticated_all ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Drop pre-existing over-permissive policies that granted the PUBLIC role
-- (anon). Their names are misleading — roles were {public}, not {authenticated}.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON entrance_fees;
DROP POLICY IF EXISTS "Allow all for entrance_fees"       ON entrance_fees;
DROP POLICY IF EXISTS "Allow public read access"          ON entrance_fees;
DROP POLICY IF EXISTS "Allow all operations on expenses"  ON expenses;
-- expenses keeps its correctly-scoped policies (is_manager_or_above / user_is_in_org).

-- ── Stage 3: fix recursive RLS (42P17) ──
-- (a) user_is_in_org() was SECURITY INVOKER, so its internal
--     SELECT FROM organization_members re-triggered that table's RLS → recursion.
--     Flipping to SECURITY DEFINER makes the lookup bypass RLS. Body unchanged.
ALTER FUNCTION public.user_is_in_org(uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

-- (b) organization_members' owner-write policy queried organization_members
--     INSIDE its own policy (self-recursion). Move the lookup into a
--     SECURITY DEFINER helper so it bypasses RLS instead of re-triggering it.
CREATE OR REPLACE FUNCTION public.user_is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

DROP POLICY IF EXISTS organization_members_owner_write ON organization_members;
CREATE POLICY organization_members_owner_write ON organization_members
  FOR ALL TO public
  USING (public.user_is_org_owner(org_id))
  WITH CHECK (public.user_is_org_owner(org_id));
-- organization_members_self_select stays (uses the now-SECURITY DEFINER user_is_in_org).

-- ── Stage 4: prophylactic hardening of EMPTY tables (no data yet, so the
--    anon-count probe couldn't confirm their state). These already have correct
--    scoped policies (org/role) OR no policy at all; ensure RLS is ON so the
--    policies apply, and give the browser-read no-policy tables an
--    authenticated-only policy. Idempotent; per-table guard skips views/missing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','bookings','invoices','booking_payments','supplier_invoices',
    'supplier_invoice_expenses','commissions','client_followups','communication_history',
    'client_notes','accounting_sync_log','template_send_log','copilot_knowledge',
    'itinerary_service_versions','tour_variation_versions'
  ] LOOP
    BEGIN EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN others THEN RAISE NOTICE 'skip ENABLE RLS %: %', t, SQLERRM; END;
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_followups','communication_history','client_notes','itinerary_service_versions']
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_authenticated_all ON %I', t, t);
      EXECUTE format('CREATE POLICY %I_authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXCEPTION WHEN others THEN RAISE NOTICE 'skip policy %: %', t, SQLERRM; END;
  END LOOP;
END $$;
-- Note: client_summary is a VIEW — if so, ALTER VIEW client_summary SET (security_invoker = true).
-- Note: booking_payments has only an {authenticated} USING(true) policy (no org scope) — not an
--   anon leak, but a candidate for future org-scoping.
