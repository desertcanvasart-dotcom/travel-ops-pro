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
BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('b2b', 'b2c')),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, kind, year)
);
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.quote_number_counters TO service_role;

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
$$;

REVOKE EXECUTE ON FUNCTION public.next_quote_number(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_quote_number(uuid, text, integer) TO service_role;

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
$$;

COMMIT;
