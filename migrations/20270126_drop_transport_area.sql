-- ============================================================================
-- 20270126 — retire transportation_rates.area (the old sightseeing-area guess)
-- ============================================================================
-- Ported from autoura-saas #834, the last step of the transport zones plan.
--
-- `area` held a sightseeing area (east_bank, pyramids, …) that the engine
-- guessed from a fixed Egypt keyword list, the same for every company. It was
-- not on the rate form, only reachable from the spreadsheet's Area column. Its
-- jobs now belong to the rate's pickup area (`zone`, 20270125) and the sights
-- it covers (`covers_sights`). The app no longer reads or writes it.
--
-- SAFE BY CONSTRUCTION: the column is dropped only when no row has a value
-- in it. If any row does, nothing is dropped and the migration says so: those
-- rates priced by the old guess, and should be re-entered as a pickup area and
-- sights covered before the column goes (re-run this file afterwards; it is
-- idempotent). travel-ops-pro has no index on the column, so none is rebuilt.
-- ============================================================================

DO $$
DECLARE
  in_use integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transportation_rates' AND column_name = 'area'
  ) THEN
    RETURN; -- already gone
  END IF;

  EXECUTE $q$SELECT count(*) FROM public.transportation_rates WHERE area IS NOT NULL AND btrim(area) <> ''$q$ INTO in_use;
  IF in_use > 0 THEN
    RAISE NOTICE 'transportation_rates.area kept: % row(s) still hold a value. Re-enter them as a pickup area / sights covered, then re-run 20270126.', in_use;
    RETURN;
  END IF;

  ALTER TABLE public.transportation_rates DROP COLUMN area;
END $$;

-- Check before applying (read-only):
--   SELECT org_id, area, count(*) FROM transportation_rates
--   WHERE area IS NOT NULL AND btrim(area) <> '' GROUP BY 1, 2;
--   -- no rows: the column is dropped; any rows: it is kept, see the notice.
