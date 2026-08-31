-- ============================================
-- The unique keys the bulk importer upserts on — for every table it serves
-- ============================================
-- CSV import upserts with ON CONFLICT (service_code) (cost_type for fixed
-- daily costs). Postgres requires a UNIQUE constraint behind an ON CONFLICT
-- target; most rate tables have one, but three were missed —
-- transportation_rates, flight_rates and fixed_daily_costs — so importing
-- any of them failed on every row with
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- (operator hit it first on transportation, 2026-09-01).
--
-- Before each constraint, duplicate key values are RENAMED, never deleted:
-- suffixed -DUP2, -DUP3 … by recency, keeping the newest row's code intact.
-- Deleting would silently drop rates somebody entered; a renamed code is
-- visible and fixable. Production has 0 rows in all three tables today —
-- the rescue exists for other installs.

BEGIN;

DO $$
DECLARE
  spec RECORD;
  renamed INT;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('transportation_rates', 'service_code'),
      ('flight_rates',         'service_code'),
      ('fixed_daily_costs',    'cost_type')
    ) AS v(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = spec.tbl AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) LIKE '%(' || spec.col || ')%'
    ) THEN
      CONTINUE; -- constraint already present, nothing to rescue
    END IF;

    -- Rescue duplicates: keep one untouched, suffix the rest. Ordered by id
    -- (not updated_at — fixed_daily_costs has no such column): which twin
    -- keeps the clean code is arbitrary but deterministic, and nothing is
    -- lost either way.
    EXECUTE format($f$
      WITH ranked AS (
        SELECT id, %2$I AS key,
               row_number() OVER (PARTITION BY %2$I ORDER BY id) AS rn
        FROM %1$I WHERE %2$I IS NOT NULL
      )
      UPDATE %1$I t SET %2$I = r.key || '-DUP' || r.rn
      FROM ranked r WHERE t.id = r.id AND r.rn > 1
    $f$, spec.tbl, spec.col);
    GET DIAGNOSTICS renamed = ROW_COUNT;
    IF renamed > 0 THEN
      RAISE NOTICE '%.%: renamed % duplicate value(s) with -DUPn suffixes', spec.tbl, spec.col, renamed;
    END IF;

  END LOOP;
END $$;

-- Literal, so the bulk-upsert-keys guard test can see each one by text.
-- (The DO block above only rescues duplicates and skips nothing: each ALTER
-- below is reached exactly when its constraint was absent, and duplicates
-- were just renamed away.)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transportation_rates_service_code_key') THEN
    ALTER TABLE transportation_rates ADD CONSTRAINT transportation_rates_service_code_key UNIQUE (service_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_rates_service_code_key') THEN
    ALTER TABLE flight_rates ADD CONSTRAINT flight_rates_service_code_key UNIQUE (service_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fixed_daily_costs_cost_type_key') THEN
    ALTER TABLE fixed_daily_costs ADD CONSTRAINT fixed_daily_costs_cost_type_key UNIQUE (cost_type);
  END IF;
END $$;

COMMIT;
