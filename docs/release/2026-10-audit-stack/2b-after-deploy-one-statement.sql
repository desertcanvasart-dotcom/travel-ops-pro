-- ============================================================
-- STEP 3 — after the deploy is live — for the Supabase SQL editor (one statement)
-- ============================================================
-- 2-after-deploy.sql (20261210–20270105) as ONE statement: the SQL editor
-- splits a script into pieces and loses what one piece made before the next
-- used it. Here every migration runs inside a single DO block — one session,
-- one transaction; if anything fails, all of it is undone. Each migration is
-- written to be safe to run twice.
DO $release$
BEGIN
  EXECUTE $s0001$
-- STEP 3 — run once the new code is live (re-runs the ones already applied; all are replay-safe).
-- Generated from migrations/ — 27 files, in order. Each is followed by its record
-- line in schema_migrations. Every file is its own transaction (BEGIN/COMMIT).

-- ==================================================================
-- 20261210_agent_memory_org_wide
-- ==================================================================
-- ============================================================================
-- get_org_agent_memories: keep the company-wide memories when a client is known
-- ============================================================================
-- lib/agent-memory.ts calls this with p_subject_id = the client and
-- p_subject_type = 'client' whenever the request names a client. The old
-- WHERE then required am.subject_id = p_subject_id AND
-- am.subject_type = 'client', so every company-wide memory (inquiry patterns,
-- supplier notes: subject_id NULL, subject_type NULL) was dropped exactly when
-- a client was known — the AI got the client's memories but lost the
-- company's. Now a memory with no subject always qualifies; one about another
-- subject still does not. The ORDER BY already puts the client's own first.
--
-- And the function never returned anything at all: its closing UPDATE named
-- `confidence` unqualified, which in plpgsql is ambiguous with the RETURNS
-- TABLE column of the same name, so every call raised "column reference
-- \"confidence\" is ambiguous" and lib/agent-memory.ts (which swallows the
-- error) injected no memories. The UPDATE's columns are qualified now.
--
-- Body otherwise unchanged from the baseline. CREATE OR REPLACE keeps the
-- privileges, but the REVOKE/GRANT from 20261129 is re-applied explicitly so
-- this file states them too: service_role only — the function is SECURITY
-- DEFINER and takes any org id.

CREATE OR REPLACE FUNCTION public.get_org_agent_memories(p_org_id uuid, p_subject_id uuid DEFAULT NULL::uuid, p_subject_type text DEFAULT NULL::text, p_min_confidence double precision DEFAULT 0.3, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, memory_type text, subject_name text, content text, confidence double precision, observation_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT am.id, am.memory_type, am.subject_name, am.content, am.confidence, am.observation_count
  FROM agent_memory am
  WHERE am.org_id = p_org_id AND am.confidence >= p_min_confidence
    AND (am.expires_at IS NULL OR am.expires_at > NOW())
    AND (p_subject_id IS NULL OR am.subject_id = p_subject_id OR am.subject_id IS NULL)
    AND (p_subject_type IS NULL OR am.subject_type = p_subject_type OR am.subject_id IS NULL)
  ORDER BY
    CASE WHEN am.subject_type = 'client' AND am.subject_id = p_subject_id THEN 0 ELSE 1 END,
    am.confidence DESC, am.observation_count DESC
  LIMIT p_limit;

  UPDATE agent_memory u SET last_accessed_at = NOW()
  WHERE u.org_id = p_org_id AND u.confidence >= p_min_confidence
    AND (u.expires_at IS NULL OR u.expires_at > NOW());
END; $$
$s0001$;
  EXECUTE $s0002$
REVOKE EXECUTE ON FUNCTION public.get_org_agent_memories(uuid, uuid, text, double precision, integer) FROM PUBLIC, anon, authenticated
$s0002$;
  EXECUTE $s0003$
GRANT EXECUTE ON FUNCTION public.get_org_agent_memories(uuid, uuid, text, double precision, integer) TO service_role
$s0003$;
  EXECUTE $s0004$
INSERT INTO public.schema_migrations (name) VALUES ('20261210_agent_memory_org_wide') ON CONFLICT DO NOTHING
$s0004$;
  EXECUTE $s0005$
-- ==================================================================
-- 20261211_quote_numbers_per_company
-- ==================================================================
-- ============================================
-- Quote numbers per company, minted safely
-- ============================================
-- B2B quote numbers (QT-YYYY-NNNNN) came from generate_quote_number(), a
-- BEFORE INSERT trigger that took MAX(number) + 1 over EVERY tour_quotes row,
-- whichever company it belonged to. Three things followed:
--
--   - each company's numbers skipped whenever the other company made a
--     quote, so a customer of one could read the other's volume off the gap;
--   - two quotes saved at the same moment (the website-order job plus a save
--     in the calculator) both read the same MAX, and the second died on the
--     UNIQUE (quote_number) constraint as a 500;
--   - the MAX cast whatever followed "QT-YYYY-" to an integer, so ONE quote
--     whose number had been edited to "QT-2026-X1" (PUT accepted any column)
--     made every later B2B insert fail with "invalid input syntax for type
--     integer" — the calculator, the order intake, the scheduled website
--     orders and quote-from-itinerary, for both companies at once.
--
-- B2C offers were numbered in the route as B2C-<milliseconds in base 36>,
-- with no unique constraint at all.
--
-- From here:
--   quote_number_counters   one row per (company, kind, year): the last
--                           number handed out. The row is locked by the
--                           INSERT … ON CONFLICT DO UPDATE that increments
--                           it, so two inserts at once get two numbers.
--   next_quote_number()     the next free number for a company. The first
--                           call for a company and year starts after that
--                           company's own highest existing number, so
--                           numbering simply carries on. A number already
--                           taken in that company (an old manual edit) is
--                           skipped, never collided with. Only well-formed
--                           numbers (PREFIX-YYYY-digits) are read.
--   generate_quote_number() B2B, now per company: QT-YYYY-NNNNN.
--   assign_b2c_quote_number() B2C, per company: B2C-YYYY-NNNNN.
--   UNIQUE (org_id, quote_number) on both tables, replacing the install-wide
--                           UNIQUE (quote_number) on tour_quotes: two
--                           companies may both hold QT-2026-00001.
--
-- And the B2C half of 20261121: reverting a B2C offer now restores its season
-- premium (season_name, season_uplift_percent, season_uplift_amount) with the
-- prices. It restored total_cost, margin and selling_price but kept the
-- premium of the version being replaced, so the breakdown no longer added up
-- to the selling price. Revisions are to_jsonb(b2c_quotes) snapshots; older
-- ones without the keys restore 0.
--
-- No existing quote number changes. Nothing reads quote_number across
-- companies (every lookup is by id within the company).
--
-- next_quote_number() is SECURITY DEFINER (the counter table has RLS on and
-- no policy) and, like the functions 20261129 closed, executable by the
-- service role only; the two trigger functions call it as its owner.
--
-- Replay-safe: CREATE … IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS,
-- and each table is guarded with to_regclass so a database without one still
-- migrates. Applying it twice changes nothing the second time.

CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('b2b', 'b2c')),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, kind, year)
)
$s0005$;
  EXECUTE $s0006$
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY
$s0006$;
  EXECUTE $s0007$
REVOKE ALL ON public.quote_number_counters FROM PUBLIC, anon, authenticated
$s0007$;
  EXECUTE $s0008$
GRANT ALL ON public.quote_number_counters TO service_role
$s0008$;
  EXECUTE $s0009$
CREATE OR REPLACE FUNCTION public.next_quote_number(p_org uuid, p_kind text, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  prefix text := CASE p_kind WHEN 'b2b' THEN 'QT' WHEN 'b2c' THEN 'B2C' END;
  pattern text;
  seed integer := 0;
  n integer;
  candidate text;
  taken boolean;
  attempts integer := 0;
BEGIN
  IF prefix IS NULL THEN RAISE EXCEPTION 'next_quote_number: unknown kind %', p_kind; END IF;
  IF p_org IS NULL THEN RAISE EXCEPTION 'next_quote_number: a quote must belong to a company'; END IF;
  pattern := '^' || prefix || '-' || p_year || '-([0-9]+)$';

  -- First number of the year for this company: carry on after its own
  -- highest well-formed number (a malformed one is ignored, not cast).
  IF NOT EXISTS (SELECT 1 FROM quote_number_counters WHERE org_id = p_org AND kind = p_kind AND year = p_year) THEN
    IF p_kind = 'b2b' THEN
      SELECT COALESCE(MAX((regexp_match(quote_number, pattern))[1]::bigint), 0) INTO seed
        FROM tour_quotes WHERE org_id = p_org AND quote_number ~ pattern;
    ELSE
      SELECT COALESCE(MAX((regexp_match(quote_number, pattern))[1]::bigint), 0) INTO seed
        FROM b2c_quotes WHERE org_id = p_org AND quote_number ~ pattern;
    END IF;
  END IF;

  LOOP
    attempts := attempts + 1;
    IF attempts > 10000 THEN
      RAISE EXCEPTION 'next_quote_number: no free % number after % attempts', prefix, attempts;
    END IF;
    INSERT INTO quote_number_counters AS c (org_id, kind, year, last_value)
      VALUES (p_org, p_kind, p_year, seed + 1)
      ON CONFLICT (org_id, kind, year) DO UPDATE SET last_value = c.last_value + 1
      RETURNING last_value INTO n;
    -- Five digits as before; a sixth is added, never cut off (lpad truncates).
    candidate := prefix || '-' || p_year || '-' || CASE WHEN length(n::text) < 5 THEN lpad(n::text, 5, '0') ELSE n::text END;
    IF p_kind = 'b2b' THEN
      SELECT EXISTS (SELECT 1 FROM tour_quotes WHERE org_id = p_org AND quote_number = candidate) INTO taken;
    ELSE
      SELECT EXISTS (SELECT 1 FROM b2c_quotes WHERE org_id = p_org AND quote_number = candidate) INTO taken;
    END IF;
    EXIT WHEN NOT taken;
  END LOOP;
  RETURN candidate;
END;
$$
$s0009$;
  EXECUTE $s0010$
REVOKE EXECUTE ON FUNCTION public.next_quote_number(uuid, text, integer) FROM PUBLIC, anon, authenticated
$s0010$;
  EXECUTE $s0011$
GRANT EXECUTE ON FUNCTION public.next_quote_number(uuid, text, integer) TO service_role
$s0011$;
  EXECUTE $s0012$
DO $$
BEGIN
  -- ---------------------------------------------------------------- B2B
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.generate_quote_number() RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
          AS $body$
      BEGIN
        NEW.quote_number := next_quote_number(NEW.org_id, 'b2b', EXTRACT(YEAR FROM NOW())::integer);
        RETURN NEW;
      END;
      $body$
    $f$;
    -- Same trigger, timing and condition as the baseline.
    DROP TRIGGER IF EXISTS trigger_generate_quote_number ON public.tour_quotes;
    CREATE TRIGGER trigger_generate_quote_number BEFORE INSERT ON public.tour_quotes
      FOR EACH ROW WHEN ((NEW.quote_number IS NULL) OR ((NEW.quote_number)::text = ''::text))
      EXECUTE FUNCTION public.generate_quote_number();

    -- Unique per company. The install-wide constraint held, so this holds.
    CREATE UNIQUE INDEX IF NOT EXISTS tour_quotes_org_quote_number_key ON public.tour_quotes (org_id, quote_number);
    ALTER TABLE public.tour_quotes DROP CONSTRAINT IF EXISTS tour_quotes_quote_number_key;
  END IF;

  -- ---------------------------------------------------------------- B2C
  IF to_regclass('public.b2c_quotes') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.assign_b2c_quote_number() RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
          AS $body$
      BEGIN
        IF NEW.org_id IS NULL THEN
          -- b2c_quotes.org_id is nullable; the routes always set it. A row
          -- without a company keeps the old time-based form.
          NEW.quote_number := 'B2C-' || upper(to_hex((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint));
        ELSE
          NEW.quote_number := next_quote_number(NEW.org_id, 'b2c', EXTRACT(YEAR FROM NOW())::integer);
        END IF;
        RETURN NEW;
      END;
      $body$
    $f$;
    DROP TRIGGER IF EXISTS trigger_assign_b2c_quote_number ON public.b2c_quotes;
    CREATE TRIGGER trigger_assign_b2c_quote_number BEFORE INSERT ON public.b2c_quotes
      FOR EACH ROW WHEN ((NEW.quote_number IS NULL) OR (NEW.quote_number = ''))
      EXECUTE FUNCTION public.assign_b2c_quote_number();

    -- Existing numbers are kept as they are. Two equal ones in one company
    -- (the same millisecond) would have to be told apart by hand first: the
    -- migration stops and names them rather than renumbering a sent offer.
    IF EXISTS (
      SELECT 1 FROM public.b2c_quotes WHERE quote_number IS NOT NULL
      GROUP BY org_id, quote_number HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'b2c_quotes has duplicate quote numbers within one company: %', (
        SELECT string_agg(DISTINCT quote_number, ', ') FROM (
          SELECT quote_number FROM public.b2c_quotes WHERE quote_number IS NOT NULL
          GROUP BY org_id, quote_number HAVING count(*) > 1) d);
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS b2c_quotes_org_quote_number_key ON public.b2c_quotes (org_id, quote_number);

    -- Revert restores the season premium too (see the header). Identical to
    -- the baseline definition apart from the three season columns.
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_b2c_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
      DECLARE d JSONB; v_new_id UUID;
      BEGIN
        SELECT quote_data INTO d FROM quote_revisions
         WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND version_number = p_version_number;
        IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

        UPDATE b2c_quotes SET
          num_travelers    = NULLIF(d->>'num_travelers','')::integer,
          tier             = d->>'tier',
          total_cost       = NULLIF(d->>'total_cost','')::numeric,
          margin_percent   = NULLIF(d->>'margin_percent','')::numeric,
          margin_amount    = NULLIF(d->>'margin_amount','')::numeric,
          selling_price    = NULLIF(d->>'selling_price','')::numeric,
          price_per_person = NULLIF(d->>'price_per_person','')::numeric,
          currency         = d->>'currency',
          cost_breakdown   = d->'cost_breakdown',
          season_name           = d->>'season_name',
          season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
          season_uplift_amount  = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
          status           = d->>'status',
          valid_until      = NULLIF(d->>'valid_until','')::date,
          internal_notes   = d->>'internal_notes',
          client_notes     = d->>'client_notes',
          updated_at       = NOW()
        WHERE id = p_quote_id;

        SELECT create_b2c_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;
END
$$
$s0012$;
  EXECUTE $s0013$
INSERT INTO public.schema_migrations (name) VALUES ('20261211_quote_numbers_per_company') ON CONFLICT DO NOTHING
$s0013$;
  EXECUTE $s0014$
-- ==================================================================
-- 20261212_trip_children_org_policies
-- ==================================================================
-- ============================================
-- A trip's and a booking's rows: only your organisation's, through RLS
-- ============================================
-- 20261201 scoped the parents (itineraries, bookings, clients, tour_quotes)
-- to the caller's organisation. Their child tables were left with one
-- permissive policy each and no org condition, so through PostgREST, with the
-- public anon key and any session, a signed-in user of either company read
-- and wrote every company's service lines (prices, supplier costs), day
-- texts, translations, booking payments (amounts, references) and supplier
-- confirmations:
--
--   itinerary_days             itinerary_days_authenticated_all  USING (true)
--   itinerary_services         itinerary_services_authenticated_all
--   itinerary_versions         itinerary_versions_authenticated
--   itinerary_day_versions     itinerary_day_versions_authenticated
--   itinerary_service_versions itinerary_service_versions_authenticated_all
--   booking_payments           "Allow all for authenticated users"
--   booking_supplier_status    "Allow all for authenticated users"
--   itinerary_resources        "Enable all access for authenticated users" —
--                              with NO `TO` clause, so it applied to anon too:
--                              guide and driver assignments readable with no
--                              sign-in at all.
--
-- None of them has an org_id; each hangs off a parent that does. Every
-- policy on these tables is dropped (by name, whatever it was called — a
-- policy added by hand in production would otherwise survive beside these,
-- and policies are OR'd) and replaced by <table>_org_select/insert/update/
-- delete, TO authenticated only, = EXISTS (the parent itinerary or booking,
-- user_is_in_org(parent.org_id)). The EXISTS reads the parent under the
-- caller's own RLS, so any role rule the parent carries applies to its
-- children too (today itineraries and bookings admit every member of the
-- organisation; nobody gains or loses a role). Anon matches no policy.
--
-- BROWSER CALLERS (lib/supabase createClient, the anon key + the user's
-- session — RLS applies). Each touches its own organisation's trip, which the
-- org policies admit:
--   itinerary_days: app/itineraries/[id]/edit/page.tsx (select, insert,
--     update — the day editor saves straight from the browser)
--   itinerary_services: app/itineraries/[id]/edit/page.tsx (select, insert,
--     update, delete), app/itineraries/[id]/page.tsx (select, manual cost
--     mode update)
--   itinerary_service_versions: app/itineraries/[id]/edit/page.tsx (select,
--     insert, update — the non-English service names)
--   itinerary_versions, itinerary_day_versions, itinerary_resources,
--   booking_payments, booking_supplier_status: no browser access (API routes
--     and the token pages /share, /portal, /staff use the service role).
-- recalculate_itinerary_totals (AFTER trigger on itinerary_services) runs as
-- the caller: it reads the trip's days and updates the trip, which the same
-- caller may do. The service role bypasses RLS; no API route is affected.
--
-- Also here, because each is the same leak from the database's side:
--
-- auto_link_client_to_itinerary (BEFORE INSERT on itineraries) filled an empty
-- client_id with the client whose email — or unique full name — matched,
-- searching EVERY company's clients. An ATS trip for john@x.com became
-- Travel2Egypt's client's trip; that client's revenue and booking count were
-- recomputed (itineraries_touch_client_stats) and its status moved lead →
-- prospect → customer (update_client_status_on_booking). Now it matches only
-- the trip's own company's clients, both stats triggers act only on a client
-- of the trip's own company, and recompute_client_revenue counts only that
-- company's invoices and trips. DATA: every trip already linked to another
-- company's client is unlinked (client_id → NULL; its stats triggers then
-- recompute the foreign client without it) and listed in org_backfill_review
-- with the client id it carried, for the owner to re-link by hand if needed.
--
-- generate_booking_code() was MAX(code)+1 over every company's bookings: two
-- bookings created at the same moment drew the same code (the second failed
-- on the unique key — and the auto-create on Confirm only logged it, leaving
-- the trip confirmed with no booking), and each company's codes counted the
-- other's bookings. Now generate_booking_code(p_org_id) numbers each company
-- separately from a counter row (booking_code_counters, one per company and
-- year) that it increments under the row lock — no two callers can draw the
-- same number — seeded from that company's highest existing BKG-YYYY-NNNN
-- and skipping any code already taken. Codes are unique per company now
-- (UNIQUE (org_id, booking_code), as suppliers did in 20261205): both
-- companies can hold BKG-2026-0007. EXISTING CODES ARE NOT CHANGED. The
-- no-argument function is dropped; the routes call the new one and retry an
-- insert that still collides.
--
-- recalculate_itinerary_totals wrote itineraries.total_cost = Σ client_price,
-- which dropped the season supplement and priced a line with no client price
-- at 0. It now writes what lib/itinerary-client-price.ts tripClientTotal
-- says the client pays: Σ (client_price, or supplier cost + 25% when there is
-- none) + season_uplift_amount, and leaves the stored total alone when the
-- trip has no priced lines.
--
-- shift_itinerary_dates(trip, org, days) moves a trip's dates, its days'
-- dates and its resource assignments by the same number of days in ONE
-- statement block (the calendar's drag-to-reschedule; the route refuses a
-- trip with a booking or supplier documents first). Service role only.
--
-- Idempotent (every policy dropped before it is created, CREATE OR REPLACE,
-- IF NOT EXISTS) and guarded on each table and function existing
-- (to_regclass / to_regprocedure).

-- ── 1. Child-table policies ────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  pol record;
  checks jsonb := jsonb_build_object(
    'itinerary_days',
      'EXISTS (SELECT 1 FROM public.itineraries i WHERE i.id = itinerary_id AND public.user_is_in_org(i.org_id))',
    'itinerary_versions',
      'EXISTS (SELECT 1 FROM public.itineraries i WHERE i.id = itinerary_id AND public.user_is_in_org(i.org_id))',
    'itinerary_resources',
      'EXISTS (SELECT 1 FROM public.itineraries i WHERE i.id = itinerary_id AND public.user_is_in_org(i.org_id))',
    'itinerary_services',
      'EXISTS (SELECT 1 FROM public.itinerary_days d JOIN public.itineraries i ON i.id = d.itinerary_id WHERE d.id = itinerary_day_id AND public.user_is_in_org(i.org_id))',
    'itinerary_day_versions',
      'EXISTS (SELECT 1 FROM public.itinerary_days d JOIN public.itineraries i ON i.id = d.itinerary_id WHERE d.id = itinerary_day_id AND public.user_is_in_org(i.org_id))',
    'itinerary_service_versions',
      'EXISTS (SELECT 1 FROM public.itinerary_services s JOIN public.itinerary_days d ON d.id = s.itinerary_day_id JOIN public.itineraries i ON i.id = d.itinerary_id WHERE s.id = itinerary_service_id AND public.user_is_in_org(i.org_id))',
    'booking_payments',
      'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND public.user_is_in_org(b.org_id))',
    'booking_supplier_status',
      'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND public.user_is_in_org(b.org_id))'
  );
  chk text;
BEGIN
  FOR t, chk IN SELECT key, value FROM jsonb_each_text(checks) LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    -- Every policy on the table, whatever its name: one permissive policy
    -- left behind would re-open the table (policies are OR'd).
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_org_select', t, chk);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_org_insert', t, chk);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_org_update', t, chk, chk);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_org_delete', t, chk);
  END LOOP;
END
$$
$s0014$;
  EXECUTE $s0015$
-- ── 2. A trip links to, and counts for, its own company's client only ─────
DO $$
BEGIN
  IF to_regclass('public.itineraries') IS NULL OR to_regclass('public.clients') IS NULL THEN RETURN; END IF;

  CREATE OR REPLACE FUNCTION public.auto_link_client_to_itinerary() RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
  DECLARE
    matched UUID;
    n INT;
  BEGIN
    -- The application knows which client it meant. Keep it.
    IF NEW.client_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- By email: the key the CRM treats as identifying. The trip's own
    -- company's clients only — never the other company's.
    IF NEW.client_email IS NOT NULL AND btrim(NEW.client_email) <> '' THEN
      SELECT id, COUNT(*) OVER () INTO matched, n
      FROM clients
      WHERE lower(btrim(email)) = lower(btrim(NEW.client_email))
        AND org_id = NEW.org_id
      LIMIT 1;
      IF n = 1 THEN
        NEW.client_id := matched;
        RETURN NEW;
      END IF;
    END IF;

    -- By full name, only when it names exactly one of the company's clients.
    IF NEW.client_name IS NOT NULL AND btrim(NEW.client_name) <> '' THEN
      SELECT id, COUNT(*) OVER () INTO matched, n
      FROM clients
      WHERE lower(btrim(concat_ws(' ', first_name, last_name))) = lower(btrim(NEW.client_name))
        AND org_id = NEW.org_id
      LIMIT 1;
      IF n = 1 THEN
        NEW.client_id := matched;
      END IF;
    END IF;

    RETURN NEW;
  END $fn$;

  CREATE OR REPLACE FUNCTION public.update_client_status_on_booking() RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
  BEGIN
    IF NEW.client_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- Only a client of the trip's own company moves.
    IF NEW.status IN ('confirmed', 'completed') THEN
      UPDATE clients SET status = 'customer'
      WHERE id = NEW.client_id AND org_id = NEW.org_id AND status IN ('lead', 'prospect');
    ELSIF NEW.status IN ('pending', 'quoted') THEN
      UPDATE clients SET status = 'prospect'
      WHERE id = NEW.client_id AND org_id = NEW.org_id AND status = 'lead';
    END IF;
    RETURN NEW;
  END $fn$;

  CREATE OR REPLACE FUNCTION public.itineraries_touch_client_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
  BEGIN
    -- recompute_client_revenue counts the client's own company's trips only,
    -- so recomputing a foreign client (a link made before 20261212) is
    -- harmless: the trip is not counted.
    IF TG_OP <> 'INSERT' AND OLD.client_id IS NOT NULL THEN
      PERFORM public.recompute_client_revenue(OLD.client_id);
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
      PERFORM public.recompute_client_revenue(NEW.client_id);
    END IF;
    RETURN NULL;
  END $fn$;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.recompute_client_revenue(p_client uuid) RETURNS void
      LANGUAGE plpgsql
      AS $fn$
    DECLARE
      v_revenue   JSONB := '{}'::jsonb;
      v_collected JSONB := '{}'::jsonb;
      v_bookings  INTEGER := 0;
      v_currency  TEXT;
      v_total     NUMERIC := 0;
      v_org       UUID;
    BEGIN
      IF p_client IS NULL THEN RETURN; END IF;
      SELECT org_id INTO v_org FROM clients WHERE id = p_client;

      -- Money: what has been billed and collected, per currency, from the
      -- client's own company's invoices.
      SELECT
        COALESCE(jsonb_object_agg(cur, billed) FILTER (WHERE billed <> 0), '{}'::jsonb),
        COALESCE(jsonb_object_agg(cur, paid)   FILTER (WHERE paid   <> 0), '{}'::jsonb)
      INTO v_revenue, v_collected
      FROM (
        SELECT
          UPPER(COALESCE(i.currency, 'EUR')) AS cur,
          SUM(COALESCE(i.total_amount, 0))   AS billed,
          SUM(COALESCE(i.amount_paid, 0))    AS paid
        FROM invoices i
        WHERE i.client_id = p_client
          AND i.org_id IS NOT DISTINCT FROM v_org
          AND COALESCE(i.status, '') NOT IN ('draft', 'cancelled')
        GROUP BY UPPER(COALESCE(i.currency, 'EUR'))
      ) per_currency;

      -- Bookings: the company's confirmed trips. Counted, never incremented.
      SELECT COUNT(*)
      INTO v_bookings
      FROM itineraries t
      WHERE t.client_id = p_client
        AND t.org_id IS NOT DISTINCT FROM v_org
        AND t.status IN ('confirmed', 'completed');

      SELECT key, value::numeric
      INTO v_currency, v_total
      FROM jsonb_each_text(v_revenue)
      ORDER BY value::numeric DESC
      LIMIT 1;

      UPDATE clients SET
        revenue_by_currency     = v_revenue,
        collected_by_currency   = v_collected,
        revenue_currency        = v_currency,
        total_revenue_generated = COALESCE(v_total, 0),
        total_bookings_count    = COALESCE(v_bookings, 0),
        average_booking_value   = CASE WHEN COALESCE(v_bookings, 0) > 0
                                       THEN COALESCE(v_total, 0) / v_bookings
                                       ELSE 0 END,
        updated_at              = now()
      WHERE id = p_client;
    END $fn$;
  END IF;

  -- Trips already linked to another company's client: unlinked, and listed.
  IF to_regclass('public.org_backfill_review') IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'itineraries', t.id::text, t.org_id,
           'client_id ' || t.client_id::text || ' was another company''s client; cleared by 20261212'
    FROM public.itineraries t
    JOIN public.clients c ON c.id = t.client_id
    WHERE c.org_id IS DISTINCT FROM t.org_id
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
  UPDATE public.itineraries t SET client_id = NULL
  FROM public.clients c
  WHERE c.id = t.client_id AND c.org_id IS DISTINCT FROM t.org_id;
END
$$
$s0015$;
  EXECUTE $s0016$
-- ── 3. Booking codes: per company, no race ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_code_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL,
  PRIMARY KEY (org_id, year)
)
$s0016$;
  EXECUTE $s0017$
ALTER TABLE public.booking_code_counters ENABLE ROW LEVEL SECURITY
$s0017$;
  EXECUTE $s0018$
REVOKE ALL ON public.booking_code_counters FROM PUBLIC, anon, authenticated
$s0018$;
  EXECUTE $s0019$
DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN RETURN; END IF;

  -- Unique per company (both companies can hold BKG-2026-0007). The global
  -- key goes only once the per-company one is in place.
  CREATE UNIQUE INDEX IF NOT EXISTS bookings_org_booking_code_key ON public.bookings (org_id, booking_code);
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_code_key;

  CREATE OR REPLACE FUNCTION public.generate_booking_code(p_org_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    v_year int := extract(year FROM current_date)::int;
    v_n int;
    v_code text;
  BEGIN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION 'generate_booking_code: an organisation is required';
    END IF;
    LOOP
      -- The counter row is locked by the UPDATE until this transaction ends,
      -- so a concurrent caller waits and draws the next number.
      UPDATE booking_code_counters SET last_value = last_value + 1
        WHERE org_id = p_org_id AND year = v_year
        RETURNING last_value INTO v_n;
      IF v_n IS NULL THEN
        -- First code of the year for this company: seeded from its highest
        -- existing code, so nothing already issued is handed out again.
        INSERT INTO booking_code_counters (org_id, year, last_value)
        VALUES (p_org_id, v_year, 1 + COALESCE((
          SELECT max(substring(booking_code FROM 10)::int)
          FROM bookings
          WHERE org_id = p_org_id AND booking_code ~ ('^BKG-' || v_year || '-[0-9]{1,9}$')
        ), 0))
        ON CONFLICT (org_id, year) DO UPDATE SET last_value = booking_code_counters.last_value + 1
        RETURNING last_value INTO v_n;
      END IF;
      v_code := 'BKG-' || v_year || '-' || CASE WHEN v_n < 10000 THEN lpad(v_n::text, 4, '0') ELSE v_n::text END;
      -- A code typed in or made by an older fallback may already sit ahead.
      IF NOT EXISTS (SELECT 1 FROM bookings WHERE org_id = p_org_id AND booking_code = v_code) THEN
        RETURN v_code;
      END IF;
    END LOOP;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.generate_booking_code(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.generate_booking_code(uuid) TO service_role;
END
$$
$s0019$;
  EXECUTE $s0020$
DROP FUNCTION IF EXISTS public.generate_booking_code()
$s0020$;
  EXECUTE $s0021$
-- ── 4. The stored total is what the client pays ───────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.recalculate_itinerary_totals()') IS NULL THEN RETURN; END IF;
  CREATE OR REPLACE FUNCTION public.recalculate_itinerary_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
  DECLARE
    v_itinerary_id UUID;
    v_lines NUMERIC;
    v_total NUMERIC;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      SELECT itinerary_id INTO v_itinerary_id FROM itinerary_days WHERE id = OLD.itinerary_day_id;
    ELSE
      SELECT itinerary_id INTO v_itinerary_id FROM itinerary_days WHERE id = NEW.itinerary_day_id;
    END IF;

    -- The client price of each line; a line with none yet at the default
    -- 25% over its cost (lib/itinerary-client-price.ts serviceClientPrice).
    SELECT round(COALESCE(SUM(COALESCE(s.client_price, COALESCE(s.total_cost, 0) * 1.25)), 0), 2)
    INTO v_lines
    FROM itinerary_services s
    JOIN itinerary_days d ON s.itinerary_day_id = d.id
    WHERE d.itinerary_id = v_itinerary_id;

    -- No priced lines: the stored total stands (tripClientTotal does the same).
    IF v_itinerary_id IS NOT NULL AND v_lines > 0 THEN
      UPDATE itineraries
      SET
        total_cost = round(v_lines + GREATEST(COALESCE(season_uplift_amount, 0), 0), 2),
        total_revenue = round(v_lines + GREATEST(COALESCE(season_uplift_amount, 0), 0), 2),
        updated_at = NOW()
      WHERE id = v_itinerary_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END $fn$;
END
$$
$s0021$;
  EXECUTE $s0022$
-- ── 5. Move a trip and everything dated on it together ────────────────────
DO $$
BEGIN
  IF to_regclass('public.itineraries') IS NULL OR to_regclass('public.itinerary_days') IS NULL
     OR to_regclass('public.itinerary_resources') IS NULL THEN RETURN; END IF;

  CREATE OR REPLACE FUNCTION public.shift_itinerary_dates(p_itinerary_id uuid, p_org_id uuid, p_days integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $fn$
  BEGIN
    UPDATE itineraries
      SET start_date = start_date + p_days, end_date = end_date + p_days, updated_at = now()
      WHERE id = p_itinerary_id AND org_id = p_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'itinerary not found' USING ERRCODE = 'P0002';
    END IF;
    UPDATE itinerary_days SET date = date + p_days WHERE itinerary_id = p_itinerary_id;
    UPDATE itinerary_resources
      SET start_date = start_date + p_days, end_date = end_date + p_days, updated_at = now()
      WHERE itinerary_id = p_itinerary_id;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.shift_itinerary_dates(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.shift_itinerary_dates(uuid, uuid, integer) TO service_role;
END
$$
$s0022$;
  EXECUTE $s0023$
INSERT INTO public.schema_migrations (name) VALUES ('20261212_trip_children_org_policies') ON CONFLICT DO NOTHING
$s0023$;
  EXECUTE $s0024$
-- ==================================================================
-- 20261213_departure_seat_holds_atomic
-- ==================================================================
-- ============================================
-- A website order's seat hold: checked and placed in one locked step
-- ============================================
-- An order that arrives through Order Intake (the operator's paste page, the
-- hosted /order form, or the website order emails the mailbox sync reads —
-- lib/intake/process-order.ts) holds seats on the programme's departure for
-- that date, as a PENDING departure_bookings row. Since the Sell audit (#21)
-- the hold is placed only when the party fits the seats left. But the check
-- and the hold were two separate requests: read the holds, count the seats in
-- the app (seatsFree), then insert. Nothing in the database enforces
-- max_pax or maintains booked_pax, so two orders for the last seats arriving
-- at the same moment (the sync and a customer on /order, or two customers)
-- both read "2 free", both inserted, and the departure was held past its
-- maximum — exactly what the check was added to stop.
--
-- hold_departure_seats(org, departure, pax, client, client name, notes) does
-- both under the departure row's lock:
--
--   1. SELECT … FOR UPDATE the departure (this company's, not cancelled). A
--      second caller for the same departure waits here until the first one's
--      transaction ends, then counts the first one's hold.
--   2. Seats free = max_pax − (the larger of booked_pax and the confirmed
--      holds) − the pending holds, never below 0 — the same rule as
--      seatsFree() in lib/intake/process-order.ts, which the preview still
--      uses (booked_pax is the office's own count, kept by hand on the
--      departures grid, and a pending hold is not in it yet).
--   3. The pending hold is inserted only if the party fits.
--
-- It returns jsonb { held, free, id }: held = whether the hold was placed,
-- free = the seats that were free when it checked (before this hold), id =
-- the new departure_bookings row (null when not held). A departure not found
-- for that company, or cancelled, returns held = false, free = 0.
--
-- What the route does when it does not fit is unchanged: the quote is still
-- created, no seats are held, and the result says how many were free.
--
-- SECURITY DEFINER with a fixed search_path, and executable by service_role
-- only: every Order Intake door runs on the service-role client, and a
-- signed-in user (or anon, with the public key) must not be able to place
-- holds on any company's departures by naming its id
-- (20261129_revoke_definer_functions has the rule).
--
-- Idempotent (CREATE OR REPLACE; the REVOKE/GRANT restate the same state)
-- and guarded on both tables existing (to_regclass).

DO $$
BEGIN
  IF to_regclass('public.tour_departures') IS NULL OR to_regclass('public.departure_bookings') IS NULL THEN
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.hold_departure_seats(
    p_org_id uuid,
    p_departure_id uuid,
    p_pax integer,
    p_client_id uuid DEFAULT NULL,
    p_client_name text DEFAULT NULL,
    p_notes text DEFAULT NULL
  ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    v_max integer;
    v_booked integer;
    v_confirmed integer;
    v_pending integer;
    v_free integer;
    v_id uuid;
  BEGIN
    IF p_org_id IS NULL OR p_departure_id IS NULL THEN
      RAISE EXCEPTION 'hold_departure_seats: an organisation and a departure are required';
    END IF;
    IF p_pax IS NULL OR p_pax < 1 THEN
      RAISE EXCEPTION 'hold_departure_seats: pax must be at least 1';
    END IF;

    -- The lock: a concurrent hold on this departure waits here, then sees
    -- this one's row when it counts.
    SELECT max_pax, booked_pax INTO v_max, v_booked
      FROM tour_departures
     WHERE id = p_departure_id AND org_id = p_org_id AND status <> 'cancelled'
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('held', false, 'free', 0, 'id', NULL);
    END IF;

    SELECT COALESCE(SUM(pax) FILTER (WHERE status = 'confirmed'), 0),
           COALESCE(SUM(pax) FILTER (WHERE status = 'pending'), 0)
      INTO v_confirmed, v_pending
      FROM departure_bookings
     WHERE org_id = p_org_id AND departure_id = p_departure_id
       AND status IN ('pending', 'confirmed');

    -- seatsFree(): the larger of booked_pax and the confirmed holds, plus
    -- every pending hold; never below 0.
    v_free := GREATEST(0, COALESCE(v_max, 0) - (GREATEST(COALESCE(v_booked, 0), v_confirmed) + v_pending));

    IF p_pax > v_free THEN
      RETURN jsonb_build_object('held', false, 'free', v_free, 'id', NULL);
    END IF;

    INSERT INTO departure_bookings (org_id, departure_id, client_id, client_name, pax, status, notes)
    VALUES (p_org_id, p_departure_id, p_client_id, p_client_name, p_pax, 'pending', p_notes)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('held', true, 'free', v_free, 'id', v_id);
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.hold_departure_seats(uuid, uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.hold_departure_seats(uuid, uuid, integer, uuid, text, text) TO service_role;
END
$$
$s0024$;
  EXECUTE $s0025$
INSERT INTO public.schema_migrations (name) VALUES ('20261213_departure_seat_holds_atomic') ON CONFLICT DO NOTHING
$s0025$;
  EXECUTE $s0026$
-- ==================================================================
-- 20261214_vat_per_document
-- ==================================================================
-- ============================================
-- VAT, recorded on each client document
-- ============================================
-- The owner's decision (2026-10-13): "Use a recorded tax amount, which is 14%
-- as VAT … on every applicable document, so the user knows if tax is applied
-- or not applied." Two companies (ATS, Travel2Egypt) share this install, so
-- the rate is per company, and each document records its own VAT at the
-- moment it is priced or issued — a later change of rate never re-prices a
-- document already made.
--
-- VAT is added ON TOP of the net price: total incl. VAT = net + vat_amount.
-- Every existing price column (selling_price, total_cost, …) keeps meaning the
-- net, so nothing that reads one changes. The amount is net × rate / 100 in
-- the currency's own unit (whole yen for JPY), computed by the server
-- (lib/vat.ts); an amount sent by a browser is never stored.
--
--   organizations.vat_rate     the company's VAT rate in percent, 14 unless
--                              an admin sets another (Settings › Company
--                              Profile). Read when a document is priced.
--
--   tour_quotes / b2c_quotes
--     vat_applied              whether this quote charges VAT on top
--     vat_rate                 the rate it was priced at (NULL when not applied)
--     vat_amount               the VAT, in the quote's currency (0 when not)
--
--   invoices
--     vat_applied              whether this invoice charges VAT. The rate and
--                              the amount are the invoice's long-standing
--                              tax_rate / tax_amount; total_amount already
--                              includes tax_amount (subtotal + tax − discount).
--
--   itineraries
--     vat_applied, vat_rate    carried from the quote the trip was converted
--                              from (or booked from). Only the flag and the
--                              rate: a trip's client total is re-added from its
--                              lines as the trip is edited, so the VAT shown
--                              beside it is that total at the recorded rate.
--                              Bookings read their trip's.
--
-- Existing rows were issued without VAT: vat_applied false, amount 0 — except
-- invoices that already carry a tax_amount above 0, which are marked applied
-- with the rate and amount they recorded.
--
-- revert_quote_to_revision / revert_b2c_quote_to_revision restore the three
-- VAT columns with the price they belong to (revisions are to_jsonb snapshots;
-- older ones without the keys restore "not applied"). Otherwise identical to
-- 20261121 / 20261211.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, each table guarded
-- with to_regclass. Applying it twice changes nothing the second time.

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 14;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_vat_rate_range') THEN
      ALTER TABLE public.organizations
        ADD CONSTRAINT organizations_vat_rate_range CHECK (vat_rate >= 0 AND vat_rate <= 100);
    END IF;
  END IF;

  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_rate numeric;
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('public.b2c_quotes') IS NOT NULL THEN
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_rate numeric;
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('public.itineraries') IS NOT NULL THEN
    ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS vat_rate numeric;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    -- An invoice that already carries tax was issued with it.
    UPDATE public.invoices SET vat_applied = true
     WHERE vat_applied = false AND COALESCE(tax_amount, 0) > 0;
  END IF;
END
$$
$s0026$;
  EXECUTE $s0027$
-- ---------------------------------------------------------------- B2B revert
DO $$
BEGIN
  IF to_regclass('public.tour_quotes') IS NOT NULL AND to_regclass('public.quote_revisions') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
      DECLARE d JSONB; v_new_id UUID;
      BEGIN
        SELECT quote_data INTO d FROM quote_revisions
         WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND version_number = p_version_number;
        IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

        UPDATE tour_quotes SET
          variation_id = NULLIF(d->>'variation_id','')::uuid,
          itinerary_id = NULLIF(d->>'itinerary_id','')::uuid,
          trip_name = d->>'trip_name',
          partner_id = NULLIF(d->>'partner_id','')::uuid,
          client_name = d->>'client_name',
          client_email = d->>'client_email',
          client_phone = d->>'client_phone',
          client_nationality = d->>'client_nationality',
          travel_date = NULLIF(d->>'travel_date','')::date,
          num_adults = NULLIF(d->>'num_adults','')::integer,
          num_children = NULLIF(d->>'num_children','')::integer,
          services_snapshot = d->'services_snapshot',
          total_cost = NULLIF(d->>'total_cost','')::numeric,
          margin_percent = NULLIF(d->>'margin_percent','')::numeric,
          margin_amount = NULLIF(d->>'margin_amount','')::numeric,
          selling_price = NULLIF(d->>'selling_price','')::numeric,
          price_per_person = NULLIF(d->>'price_per_person','')::numeric,
          currency = d->>'currency',
          tour_leader_included = NULLIF(d->>'tour_leader_included','')::boolean,
          tour_leader_cost = NULLIF(d->>'tour_leader_cost','')::numeric,
          single_supplement = NULLIF(d->>'single_supplement','')::numeric,
          is_eur_passport = NULLIF(d->>'is_eur_passport','')::boolean,
          season = d->>'season',
          season_name = d->>'season_name',
          season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
          season_uplift_amount = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
          vat_applied = COALESCE(NULLIF(d->>'vat_applied','')::boolean, false),
          vat_rate = NULLIF(d->>'vat_rate','')::numeric,
          vat_amount = COALESCE(NULLIF(d->>'vat_amount','')::numeric, 0),
          status = d->>'status',
          valid_until = NULLIF(d->>'valid_until','')::date,
          notes = d->>'notes',
          updated_at = NOW()
        WHERE id = p_quote_id;

        SELECT create_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;

  -- -------------------------------------------------------------- B2C revert
  IF to_regclass('public.b2c_quotes') IS NOT NULL AND to_regclass('public.quote_revisions') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_b2c_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
      DECLARE d JSONB; v_new_id UUID;
      BEGIN
        SELECT quote_data INTO d FROM quote_revisions
         WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND version_number = p_version_number;
        IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

        UPDATE b2c_quotes SET
          num_travelers    = NULLIF(d->>'num_travelers','')::integer,
          tier             = d->>'tier',
          total_cost       = NULLIF(d->>'total_cost','')::numeric,
          margin_percent   = NULLIF(d->>'margin_percent','')::numeric,
          margin_amount    = NULLIF(d->>'margin_amount','')::numeric,
          selling_price    = NULLIF(d->>'selling_price','')::numeric,
          price_per_person = NULLIF(d->>'price_per_person','')::numeric,
          currency         = d->>'currency',
          cost_breakdown   = d->'cost_breakdown',
          season_name           = d->>'season_name',
          season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
          season_uplift_amount  = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
          vat_applied      = COALESCE(NULLIF(d->>'vat_applied','')::boolean, false),
          vat_rate         = NULLIF(d->>'vat_rate','')::numeric,
          vat_amount       = COALESCE(NULLIF(d->>'vat_amount','')::numeric, 0),
          status           = d->>'status',
          valid_until      = NULLIF(d->>'valid_until','')::date,
          internal_notes   = d->>'internal_notes',
          client_notes     = d->>'client_notes',
          updated_at       = NOW()
        WHERE id = p_quote_id;

        SELECT create_b2c_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;
END
$$
$s0027$;
  EXECUTE $s0028$
INSERT INTO public.schema_migrations (name) VALUES ('20261214_vat_per_document') ON CONFLICT DO NOTHING
$s0028$;
  EXECUTE $s0029$
-- ==================================================================
-- 20261215_departure_holds_lifecycle
-- ==================================================================
-- ============================================
-- A departure's seat holds: one seat rule, open dates only, released on cancel
-- ============================================
-- 20261213 made a website order's seat hold atomic (hold_departure_seats,
-- under the departure row's lock). The Operate audit found what was left:
--
--   1. The seat rule. Seats free = max_pax − (the LARGER of booked_pax and
--      the confirmed holds) − the pending holds. But booked_pax is the
--      office's count of seats sold OUTSIDE the app (or a partner's count on
--      a mirrored departure) — a confirmed hold is never in it — so taking the
--      larger of the two hid one or the other. Now, everywhere
--      (lib/departures/seats.ts and this file):
--
--        taken = booked_pax + confirmed holds + pending holds
--        free  = max_pax − taken, never below 0
--
--   2. Which dates take holds. Only status <> 'cancelled' was refused, so a
--      date the office closed by hand (Full) or never published (Draft) still
--      took web-order holds. A hold is now placed only on an Open, Limited or
--      Guaranteed departure — the statuses /api/departures/check calls
--      bookable. Anything else returns held = false, free = 0.
--
--   3. Lowering the seats. PUT /api/departures/[id] refused max_pax below
--      booked_pax only, and without the departure's lock: six pending holds
--      and max_pax lowered to 4 left the date held past its maximum.
--      set_departure_seats(org, departure, max_pax, booked_pax) changes either
--      number under the same row lock hold_departure_seats takes, and refuses
--      (ok = false, reason 'below_taken') when max_pax would fall under
--      booked_pax + the live holds. A null argument keeps the stored value.
--      It returns jsonb { ok, reason, max_pax, booked_pax, held, taken }.
--
--   4. Cancelling a departure. Its pending holds stayed pending — seats
--      "taken" on a date that will not run, invisible to the office. A
--      trigger now releases them (status 'cancelled') whenever a departure
--      becomes Cancelled, whoever changes it: the departures screens, a PUT,
--      or an integration's sync of a mirrored departure (which the route
--      never sees — that is why this is a trigger and not route code).
--      Confirmed holds are left alone: those are seats the office sold, and
--      rehoming them is the office's call; the departure page lists them.
--
-- DATA: pending holds on departures that are ALREADY cancelled are released
-- once, the same as the trigger would have. Nothing else changes.
--
-- Both functions are SECURITY DEFINER with a fixed search_path and
-- executable by service_role only (20261129_revoke_definer_functions has the
-- rule): every caller is a server route on the service-role client, and a
-- signed-in user must not change any company's seats by naming its id. The
-- trigger function is not callable on its own.
--
-- Idempotent (CREATE OR REPLACE, DROP TRIGGER IF EXISTS, the release only
-- touches rows still pending) and guarded on both tables existing.

DO $$
BEGIN
  IF to_regclass('public.tour_departures') IS NULL OR to_regclass('public.departure_bookings') IS NULL THEN
    RETURN;
  END IF;

  -- 1 + 2. The hold: same signature, same answer shape, new rule and statuses.
  CREATE OR REPLACE FUNCTION public.hold_departure_seats(
    p_org_id uuid,
    p_departure_id uuid,
    p_pax integer,
    p_client_id uuid DEFAULT NULL,
    p_client_name text DEFAULT NULL,
    p_notes text DEFAULT NULL
  ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    v_max integer;
    v_booked integer;
    v_confirmed integer;
    v_pending integer;
    v_free integer;
    v_id uuid;
  BEGIN
    IF p_org_id IS NULL OR p_departure_id IS NULL THEN
      RAISE EXCEPTION 'hold_departure_seats: an organisation and a departure are required';
    END IF;
    IF p_pax IS NULL OR p_pax < 1 THEN
      RAISE EXCEPTION 'hold_departure_seats: pax must be at least 1';
    END IF;

    -- The lock: a concurrent hold (or seat change) on this departure waits
    -- here, then sees this one's row when it counts. Open dates only.
    SELECT max_pax, booked_pax INTO v_max, v_booked
      FROM tour_departures
     WHERE id = p_departure_id AND org_id = p_org_id AND status IN ('open', 'limited', 'guaranteed')
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('held', false, 'free', 0, 'id', NULL);
    END IF;

    SELECT COALESCE(SUM(pax) FILTER (WHERE status = 'confirmed'), 0),
           COALESCE(SUM(pax) FILTER (WHERE status = 'pending'), 0)
      INTO v_confirmed, v_pending
      FROM departure_bookings
     WHERE org_id = p_org_id AND departure_id = p_departure_id
       AND status IN ('pending', 'confirmed');

    -- lib/departures/seats.ts: booked_pax + confirmed + pending; never below 0.
    v_free := GREATEST(0, COALESCE(v_max, 0) - (COALESCE(v_booked, 0) + v_confirmed + v_pending));

    IF p_pax > v_free THEN
      RETURN jsonb_build_object('held', false, 'free', v_free, 'id', NULL);
    END IF;

    INSERT INTO departure_bookings (org_id, departure_id, client_id, client_name, pax, status, notes)
    VALUES (p_org_id, p_departure_id, p_client_id, p_client_name, p_pax, 'pending', p_notes)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('held', true, 'free', v_free, 'id', v_id);
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.hold_departure_seats(uuid, uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.hold_departure_seats(uuid, uuid, integer, uuid, text, text) TO service_role;

  -- 3. Changing the seats under the lock.
  CREATE OR REPLACE FUNCTION public.set_departure_seats(
    p_org_id uuid,
    p_departure_id uuid,
    p_max_pax integer DEFAULT NULL,
    p_booked_pax integer DEFAULT NULL
  ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    v_max integer;
    v_booked integer;
    v_held integer;
  BEGIN
    IF p_org_id IS NULL OR p_departure_id IS NULL THEN
      RAISE EXCEPTION 'set_departure_seats: an organisation and a departure are required';
    END IF;
    IF p_max_pax IS NOT NULL AND p_max_pax < 1 THEN
      RAISE EXCEPTION 'set_departure_seats: max_pax must be at least 1';
    END IF;
    IF p_booked_pax IS NOT NULL AND p_booked_pax < 0 THEN
      RAISE EXCEPTION 'set_departure_seats: booked_pax must not be negative';
    END IF;

    SELECT max_pax, booked_pax INTO v_max, v_booked
      FROM tour_departures
     WHERE id = p_departure_id AND org_id = p_org_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    v_max := COALESCE(p_max_pax, v_max, 0);
    v_booked := COALESCE(p_booked_pax, v_booked, 0);

    SELECT COALESCE(SUM(pax), 0) INTO v_held
      FROM departure_bookings
     WHERE org_id = p_org_id AND departure_id = p_departure_id
       AND status IN ('pending', 'confirmed');

    IF v_booked + v_held > v_max THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'below_taken',
        'max_pax', v_max, 'booked_pax', v_booked, 'held', v_held, 'taken', v_booked + v_held);
    END IF;

    UPDATE tour_departures
       SET max_pax = v_max, booked_pax = v_booked, updated_at = now()
     WHERE id = p_departure_id AND org_id = p_org_id;

    RETURN jsonb_build_object('ok', true, 'reason', NULL,
      'max_pax', v_max, 'booked_pax', v_booked, 'held', v_held, 'taken', v_booked + v_held);
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.set_departure_seats(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.set_departure_seats(uuid, uuid, integer, integer) TO service_role;

  -- 4. A cancelled departure releases its pending holds.
  CREATE OR REPLACE FUNCTION public.release_holds_on_departure_cancel() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  BEGIN
    UPDATE departure_bookings
       SET status = 'cancelled', updated_at = now()
     WHERE departure_id = NEW.id AND org_id = NEW.org_id AND status = 'pending';
    RETURN NEW;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.release_holds_on_departure_cancel() FROM PUBLIC, anon, authenticated;

  DROP TRIGGER IF EXISTS tour_departures_cancel_releases_holds ON public.tour_departures;
  CREATE TRIGGER tour_departures_cancel_releases_holds
    AFTER UPDATE OF status ON public.tour_departures
    FOR EACH ROW
    WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
    EXECUTE FUNCTION public.release_holds_on_departure_cancel();

  -- DATA: pending holds already sitting on cancelled departures.
  UPDATE public.departure_bookings b
     SET status = 'cancelled', updated_at = now()
    FROM public.tour_departures d
   WHERE d.id = b.departure_id AND d.org_id = b.org_id
     AND d.status = 'cancelled' AND b.status = 'pending';
END
$$
$s0029$;
  EXECUTE $s0030$
-- ── A hold follows its quote ──────────────────────────────────────────────
-- A website order's hold (lib/intake/process-order) was tied to its quote
-- only by the quote number written into the note, so a quote the customer
-- turned down, or one the office deleted, kept its seats held until someone
-- released them by hand on the departure page. departure_bookings.quote_id
-- now records the quote; a quote set to Rejected or Expired, or deleted,
-- releases its pending holds (confirmed ones are the office's to release).
-- Existing holds are linked through the quote number in their note
-- ("ウェブ注文 QT-2026-00012…"), within the same company only.
DO $$
BEGIN
  IF to_regclass('public.departure_bookings') IS NULL OR to_regclass('public.tour_quotes') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.departure_bookings
    ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.tour_quotes(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS departure_bookings_quote_id_idx ON public.departure_bookings (quote_id);

  CREATE OR REPLACE FUNCTION public.release_holds_on_quote_end() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    q public.tour_quotes;
  BEGIN
    IF TG_OP = 'DELETE' THEN q := OLD; ELSE q := NEW; END IF;
    UPDATE departure_bookings
       SET status = 'cancelled', updated_at = now()
     WHERE quote_id = q.id AND org_id = q.org_id AND status = 'pending';
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END $fn$;
  REVOKE EXECUTE ON FUNCTION public.release_holds_on_quote_end() FROM PUBLIC, anon, authenticated;

  DROP TRIGGER IF EXISTS tour_quotes_end_releases_holds ON public.tour_quotes;
  CREATE TRIGGER tour_quotes_end_releases_holds
    AFTER UPDATE OF status ON public.tour_quotes
    FOR EACH ROW
    WHEN (NEW.status IN ('rejected', 'expired') AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.release_holds_on_quote_end();

  -- BEFORE: the foreign key clears quote_id as the row goes.
  DROP TRIGGER IF EXISTS tour_quotes_delete_releases_holds ON public.tour_quotes;
  CREATE TRIGGER tour_quotes_delete_releases_holds
    BEFORE DELETE ON public.tour_quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.release_holds_on_quote_end();

  -- DATA: link the holds already placed, by the quote number in their note.
  UPDATE public.departure_bookings b
     SET quote_id = q.id
    FROM public.tour_quotes q
   WHERE b.quote_id IS NULL
     AND q.org_id = b.org_id
     AND b.notes LIKE 'ウェブ注文 %'
     AND regexp_replace(split_part(b.notes, ' ', 2), '（.*$', '') = q.quote_number;
END
$$
$s0030$;
  EXECUTE $s0031$
INSERT INTO public.schema_migrations (name) VALUES ('20261215_departure_holds_lifecycle') ON CONFLICT DO NOTHING
$s0031$;
  EXECUTE $s0032$
-- ==================================================================
-- 20261216_surveys_and_voucher_numbers
-- ==================================================================
-- ============================================
-- Guest surveys: only your organisation's, one answer per guest.
-- Supplier document numbers: per company.
-- ============================================
-- guest_surveys (20261031) was created with no RLS and no policy, and the
-- baseline grants ALL on new tables to authenticated. So through PostgREST,
-- with the public anon key and ANY signed-in session — a self-signed-up
-- stranger with no membership included — GET /rest/v1/guest_surveys read
-- every company's survey tokens, client names, trip snapshots and answers,
-- and PATCH/DELETE changed or removed them. RLS is now on, every policy on it
-- is dropped by name (whatever it was called — one left behind would re-open
-- the table, policies are OR'd) and replaced by guest_surveys_org_select/
-- insert/update/delete, TO authenticated, = user_is_in_org(org_id). anon has
-- no grant and matches no policy.
--
-- One survey link per trip is handed to the whole party (the printed sheet's
-- QR, the emailed link), and the public POST replaced guest_surveys.responses
-- on every submit: the second guest's answers erased the first's, silently,
-- and the public GET echoed the earlier guest's answers to whoever opened the
-- link. Each submission is now its own row:
--
--   guest_survey_responses  org_id, survey_id, respondent_name, answers,
--                           submitted_at. org_id is always the survey's
--                           (a trigger sets it), so a response can never sit
--                           in another company. Same RLS as guest_surveys.
--
-- DATA: every submitted survey's answers (guest_surveys.responses) become its
-- first response row, submitted at its submitted_at. guest_surveys.responses
-- is left as it was and is no longer written or read; nothing is deleted.
--
-- BROWSER CALLERS: none. The staff results page (/surveys → /api/surveys),
-- the public survey (/api/public/survey/<token>), the daily invite job and
-- the printed sheet all use the service role, which bypasses RLS.
--
-- Supplier document numbers (HV-/SO-/TV-/AV-/GA-/CV-YYYY-NNNN) were read as
-- the highest number across EVERY company (lib/documents/numberer.ts, no org
-- filter) under one install-wide UNIQUE (document_number): ATS and
-- Travel2Egypt drew interleaved numbers from one sequence — each could read
-- the other's voucher volume off the gaps — and a number typed on one
-- company's voucher that the other already held failed as a duplicate,
-- saying that it existed. Now, as quotes (20261211) and bookings (20261212):
--
--   supplier_document_number_counters  one row per (company, prefix, year):
--                           the last number handed out, locked by the
--                           INSERT … ON CONFLICT DO UPDATE that increments it.
--   next_supplier_document_number(org, prefix, year)  the next free number
--                           for that company. The first call for a company,
--                           prefix and year starts after the company's own
--                           highest well-formed number; a number the company
--                           already holds is skipped. Service role only.
--   UNIQUE (org_id, document_number)  replaces UNIQUE (document_number): both
--                           companies may hold HV-2026-0007.
--
-- EXISTING DOCUMENT NUMBERS ARE NOT CHANGED. The install-wide constraint
-- held, so the per-company one holds.
--
-- Idempotent (policies dropped before they are created, CREATE … IF NOT
-- EXISTS, CREATE OR REPLACE, the backfill skips surveys that already have a
-- response) and guarded on each table existing (to_regclass). Applying it
-- twice changes nothing the second time.

-- ── 1. Each guest's answers kept separately ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.guest_surveys') IS NULL THEN RETURN; END IF;

  CREATE TABLE IF NOT EXISTS public.guest_survey_responses (
    id              uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id          uuid NOT NULL,
    survey_id       uuid NOT NULL,
    -- The name the guest typed (optional — the questionnaire welcomes
    -- unnamed answers). Also inside answers.guest_name, as submitted.
    respondent_name character varying(200),
    -- Ratings / comments / extras / free text, as lib/surveys/guest-survey.ts
    -- sanitizeResponses keeps them.
    answers         jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_at    timestamp with time zone DEFAULT now() NOT NULL,
    created_at      timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guest_survey_responses_pkey PRIMARY KEY (id),
    CONSTRAINT guest_survey_responses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT guest_survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.guest_surveys(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS guest_survey_responses_survey_idx
    ON public.guest_survey_responses (survey_id, submitted_at);
  CREATE INDEX IF NOT EXISTS guest_survey_responses_org_idx
    ON public.guest_survey_responses (org_id, submitted_at DESC);

  -- A response belongs to its survey's company, whatever the writer sent.
  CREATE OR REPLACE FUNCTION public.guest_survey_responses_org_from_survey() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    SELECT s.org_id INTO NEW.org_id FROM public.guest_surveys s WHERE s.id = NEW.survey_id;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS guest_survey_responses_org_from_survey ON public.guest_survey_responses;
  CREATE TRIGGER guest_survey_responses_org_from_survey
    BEFORE INSERT OR UPDATE OF survey_id, org_id ON public.guest_survey_responses
    FOR EACH ROW EXECUTE FUNCTION public.guest_survey_responses_org_from_survey();

  -- The answers each submitted survey holds today become its first response.
  INSERT INTO public.guest_survey_responses (org_id, survey_id, respondent_name, answers, submitted_at, created_at)
  SELECT s.org_id, s.id,
         NULLIF(btrim(left(s.responses->>'guest_name', 200)), ''),
         s.responses,
         COALESCE(s.submitted_at, s.updated_at, s.created_at),
         now()
    FROM public.guest_surveys s
   WHERE s.status = 'submitted'
     AND s.responses IS NOT NULL AND s.responses <> '{}'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.guest_survey_responses r WHERE r.survey_id = s.id);

  COMMENT ON COLUMN public.guest_surveys.responses IS
    'Before 20261216: the LAST submission only. Copied to guest_survey_responses; no longer written or read.';
END
$$
$s0032$;
  EXECUTE $s0033$
-- ── 2. Both survey tables: only your organisation's, through RLS ──────────
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['guest_surveys', 'guest_survey_responses'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id))', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id))', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_delete', t);
    -- The routes' client (as 20261113 does for supplier_documents).
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$$
$s0033$;
  EXECUTE $s0034$
-- ── 3. Supplier document numbers: per company, no race ────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_document_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z]{2,3}$'),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, prefix, year)
)
$s0034$;
  EXECUTE $s0035$
ALTER TABLE public.supplier_document_number_counters ENABLE ROW LEVEL SECURITY
$s0035$;
  EXECUTE $s0036$
REVOKE ALL ON public.supplier_document_number_counters FROM PUBLIC, anon, authenticated
$s0036$;
  EXECUTE $s0037$
GRANT ALL ON public.supplier_document_number_counters TO service_role
$s0037$;
  EXECUTE $s0038$
DO $$
BEGIN
  IF to_regclass('public.supplier_documents') IS NULL THEN RETURN; END IF;

  -- Unique per company. The global key goes only once this one is in place.
  CREATE UNIQUE INDEX IF NOT EXISTS supplier_documents_org_document_number_key
    ON public.supplier_documents (org_id, document_number);
  ALTER TABLE public.supplier_documents DROP CONSTRAINT IF EXISTS supplier_documents_document_number_key;

  CREATE OR REPLACE FUNCTION public.next_supplier_document_number(p_org uuid, p_prefix text, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    pattern text;
    seed integer := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_supplier_document_number: a document must belong to a company'; END IF;
    IF p_prefix IS NULL OR p_prefix !~ '^[A-Z]{2,3}$' THEN
      RAISE EXCEPTION 'next_supplier_document_number: bad prefix %', p_prefix;
    END IF;
    pattern := '^' || p_prefix || '-' || p_year || '-([0-9]{1,9})$';

    -- First number of the year for this company and prefix: carry on after
    -- its own highest well-formed number (a malformed one is ignored).
    IF NOT EXISTS (SELECT 1 FROM supplier_document_number_counters
                    WHERE org_id = p_org AND prefix = p_prefix AND year = p_year) THEN
      SELECT COALESCE(MAX((regexp_match(document_number, pattern))[1]::integer), 0) INTO seed
        FROM supplier_documents WHERE org_id = p_org AND document_number ~ pattern;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_supplier_document_number: no free % number after % attempts', p_prefix, attempts;
      END IF;
      INSERT INTO supplier_document_number_counters AS c (org_id, prefix, year, last_value)
        VALUES (p_org, p_prefix, p_year, seed + 1)
        ON CONFLICT (org_id, prefix, year) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      -- Four digits as before; a fifth is added, never cut off (lpad truncates).
      candidate := p_prefix || '-' || p_year || '-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM supplier_documents WHERE org_id = p_org AND document_number = candidate);
    END LOOP;
    RETURN candidate;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_supplier_document_number(uuid, text, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_supplier_document_number(uuid, text, integer) TO service_role;
END
$$
$s0038$;
  EXECUTE $s0039$
INSERT INTO public.schema_migrations (name) VALUES ('20261216_surveys_and_voucher_numbers') ON CONFLICT DO NOTHING
$s0039$;
  EXECUTE $s0040$
-- ==================================================================
-- 20261217_followup_owner_backfill
-- ==================================================================
-- ============================================
-- Follow-ups scheduled before they had an owner get one
-- ============================================
-- Since the Operate audit (Tasks and Follow-ups), whoever schedules a client
-- follow-up owns it (client_followups.assigned_to = their login id, stamped
-- by POST /api/followups), and the task-reminders job gives the owner an
-- in-app reminder on the due date. Follow-ups scheduled before that have
-- assigned_to NULL, so they never remind anyone.
--
-- This names an owner for each PENDING follow-up with none, from the first
-- rule that names one. Every rule only ever names a login that is a member
-- (organization_members) of the company of the follow-up's client — the
-- reminder job sends to nobody else, and a follow-up must not land with
-- another company's staff.
--
--   1. The activity log: the person whose POST /api/followups was logged in
--      the client's company within 60 seconds of the follow-up being created
--      — the person who scheduled it. Used only when exactly ONE such person
--      is found; two people scheduling follow-ups in the same minute name
--      nobody.
--   2. The client's creator: clients.created_by, when it is the id of such a
--      member.
--   3. The client's latest trip with an assignee: the most recently created
--      itinerary of this client in the same company whose assignee
--      (itineraries.assigned_to → team_members) has a login that is such a
--      member and is not deactivated — the person handling that client now.
--
-- Anything left is listed in org_backfill_review ('client_followups',
-- follow-up id, the client's company, reason below) for someone to assign by
-- hand; it stays unowned (and unreminded) until then.
--
-- Completed and cancelled follow-ups are left alone: they never remind, so a
-- guessed owner would change nothing but the record.
--
-- DATA: client_followups.assigned_to is set on pending follow-ups that had
-- none; rows the rules cannot place are added to org_backfill_review. Nothing
-- else changes (updated_at, reminder_sent and the rest are left as they were).
--
-- Idempotent: every rule touches only rows still NULL, and the review insert
-- is ON CONFLICT DO NOTHING. Guarded on the tables it reads existing.

DO $$
DECLARE
  v_reason constant text := 'pending follow-up with no owner: the activity log, the client''s creator and the client''s trips name nobody in the client''s company — assign it by hand';
BEGIN
  IF to_regclass('public.client_followups') IS NULL
     OR to_regclass('public.clients') IS NULL
     OR to_regclass('public.organization_members') IS NULL
     OR to_regclass('public.org_backfill_review') IS NULL THEN
    RETURN;
  END IF;

  -- 1. Who scheduled it, by the activity log.
  IF to_regclass('public.activity_log') IS NOT NULL THEN
    UPDATE public.client_followups f
       SET assigned_to = pick.user_id::text
      FROM (
        SELECT f2.id, min(a.user_id::text) AS user_id
          FROM public.client_followups f2
          JOIN public.clients c ON c.id = f2.client_id
          JOIN public.activity_log a
            ON a.org_id = c.org_id
           AND a.method = 'POST'
           AND split_part(a.path, '?', 1) = '/api/followups'
           AND a.created_at BETWEEN f2.created_at - interval '60 seconds' AND f2.created_at + interval '60 seconds'
          JOIN public.organization_members m ON m.org_id = c.org_id AND m.user_id = a.user_id
         WHERE f2.assigned_to IS NULL AND f2.status = 'pending' AND f2.created_at IS NOT NULL
         GROUP BY f2.id
        HAVING count(DISTINCT a.user_id) = 1
      ) pick
     WHERE f.id = pick.id AND f.assigned_to IS NULL;
  END IF;

  -- 2. The client's creator. Compared as text: created_by is free text, and
  -- casting a value that is not a uuid would fail the migration.
  UPDATE public.client_followups f
     SET assigned_to = m.user_id::text
    FROM public.clients c
    JOIN public.organization_members m ON m.org_id = c.org_id
   WHERE c.id = f.client_id
     AND f.assigned_to IS NULL AND f.status = 'pending'
     AND c.created_by IS NOT NULL
     AND m.user_id::text = lower(trim(c.created_by));

  -- 3. The assignee of the client's latest trip that has one.
  IF to_regclass('public.itineraries') IS NOT NULL AND to_regclass('public.team_members') IS NOT NULL THEN
    UPDATE public.client_followups f
       SET assigned_to = pick.user_id::text
      FROM (
        SELECT DISTINCT ON (f2.id) f2.id, tm.user_id
          FROM public.client_followups f2
          JOIN public.clients c ON c.id = f2.client_id
          JOIN public.itineraries i ON i.client_id = c.id AND i.org_id = c.org_id AND i.assigned_to IS NOT NULL
          JOIN public.team_members tm ON tm.id = i.assigned_to AND tm.user_id IS NOT NULL AND tm.is_active IS DISTINCT FROM false
          JOIN public.organization_members m ON m.org_id = c.org_id AND m.user_id = tm.user_id
         WHERE f2.assigned_to IS NULL AND f2.status = 'pending'
         ORDER BY f2.id, i.created_at DESC NULLS LAST, i.id DESC
      ) pick
     WHERE f.id = pick.id AND f.assigned_to IS NULL;
  END IF;

  -- 4. The rest, for a person to assign.
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'client_followups', f.id::text, c.org_id, v_reason
    FROM public.client_followups f
    JOIN public.clients c ON c.id = f.client_id
   WHERE f.assigned_to IS NULL AND f.status = 'pending'
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$
$s0040$;
  EXECUTE $s0041$
INSERT INTO public.schema_migrations (name) VALUES ('20261217_followup_owner_backfill') ON CONFLICT DO NOTHING
$s0041$;
  EXECUTE $s0042$
-- ==================================================================
-- 20261218_vat_base_excludes_extras
-- ==================================================================
-- ============================================
-- VAT is not charged on extras or insurance
-- ============================================
-- The owner's decision (2026-10-13): "VAT is to be added on top of the price,
-- with the token functionality to include and exclude. No taxes over extras
-- or insurance." Migration 20261214 recorded VAT on each document as
-- net × rate; the BASE is now the net less the extras and insurance in it
-- (lib/vat.ts):
--
--   tour_quotes   the catalogue extras' share of the selling price
--                 (services_snapshot lines with rate_source
--                 'extras_catalogue', or of category 'extra' / 'insurance')
--   b2c_quotes    the trip's extras lines' share of the offer's price
--   invoices      the insurance premiums and extras the server adds to the
--                 invoice, plus the trip's extras share of what it bills
--
-- They are still billed, and still in the net and the total; only the VAT
-- leaves them out. vat_amount = vat_base × rate / 100, in the currency's unit.
--
--   vat_base      what the VAT was charged on, recorded when that is LESS
--                 than the net because extras or insurance were left out.
--                 NULL means the whole net was taxed. The marker reads
--                 "VAT 14% included: ¥X (extras and insurance not taxed)"
--                 exactly when it is set.
--
-- Documents issued before this keep the VAT they recorded: nothing here
-- re-rates a vat_amount or a tax_amount, and their vat_base stays NULL ("the
-- whole net"), which is what they taxed. Trips (itineraries) record no amount
-- — their VAT is worked out beside their live total — so they need nothing.
--
-- revert_quote_to_revision / revert_b2c_quote_to_revision restore vat_base
-- with the VAT it belongs to (revisions are to_jsonb snapshots; an older one
-- without the key restores NULL, which is what it taxed). Otherwise identical
-- to 20261214.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, a named constraint added only when
-- missing, CREATE OR REPLACE, each table guarded with to_regclass. Applying it
-- twice changes nothing the second time.

DO $$
BEGIN
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_base numeric;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_quotes_vat_base_nonnegative') THEN
      ALTER TABLE public.tour_quotes
        ADD CONSTRAINT tour_quotes_vat_base_nonnegative CHECK (vat_base IS NULL OR vat_base >= 0);
    END IF;
  END IF;

  IF to_regclass('public.b2c_quotes') IS NOT NULL THEN
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_base numeric;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'b2c_quotes_vat_base_nonnegative') THEN
      ALTER TABLE public.b2c_quotes
        ADD CONSTRAINT b2c_quotes_vat_base_nonnegative CHECK (vat_base IS NULL OR vat_base >= 0);
    END IF;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_base numeric;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_vat_base_nonnegative') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_vat_base_nonnegative CHECK (vat_base IS NULL OR vat_base >= 0);
    END IF;
  END IF;
END
$$
$s0042$;
  EXECUTE $s0043$
-- ---------------------------------------------------------------- B2B revert
DO $$
BEGIN
  IF to_regclass('public.tour_quotes') IS NOT NULL AND to_regclass('public.quote_revisions') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
      DECLARE d JSONB; v_new_id UUID;
      BEGIN
        SELECT quote_data INTO d FROM quote_revisions
         WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND version_number = p_version_number;
        IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

        UPDATE tour_quotes SET
          variation_id = NULLIF(d->>'variation_id','')::uuid,
          itinerary_id = NULLIF(d->>'itinerary_id','')::uuid,
          trip_name = d->>'trip_name',
          partner_id = NULLIF(d->>'partner_id','')::uuid,
          client_name = d->>'client_name',
          client_email = d->>'client_email',
          client_phone = d->>'client_phone',
          client_nationality = d->>'client_nationality',
          travel_date = NULLIF(d->>'travel_date','')::date,
          num_adults = NULLIF(d->>'num_adults','')::integer,
          num_children = NULLIF(d->>'num_children','')::integer,
          services_snapshot = d->'services_snapshot',
          total_cost = NULLIF(d->>'total_cost','')::numeric,
          margin_percent = NULLIF(d->>'margin_percent','')::numeric,
          margin_amount = NULLIF(d->>'margin_amount','')::numeric,
          selling_price = NULLIF(d->>'selling_price','')::numeric,
          price_per_person = NULLIF(d->>'price_per_person','')::numeric,
          currency = d->>'currency',
          tour_leader_included = NULLIF(d->>'tour_leader_included','')::boolean,
          tour_leader_cost = NULLIF(d->>'tour_leader_cost','')::numeric,
          single_supplement = NULLIF(d->>'single_supplement','')::numeric,
          is_eur_passport = NULLIF(d->>'is_eur_passport','')::boolean,
          season = d->>'season',
          season_name = d->>'season_name',
          season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
          season_uplift_amount = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
          vat_applied = COALESCE(NULLIF(d->>'vat_applied','')::boolean, false),
          vat_rate = NULLIF(d->>'vat_rate','')::numeric,
          vat_amount = COALESCE(NULLIF(d->>'vat_amount','')::numeric, 0),
          vat_base = NULLIF(d->>'vat_base','')::numeric,
          status = d->>'status',
          valid_until = NULLIF(d->>'valid_until','')::date,
          notes = d->>'notes',
          updated_at = NOW()
        WHERE id = p_quote_id;

        SELECT create_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;

  -- -------------------------------------------------------------- B2C revert
  IF to_regclass('public.b2c_quotes') IS NOT NULL AND to_regclass('public.quote_revisions') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_b2c_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
      DECLARE d JSONB; v_new_id UUID;
      BEGIN
        SELECT quote_data INTO d FROM quote_revisions
         WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND version_number = p_version_number;
        IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

        UPDATE b2c_quotes SET
          num_travelers    = NULLIF(d->>'num_travelers','')::integer,
          tier             = d->>'tier',
          total_cost       = NULLIF(d->>'total_cost','')::numeric,
          margin_percent   = NULLIF(d->>'margin_percent','')::numeric,
          margin_amount    = NULLIF(d->>'margin_amount','')::numeric,
          selling_price    = NULLIF(d->>'selling_price','')::numeric,
          price_per_person = NULLIF(d->>'price_per_person','')::numeric,
          currency         = d->>'currency',
          cost_breakdown   = d->'cost_breakdown',
          season_name           = d->>'season_name',
          season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
          season_uplift_amount  = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
          vat_applied      = COALESCE(NULLIF(d->>'vat_applied','')::boolean, false),
          vat_rate         = NULLIF(d->>'vat_rate','')::numeric,
          vat_amount       = COALESCE(NULLIF(d->>'vat_amount','')::numeric, 0),
          vat_base         = NULLIF(d->>'vat_base','')::numeric,
          status           = d->>'status',
          valid_until      = NULLIF(d->>'valid_until','')::date,
          internal_notes   = d->>'internal_notes',
          client_notes     = d->>'client_notes',
          updated_at       = NOW()
        WHERE id = p_quote_id;

        SELECT create_b2c_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;
END
$$
$s0043$;
  EXECUTE $s0044$
INSERT INTO public.schema_migrations (name) VALUES ('20261218_vat_base_excludes_extras') ON CONFLICT DO NOTHING
$s0044$;
  EXECUTE $s0045$
-- ==================================================================
-- 20261219_b2b_pricing_rules_org_policies
-- ==================================================================
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

DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.b2b_pricing_rules') IS NULL THEN RETURN; END IF;
  -- A table that predates org_id (the E2E project's) gets it; production
  -- and a fresh install have it NOT NULL already, so this is a no-op there.
  ALTER TABLE public.b2b_pricing_rules
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

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
$$
$s0045$;
  EXECUTE $s0046$
INSERT INTO public.schema_migrations (name) VALUES ('20261219_b2b_pricing_rules_org_policies') ON CONFLICT DO NOTHING
$s0046$;
  EXECUTE $s0047$
-- ==================================================================
-- 20261220_guide_rates_unique_mode
-- ==================================================================
-- ============================================
-- guide_rates: the natural key carries the guide mode and the validity period
-- ============================================
-- uq_guide_rates_natural_key (20261206) is
--
--   (org_id, supplier, guide_language, guide_type, tour_duration, city)
--
-- 20261018 added guide_rates.guide_mode (spot / throughout) and the engine
-- prices a throughout quote ONLY from throughout rows — but the index was
-- never re-created with the mode. So a "Japanese / Egyptologist / Full day /
-- Luxor / Throughout" rate beside the same Spot rate passed the create
-- route's own duplicate check (which does include the mode) and then died on
-- the index with 23505: "Internal server error", and the operator could not
-- enter the one rate a throughout quote needs (Rates audit, Guides & Services
-- #4). Switching an existing rate's mode on edit failed the same way.
--
-- The create routes now also let one service hold more than one validity
-- period (next year's price beside this year's; #5). The index has to agree,
-- or the second period is the same 23505. So the key becomes
--
--   (org_id, supplier, guide_language, guide_type, tour_duration, city,
--    guide_mode, rate_valid_from, rate_valid_to)
--
-- with blank supplier / city / dates read as one identity each (COALESCE), as
-- before.
--
-- Existing data cannot violate the new index: it only ADDS columns to the
-- old key, so any two rows equal on the new key were already equal on the
-- old one, which the old index refused. The guard below checks anyway (an
-- index dropped by hand would have let duplicates in) and stops with the
-- query to find them rather than half-applying.
--
-- Idempotent (DROP IF EXISTS, then CREATE) and guarded on the table and the
-- guide_mode column existing.

DO $$
DECLARE
  dupes integer;
BEGIN
  IF to_regclass('public.guide_rates') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guide_rates' AND column_name = 'guide_mode'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT 1
    FROM public.guide_rates
    -- A NULL tour_duration never collides in a unique index (NULLs are distinct).
    WHERE tour_duration IS NOT NULL
    GROUP BY org_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language,
             guide_type, tour_duration, COALESCE(city, ''::character varying), guide_mode,
             COALESCE(rate_valid_from, '-infinity'::date), COALESCE(rate_valid_to, 'infinity'::date)
    HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'guide_rates has % duplicate natural key(s); find them with: SELECT org_id, supplier_id, guide_language, guide_type, tour_duration, city, guide_mode, rate_valid_from, rate_valid_to, count(*) FROM public.guide_rates GROUP BY 1,2,3,4,5,6,7,8,9 HAVING count(*) > 1', dupes;
  END IF;

  DROP INDEX IF EXISTS public.uq_guide_rates_natural_key;
  CREATE UNIQUE INDEX uq_guide_rates_natural_key ON public.guide_rates (
    org_id,
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    guide_language,
    guide_type,
    tour_duration,
    COALESCE(city, ''::character varying),
    guide_mode,
    COALESCE(rate_valid_from, '-infinity'::date),
    COALESCE(rate_valid_to, 'infinity'::date)
  );
END
$$
$s0047$;
  EXECUTE $s0048$
INSERT INTO public.schema_migrations (name) VALUES ('20261220_guide_rates_unique_mode') ON CONFLICT DO NOTHING
$s0048$;
  EXECUTE $s0049$
-- ==================================================================
-- 20261221_guide_rate_blank_is_null
-- ==================================================================
-- ============================================
-- A blank throughout-guide rate is NULL, never 0
-- ============================================
-- Every dated rate period carries `guide_rate`: the throughout guide's
-- per-night bed (hotels, ships) or seat (flights). The editor leaves it out
-- when the box is blank, and the save path (lib/rates/rate-seasons
-- sanitizeSeasons) wrote it back as 0 — so blank and 0 became the same
-- number once stored:
--
--   hotels / ships  the hint says "Blank = not given (flagged); 0 = the
--                   supplier gives it free", but the engine had to treat 0
--                   as a hole, so a free bed could not be recorded.
--   flights         the hint says "Blank = the guide pays the customer
--                   fare", but the stored 0 priced the guide's seat at
--                   nothing — every throughout-guide flight under-quoted.
--
-- From now on the save path keeps a blank guide rate OUT of the period, and
-- 0 is stored only when 0 was typed. Existing rows cannot tell the two
-- apart, so every stored 0 is read as the blank it almost always was:
--
--   accommodation_rates / nile_cruises  seasons[].rates.guide_rate = 0 is
--       removed. Pricing is IDENTICAL to before — 0 was already a hole —
--       and a deliberately free bed is entered again as 0.
--   flight_rates  seasons[].rates.guide_rate = 0 is removed and the mirrored
--       guide_rate column 0 becomes NULL: the guide's seat now costs the
--       customer fare, the hint's promise. A seat the airline really gives
--       free is entered again as 0. (Over-quoting a free seat shows on the
--       quote; under-quoting every guide seat did not.)
--
-- Replay-safe: each table guarded with to_regclass, and a second run finds
-- no 0 left to remove.

CREATE OR REPLACE FUNCTION pg_temp.drop_zero_guide_rate(seasons jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN jsonb_typeof(s) = 'object'
        AND jsonb_typeof(s -> 'rates') = 'object'
        AND jsonb_typeof(s -> 'rates' -> 'guide_rate') = 'number'
        AND (s -> 'rates' ->> 'guide_rate')::numeric = 0
      THEN jsonb_set(s, '{rates}', (s -> 'rates') - 'guide_rate')
      ELSE s
    END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(seasons) WITH ORDINALITY AS t(s, ord)
$$
$s0049$;
  EXECUTE $s0050$
CREATE OR REPLACE FUNCTION pg_temp.has_zero_guide_rate(seasons jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(seasons) AS s
    WHERE jsonb_typeof(s) = 'object'
      AND jsonb_typeof(s -> 'rates') = 'object'
      AND jsonb_typeof(s -> 'rates' -> 'guide_rate') = 'number'
      AND (s -> 'rates' ->> 'guide_rate')::numeric = 0
  )
$$
$s0050$;
  EXECUTE $s0051$
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accommodation_rates', 'nile_cruises', 'flight_rates'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = 'seasons') THEN
      EXECUTE format(
        'UPDATE public.%I SET seasons = pg_temp.drop_zero_guide_rate(seasons)
           WHERE jsonb_typeof(seasons) = ''array'' AND pg_temp.has_zero_guide_rate(seasons)', t);
    END IF;
  END LOOP;

  IF to_regclass('public.flight_rates') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'flight_rates' AND column_name = 'guide_rate') THEN
    UPDATE public.flight_rates SET guide_rate = NULL WHERE guide_rate = 0;
  END IF;
END $$
$s0051$;
  EXECUTE $s0052$
INSERT INTO public.schema_migrations (name) VALUES ('20261221_guide_rate_blank_is_null') ON CONFLICT DO NOTHING
$s0052$;
  EXECUTE $s0053$
-- ==================================================================
-- 20261222_clients_privacy_and_codes
-- ==================================================================
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
$$
$s0053$;
  EXECUTE $s0054$
-- ── 2. Client codes: per company, no race ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_code_counters (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_value integer NOT NULL DEFAULT 0
)
$s0054$;
  EXECUTE $s0055$
ALTER TABLE public.client_code_counters ENABLE ROW LEVEL SECURITY
$s0055$;
  EXECUTE $s0056$
REVOKE ALL ON public.client_code_counters FROM PUBLIC, anon, authenticated
$s0056$;
  EXECUTE $s0057$
GRANT ALL ON public.client_code_counters TO service_role
$s0057$;
  EXECUTE $s0058$
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
$$
$s0058$;
  EXECUTE $s0059$
INSERT INTO public.schema_migrations (name) VALUES ('20261222_clients_privacy_and_codes') ON CONFLICT DO NOTHING
$s0059$;
  EXECUTE $s0060$
-- ==================================================================
-- 20261223_partners_org_policies_and_codes
-- ==================================================================
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
$$
$s0060$;
  EXECUTE $s0061$
INSERT INTO public.schema_migrations (name) VALUES ('20261223_partners_org_policies_and_codes') ON CONFLICT DO NOTHING
$s0061$;
  EXECUTE $s0062$
-- ==================================================================
-- 20261224_team_member_login_link
-- ==================================================================
-- ============================================
-- team_members.user_id: link existing members to their company's login
-- ============================================
-- People audit (Team Members), finding 12.
--
-- A trip or task assigned to a team member notifies them through
-- team_members.user_id: the bell shows only rows whose team_member_id is a
-- member whose user_id is the viewer (lib/notifications-scope), and the
-- WhatsApp inbox finds "me" the same way. The Team page never set user_id —
-- only WhatsApp Manage Agents did, by email — so a person added on the Team
-- page, then invited and joined, never saw "You now own TRIP" in-app, while
-- the page showed a green "System user" chip (matched by email) as if all
-- were linked.
--
-- The routes now link at create and edit (a login of the SAME company whose
-- email matches, case-insensitive, and only one). This migration does the same
-- for the members that already exist: user_id is set where it is NULL, the
-- member has an email, and exactly ONE login matches it — a login that is a
-- member of the member's own company (organization_members.org_id =
-- team_members.org_id; a login of the other company is never linked, even with
-- the same address) and that is not already another member's login there
-- (team_members_org_user_key: one row per login per company).
--
-- Not linked, and listed in org_backfill_review (20261202) with the member's
-- company, for the owner to look at:
--   * AMBIGUOUS: two or more logins of the company have that email, or two
--     members of the company share an email that matches the same login;
--   * LOGIN TAKEN: the one matching login already belongs to another member;
--   * UNMATCHED: the member has an email and no login of the company has it
--     (usually a guide or driver with no login — nothing to fix; listed so
--     it can be checked). Members with no email are not listed.
-- Read it in the SQL editor:
--   SELECT * FROM org_backfill_review WHERE table_name = 'team_members';
--
-- DATA CHANGED: team_members.user_id only, and only from NULL. Nothing else.
-- Idempotent (a linked member is no longer a candidate; review rows are
-- ON CONFLICT DO NOTHING) and guarded on each table existing (to_regclass).

DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL
     OR to_regclass('public.organization_members') IS NULL
     OR to_regclass('public.user_profiles') IS NULL THEN
    RETURN;
  END IF;

  -- team_members.org_id comes from 20261203_people_work_org_id. Without it
  -- there is no company to match within, so do nothing (re-run after it).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE '20261224: team_members.org_id is missing - apply 20261203_people_work_org_id first; nothing linked.';
    RETURN;
  END IF;

  -- Each (member, login) pair whose email matches, within the member's company.
  CREATE TEMP TABLE _tm_link_pairs ON COMMIT DROP AS
    SELECT DISTINCT t.id AS member_id, t.org_id, p.id AS user_id
    FROM public.team_members t
    JOIN public.organization_members m ON m.org_id = t.org_id
    JOIN public.user_profiles p ON p.id = m.user_id
    WHERE t.user_id IS NULL
      AND t.email IS NOT NULL AND btrim(t.email) <> ''
      AND lower(btrim(p.email)) = lower(btrim(t.email));

  -- Safe to link: the member has one login, and that login has one member
  -- among the candidates and no member in the company yet.
  CREATE TEMP TABLE _tm_link_ok ON COMMIT DROP AS
    SELECT a.member_id, a.org_id, a.user_id
    FROM _tm_link_pairs a
    WHERE (SELECT count(*) FROM _tm_link_pairs b WHERE b.member_id = a.member_id) = 1
      AND (SELECT count(*) FROM _tm_link_pairs b WHERE b.org_id = a.org_id AND b.user_id = a.user_id) = 1
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members x
        WHERE x.org_id = a.org_id AND x.user_id = a.user_id
      );

  UPDATE public.team_members t
     SET user_id = k.user_id
    FROM _tm_link_ok k
   WHERE t.id = k.member_id AND t.user_id IS NULL;

  IF to_regclass('public.org_backfill_review') IS NOT NULL THEN
    -- Ambiguous, or the login is taken.
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'team_members', p.member_id::text, p.org_id,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.team_members x WHERE x.org_id = p.org_id AND x.user_id = p.user_id)
               THEN 'email matches login ' || p.user_id::text || ' which already belongs to another team member; not linked by 20261224'
             ELSE 'email matches several logins or is shared by several team members of the company; not linked by 20261224'
           END
    FROM _tm_link_pairs p
    WHERE NOT EXISTS (SELECT 1 FROM _tm_link_ok k WHERE k.member_id = p.member_id)
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;

    -- Unmatched: an email, no login of the company has it.
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'team_members', t.id::text, t.org_id,
           'email matches no login of the company; not linked by 20261224'
    FROM public.team_members t
    WHERE t.user_id IS NULL
      AND t.email IS NOT NULL AND btrim(t.email) <> ''
      AND NOT EXISTS (SELECT 1 FROM _tm_link_pairs p WHERE p.member_id = t.id)
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$
$s0062$;
  EXECUTE $s0063$
INSERT INTO public.schema_migrations (name) VALUES ('20261224_team_member_login_link') ON CONFLICT DO NOTHING
$s0063$;
  EXECUTE $s0064$
-- ==================================================================
-- 20261225_invoice_receipt_numbers_per_company
-- ==================================================================
-- ============================================
-- Invoice and receipt numbers per company; VAT recorded on a trip payment;
-- a payment can no longer overdraw an invoice
-- ============================================
-- INVOICE NUMBERS (INV-YYYY-NNN, -DEP / -FIN for a deposit and its final) came
-- from ONE install-wide sequence (rpc nextval('invoice_number_seq')) under one
-- UNIQUE (invoice_number). Each company's numbers skipped whenever the other
-- issued an invoice, so either could read the other's volume off the gaps, and
-- a tax document series is expected to run without them. Where the nextval
-- helper function was never created, the route fell back to the highest number
-- across EVERY company, compared as text ('INV-2026-999' sorts above
-- 'INV-2026-1000'), so the 1,000th invoice of a year failed as a duplicate.
--
-- RECEIPT NUMBERS did not exist: a receipt printed the payment's transaction
-- reference (a bank reference, "wire", the invoice number...) or RCP- and the
-- first eight characters of the payment id. Two payments with the same
-- reference had the same receipt number.
--
-- From here, as quotes (20261211), bookings (20261212) and voucher numbers
-- (20261216):
--
--   invoice_number_counters   one row per (company, kind, year): the last number
--                             handed out, locked by the INSERT … ON CONFLICT DO
--                             UPDATE that increments it. kind is 'invoice' or
--                             'receipt'.
--   next_invoice_number()     the next free INV-YYYY-NNN for a company. The
--                             first call for a company and year carries on after
--                             that company's own highest well-formed number
--                             (read as a number, so 1000 follows 999); a number
--                             the company already holds, with or without a
--                             -DEP / -FIN suffix, is skipped. Service role only.
--   UNIQUE (org_id, invoice_number)   replaces UNIQUE (invoice_number): both
--                             companies may hold INV-2026-001.
--   payments.receipt_number, invoice_payments.receipt_number   the receipt's own
--                             number, RCP-YYYY-NNNN, per company, from
--                             next_receipt_number(). One series across both
--                             tables. A trip payment is numbered when it is
--                             completed and is not a refund (a pending, failed
--                             or refunded payment has no receipt); an invoice
--                             payment when it is recorded.
--   invoice_payments.org_id   the invoice's company, set by a trigger, so the
--                             receipt number can be unique per company.
--
-- EXISTING NUMBERS ARE NOT CHANGED. Invoice numbers were unique install-wide,
-- so they are unique per company. For receipts, a payment already receipted
-- keeps the number it showed: its transaction reference, when that is filled
-- in and no other payment of the company has the same one; every other
-- payment is numbered from the series, per company, oldest first. Rows that
-- already have a receipt number are never touched (a second run changes
-- nothing).
--
-- VAT ON A TRIP PAYMENT is recorded on the payment (vat_applied, vat_rate,
-- vat_amount, vat_base), as an invoice records its own. It was worked out from
-- the trip every time the receipt was opened, so a trip whose VAT was switched
-- later reprinted an old receipt with different VAT than the copy already sent.
-- Existing rows stay NULL = "not recorded": the receipt keeps reading the trip
-- for those, as before. New rows are written by POST /api/payments.
--
-- OVERPAYMENT: the route read the balance and then inserted, so two payments
-- recorded at once both passed. A BEFORE INSERT trigger on invoice_payments
-- now locks the invoice row and refuses an amount above its balance (the same
-- 0.01 allowance as the route), so the second waits for the first.
--
-- Counter table and both number functions: RLS on, no policy, service role
-- only (the trigger functions are SECURITY DEFINER and call them as owner).
-- No policy on an existing table is touched.
--
-- Replay-safe: CREATE … IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS,
-- each table guarded with to_regclass and each column with IF NOT EXISTS.
-- Applying it twice changes nothing the second time.

CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice', 'receipt')),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, kind, year)
)
$s0064$;
  EXECUTE $s0065$
ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY
$s0065$;
  EXECUTE $s0066$
REVOKE ALL ON public.invoice_number_counters FROM PUBLIC, anon, authenticated
$s0066$;
  EXECUTE $s0067$
GRANT ALL ON public.invoice_number_counters TO service_role
$s0067$;
  EXECUTE $s0068$
-- ── 1. Columns ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL THEN
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_number text;
    -- NULL = not recorded (a row from before this migration).
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_applied boolean;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_rate numeric;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_amount numeric;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_base numeric;
  END IF;

  IF to_regclass('public.invoice_payments') IS NOT NULL THEN
    ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS receipt_number text;
    ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS org_id uuid;
    IF to_regclass('public.invoices') IS NOT NULL THEN
      UPDATE public.invoice_payments ip SET org_id = i.org_id
        FROM public.invoices i WHERE i.id = ip.invoice_id AND ip.org_id IS NULL;
    END IF;
  END IF;
END
$$
$s0068$;
  EXECUTE $s0069$
-- ── 2. Invoice numbers: per company, no race ──────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN RETURN; END IF;

  -- Unique per company. The install-wide key goes only once this one is in place.
  CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_invoice_number_key
    ON public.invoices (org_id, invoice_number);
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

  CREATE OR REPLACE FUNCTION public.next_invoice_number(p_org uuid, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    pattern text;
    seed bigint := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_invoice_number: an invoice must belong to a company'; END IF;
    pattern := '^INV-' || p_year || '-([0-9]{1,9})(-DEP|-FIN)?$';

    -- First number of the year for this company: carry on after its own
    -- highest well-formed number, compared as a number (a malformed one is
    -- ignored, not cast).
    IF NOT EXISTS (SELECT 1 FROM invoice_number_counters WHERE org_id = p_org AND kind = 'invoice' AND year = p_year) THEN
      SELECT COALESCE(MAX((regexp_match(invoice_number, pattern))[1]::bigint), 0) INTO seed
        FROM invoices WHERE org_id = p_org AND invoice_number ~ pattern;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_invoice_number: no free number after % attempts', attempts;
      END IF;
      INSERT INTO invoice_number_counters AS c (org_id, kind, year, last_value)
        VALUES (p_org, 'invoice', p_year, (seed + 1)::integer)
        ON CONFLICT (org_id, kind, year) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      -- Three digits as before; a fourth is added, never cut off (lpad truncates).
      candidate := 'INV-' || p_year || '-' || CASE WHEN length(n::text) < 3 THEN lpad(n::text, 3, '0') ELSE n::text END;
      -- The deposit / final suffix is added to the number by the caller, so
      -- the number is free only if none of its three forms is taken.
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM invoices
         WHERE org_id = p_org AND invoice_number IN (candidate, candidate || '-DEP', candidate || '-FIN'));
    END LOOP;
    RETURN candidate;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid, integer) TO service_role;
END
$$
$s0069$;
  EXECUTE $s0070$
-- ── 3. Receipt numbers: one series per company across both payment tables ─
DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL OR to_regclass('public.invoice_payments') IS NULL THEN RETURN; END IF;

  CREATE OR REPLACE FUNCTION public.next_receipt_number(p_org uuid, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    pattern text;
    seed bigint := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_receipt_number: a receipt must belong to a company'; END IF;
    pattern := '^RCP-' || p_year || '-([0-9]{1,9})$';

    IF NOT EXISTS (SELECT 1 FROM invoice_number_counters WHERE org_id = p_org AND kind = 'receipt' AND year = p_year) THEN
      SELECT GREATEST(
        COALESCE((SELECT MAX((regexp_match(receipt_number, pattern))[1]::bigint)
                    FROM payments WHERE org_id = p_org AND receipt_number ~ pattern), 0),
        COALESCE((SELECT MAX((regexp_match(receipt_number, pattern))[1]::bigint)
                    FROM invoice_payments WHERE org_id = p_org AND receipt_number ~ pattern), 0)
      ) INTO seed;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_receipt_number: no free number after % attempts', attempts;
      END IF;
      INSERT INTO invoice_number_counters AS c (org_id, kind, year, last_value)
        VALUES (p_org, 'receipt', p_year, (seed + 1)::integer)
        ON CONFLICT (org_id, kind, year) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      candidate := 'RCP-' || p_year || '-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM payments WHERE org_id = p_org AND receipt_number = candidate)
            AND NOT EXISTS (SELECT 1 FROM invoice_payments WHERE org_id = p_org AND receipt_number = candidate);
    END LOOP;
    RETURN candidate;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_receipt_number(uuid, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_receipt_number(uuid, integer) TO service_role;

  -- A trip payment: numbered once it is a completed, non-refund payment.
  CREATE OR REPLACE FUNCTION public.assign_payment_receipt_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    IF (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
       AND NEW.payment_status = 'completed'
       AND COALESCE(NEW.payment_type, '') <> 'refund' THEN
      NEW.receipt_number := next_receipt_number(NEW.org_id, EXTRACT(YEAR FROM NOW())::integer);
    END IF;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS trigger_assign_payment_receipt_number ON public.payments;
  CREATE TRIGGER trigger_assign_payment_receipt_number
    BEFORE INSERT OR UPDATE OF payment_status, payment_type, receipt_number ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.assign_payment_receipt_number();

  -- An invoice payment: numbered when recorded, in its invoice's company.
  CREATE OR REPLACE FUNCTION public.assign_invoice_payment_receipt_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    IF NEW.org_id IS NULL THEN
      SELECT i.org_id INTO NEW.org_id FROM invoices i WHERE i.id = NEW.invoice_id;
    END IF;
    IF NEW.org_id IS NOT NULL AND (NEW.receipt_number IS NULL OR NEW.receipt_number = '') THEN
      NEW.receipt_number := next_receipt_number(NEW.org_id, EXTRACT(YEAR FROM NOW())::integer);
    END IF;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS trigger_assign_invoice_payment_receipt_number ON public.invoice_payments;
  CREATE TRIGGER trigger_assign_invoice_payment_receipt_number
    BEFORE INSERT ON public.invoice_payments
    FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_payment_receipt_number();

  -- ── Backfill ────────────────────────────────────────────────────────────
  -- Per company, oldest first, only rows with no receipt number yet. A payment
  -- keeps the number it already showed (its transaction reference) when that
  -- is filled in and no other payment of the company has the same one.
  DECLARE
    r record;
    ref text;
  BEGIN
    FOR r IN
      SELECT 'p' AS src, id, org_id, created_at, transaction_reference AS ref
        FROM payments
       WHERE receipt_number IS NULL AND payment_status = 'completed' AND COALESCE(payment_type, '') <> 'refund'
      UNION ALL
      SELECT 'i', id, org_id, created_at, transaction_reference
        FROM invoice_payments
       WHERE receipt_number IS NULL AND org_id IS NOT NULL
      ORDER BY org_id, created_at, id
    LOOP
      ref := NULLIF(btrim(r.ref), '');
      IF ref IS NOT NULL
         AND (SELECT count(*) FROM payments WHERE org_id = r.org_id AND btrim(transaction_reference) = ref)
           + (SELECT count(*) FROM invoice_payments WHERE org_id = r.org_id AND btrim(transaction_reference) = ref) = 1
         AND NOT EXISTS (SELECT 1 FROM payments WHERE org_id = r.org_id AND receipt_number = ref)
         AND NOT EXISTS (SELECT 1 FROM invoice_payments WHERE org_id = r.org_id AND receipt_number = ref) THEN
        NULL; -- ref stays
      ELSE
        ref := next_receipt_number(r.org_id, EXTRACT(YEAR FROM COALESCE(r.created_at, NOW()))::integer);
      END IF;
      IF r.src = 'p' THEN
        UPDATE payments SET receipt_number = ref WHERE id = r.id;
      ELSE
        UPDATE invoice_payments SET receipt_number = ref WHERE id = r.id;
      END IF;
    END LOOP;
  END;

  -- One receipt number per company. After the backfill, so it can hold.
  CREATE UNIQUE INDEX IF NOT EXISTS payments_org_receipt_number_key
    ON public.payments (org_id, receipt_number) WHERE receipt_number IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_org_receipt_number_key
    ON public.invoice_payments (org_id, receipt_number) WHERE receipt_number IS NOT NULL;
END
$$
$s0070$;
  EXECUTE $s0071$
-- ── 4. A payment cannot overdraw an invoice ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.invoice_payments') IS NULL OR to_regclass('public.invoices') IS NULL THEN RETURN; END IF;

  CREATE OR REPLACE FUNCTION public.invoice_payment_within_balance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    due numeric;
  BEGIN
    -- The row lock is what serialises two payments recorded at once.
    SELECT balance_due INTO due FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF FOUND AND NEW.amount > COALESCE(due, 0) + 0.01 THEN
      RAISE EXCEPTION 'Payment amount exceeds balance due (%)', due USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS trigger_invoice_payment_within_balance ON public.invoice_payments;
  CREATE TRIGGER trigger_invoice_payment_within_balance
    BEFORE INSERT ON public.invoice_payments
    FOR EACH ROW EXECUTE FUNCTION public.invoice_payment_within_balance();
END
$$
$s0071$;
  EXECUTE $s0072$
INSERT INTO public.schema_migrations (name) VALUES ('20261225_invoice_receipt_numbers_per_company') ON CONFLICT DO NOTHING
$s0072$;
  EXECUTE $s0073$
-- ==================================================================
-- 20261226_supplier_invoice_numbers_unique
-- ==================================================================
-- ============================================
-- Supplier invoices: one bill number per supplier, per company
-- ============================================
-- Finance audit (Bills), finding 1. The only unique constraint on
-- supplier_invoices was internal_reference (the SI-year-number the app
-- generates). Nothing stopped the same supplier's invoice number being entered
-- twice — typing it again, or uploading the same PDF twice — and both rows
-- could then be matched, approved and paid: the same bill paid twice.
--
-- This adds a partial unique index on
--
--   (org_id, lower(btrim(supplier_name)), lower(btrim(supplier_invoice_number)))
--   WHERE status <> 'cancelled'
--
-- so a cancelled bill frees its number (cancel is how a mistaken bill is taken
-- out of play), a second company may use the same supplier and number, and
-- "ACME" / "acme " are the same supplier. POST and PUT /api/supplier-invoices
-- check the same key first and answer 409; the index is the backstop for two
-- saves at once.
--
-- DUPLICATES ALREADY IN THE TABLE. The index cannot be built over them, and
-- this migration will not pick which of two live bills to cancel or delete:
-- that is a decision about money. So when any duplicate group exists it
--
--   * writes every row of every group to org_backfill_review (table_name
--     'supplier_invoices', reason 'duplicate supplier invoice number'), and
--   * RAISEs a NOTICE and creates NO index.
--
-- The API check still rejects new duplicates meanwhile. Cancel or delete the
-- extras (Bills > the bill > Cancel), then re-run this file: it is idempotent
-- and builds the index once no duplicates are left.
--
-- Guarded on the table existing (to_regclass); safe to run twice.

DO $$
DECLARE
  dup_rows integer;
  dup_groups integer;
BEGIN
  IF to_regclass('public.supplier_invoices') IS NULL THEN RETURN; END IF;

  CREATE TEMP TABLE _si_dups ON COMMIT DROP AS
    SELECT id, org_id
      FROM public.supplier_invoices s
     WHERE s.status <> 'cancelled'
       AND EXISTS (
         SELECT 1 FROM public.supplier_invoices o
          WHERE o.id <> s.id
            AND o.status <> 'cancelled'
            AND o.org_id = s.org_id
            AND lower(btrim(o.supplier_name)) = lower(btrim(s.supplier_name))
            AND lower(btrim(o.supplier_invoice_number)) = lower(btrim(s.supplier_invoice_number))
       );

  SELECT count(*) INTO dup_rows FROM _si_dups;

  IF dup_rows > 0 THEN
    SELECT count(*) INTO dup_groups FROM (
      SELECT 1
        FROM public.supplier_invoices
       WHERE status <> 'cancelled'
       GROUP BY org_id, lower(btrim(supplier_name)), lower(btrim(supplier_invoice_number))
      HAVING count(*) > 1
    ) g;

    IF to_regclass('public.org_backfill_review') IS NOT NULL THEN
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT 'supplier_invoices', d.id::text, d.org_id, 'duplicate supplier invoice number'
        FROM _si_dups d
      ON CONFLICT (table_name, row_id, reason) DO NOTHING;
    END IF;

    RAISE NOTICE 'supplier_invoices: % duplicate group(s), % row(s); unique index NOT created. See org_backfill_review (reason: duplicate supplier invoice number). Cancel or delete the extras and re-run this migration.', dup_groups, dup_rows;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS supplier_invoices_org_supplier_number_key
    ON public.supplier_invoices (org_id, lower(btrim(supplier_name)), lower(btrim(supplier_invoice_number)))
    WHERE status <> 'cancelled';
END
$$
$s0073$;
  EXECUTE $s0074$
INSERT INTO public.schema_migrations (name) VALUES ('20261226_supplier_invoice_numbers_unique') ON CONFLICT DO NOTHING
$s0074$;
  EXECUTE $s0075$
-- ==================================================================
-- 20261227_expense_numbers_per_company
-- ==================================================================
-- ============================================
-- Expense numbers per company, and the commission -> service link
-- ============================================
-- EXPENSE NUMBERS. Expenses (EXP-YYYY-NNN) were numbered from ONE global
-- sequence (expense_number_seq) and expenses_expense_number_key was UNIQUE
-- across every company. So:
--
--   - each company's numbers skipped whenever the other company entered an
--     expense, and a company could read the other's volume off the gaps;
--   - the sequence never restarted, so 2027 carried on from 2026's count while
--     the year in the number changed.
--
-- Same repair as quote numbers (20261211):
--   expense_number_counters  one row per (company, year): the last number
--                            handed out. The row is locked by the
--                            INSERT … ON CONFLICT DO UPDATE that increments
--                            it, so two inserts at once get two numbers.
--   next_expense_number()    the next free number for a company. The first
--                            call for a company and year starts after that
--                            company's own highest existing number, so
--                            numbering simply carries on. A number already
--                            taken in that company is skipped, never collided
--                            with. Only well-formed numbers (EXP-YYYY-digits)
--                            are read. Three digits as before; a fourth is
--                            added, never cut off.
--   assign_expense_number()  BEFORE INSERT, only when the row names no number
--                            (a row inserted with one keeps it, as the app did
--                            until now).
--   UNIQUE (org_id, expense_number) in place of the install-wide
--                            UNIQUE (expense_number): two companies may both
--                            hold EXP-2026-001.
--
-- No existing expense number changes. Nothing reads expense_number across
-- companies (every lookup is by id within the company).
--
-- next_expense_number() is SECURITY DEFINER (the counter table has RLS on and
-- no policy) and executable by the service role only; the trigger function
-- calls it as its owner.
--
-- COMMISSION -> SERVICE. Generating commissions marks the source service
-- (itinerary_services.commission_status = 'generated') but the commission
-- itself did not say which service it came from, so deleting one left the
-- service marked generated for ever and the commission could never be made
-- again. commissions.service_id records it (NULL for manual commissions and
-- for those generated before this column); deleting a commission releases its
-- service. ON DELETE SET NULL: removing a service keeps the money record.
--
-- Replay-safe: CREATE … IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS,
-- each table guarded with to_regclass so a database without one still
-- migrates. Applying it twice changes nothing the second time.

CREATE TABLE IF NOT EXISTS public.expense_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, year)
)
$s0075$;
  EXECUTE $s0076$
ALTER TABLE public.expense_number_counters ENABLE ROW LEVEL SECURITY
$s0076$;
  EXECUTE $s0077$
REVOKE ALL ON public.expense_number_counters FROM PUBLIC, anon, authenticated
$s0077$;
  EXECUTE $s0078$
GRANT ALL ON public.expense_number_counters TO service_role
$s0078$;
  EXECUTE $s0079$
CREATE OR REPLACE FUNCTION public.next_expense_number(p_org uuid, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  pattern text;
  seed integer := 0;
  n integer;
  candidate text;
  taken boolean;
  attempts integer := 0;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'next_expense_number: an expense must belong to a company'; END IF;
  pattern := '^EXP-' || p_year || '-([0-9]+)$';

  -- First number of the year for this company: carry on after its own
  -- highest well-formed number (a malformed one is ignored, not cast).
  IF NOT EXISTS (SELECT 1 FROM expense_number_counters WHERE org_id = p_org AND year = p_year) THEN
    SELECT COALESCE(MAX((regexp_match(expense_number, pattern))[1]::bigint), 0) INTO seed
      FROM expenses WHERE org_id = p_org AND expense_number ~ pattern;
  END IF;

  LOOP
    attempts := attempts + 1;
    IF attempts > 10000 THEN
      RAISE EXCEPTION 'next_expense_number: no free number after % attempts', attempts;
    END IF;
    INSERT INTO expense_number_counters AS c (org_id, year, last_value)
      VALUES (p_org, p_year, seed + 1)
      ON CONFLICT (org_id, year) DO UPDATE SET last_value = c.last_value + 1
      RETURNING last_value INTO n;
    -- Three digits as before; a fourth is added, never cut off (lpad truncates).
    candidate := 'EXP-' || p_year || '-' || CASE WHEN length(n::text) < 3 THEN lpad(n::text, 3, '0') ELSE n::text END;
    SELECT EXISTS (SELECT 1 FROM expenses WHERE org_id = p_org AND expense_number = candidate) INTO taken;
    EXIT WHEN NOT taken;
  END LOOP;
  RETURN candidate;
END;
$$
$s0079$;
  EXECUTE $s0080$
REVOKE EXECUTE ON FUNCTION public.next_expense_number(uuid, integer) FROM PUBLIC, anon, authenticated
$s0080$;
  EXECUTE $s0081$
GRANT EXECUTE ON FUNCTION public.next_expense_number(uuid, integer) TO service_role
$s0081$;
  EXECUTE $s0082$
DO $$
BEGIN
  IF to_regclass('public.expenses') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.assign_expense_number() RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
          AS $body$
      BEGIN
        NEW.expense_number := next_expense_number(NEW.org_id, EXTRACT(YEAR FROM NOW())::integer);
        RETURN NEW;
      END;
      $body$
    $f$;
    DROP TRIGGER IF EXISTS trigger_assign_expense_number ON public.expenses;
    CREATE TRIGGER trigger_assign_expense_number BEFORE INSERT ON public.expenses
      FOR EACH ROW WHEN ((NEW.expense_number IS NULL) OR ((NEW.expense_number)::text = ''::text))
      EXECUTE FUNCTION public.assign_expense_number();

    -- Unique per company. The install-wide constraint held, so this holds.
    CREATE UNIQUE INDEX IF NOT EXISTS expenses_org_expense_number_key ON public.expenses (org_id, expense_number);
    ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_expense_number_key;
  END IF;

  IF to_regclass('public.commissions') IS NOT NULL AND to_regclass('public.itinerary_services') IS NOT NULL THEN
    ALTER TABLE public.commissions
      ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.itinerary_services(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_commissions_service_id ON public.commissions (service_id) WHERE service_id IS NOT NULL;
  END IF;
END
$$
$s0082$;
  EXECUTE $s0083$
INSERT INTO public.schema_migrations (name) VALUES ('20261227_expense_numbers_per_company') ON CONFLICT DO NOTHING
$s0083$;
  EXECUTE $s0084$
-- ==================================================================
-- 20261228_invoice_server_amounts
-- ==================================================================
-- ============================================
-- Invoice amounts come from the server; a manual override is recorded
-- ============================================
-- POST /api/invoices used the trip price the browser sent (total_amount,
-- full_trip_cost), so an agent could bill any amount for a trip. From here the
-- server works the invoice base out from the saved trip (its priced lines plus
-- the season supplement, the figure the itinerary page shows) and computes a
-- deposit, a final and a full invoice from it. A different amount is a manual
-- override, allowed to admin and manager only, and the invoice records it:
--
--   amount_source    where the figure came from:
--                      'trip'             worked out from the trip's saved total
--                      'parent'           a final worked out from its deposit invoice
--                                         (no trip is linked)
--                      'manual_override'  an admin or manager billed another amount
--                                         for a trip; see override_*
--                      'manual_entry'     an invoice with no trip, typed by an admin
--                                         or manager
--                    NULL on invoices issued before this: their source is unknown.
--   computed_amount  what the server worked out for the tour part of the invoice
--                    (before VAT, without the insurance and extras it adds), in
--                    the invoice's currency. NULL when there was nothing to work
--                    out from.
--   override_amount  the amount billed instead, for the same part. NULL unless
--                    amount_source = 'manual_override'.
--   override_reason  why, in the person's words. Required with an override.
--   override_by      who (auth user id).
--
-- Existing invoices keep every figure; the new columns stay NULL for them.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, named constraints added only when
-- missing, the table guarded with to_regclass. Applying it twice changes
-- nothing the second time.

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_source text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS computed_amount numeric;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS override_amount numeric;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS override_reason text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS override_by uuid;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_source_known') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_amount_source_known
        CHECK (amount_source IS NULL OR amount_source IN ('trip', 'parent', 'manual_override', 'manual_entry'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_computed_amount_nonnegative') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_computed_amount_nonnegative
        CHECK (computed_amount IS NULL OR computed_amount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_override_amount_nonnegative') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_override_amount_nonnegative
        CHECK (override_amount IS NULL OR override_amount >= 0);
    END IF;

    -- An override says why: a figure with no reason is not an override.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_override_has_reason') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_override_has_reason
        CHECK (
          (amount_source IS DISTINCT FROM 'manual_override')
          OR (override_amount IS NOT NULL AND length(btrim(COALESCE(override_reason, ''))) > 0)
        );
    END IF;
  END IF;
END
$$
$s0084$;
  EXECUTE $s0085$
INSERT INTO public.schema_migrations (name) VALUES ('20261228_invoice_server_amounts') ON CONFLICT DO NOTHING
$s0085$;
  EXECUTE $s0086$
-- ==================================================================
-- 20261229_commission_service_backfill
-- ==================================================================
-- ============================================
-- Commissions generated before commissions.service_id: link them to their service
-- ============================================
-- commissions.service_id (20261227) records which service a generated
-- commission came from, so deleting the commission releases the service
-- (itinerary_services.commission_status back to 'pending') and it can be
-- generated again. Every commission generated BEFORE that column carries NULL,
-- so deleting one released nothing and the service stayed 'generated' for ever.
--
-- This links them, conservatively. A generated commission (its notes start
-- "Auto-generated from itinerary", which only the generator writes; a manual
-- commission is never touched) is linked to a service of the SAME trip when
-- exactly ONE service matches on all of:
--
--   supplier  the commission's supplier is the service's supplier or the
--             service's seller (sold_by_supplier_id); a commission with no
--             supplier matches on source_name = the service's supplier_name
--   amount    base_amount equals what the generator based it on: the service's
--             total_cost for a receivable commission, the profit
--             (client_price - total_cost) for a payable one
--   state     the service is still marked 'generated' (a released service has
--             nothing to release)
--
-- Zero matches, or more than one (two identical lunches from one supplier),
-- is NOT guessed: the commission is listed in org_backfill_review
-- (table_name 'commissions') for a person to link or leave. Look at them with
--   SELECT * FROM org_backfill_review WHERE table_name = 'commissions';
--
-- Replay-safe: the column is added IF NOT EXISTS, only commissions with no
-- service_id are considered, and a review row is inserted once per
-- (commission, reason). Each table and column is checked first, so a database
-- without one still migrates. Applying it twice changes nothing the second time.

DO $$
BEGIN
  IF to_regclass('public.commissions') IS NULL
     OR to_regclass('public.itinerary_services') IS NULL
     OR to_regclass('public.itinerary_days') IS NULL THEN
    RETURN;
  END IF;

  -- Same column 20261227 adds, so this file stands on its own.
  ALTER TABLE public.commissions
    ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.itinerary_services(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_commissions_service_id ON public.commissions (service_id) WHERE service_id IS NOT NULL;

  -- The columns the match reads. A database that lacks any of them has
  -- nothing to match on, and is left as it is.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itinerary_services'
         AND column_name IN ('supplier_id', 'sold_by_supplier_id', 'supplier_name', 'total_cost', 'client_price', 'commission_status')) < 6
     OR (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'commissions'
            AND column_name IN ('itinerary_id', 'supplier_id', 'source_name', 'base_amount', 'commission_type', 'notes')) < 6 THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _commission_service_candidates ON COMMIT DROP AS
  SELECT c.id AS commission_id, s.id AS service_id
    FROM public.commissions c
    JOIN public.itinerary_days d ON d.itinerary_id = c.itinerary_id
    JOIN public.itinerary_services s ON s.itinerary_day_id = d.id
   WHERE c.service_id IS NULL
     AND c.itinerary_id IS NOT NULL
     AND c.notes LIKE 'Auto-generated from itinerary%'
     AND s.commission_status = 'generated'
     AND (
           (c.supplier_id IS NOT NULL AND c.supplier_id IN (s.supplier_id, s.sold_by_supplier_id))
        OR (c.supplier_id IS NULL AND c.source_name IS NOT NULL AND lower(c.source_name) = lower(s.supplier_name))
     )
     AND (
           (c.commission_type = 'receivable'
              AND round(COALESCE(c.base_amount, 0), 2) = round(COALESCE(s.total_cost, 0), 2))
        OR (c.commission_type = 'payable'
              AND COALESCE(s.total_cost, 0) > 0 AND COALESCE(s.client_price, 0) > 0
              AND round(COALESCE(c.base_amount, 0), 2) = round(s.client_price - s.total_cost, 2))
     );

  -- Exactly one candidate: link it.
  UPDATE public.commissions c
     SET service_id = m.service_id
    FROM (
      SELECT commission_id, (array_agg(service_id::text))[1]::uuid AS service_id
        FROM _commission_service_candidates
       GROUP BY commission_id
      HAVING count(*) = 1
    ) m
   WHERE c.id = m.commission_id
     AND c.service_id IS NULL;

  -- Everything generated that is still unlinked goes to review, with why.
  IF to_regclass('public.org_backfill_review') IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'commissions', c.id::text, c.org_id,
           CASE WHEN EXISTS (SELECT 1 FROM _commission_service_candidates k WHERE k.commission_id = c.id)
                THEN 'service_id not set: more than one service of the trip matches this commission'
                ELSE 'service_id not set: no service of the trip matches this commission'
           END
      FROM public.commissions c
     WHERE c.service_id IS NULL
       AND c.itinerary_id IS NOT NULL
       AND c.notes LIKE 'Auto-generated from itinerary%'
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$
$s0086$;
  EXECUTE $s0087$
INSERT INTO public.schema_migrations (name) VALUES ('20261229_commission_service_backfill') ON CONFLICT DO NOTHING
$s0087$;
  EXECUTE $s0088$
-- ==================================================================
-- 20261230_expense_approver
-- ==================================================================
-- ============================================
-- Expenses: who created one, and who approved it
-- ============================================
-- An expense moved from Pending to Approved (or straight to Paid) with nothing
-- recording who did it, and nothing stopping the person who entered it from
-- approving it themselves.
--
--   created_by   the signed-in user who entered the expense (NULL for those
--                entered before this column, and for ones the system makes,
--                such as an expense raised from a supplier confirmation)
--   approved_by  the signed-in user who moved it out of Pending to Approved or
--                Paid
--   approved_at  when
--
-- The app sets all three from the session, never from the request, and refuses
-- an approval by the person who created the expense unless they are an owner or
-- admin. No existing row changes: an expense approved before this migration has
-- no approver on record, which the screens show as blank, not guessed.
--
-- No foreign keys to auth.users: an approver who later leaves must not block
-- or erase the record, and this table is already written by the service role.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS behind a to_regclass check.

DO $$
BEGIN
  IF to_regclass('public.expenses') IS NOT NULL THEN
    ALTER TABLE public.expenses
      ADD COLUMN IF NOT EXISTS created_by uuid,
      ADD COLUMN IF NOT EXISTS approved_by uuid,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz;
  END IF;
END
$$
$s0088$;
  EXECUTE $s0089$
INSERT INTO public.schema_migrations (name) VALUES ('20261230_expense_approver') ON CONFLICT DO NOTHING
$s0089$;
  EXECUTE $s0090$
-- ==================================================================
-- 20261231_commission_numbers_per_company
-- ==================================================================
-- ============================================
-- Commission numbers per company (COM-YYYY-NNN)
-- ============================================
-- A commission had no number of its own: the Commissions page and the
-- duplicate-commission message named it by a short reference cut from its
-- uuid, which nobody can quote back, search for or find on a statement.
--
-- Same shape as expense numbers (20261227):
--   commission_number_counters  one row per (company, year): the last number
--                               handed out. The row is locked by the
--                               INSERT … ON CONFLICT DO UPDATE that increments
--                               it, so two inserts at once get two numbers.
--   next_commission_number()    the next free number for a company. The first
--                               call for a company and year starts after that
--                               company's own highest existing number. A number
--                               already taken in that company is skipped, never
--                               collided with. Only well-formed numbers
--                               (COM-YYYY-digits) are read. Three digits; a
--                               fourth is added, never cut off.
--   assign_commission_number()  BEFORE INSERT, only when the row names no
--                               number (one inserted with a number keeps it).
--   UNIQUE (org_id, commission_number): two companies may both hold
--                               COM-2026-001.
--
-- BACKFILL. Every commission without a number gets one, per company and per
-- year of its created_at, oldest first (ties by id), carrying on after any
-- number already present. The counters are then set to the highest number
-- issued so the first new commission continues from there.
--
-- next_commission_number() is SECURITY DEFINER (the counter table has RLS on
-- and no policy) and executable by the service role only; the trigger function
-- calls it as its owner.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP … IF
-- EXISTS, the commissions part guarded with to_regclass so a database without
-- the table still migrates. Applying it twice changes nothing the second time
-- (the backfill only touches rows still without a number).

CREATE TABLE IF NOT EXISTS public.commission_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, year)
)
$s0090$;
  EXECUTE $s0091$
ALTER TABLE public.commission_number_counters ENABLE ROW LEVEL SECURITY
$s0091$;
  EXECUTE $s0092$
REVOKE ALL ON public.commission_number_counters FROM PUBLIC, anon, authenticated
$s0092$;
  EXECUTE $s0093$
GRANT ALL ON public.commission_number_counters TO service_role
$s0093$;
  EXECUTE $s0094$
CREATE OR REPLACE FUNCTION public.next_commission_number(p_org uuid, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  pattern text;
  seed integer := 0;
  n integer;
  candidate text;
  taken boolean;
  attempts integer := 0;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'next_commission_number: a commission must belong to a company'; END IF;
  pattern := '^COM-' || p_year || '-([0-9]+)$';

  -- First number of the year for this company: carry on after its own
  -- highest well-formed number (a malformed one is ignored, not cast).
  IF NOT EXISTS (SELECT 1 FROM commission_number_counters WHERE org_id = p_org AND year = p_year) THEN
    SELECT COALESCE(MAX((regexp_match(commission_number, pattern))[1]::bigint), 0) INTO seed
      FROM commissions WHERE org_id = p_org AND commission_number ~ pattern;
  END IF;

  LOOP
    attempts := attempts + 1;
    IF attempts > 10000 THEN
      RAISE EXCEPTION 'next_commission_number: no free number after % attempts', attempts;
    END IF;
    INSERT INTO commission_number_counters AS c (org_id, year, last_value)
      VALUES (p_org, p_year, seed + 1)
      ON CONFLICT (org_id, year) DO UPDATE SET last_value = c.last_value + 1
      RETURNING last_value INTO n;
    -- Three digits; a fourth is added, never cut off (lpad truncates).
    candidate := 'COM-' || p_year || '-' || CASE WHEN length(n::text) < 3 THEN lpad(n::text, 3, '0') ELSE n::text END;
    SELECT EXISTS (SELECT 1 FROM commissions WHERE org_id = p_org AND commission_number = candidate) INTO taken;
    EXIT WHEN NOT taken;
  END LOOP;
  RETURN candidate;
END;
$$
$s0094$;
  EXECUTE $s0095$
REVOKE EXECUTE ON FUNCTION public.next_commission_number(uuid, integer) FROM PUBLIC, anon, authenticated
$s0095$;
  EXECUTE $s0096$
GRANT EXECUTE ON FUNCTION public.next_commission_number(uuid, integer) TO service_role
$s0096$;
  EXECUTE $s0097$
DO $$
BEGIN
  IF to_regclass('public.commissions') IS NOT NULL THEN
    ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS commission_number text;

    -- Backfill, oldest first within each company and year, after the highest
    -- well-formed number the company already holds for that year.
    EXECUTE $b$
      WITH base AS (
        SELECT c.id, c.org_id,
               EXTRACT(YEAR FROM COALESCE(c.created_at, NOW()))::integer AS yr,
               COALESCE(c.created_at, NOW()) AS ts
          FROM public.commissions c
         WHERE c.commission_number IS NULL OR c.commission_number = ''
      ),
      ranked AS (
        SELECT b.id, b.org_id, b.yr,
               ROW_NUMBER() OVER (PARTITION BY b.org_id, b.yr ORDER BY b.ts, b.id) AS rn
          FROM base b
      ),
      held AS (
        SELECT org_id, (regexp_match(commission_number, '^COM-([0-9]{4})-([0-9]+)$'))[1]::integer AS yr,
               MAX((regexp_match(commission_number, '^COM-([0-9]{4})-([0-9]+)$'))[2]::bigint) AS top
          FROM public.commissions
         WHERE commission_number ~ '^COM-[0-9]{4}-[0-9]+$'
         GROUP BY 1, 2
      )
      UPDATE public.commissions c
         SET commission_number = 'COM-' || r.yr || '-' ||
             CASE WHEN length((r.rn + COALESCE(h.top, 0))::text) < 3
                  THEN lpad((r.rn + COALESCE(h.top, 0))::text, 3, '0')
                  ELSE (r.rn + COALESCE(h.top, 0))::text END
        FROM ranked r
        LEFT JOIN held h ON h.org_id = r.org_id AND h.yr = r.yr
       WHERE c.id = r.id
    $b$;

    -- Counters start at the highest number now held, per company and year.
    EXECUTE $k$
      INSERT INTO public.commission_number_counters AS k (org_id, year, last_value)
      SELECT org_id,
             (regexp_match(commission_number, '^COM-([0-9]{4})-([0-9]+)$'))[1]::integer,
             MAX((regexp_match(commission_number, '^COM-([0-9]{4})-([0-9]+)$'))[2]::bigint)::integer
        FROM public.commissions
       WHERE commission_number ~ '^COM-[0-9]{4}-[0-9]+$'
       GROUP BY 1, 2
      ON CONFLICT (org_id, year) DO UPDATE SET last_value = GREATEST(k.last_value, EXCLUDED.last_value)
    $k$;

    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.assign_commission_number() RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
          AS $body$
      BEGIN
        NEW.commission_number := next_commission_number(NEW.org_id, EXTRACT(YEAR FROM NOW())::integer);
        RETURN NEW;
      END;
      $body$
    $f$;
    REVOKE EXECUTE ON FUNCTION public.assign_commission_number() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.assign_commission_number() TO service_role;

    DROP TRIGGER IF EXISTS trigger_assign_commission_number ON public.commissions;
    CREATE TRIGGER trigger_assign_commission_number BEFORE INSERT ON public.commissions
      FOR EACH ROW WHEN ((NEW.commission_number IS NULL) OR ((NEW.commission_number)::text = ''::text))
      EXECUTE FUNCTION public.assign_commission_number();

    -- Unique per company; every row has a number by now.
    CREATE UNIQUE INDEX IF NOT EXISTS commissions_org_commission_number_key ON public.commissions (org_id, commission_number);
  END IF;
END
$$
$s0097$;
  EXECUTE $s0098$
INSERT INTO public.schema_migrations (name) VALUES ('20261231_commission_numbers_per_company') ON CONFLICT DO NOTHING
$s0098$;
  EXECUTE $s0099$
-- ==================================================================
-- 20270101_booking_supplier_currency
-- ==================================================================
-- ============================================
-- Booking supplier rows: the currency their cost is in
-- ============================================
-- booking_supplier_status.quoted_cost was copied from the itinerary lines'
-- total_cost, which is converted to the TRIP's currency; the expense made when
-- the row is confirmed was then recorded in the booking's currency. So a guide
-- paid EGP 3,000 on a yen trip became an expense of "¥14,xxx", and a Nile
-- cruise contracted in USD one in EUR.
--
--   cost_currency  the currency quoted_cost and confirmed_cost are in; NULL =
--                  the booking's currency (every row before this column, and
--                  rows added by hand)
--
-- The app now writes the supplier's OWN currency and amount when every line
-- of the row is in that one currency and the line's original cost still
-- agrees with its total_cost at the rate it was converted at (the voucher
-- rule, lib/supplier-own-currency); otherwise the trip's currency and
-- total_cost.
--
-- Backfill, by the same rule, ONLY for rows nobody has confirmed a cost on:
-- status pending / requested / contacted and confirmed_cost NULL. The row's
-- lines are its booking's itinerary services of the same supplier (supplier_id,
-- else name), supplier type and service date, as lib/bookings/supplier-lines
-- groups them; the row is changed only when its quoted_cost is still exactly
-- those lines' total_cost (it came from them and nothing was edited since).
-- Confirmed rows, and every expense, keep their amounts and currencies.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS behind to_regclass / column checks;
-- the backfill only touches rows whose cost_currency is still NULL.

CREATE OR REPLACE FUNCTION pg_temp.has_col(t text, c text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = c)
$$
$s0099$;
  EXECUTE $s0100$
-- lib/bookings/supplier-lines supplierTypeForService: NULL = nobody confirms it.
CREATE OR REPLACE FUNCTION pg_temp.supplier_type_for_service(st text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(st, ''))
    WHEN 'hotel' THEN 'hotel' WHEN 'accommodation' THEN 'hotel'
    WHEN 'guide' THEN 'guide' WHEN 'tour_guide' THEN 'guide'
    WHEN 'transport' THEN 'transport' WHEN 'transportation' THEN 'transport' WHEN 'transfer' THEN 'transport'
    WHEN 'vehicle' THEN 'transport' WHEN 'airport_transfer' THEN 'transport' WHEN 'cruise_transport_package' THEN 'transport'
    WHEN 'train' THEN 'transport' WHEN 'sleeping_train' THEN 'transport'
    WHEN 'restaurant' THEN 'restaurant' WHEN 'meal' THEN 'restaurant' WHEN 'lunch' THEN 'restaurant'
    WHEN 'dinner' THEN 'restaurant' WHEN 'breakfast' THEN 'restaurant'
    WHEN 'activity' THEN 'activity' WHEN 'excursion' THEN 'activity' WHEN 'tour' THEN 'activity'
    WHEN 'entrance' THEN 'entrance' WHEN 'entrance_fee' THEN 'entrance' WHEN 'ticket' THEN 'entrance'
    WHEN 'cruise' THEN 'cruise' WHEN 'nile_cruise' THEN 'cruise'
    WHEN 'flight' THEN 'flight' WHEN 'domestic_flight' THEN 'flight'
    WHEN 'airport_service' THEN 'airport_service' WHEN 'meet_greet' THEN 'airport_service' WHEN 'porter' THEN 'airport_service'
    WHEN 'hotel_service' THEN 'hotel_service'
    WHEN 'tips' THEN NULL WHEN 'tip' THEN NULL WHEN 'water' THEN NULL WHEN 'supplies' THEN NULL
    WHEN 'service_fee' THEN NULL WHEN 'extra_expenses' THEN NULL
    ELSE 'other'
  END
$$
$s0100$;
  EXECUTE $s0101$
DO $$
BEGIN
  IF to_regclass('public.booking_supplier_status') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.booking_supplier_status
    ADD COLUMN IF NOT EXISTS cost_currency text;

  COMMENT ON COLUMN public.booking_supplier_status.cost_currency IS
    'Currency of quoted_cost and confirmed_cost (the supplier''s own when its itinerary lines were priced in it); NULL = the booking''s currency.';

  IF to_regclass('public.bookings') IS NULL
     OR to_regclass('public.itineraries') IS NULL
     OR to_regclass('public.itinerary_days') IS NULL
     OR to_regclass('public.itinerary_services') IS NULL
     OR NOT pg_temp.has_col('bookings', 'itinerary_id')
     OR NOT pg_temp.has_col('bookings', 'start_date')
     OR NOT pg_temp.has_col('itineraries', 'currency')
     OR NOT pg_temp.has_col('itinerary_services', 'supplier_currency')
     OR NOT pg_temp.has_col('itinerary_services', 'supplier_cost_original')
     OR NOT pg_temp.has_col('itinerary_services', 'exchange_rate_used') THEN
    RETURN;
  END IF;

  WITH lines AS (
    SELECT b.id AS booking_id,
           upper(btrim(i.currency)) AS trip_currency,
           s.supplier_id,
           lower(btrim(coalesce(nullif(s.supplier_name, ''), nullif(s.service_name, ''), 'Unknown'))) AS name_key,
           pg_temp.supplier_type_for_service(s.service_type) AS supplier_type,
           coalesce(d.date, coalesce(b.start_date, i.start_date) + (d.day_number - 1)) AS service_date,
           upper(btrim(coalesce(s.supplier_currency, ''))) AS cur,
           s.supplier_cost_original AS original,
           s.exchange_rate_used AS rate,
           s.total_cost AS total
      FROM public.bookings b
      JOIN public.itineraries i ON i.id = b.itinerary_id
      JOIN public.itinerary_days d ON d.itinerary_id = i.id
      JOIN public.itinerary_services s ON s.itinerary_day_id = d.id
     WHERE nullif(btrim(i.currency), '') IS NOT NULL
  ),
  candidates AS (
    SELECT r.id AS row_id, r.quoted_cost,
           l.trip_currency, l.cur, l.original, l.rate, l.total
      FROM public.booking_supplier_status r
      JOIN lines l
        ON l.booking_id = r.booking_id
       AND l.supplier_type = r.supplier_type
       AND l.service_date IS NOT DISTINCT FROM r.service_date
       AND (CASE WHEN r.supplier_id IS NOT NULL
                 THEN l.supplier_id = r.supplier_id
                 ELSE l.supplier_id IS NULL AND l.name_key = lower(btrim(r.supplier_name)) END)
     WHERE r.cost_currency IS NULL
       AND r.confirmed_cost IS NULL
       AND coalesce(r.status, 'pending') IN ('pending', 'requested', 'contacted')
  ),
  derived AS (
    SELECT row_id,
           min(cur) AS cur,
           round(sum(original), 2) AS own_amount
      FROM candidates
     GROUP BY row_id, quoted_cost, trip_currency
    HAVING count(DISTINCT cur) = 1
       AND min(cur) <> ''
       AND min(cur) <> trip_currency
       -- every line's original still agrees with its total (rounding, not an edit)
       AND bool_and(original IS NOT NULL AND rate IS NOT NULL AND rate > 0 AND total IS NOT NULL
                    AND abs(original * rate - total) <= greatest(0.01, abs(total) * 0.005))
       -- the row is still exactly what these lines made it
       AND quoted_cost IS NOT NULL
       AND abs(quoted_cost - round(sum(total), 2)) <= 0.01
       AND round(sum(original), 2) > 0
  )
  UPDATE public.booking_supplier_status r
     SET cost_currency = dv.cur,
         quoted_cost = dv.own_amount
    FROM derived dv
   WHERE r.id = dv.row_id
     AND r.cost_currency IS NULL
     AND r.confirmed_cost IS NULL;
END
$$
$s0101$;
  EXECUTE $s0102$
INSERT INTO public.schema_migrations (name) VALUES ('20270101_booking_supplier_currency') ON CONFLICT DO NOTHING
$s0102$;
  EXECUTE $s0103$
-- ==================================================================
-- 20270102_invitations_activity_log_lockdown
-- ==================================================================
-- ============================================
-- user_invitations and activity_log: closed to signed-in browsers
-- ============================================
-- Settings audit (User Management, Activity Log), critical.
--
-- user_invitations carried a policy named "Allow all for service role" that is
-- USING (true) WITH CHECK (true) for EVERY role (the service role bypasses RLS
-- and never needed it), plus "Anyone can accept invitation with valid token"
-- (UPDATE, USING (true)). With signup open, any account could insert an admin
-- invitation for another company's org_id and accept it through
-- /api/invitations/accept, read other companies' pending tokens, or reset an
-- invitation's accepted/expiry fields. The org policies were no better: any
-- member, a viewer included, could insert an admin invitation for their own
-- company.
--
-- activity_log had activity_log_authenticated: any signed-in user could read
-- every company's audit trail (emails, IPs, org ids) and insert fake entries.
--
-- Every reader and writer of both tables in the app is a server route using
-- the service role (app/api/invitations/*, app/api/activity, lib/activity-log),
-- which bypasses RLS. So every policy on both tables is dropped and table
-- access is revoked from anon and authenticated. RLS stays ENABLED with no
-- policy: deny by default.
--
-- Idempotent; guarded on each table existing. No data is changed.

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_invitations', 'activity_log'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END
$$
$s0103$;
  EXECUTE $s0104$
INSERT INTO public.schema_migrations (name) VALUES ('20270102_invitations_activity_log_lockdown') ON CONFLICT DO NOTHING
$s0104$;
  EXECUTE $s0105$
-- ==================================================================
-- 20270103_profiles_seasons_rls
-- ==================================================================
-- ============================================
-- user_profiles: no self-promotion, no self-reactivation; season calendar
-- written by the server only; activity_log carries what changed
-- ============================================
-- Settings audit (User Management, Seasonal Premiums, Activity Log).
--
-- 1. user_profiles. "Users can update own profile" is USING (id = auth.uid())
--    with no column limit, so any signed-in person could run, through
--    PostgREST, `update user_profiles set is_active = true` on their own row
--    (a deactivated person let themselves back in: middleware reads that
--    flag) or `set role = 'admin'` (the mirror is_admin() and
--    is_manager_or_above() read, which 137 rate, tour, content and finance
--    policies call). A BEFORE UPDATE trigger now refuses a change to role,
--    is_active, id or email unless the statement runs as a server role:
--    the service role (every app route that changes them), postgres and the
--    SECURITY DEFINER functions it owns (mirror_membership_role keeps role in
--    step with organization_members). Name, phone, company name and avatar
--    stay the person's own to edit (/api/profile, /api/avatar/upload).
--
--    "Admins can update all profiles" and "Admins can delete profiles" are
--    dropped. The Users page changes and deletes accounts through
--    /api/profiles/[id] on the service role, which checks the target's
--    company, the owner rule and the other-company rule; the policies let a
--    shared-company admin skip all three from a browser, and a deleted
--    profile row reads as an ACTIVE account in middleware. No browser code
--    updates or deletes another person's profile.
--
-- 2. Removing a membership did not touch the mirror: the trigger fired on
--    insert and role change only, so someone removed from the company whose
--    role the mirror held kept that role there. A DELETE trigger now
--    re-mirrors the earliest remaining membership, or viewer when none is
--    left.
--
-- 3. pricing_seasons / pricing_season_dates. pricing_seasons_org_all and
--    pricing_season_dates_org_all were FOR ALL USING user_is_in_org(org_id):
--    any member, a viewer included, could change a premium from the browser,
--    past the admin/manager API gate and the Activity Log. Every write in the
--    app is a service-role route (/api/pricing/seasons, /api/pricing/
--    season-dates), so the browser keeps SELECT for members of the company
--    and loses INSERT, UPDATE and DELETE.
--
-- 4. activity_log.detail (jsonb, nullable): the before and after values a
--    route records for a role change, a removal, an invitation accepted or a
--    season premium change. Older rows have none.
--
-- Idempotent (CREATE OR REPLACE, DROP … IF EXISTS, ADD COLUMN IF NOT
-- EXISTS) and guarded on each table existing. No data is changed.

CREATE OR REPLACE FUNCTION public.user_profiles_guard_privileged() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- current_user, not auth.role(): inside a SECURITY DEFINER function it is
  -- the function's owner, so the membership mirror still writes role.
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.role IS DISTINCT FROM OLD.role
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
  ) THEN
    RAISE EXCEPTION 'role, active status and email are changed by an administrator, not from a profile'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$
$s0105$;
  EXECUTE $s0106$
REVOKE EXECUTE ON FUNCTION public.user_profiles_guard_privileged() FROM PUBLIC, anon, authenticated
$s0106$;
  EXECUTE $s0107$
CREATE OR REPLACE FUNCTION public.mirror_membership_role_on_delete() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  first_role text;
BEGIN
  SELECT role INTO first_role
    FROM public.organization_members
    WHERE user_id = OLD.user_id
    ORDER BY created_at ASC
    LIMIT 1;
  UPDATE public.user_profiles
    SET role = CASE WHEN first_role IS NULL THEN 'viewer' WHEN first_role = 'owner' THEN 'admin' ELSE first_role END
    WHERE id = OLD.user_id
      AND role IS DISTINCT FROM CASE WHEN first_role IS NULL THEN 'viewer' WHEN first_role = 'owner' THEN 'admin' ELSE first_role END;
  RETURN OLD;
END;
$$
$s0107$;
  EXECUTE $s0108$
REVOKE EXECUTE ON FUNCTION public.mirror_membership_role_on_delete() FROM PUBLIC, anon, authenticated
$s0108$;
  EXECUTE $s0109$
DO $$
DECLARE
  t text;
  p record;
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_user_profiles_guard_privileged ON public.user_profiles;
    CREATE TRIGGER trg_user_profiles_guard_privileged
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.user_profiles_guard_privileged();
    DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
    DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
  END IF;

  IF to_regclass('public.organization_members') IS NOT NULL AND to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_organization_members_mirror_role_delete ON public.organization_members;
    CREATE TRIGGER trg_organization_members_mirror_role_delete
      AFTER DELETE ON public.organization_members
      FOR EACH ROW EXECUTE FUNCTION public.mirror_membership_role_on_delete();
  END IF;

  FOREACH t IN ARRAY ARRAY['pricing_seasons', 'pricing_season_dates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;

  IF to_regclass('public.activity_log') IS NOT NULL THEN
    ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS detail jsonb;
  END IF;
END
$$
$s0109$;
  EXECUTE $s0110$
INSERT INTO public.schema_migrations (name) VALUES ('20270103_profiles_seasons_rls') ON CONFLICT DO NOTHING
$s0110$;
  EXECUTE $s0111$
-- ==================================================================
-- 20270104_accounting_tokens_per_company
-- ==================================================================
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
$$
$s0111$;
  EXECUTE $s0112$
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

  -- A person in both companies signs for both: their signature is copied into
  -- each other company, and the original row takes the earliest one. A
  -- signature is the person's own words, so nothing crosses companies.
  CREATE TEMP TABLE _sig_multi ON COMMIT DROP AS
    SELECT s.id, s.user_id,
           (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = s.user_id
             ORDER BY m.created_at, m.org_id LIMIT 1) AS first_org
      FROM public.email_signatures s
     WHERE s.org_id IS NULL AND s.user_id IS NOT NULL
       AND (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = s.user_id) > 1;

  INSERT INTO public.email_signatures (user_id, name, content, is_default, created_at, updated_at, org_id)
  SELECT s.user_id, s.name, s.content, s.is_default, s.created_at, s.updated_at, m.org_id
    FROM _sig_multi x
    JOIN public.email_signatures s ON s.id = x.id
    JOIN public.organization_members m ON m.user_id = x.user_id AND m.org_id <> x.first_org;

  UPDATE public.email_signatures s SET org_id = x.first_org
    FROM _sig_multi x WHERE s.id = x.id;

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
$$
$s0112$;
  EXECUTE $s0113$
INSERT INTO public.schema_migrations (name) VALUES ('20270104_accounting_tokens_per_company') ON CONFLICT DO NOTHING
$s0113$;
  EXECUTE $s0114$
-- ==================================================================
-- 20270105_rls_company_roles
-- ==================================================================
-- ============================================
-- RLS: every browser-reachable policy is scoped to the caller's company, and
-- role checks read the caller's role IN THAT company
-- ============================================
-- Travel2Egypt and ATS share one database. Server routes use the service
-- role (RLS does not apply) and filter by org_id; RLS is what stands between
-- a signed-in person and the other company when they call PostgREST
-- directly with their own session, which anyone can do.
--
-- 1. Policies with no company check at all. Permissive policies are OR'd, so
--    one of these beside a correct org policy still opens the table:
--      invoices   "Managers can view/create/update invoices",
--                 "Admins can delete invoices"
--      expenses   "Managers can view/update expenses", "Agents can create
--                 expenses", "Admins can delete expenses"
--                 -> dropped: invoices_org_* / expenses_org_* already give
--                 members of the company the same access (and more).
--      message_templates "Active users can view templates",
--                 "Managers can manage templates"
--      template_send_log "Agents can view/insert send log"
--      whatsapp_conversations "Agents can access whatsapp conversations"
--      b2c_quotes "b2c_quotes_authenticated" (USING true)
--      invoice_payments "invoice_payments_authenticated" (USING true)
--                 -> recreated with user_is_in_org(org_id) / the role in
--                 that company (b2c_quotes_org_all, invoice_payments_org_all
--                 replace the USING true ones).
--      whatsapp_messages, audit_logs, invoice_reminders, quote_revisions,
--      quote_versions, supplier_invoice_expenses, template_placeholders
--                 -> no org_id. Only the service role touches them (no
--                 browser client, createServerClient-with-anon-key route or
--                 realtime channel reads or writes any of them), so their
--                 browser policies go and anon/authenticated lose the table
--                 grants. audit_logs' "System can insert audit logs" let
--                 even anon insert.
--    Kept as they are: service_role policies (that role bypasses RLS
--    anyway), per-person tables keyed on auth.uid() = user_id (email_*,
--    copilot_settings, user_settings, user_profiles), the global
--    exchange_rates / exchange_rate_snapshots read, and rate_audit_log's
--    WITH CHECK (false).
--
-- 2. is_admin(), is_manager_or_above() and is_agent_or_above() read
--    user_profiles.role, the mirror of the person's EARLIEST membership. An
--    admin of one company who is a viewer in the other passed every
--    "user_is_in_org(org_id) AND is_manager_or_above()" check in both.
--    user_has_org_role(org, roles) reads organization_members for that
--    company (an owner always passes; like the old functions it needs an
--    active profile). Every policy that pairs user_is_in_org(X) with one of
--    the three is rewritten in place with ALTER POLICY (command, roles and
--    permissive/restrictive untouched; only the calls change):
--      user_is_in_org(X) AND is_manager_or_above()
--        -> user_has_org_role(X, ARRAY['owner','admin','manager'])
--      is_agent_or_above() elsewhere beside user_is_in_org(X)
--        -> user_has_org_role(X, ARRAY['owner','admin','manager','agent'])
--      is_admin() -> user_has_org_role(X, ARRAY['owner','admin'])
--      is_manager_or_above() AND (EXISTS (... user_is_in_org(p.org_id)))
--        -> EXISTS (... user_has_org_role(p.org_id, ...))  (child tables)
--    A policy whose text does not fit those shapes is left as it was with a
--    WARNING naming it.
--
-- Idempotent: the second run finds nothing to rewrite, and every DROP is IF
-- EXISTS. Guarded on each table (and its org_id) existing. No data changes.

-- pg_policies prints expressions relative to the search path; the rewrite
-- below matches unqualified names.
SET LOCAL search_path TO public, pg_temp
$s0114$;
  EXECUTE $s0115$
CREATE OR REPLACE FUNCTION public.user_has_org_role(p_org uuid, p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.organization_members m
           WHERE m.org_id = p_org
             AND m.user_id = auth.uid()
             AND (m.role = 'owner' OR m.role = ANY (p_roles))
         )
     AND EXISTS (
           SELECT 1 FROM public.user_profiles u
           WHERE u.id = auth.uid() AND u.is_active = true
         )
$$
$s0115$;
  EXECUTE $s0116$
REVOKE EXECUTE ON FUNCTION public.user_has_org_role(uuid, text[]) FROM PUBLIC
$s0116$;
  EXECUTE $s0117$
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.user_has_org_role(uuid, text[]) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL;
END $$
$s0117$;
  EXECUTE $s0118$
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid, text[]) TO authenticated
$s0118$;
  EXECUTE $s0119$
-- --------------------------------------------
-- 1. Policies with no company check
-- --------------------------------------------
DO $$
DECLARE
  t text;
  has_org boolean;
BEGIN
  -- invoices / expenses: the org policies already cover members.
  IF to_regclass('public.invoices') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can view invoices" ON public.invoices;
    DROP POLICY IF EXISTS "Managers can create invoices" ON public.invoices;
    DROP POLICY IF EXISTS "Managers can update invoices" ON public.invoices;
    DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
  END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can view expenses" ON public.expenses;
    DROP POLICY IF EXISTS "Managers can update expenses" ON public.expenses;
    DROP POLICY IF EXISTS "Agents can create expenses" ON public.expenses;
    DROP POLICY IF EXISTS "Admins can delete expenses" ON public.expenses;
  END IF;

  FOREACH t IN ARRAY ARRAY['message_templates', 'template_send_log', 'whatsapp_conversations', 'b2c_quotes', 'invoice_payments'] LOOP
    has_org := EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id');
    IF NOT has_org THEN
      IF to_regclass('public.' || t) IS NOT NULL THEN
        RAISE WARNING '% has no org_id; its policies were left as they are', t;
      END IF;
      CONTINUE;
    END IF;

    IF t = 'message_templates' THEN
      DROP POLICY IF EXISTS "Active users can view templates" ON public.message_templates;
      DROP POLICY IF EXISTS "Managers can manage templates" ON public.message_templates;
      CREATE POLICY "Active users can view templates" ON public.message_templates
        FOR SELECT USING (user_is_in_org(org_id) AND is_active_user());
      CREATE POLICY "Managers can manage templates" ON public.message_templates
        FOR ALL USING (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager']))
        WITH CHECK (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager']));
    ELSIF t = 'template_send_log' THEN
      DROP POLICY IF EXISTS "Agents can view send log" ON public.template_send_log;
      DROP POLICY IF EXISTS "Agents can insert send log" ON public.template_send_log;
      CREATE POLICY "Agents can view send log" ON public.template_send_log
        FOR SELECT USING (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']));
      CREATE POLICY "Agents can insert send log" ON public.template_send_log
        FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']));
    ELSIF t = 'whatsapp_conversations' THEN
      DROP POLICY IF EXISTS "Agents can access whatsapp conversations" ON public.whatsapp_conversations;
      CREATE POLICY "Agents can access whatsapp conversations" ON public.whatsapp_conversations
        FOR ALL USING (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']))
        WITH CHECK (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']));
    ELSIF t = 'b2c_quotes' THEN
      DROP POLICY IF EXISTS b2c_quotes_authenticated ON public.b2c_quotes;
      DROP POLICY IF EXISTS b2c_quotes_org_all ON public.b2c_quotes;
      CREATE POLICY b2c_quotes_org_all ON public.b2c_quotes
        FOR ALL TO authenticated USING (user_is_in_org(org_id)) WITH CHECK (user_is_in_org(org_id));
    ELSIF t = 'invoice_payments' THEN
      DROP POLICY IF EXISTS invoice_payments_authenticated ON public.invoice_payments;
      DROP POLICY IF EXISTS invoice_payments_org_all ON public.invoice_payments;
      CREATE POLICY invoice_payments_org_all ON public.invoice_payments
        FOR ALL TO authenticated USING (user_is_in_org(org_id)) WITH CHECK (user_is_in_org(org_id));
    END IF;
  END LOOP;

  -- No org_id, service role only: no browser policy, no browser grant.
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Agents can access whatsapp messages" ON public.whatsapp_messages;
  END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
  END IF;
  IF to_regclass('public.invoice_reminders') IS NOT NULL THEN
    DROP POLICY IF EXISTS invoice_reminders_authenticated ON public.invoice_reminders;
  END IF;
  IF to_regclass('public.quote_revisions') IS NOT NULL THEN
    DROP POLICY IF EXISTS quote_revisions_authenticated ON public.quote_revisions;
  END IF;
  IF to_regclass('public.quote_versions') IS NOT NULL THEN
    DROP POLICY IF EXISTS quote_versions_authenticated ON public.quote_versions;
  END IF;
  IF to_regclass('public.supplier_invoice_expenses') IS NOT NULL THEN
    DROP POLICY IF EXISTS supplier_invoice_expenses_authenticated ON public.supplier_invoice_expenses;
  END IF;
  IF to_regclass('public.template_placeholders') IS NOT NULL THEN
    DROP POLICY IF EXISTS template_placeholders_authenticated ON public.template_placeholders;
  END IF;

  FOREACH t IN ARRAY ARRAY['whatsapp_messages', 'audit_logs', 'invoice_reminders', 'quote_revisions',
                           'quote_versions', 'supplier_invoice_expenses', 'template_placeholders'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXCEPTION WHEN undefined_object THEN NULL;
      END;
    END IF;
  END LOOP;
END
$$
$s0119$;
  EXECUTE $s0120$
-- --------------------------------------------
-- 2. Role checks read the role in the policy's company
-- --------------------------------------------
-- Returns the rewritten expression, the same text when it calls none of the
-- three functions, or NULL when it does but does not fit a known shape.
CREATE OR REPLACE FUNCTION pg_temp.rls_role_rewrite(e text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $f$
DECLARE
  fns  text[] := ARRAY['is_admin', 'is_manager_or_above', 'is_agent_or_above'];
  sets text[] := ARRAY[
    $s$ARRAY['owner'::text, 'admin'::text]$s$,
    $s$ARRAY['owner'::text, 'admin'::text, 'manager'::text]$s$,
    $s$ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text]$s$
  ];
  any_fn constant text := '\m(is_admin|is_manager_or_above|is_agent_or_above)\(\)';
  m text[];
  orgs text[];
  x text;
  i int;
BEGIN
  IF e IS NULL OR e !~ any_fn THEN
    RETURN e;
  END IF;

  -- A child table scoped through its parent:
  --   (fn() AND (EXISTS ( SELECT 1 FROM parent p WHERE (... AND user_is_in_org(p.org_id)))))
  -- The role check moves inside, onto the parent's company.
  m := regexp_match(e, '^\((is_admin|is_manager_or_above|is_agent_or_above)\(\) AND (\(EXISTS .*\))\)$');
  IF m IS NOT NULL THEN
    IF m[2] ~ any_fn THEN
      RETURN NULL;
    END IF;
    orgs := ARRAY(SELECT DISTINCT (regexp_matches(m[2], 'user_is_in_org\(([^()]+)\)', 'g'))[1]);
    IF cardinality(orgs) <> 1 THEN
      RETURN NULL;
    END IF;
    RETURN replace(m[2], format('user_is_in_org(%s)', orgs[1]),
                   format('user_has_org_role(%s, %s)', orgs[1], sets[array_position(fns, m[1])]));
  END IF;

  -- The table's own org column, checked at the top level of the expression.
  orgs := ARRAY(SELECT DISTINCT (regexp_matches(e, 'user_is_in_org\(([^()]+)\)', 'g'))[1]);
  IF cardinality(orgs) <> 1 OR orgs[1] !~ '^[a-z_][a-z0-9_]*$' OR e ~* '\mselect\M' THEN
    RETURN NULL;
  END IF;
  x := orgs[1];
  FOR i IN 1..3 LOOP
    -- "user_is_in_org(x) AND fn()" is one call; any other fn() keeps its
    -- surrounding logic and asks about the same company.
    e := replace(e, format('user_is_in_org(%s) AND %s()', x, fns[i]),
                 format('user_has_org_role(%s, %s)', x, sets[i]));
    e := regexp_replace(e, '\m' || fns[i] || '\(\)', format('user_has_org_role(%s, %s)', x, sets[i]), 'g');
  END LOOP;
  RETURN e;
END
$f$
$s0120$;
  EXECUTE $s0121$
DO $$
DECLARE
  r record;
  nq text;
  nc text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '\m(is_admin|is_manager_or_above|is_agent_or_above)\(\)'
    ORDER BY tablename, policyname
  LOOP
    nq := pg_temp.rls_role_rewrite(r.qual);
    nc := pg_temp.rls_role_rewrite(r.with_check);
    IF (r.qual IS NOT NULL AND nq IS NULL) OR (r.with_check IS NOT NULL AND nc IS NULL) THEN
      RAISE WARNING 'policy % on % calls a profile-wide role function and was left unchanged', r.policyname, r.tablename;
      CONTINUE;
    END IF;
    IF nq IS DISTINCT FROM r.qual AND nc IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', r.policyname, r.tablename, nq, nc);
    ELSIF nq IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, nq);
    ELSIF nc IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', r.policyname, r.tablename, nc);
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE '20270105: % policies now read the role in their company', n;
END
$$
$s0121$;
  EXECUTE $s0122$
DROP FUNCTION pg_temp.rls_role_rewrite(text)
$s0122$;
  EXECUTE $s0123$
-- Money tables are written only by server routes (service role), which apply
-- the role rules (agents issue invoices and record payments; expenses are
-- manager-and-above). Their org policies let ANY member of the company, a
-- viewer included, write them straight through PostgREST. Browser roles keep
-- reading their own company's rows (the org SELECT policies) and lose writes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'expenses', 'b2c_quotes', 'invoice_payments'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END
$$
$s0123$;
  EXECUTE $s0124$
INSERT INTO public.schema_migrations (name) VALUES ('20270105_rls_company_roles') ON CONFLICT DO NOTHING
$s0124$;
  RAISE NOTICE 'release step 3: 20261210–20270105 applied';
END
$release$;
