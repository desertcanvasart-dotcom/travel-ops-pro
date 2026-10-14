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
BEGIN;

CREATE TABLE IF NOT EXISTS public.expense_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, year)
);
ALTER TABLE public.expense_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.expense_number_counters TO service_role;

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
$$;

REVOKE EXECUTE ON FUNCTION public.next_expense_number(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_expense_number(uuid, integer) TO service_role;

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
$$;

COMMIT;
