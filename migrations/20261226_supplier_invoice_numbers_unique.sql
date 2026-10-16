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
BEGIN;

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
$$;

COMMIT;
