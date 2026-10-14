-- ============================================
-- b2b_partners: only your company's rows through RLS; partner codes per company
-- ============================================
-- People audit (Partners), findings 2 and 3.
--
-- 3. RLS. 20261206 gave b2b_partner_pricing the org policies but left its
-- parent on the baseline's single policy
--
--   b2b_partners_authenticated  TO authenticated USING (true) WITH CHECK (true)
--
-- so through PostgREST, with the public anon key and any session, a signed-in
-- user of either company — a viewer included — could read, insert, update and
-- delete EVERY company's partners: contacts, default margins, credit limits,
-- notes. Every app route uses the service role and filters by org_id, so the
-- app was fine; this is the second wall the other tables already have.
--
-- Every policy on the table is dropped by name, whatever it was called — a
-- policy added by hand in production would otherwise survive beside these and
-- policies are OR'd — and replaced, TO authenticated only:
--
--   b2b_partners_org_select   user_is_in_org(org_id)
--   b2b_partners_org_insert   user_is_in_org(org_id) AND is_manager_or_above()
--   b2b_partners_org_update   the same, USING and WITH CHECK
--   b2b_partners_org_delete   the same
--
-- The same set 20261206 gave b2b_partner_pricing (still b2b_partner_pricing_
-- org_select / _org_write there; nothing later replaced them). anon loses
-- every table privilege (it matched no policy already; the revoke makes it
-- explicit).
--
-- BROWSER CALLERS (lib/supabase createClient — the anon key and the user's
-- session, so RLS applies): none. No component or page reads or writes
-- b2b_partners from the browser; the Partners page, the quote pages, the
-- calculator, the Pricing Grid and the WhatsApp parser all go through
-- /api/b2b/*, /api/pricing-grid/* and /api/b2b/quotes/*, which use the service
-- role (RLS bypassed) — so write access needs no agent exception here and
-- is manager-and-above, as the menu is. Reads stay open to every member of the
-- company. No API route is affected.
--
-- 2. partner_code was UNIQUE across the whole install (b2b_partners_partner_
-- code_key), although org_id was added later. Travel2Egypt creating or editing
-- a partner "ABC-123" while ATS had one failed with a 500 that also revealed
-- that the other company's code exists; the generated code is PREFIX-NNN, 1000
-- values per prefix install-wide, and the WhatsApp parser sent the first three
-- letters of the name, which collided on the second "ABC...". The unique key
-- is now UNIQUE (org_id, partner_code): each company has its own codes, and
-- both may hold ABC-123. EXISTING CODES ARE NOT CHANGED (they were unique
-- install-wide, so they are unique within each company). The routes answer a
-- taken code with a 409 naming it and retry a generated one.
--
-- Idempotent (every policy dropped before it is created, the constraint added
-- only if absent) and guarded on the table existing (to_regclass).
BEGIN;

DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.b2b_partners') IS NULL THEN RETURN; END IF;

  -- ── Policies ────────────────────────────────────────────────────────────
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'b2b_partners' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.b2b_partners', pol.policyname);
  END LOOP;

  ALTER TABLE public.b2b_partners ENABLE ROW LEVEL SECURITY;

  CREATE POLICY b2b_partners_org_select ON public.b2b_partners FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id));
  CREATE POLICY b2b_partners_org_insert ON public.b2b_partners FOR INSERT TO authenticated
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY b2b_partners_org_update ON public.b2b_partners FOR UPDATE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY b2b_partners_org_delete ON public.b2b_partners FOR DELETE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());

  REVOKE ALL ON public.b2b_partners FROM anon;

  -- ── Partner codes: unique per company ───────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'b2b_partners_org_code_key' AND conrelid = 'public.b2b_partners'::regclass
  ) THEN
    ALTER TABLE public.b2b_partners ADD CONSTRAINT b2b_partners_org_code_key UNIQUE (org_id, partner_code);
  END IF;
  ALTER TABLE public.b2b_partners DROP CONSTRAINT IF EXISTS b2b_partners_partner_code_key;
END
$$;

COMMIT;
