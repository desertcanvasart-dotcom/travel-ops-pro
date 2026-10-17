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
BEGIN;

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
$$;

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
$$;

-- ── 3. Booking codes: per company, no race ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_code_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL,
  PRIMARY KEY (org_id, year)
);
ALTER TABLE public.booking_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_code_counters FROM PUBLIC, anon, authenticated;

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
$$;

DROP FUNCTION IF EXISTS public.generate_booking_code();

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
$$;

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
$$;

COMMIT;
