-- 20261029_supplier_code_sequence.sql
-- Stop the supplier code sequence stranding behind the table.
--
-- WHY: 20260930 gave suppliers a portable SUP-#### code, auto-assigned from
-- public.suppliers_code_seq by a BEFORE INSERT trigger, AND deliberately let a
-- caller supply its own code (the form, the CSV import, and the cross-install
-- "Reconcile Codes" all do). Those two facts fight each other: an explicit
-- code does not call nextval(), so the sequence never learns the number was
-- spent. On 2026-09-19 a CSV import of 18 hotel/cruise suppliers arrived with
-- codes SUP-0066..SUP-0083 while the sequence sat at 69. Every supplier
-- created by hand afterwards minted SUP-0070 — already held by "Sonesta Hotels
-- & Resorts" — and died on the unique index.
--
-- What the operator SAW was "A supplier with these details already exists"
-- while adding a guide named Nasser Badawi, then an empty guide list. The
-- clash was on a column the form never shows, against a row in a different
-- section, so the message pointed at nothing they could see. The 409 was
-- honest about the database and useless about the world.
--
-- TWO fixes, because either alone leaves a hole:
--   1. The trigger now SKIPS a taken code instead of failing on it, so a
--      sequence that is behind for any reason self-heals on the next insert.
--   2. An explicit SUP-#### code now FAST-FORWARDS the sequence past itself,
--      so the gap never opens in the first place — on every path at once,
--      which is the only place that can be true (the API, the CSV importer
--      and any future bulk path all go through this trigger).
-- Plus a one-time catch-up for the gap that already exists.
--
-- Additive: no column changes, no data changes to suppliers.

BEGIN;

-- 1. Catch the sequence up to the table as it stands today.
SELECT setval(
  'public.suppliers_code_seq',
  GREATEST(
    (SELECT coalesce(max(substring(supplier_code from 5)::bigint), 0)
       FROM public.suppliers WHERE supplier_code ~ '^SUP-[0-9]+$'),
    (SELECT last_value FROM public.suppliers_code_seq),
    1
  ),
  true
);

-- 2. The trigger, rewritten. Same contract as 20260930 (auto-assign when
--    blank, never blank an existing code on update, operator-editable) with
--    the two repairs above.
CREATE OR REPLACE FUNCTION public.suppliers_assign_code()
RETURNS trigger AS $$
DECLARE
  candidate  text;
  spent      bigint;
  seq_last   bigint;
  seq_called boolean;
  attempts   integer := 0;
BEGIN
  IF NEW.supplier_code IS NULL OR btrim(NEW.supplier_code) = '' THEN
    -- Blank on UPDATE means "leave it alone", not "mint a new one": the code
    -- is a business key that rates and other installs point at.
    IF TG_OP = 'UPDATE' THEN
      NEW.supplier_code := OLD.supplier_code;
      RETURN NEW;
    END IF;

    -- Mint, skipping anything already taken. A sequence can be behind the
    -- table for reasons this trigger cannot prevent (a restore, a manual
    -- INSERT, an import that predates this migration), and the operator
    -- should never meet that as a duplicate error.
    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'suppliers_assign_code: no free supplier code after % attempts', attempts;
      END IF;
      candidate := 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.suppliers WHERE supplier_code = candidate
      );
    END LOOP;

    NEW.supplier_code := candidate;
    RETURN NEW;
  END IF;

  -- An explicit code was supplied. Keep it exactly as given — but if it spends
  -- a number at or beyond where the sequence stands, move the sequence past
  -- it, or the next auto-assign will hand out a number this row already holds.
  IF NEW.supplier_code ~ '^SUP-[0-9]+$' THEN
    spent := substring(NEW.supplier_code from 5)::bigint;
    SELECT last_value, is_called INTO seq_last, seq_called
      FROM public.suppliers_code_seq;
    IF spent > seq_last OR (spent = seq_last AND NOT seq_called) THEN
      PERFORM setval('public.suppliers_code_seq', spent, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The trigger itself is unchanged, but recreate it so a replay from the
-- baseline lands on this function with the same name and timing.
DROP TRIGGER IF EXISTS trg_suppliers_assign_code ON public.suppliers;
CREATE TRIGGER trg_suppliers_assign_code
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_assign_code();

-- 3. Self-verify: the sequence is no longer behind any code in the table.
DO $verify$
DECLARE
  max_used bigint;
  seq_last bigint;
BEGIN
  SELECT coalesce(max(substring(supplier_code from 5)::bigint), 0) INTO max_used
    FROM public.suppliers WHERE supplier_code ~ '^SUP-[0-9]+$';
  SELECT last_value INTO seq_last FROM public.suppliers_code_seq;
  IF seq_last < max_used THEN
    RAISE EXCEPTION 'suppliers_code_seq is at % but the table already uses %', seq_last, max_used;
  END IF;
END
$verify$;

COMMIT;
