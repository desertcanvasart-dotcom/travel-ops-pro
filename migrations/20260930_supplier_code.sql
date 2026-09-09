-- 20260930_supplier_code.sql
-- Portable, human-readable supplier code (SUP-0001, SUP-0002, …).
--
-- WHY: a rate's link to its supplier is supplier_id, a gen_random_uuid() that
-- is local to this install. It cannot survive an export to another install
-- (the sibling autoura-saas), where the same supplier has a different UUID, so
-- rates land unattached and must be relinked by hand. supplier_code is a stable
-- business key the two apps can share: the same supplier carries the same code
-- in both, and CSV export/import links by it instead of by UUID.
--
-- Single-org install (suppliers has no org_id), so the code is globally unique
-- here — matching the sibling's own `supplier_code VARCHAR(50) UNIQUE`.
--
-- Auto-assigned by a BEFORE INSERT trigger when not supplied (covers the API,
-- CSV import and bulk paths uniformly); operator-editable (the form may send a
-- custom code, which the trigger leaves untouched). Existing rows are
-- backfilled in created_at order. Additive: no existing column changes.

BEGIN;

-- 1. The column.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_code text;

-- 2. The number source (global sequence).
CREATE SEQUENCE IF NOT EXISTS public.suppliers_code_seq;

-- 3. Backfill existing suppliers that have no code yet, oldest first, so the
--    numbering follows the order they were added.
DO $backfill$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.suppliers
    WHERE supplier_code IS NULL OR btrim(supplier_code) = ''
    ORDER BY created_at NULLS FIRST, id
  LOOP
    UPDATE public.suppliers
      SET supplier_code = 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 4, '0')
      WHERE id = r.id;
  END LOOP;
END
$backfill$;

-- 4. Auto-assign on insert when the caller did not provide one; on update,
--    never let a set code be blanked (the operator may change it to align with
--    the sibling, but clearing it keeps the existing one). SECURITY DEFINER so
--    the inserting role needs no direct grant on the sequence; search_path
--    pinned per the migration-safety convention.
CREATE OR REPLACE FUNCTION public.suppliers_assign_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.supplier_code IS NULL OR btrim(NEW.supplier_code) = '' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.supplier_code := OLD.supplier_code;
    ELSE
      NEW.supplier_code := 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_suppliers_assign_code ON public.suppliers;
CREATE TRIGGER trg_suppliers_assign_code
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_assign_code();

-- 5. Uniqueness (after the backfill, so existing rows never collide).
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_supplier_code_key
  ON public.suppliers (supplier_code);

-- 6. Self-verify: every supplier now has a non-blank, unique code.
DO $verify$
DECLARE
  missing INTEGER;
  dupes INTEGER;
BEGIN
  SELECT count(*) INTO missing FROM public.suppliers
    WHERE supplier_code IS NULL OR btrim(supplier_code) = '';
  IF missing > 0 THEN
    RAISE EXCEPTION 'supplier_code: % suppliers without a code after backfill', missing;
  END IF;
  SELECT coalesce(sum(c) FILTER (WHERE c > 1), 0) INTO dupes
    FROM (SELECT count(*) c FROM public.suppliers GROUP BY supplier_code) g;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'supplier_code: % duplicate codes after backfill', dupes;
  END IF;
END
$verify$;

COMMIT;
