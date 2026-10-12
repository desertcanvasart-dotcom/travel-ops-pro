-- ============================================
-- Clients, trips, bookings and quotes: only your organisation's, through RLS
-- ============================================
-- RLS policies are OR'd. Each of these tables carried, BESIDE (or instead of)
-- an organisation-scoped policy, a permissive one with no org condition — so
-- through PostgREST, with nothing but a session, any signed-in user of either
-- company read (and mostly wrote) every company's rows:
--
--   itineraries  "Agents can view/create/update itineraries" USING
--                (is_agent_or_above() OR auth.uid() IS NOT NULL) — i.e. any
--                session — and "Managers can delete itineraries"
--                (is_manager_or_above(), a role from user_profiles, any org).
--                itineraries_org_select/insert/update/delete (user_is_in_org)
--                already exist and stay; the four are dropped.
--   clients      "Agents can view/create/update clients" (is_agent_or_above())
--                and "Managers can delete clients" (is_manager_or_above()) —
--                a role, never an organisation, and no org policy at all.
--                Replaced by clients_org_* = user_is_in_org(org_id) AND the
--                same role helper as before, so nobody gains access (a viewer
--                still reads no clients) and every role loses the other org.
--   bookings     "Allow all for authenticated users" ALL USING (true) beside
--                bookings_org_select/insert/update/delete. Dropped.
--   tour_quotes  tour_quotes_authenticated ALL USING (true), the only policy.
--                Replaced by tour_quotes_org_* = user_is_in_org(org_id).
--
--   client_followups, client_notes, communication_history — each one policy,
--   <table>_authenticated_all ALL USING (true). They have no org_id; their
--   client_id is NOT NULL, and clients.org_id says whose they are. Replaced
--   by <table>_org_* = EXISTS (the client, user_is_in_org(client.org_id)).
--   That subquery reads clients under the caller's RLS, so these follow the
--   client's role rule too (agent and above).
--
-- A person who is a member of BOTH companies still sees both through direct
-- REST: user_is_in_org is true for each. That is correct — they are a member
-- of both — and the app's own reads pick the active workspace.
--
-- BROWSER CALLERS (lib/supabase createClient, the anon key + the user's
-- session — RLS applies). Each touches the user's own organisation's rows,
-- which the org policies admit for an agent and above:
--   clients: app/clients/page.tsx (client_summary view, security_invoker;
--     clients update), app/clients/new/page.tsx (insert, org_id from
--     /api/auth/role), app/clients/[id]/page.tsx and [id]/edit/page.tsx
--     (select/update), app/dashboard/page.tsx (recent clients; clients(...)
--     embed), app/whatsapp-parser/whatsapp-parser-content.tsx (select),
--     components/ClientTimeline.tsx
--   itineraries: app/itineraries/[id]/page.tsx and [id]/edit/page.tsx
--     (select/update), components/ClientTimeline.tsx
--   client_followups: app/followups/page.tsx (select with clients(...) embed,
--     update, delete), app/dashboard/page.tsx, app/clients/[id]/page.tsx,
--     components/AddFollowupModal.tsx, components/ClientTimeline.tsx
--   client_notes: app/clients/[id]/page.tsx, components/AddNoteModal.tsx,
--     components/ClientTimeline.tsx
--   communication_history: app/clients/[id]/page.tsx,
--     components/LogCommunicationModal.tsx, components/ClientTimeline.tsx
--   bookings, tour_quotes: no browser access (API routes, service role).
-- Every view over these tables is security_invoker (pinned by
-- __tests__/migrations/view-security-invoker.test.ts), so the views follow
-- the same policies. The service
-- role bypasses RLS; no API route is affected.
--
-- generate_client_code(), the BEFORE INSERT trigger that numbers a new client
-- (CLI-0001 …), counts clients and checks its code is unused. It ran as the
-- caller, so under these policies it would count and check only the caller's
-- own organisation's clients — and hand the second company a code the first
-- already holds (client_code is unique install-wide): every new client from
-- the browser (app/clients/new) would fail. It is made SECURITY DEFINER, so it
-- numbers against every client as it always did. A trigger function cannot be
-- called through rpc, so this opens nothing; it returns only the code.
--
-- Idempotent (DROP POLICY IF EXISTS before each CREATE) and guarded on each
-- table existing (to_regclass).
BEGIN;

DO $$
DECLARE
  t text;
  child_check text := 'EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND public.user_is_in_org(c.org_id))';
BEGIN
  IF to_regclass('public.itineraries') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Agents can view itineraries" ON public.itineraries;
    DROP POLICY IF EXISTS "Agents can create itineraries" ON public.itineraries;
    DROP POLICY IF EXISTS "Agents can update itineraries" ON public.itineraries;
    DROP POLICY IF EXISTS "Managers can delete itineraries" ON public.itineraries;
    -- The org policies, as 20260829 created them (re-asserted, not changed).
    DROP POLICY IF EXISTS itineraries_org_select ON public.itineraries;
    DROP POLICY IF EXISTS itineraries_org_insert ON public.itineraries;
    DROP POLICY IF EXISTS itineraries_org_update ON public.itineraries;
    DROP POLICY IF EXISTS itineraries_org_delete ON public.itineraries;
    CREATE POLICY itineraries_org_select ON public.itineraries FOR SELECT USING (public.user_is_in_org(org_id));
    CREATE POLICY itineraries_org_insert ON public.itineraries FOR INSERT WITH CHECK (public.user_is_in_org(org_id));
    CREATE POLICY itineraries_org_update ON public.itineraries FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));
    CREATE POLICY itineraries_org_delete ON public.itineraries FOR DELETE USING (public.user_is_in_org(org_id));
  END IF;

  IF to_regprocedure('public.generate_client_code()') IS NOT NULL THEN
    ALTER FUNCTION public.generate_client_code() SECURITY DEFINER SET search_path = public, pg_temp;
  END IF;

  IF to_regclass('public.clients') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Agents can view clients" ON public.clients;
    DROP POLICY IF EXISTS "Agents can create clients" ON public.clients;
    DROP POLICY IF EXISTS "Agents can update clients" ON public.clients;
    DROP POLICY IF EXISTS "Managers can delete clients" ON public.clients;
    DROP POLICY IF EXISTS clients_org_select ON public.clients;
    DROP POLICY IF EXISTS clients_org_insert ON public.clients;
    DROP POLICY IF EXISTS clients_org_update ON public.clients;
    DROP POLICY IF EXISTS clients_org_delete ON public.clients;
    CREATE POLICY clients_org_select ON public.clients FOR SELECT
      USING (public.user_is_in_org(org_id) AND public.is_agent_or_above());
    CREATE POLICY clients_org_insert ON public.clients FOR INSERT
      WITH CHECK (public.user_is_in_org(org_id) AND public.is_agent_or_above());
    CREATE POLICY clients_org_update ON public.clients FOR UPDATE
      USING (public.user_is_in_org(org_id) AND public.is_agent_or_above())
      WITH CHECK (public.user_is_in_org(org_id) AND public.is_agent_or_above());
    CREATE POLICY clients_org_delete ON public.clients FOR DELETE
      USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.bookings;
  END IF;

  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    DROP POLICY IF EXISTS tour_quotes_authenticated ON public.tour_quotes;
    DROP POLICY IF EXISTS tour_quotes_org_select ON public.tour_quotes;
    DROP POLICY IF EXISTS tour_quotes_org_insert ON public.tour_quotes;
    DROP POLICY IF EXISTS tour_quotes_org_update ON public.tour_quotes;
    DROP POLICY IF EXISTS tour_quotes_org_delete ON public.tour_quotes;
    CREATE POLICY tour_quotes_org_select ON public.tour_quotes FOR SELECT TO authenticated USING (public.user_is_in_org(org_id));
    CREATE POLICY tour_quotes_org_insert ON public.tour_quotes FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id));
    CREATE POLICY tour_quotes_org_update ON public.tour_quotes FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));
    CREATE POLICY tour_quotes_org_delete ON public.tour_quotes FOR DELETE TO authenticated USING (public.user_is_in_org(org_id));
  END IF;

  FOREACH t IN ARRAY ARRAY['client_followups', 'client_notes', 'communication_history'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_all', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_org_select', t, child_check);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_org_insert', t, child_check);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_org_update', t, child_check, child_check);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_org_delete', t, child_check);
    END IF;
  END LOOP;
END
$$;

COMMIT;
