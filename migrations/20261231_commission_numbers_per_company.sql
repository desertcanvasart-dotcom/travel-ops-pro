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
BEGIN;

CREATE TABLE IF NOT EXISTS public.commission_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, year)
);
ALTER TABLE public.commission_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.commission_number_counters TO service_role;

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
$$;

REVOKE EXECUTE ON FUNCTION public.next_commission_number(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_commission_number(uuid, integer) TO service_role;

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
$$;

COMMIT;
