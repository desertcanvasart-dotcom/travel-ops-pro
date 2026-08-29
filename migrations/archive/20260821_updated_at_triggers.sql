-- ============================================
-- updated_at actually updates — on every table that has the column
-- ============================================
-- 2026-08-21. The operator priced the porter rate at 17:06 UTC; the row's
-- updated_at still read 00:46. Nothing bumps it: there is no trigger, and the
-- PUT route (correctly, since PR #123) no longer lets the client write audit
-- columns. So "last edited" on every rates page, and on most of the app, is
-- whatever the INSERT default happened to be.
--
-- A trigger function for this has existed since February
-- (update_updated_at_column, 20260203_add_language_versions.sql) but was wired
-- to 8 tables by hand. 109 resources carry an updated_at column. The other
-- 101 were never going to be listed one at a time — so this is schema-driven:
-- every base table in `public` that has an updated_at column gets the
-- trigger, and re-running picks up tables created since.
--
-- Idempotent: one trigger name per table, dropped and recreated, so applying
-- twice (or after the February hand-wired ones) leaves exactly one.
-- Views are skipped — they cannot carry row triggers and their updated_at is
-- the underlying table's anyway.
-- ============================================

BEGIN;

-- Same function the February migration created; CREATE OR REPLACE so this
-- file stands alone on a fresh database.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl      record;
  old      record;
  n_tables int := 0;
  n_retired int := 0;
BEGIN
  FOR tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')          -- base + partitioned tables only
      AND a.attname = 'updated_at'
      AND NOT a.attisdropped
    ORDER BY c.relname
  LOOP
    -- Retire any earlier hand-wired stamp trigger on this table — the February
    -- ones, and the two bespoke per-table functions (communication_threads,
    -- concierge_briefs) — so a row is stamped once, by one function.
    FOR old IN
      SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = format('public.%I', tbl.relname)::regclass
        AND NOT t.tgisinternal
        AND p.proname LIKE '%updated_at%'
        AND t.tgname <> 'set_updated_at'
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', old.tgname, tbl.relname);
      n_retired := n_retired + 1;
    END LOOP;

    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', tbl.relname);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      tbl.relname
    );
    n_tables := n_tables + 1;
  END LOOP;

  RAISE NOTICE 'set_updated_at installed on % tables (% older hand-wired stamp triggers retired)',
    n_tables, n_retired;
END $$;

COMMIT;

-- Verify: edit any rate and re-read the row — updated_at must move.
--   update hotel_staff_rates set notes = notes where service_code = 'HOTEL-PORTER-ALL' returning updated_at;
