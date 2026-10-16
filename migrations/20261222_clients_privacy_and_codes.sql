-- ============================================
-- A client's health notes, passport numbers and contacts: only your company's,
-- and client codes numbered per company
-- ============================================
-- 1. THE LEAK. 20261201 scoped the clients table to the caller's organisation
-- (and, for reading, to agents and above), and fixed three of its child tables
-- (client_followups, client_notes, communication_history). Three more were left
-- with the one baseline policy each, `USING (true) WITH CHECK (true)` TO
-- authenticated:
--
--   client_preferences  client_preferences_authenticated  health_considerations,
--                       mobility_requirements, age_related_needs, dietary and
--                       room preferences, budget range
--   client_documents    client_documents_authenticated    document_number (the
--                       passport number), file_url (the scan), is_confidential
--   client_contacts     client_contacts_authenticated     fellow travellers: name,
--                       date of birth, passport number and expiry, phone, email
--
-- Through PostgREST, with the public anon key and any session, a signed-in
-- user of EITHER company — and of ANY role, a viewer included — could list,
-- change and delete every company's rows in all three tables. /api/clients
-- (POST) and the Concierge brief intake write health data into
-- client_preferences, so the data is real. (The other client tables checked:
-- client_followups, client_notes and communication_history are done by 20261201;
-- email_client_links is per user; client_summary is a security_invoker view over
-- clients. There is no client_tags or client_interests table — tags and
-- interests are columns of clients — so there is nothing more to close.)
--
-- Every policy on the three tables is dropped (by name, whatever it was called —
-- a policy added by hand in production would otherwise survive beside these,
-- and policies are OR'd) and replaced by <table>_org_select/insert/update/
-- delete, TO authenticated only, = EXISTS (the parent client,
-- user_is_in_org(client.org_id)). The EXISTS reads the client under the
-- caller's own RLS, so the rule the client carries applies to its children too:
-- agents and above read and write, a viewer sees nothing, and a client of the
-- other company does not exist as far as the caller is concerned. Anon is
-- revoked from the tables and matches no policy.
--
-- BROWSER CALLERS (lib/supabase createClient, the anon key + the user's session,
-- RLS applies): none. grep for client_preferences / client_documents /
-- client_contacts finds only server code on the service role —
-- app/api/clients/route.ts (POST writes the wizard's preferences),
-- app/api/clients/[id]/route.ts and lib/concierge-brief-intake.ts. No page,
-- component or hook reads or writes them from the browser, so no screen
-- changes behaviour. The service role bypasses RLS; no API route is affected.
--
-- 2. CLIENT CODES. generate_client_code() numbered a new client CLI-(COUNT(*)
-- of ALL clients in the install + 1): a global counter. The second company's
-- first client got, say, CLI-0412 (the first company's volume, readable off
-- the code), the codes of each company skipped whenever the other added a
-- client, the UNIQUE (client_code) key was install-wide, and two clients saved
-- at the same moment counted the same total and the second died on that key (a
-- 500 from the API, a raw database error in the New client form).
--
-- From here, as booking codes (20261212) and quote numbers (20261211):
--   client_code_counters    one row per company: the last number handed out. The
--                           row is locked by the INSERT … ON CONFLICT DO UPDATE
--                           that increments it, so two inserts at once get two
--                           numbers.
--   next_client_code(org)   the next free CLI-nnnn for a company. The first call
--                           for a company starts after that company's OWN
--                           highest well-formed code (CLI- and 1–9 digits); a
--                           malformed code is ignored, never cast. A code
--                           already taken in that company is skipped, never
--                           collided with. SECURITY DEFINER (the counter table
--                           has RLS on and no policy); executable by the
--                           service role only.
--   generate_client_code()  the BEFORE INSERT trigger, now asking for the
--                           company's next code. It stays SECURITY DEFINER
--                           (20261201): a browser insert runs as the caller, who
--                           cannot read the counter. A trigger function cannot
--                           be called through rpc; it returns only the code.
--   UNIQUE (org_id, client_code) replaces the install-wide UNIQUE
--                           (client_code): both companies may hold CLI-0001.
--
-- DATA: no client changes — every existing code is kept as it is. The counters
-- are seeded here from each company's highest well-formed code, so numbering
-- simply carries on. Nothing reads client_code across companies (every lookup
-- is by id, or by code within the company's own list).
--
-- Idempotent (every policy dropped before it is created, CREATE OR REPLACE,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING) and guarded on each table and function
-- existing (to_regclass / to_regprocedure).
BEGIN;

-- ── 1. Child-table policies ────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  pol record;
  child_check text := 'EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND public.user_is_in_org(c.org_id))';
BEGIN
  IF to_regclass('public.clients') IS NULL THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['client_preferences', 'client_documents', 'client_contacts'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    -- Every policy on the table, whatever its name: one permissive policy left
    -- behind would re-open the table (policies are OR'd).
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_org_select', t, child_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_org_insert', t, child_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_org_update', t, child_check, child_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_org_delete', t, child_check);
  END LOOP;
END
$$;

-- ── 2. Client codes: per company, no race ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_code_counters (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_value integer NOT NULL DEFAULT 0
);
ALTER TABLE public.client_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_code_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_code_counters TO service_role;

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN RETURN; END IF;

  -- Unique per company (both companies can hold CLI-0001). The install-wide
  -- key goes only once the per-company one is in place; the install-wide one
  -- held, so this holds.
  CREATE UNIQUE INDEX IF NOT EXISTS clients_org_client_code_key ON public.clients (org_id, client_code);
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_client_code_key;

  CREATE OR REPLACE FUNCTION public.next_client_code(p_org uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    seed bigint := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_client_code: a client must belong to a company'; END IF;

    -- First number for this company: carry on after its own highest
    -- well-formed code (a malformed one is ignored, not cast).
    IF NOT EXISTS (SELECT 1 FROM client_code_counters WHERE org_id = p_org) THEN
      SELECT COALESCE(MAX((regexp_match(client_code, '^CLI-([0-9]{1,9})$'))[1]::bigint), 0) INTO seed
        FROM clients WHERE org_id = p_org AND client_code ~ '^CLI-[0-9]{1,9}$';
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_client_code: no free code after % attempts', attempts;
      END IF;
      -- The counter row is locked by this statement until the transaction
      -- ends, so a concurrent caller waits and draws the next number.
      INSERT INTO client_code_counters AS c (org_id, last_value)
        VALUES (p_org, seed + 1)
        ON CONFLICT (org_id) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      -- Four digits as before; a fifth is added, never cut off (lpad truncates).
      candidate := 'CLI-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END;
      -- A code typed in or imported may already sit ahead.
      IF NOT EXISTS (SELECT 1 FROM clients WHERE org_id = p_org AND client_code = candidate) THEN
        RETURN candidate;
      END IF;
    END LOOP;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_client_code(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_client_code(uuid) TO service_role;

  -- The trigger keeps its name, timing and SECURITY DEFINER (20261201); only
  -- the numbering behind it changes. It still sets the code on every insert.
  CREATE OR REPLACE FUNCTION public.generate_client_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    NEW.client_code := public.next_client_code(NEW.org_id);
    RETURN NEW;
  END $fn$;

  -- Each company's counter starts at its own highest well-formed code.
  INSERT INTO client_code_counters (org_id, last_value)
  SELECT org_id, MAX((regexp_match(client_code, '^CLI-([0-9]{1,9})$'))[1]::bigint)
  FROM clients
  WHERE org_id IS NOT NULL AND client_code ~ '^CLI-[0-9]{1,9}$'
  GROUP BY org_id
  ON CONFLICT (org_id) DO NOTHING;
END
$$;

COMMIT;
