-- 20261006_transportation_drop_vehicle_columns.sql
-- The twenty per-vehicle columns on transportation_rates are retired.
--
-- WHY: since 20261005 a row's vehicles are its `vehicles` JSONB list —
-- { key, rate_eur, rate_non_eur, capacity_min, capacity_max } per vehicle,
-- keyed by the Settings → Vocabulary vehicle key — and every reader (the
-- pricing engine, the grid, the rates hub, the resources API, the supplier
-- document, the CSV exporter) and every writer (the form, the API routes,
-- the CSV importer) went through lib/rates/vehicle-bands.ts by 20261006's
-- deploy. The five sedan / minivan / van / minibus / bus column-sets were a
-- mirror nothing reads; an agency's own vehicle (4x4, horse carriage) never
-- had a column and never will.
--
-- SAFETY: refuses to run while any row still prices a vehicle ONLY in the
-- columns (a legacy rate with no list) — 20261005's backfill left none, and
-- every write since has stored the list, but the check costs nothing and a
-- silent drop of a priced vehicle is not a risk worth a shortcut.
--
-- Deploy order: the code that stops naming these columns (PR for P4b) must
-- be LIVE before this runs — a select naming a dropped column fails outright
-- (PostgREST), a mirror write into one fails the upsert. Applied by the
-- operator by hand after that deploy, like every migration of this series.
--
-- Idempotent: DROP COLUMN IF EXISTS.

BEGIN;

DO $$
DECLARE
  unlisted integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transportation_rates' AND column_name = 'sedan_rate_eur'
  ) THEN
    EXECUTE $q$
      SELECT count(*) FROM public.transportation_rates
      WHERE vehicles IS NULL
        AND (coalesce(sedan_rate_eur, 0) > 0 OR coalesce(minivan_rate_eur, 0) > 0 OR coalesce(van_rate_eur, 0) > 0
             OR coalesce(minibus_rate_eur, 0) > 0 OR coalesce(bus_rate_eur, 0) > 0)
    $q$ INTO unlisted;
    IF unlisted > 0 THEN
      RAISE EXCEPTION '20261006: % transportation_rates row(s) price a vehicle only in the legacy columns (vehicles IS NULL) — run 20261005''s backfill first', unlisted;
    END IF;
  END IF;
END $$;

ALTER TABLE public.transportation_rates
  DROP COLUMN IF EXISTS sedan_rate_eur,   DROP COLUMN IF EXISTS sedan_rate_non_eur,
  DROP COLUMN IF EXISTS sedan_capacity_min,   DROP COLUMN IF EXISTS sedan_capacity_max,
  DROP COLUMN IF EXISTS minivan_rate_eur, DROP COLUMN IF EXISTS minivan_rate_non_eur,
  DROP COLUMN IF EXISTS minivan_capacity_min, DROP COLUMN IF EXISTS minivan_capacity_max,
  DROP COLUMN IF EXISTS van_rate_eur,     DROP COLUMN IF EXISTS van_rate_non_eur,
  DROP COLUMN IF EXISTS van_capacity_min,     DROP COLUMN IF EXISTS van_capacity_max,
  DROP COLUMN IF EXISTS minibus_rate_eur, DROP COLUMN IF EXISTS minibus_rate_non_eur,
  DROP COLUMN IF EXISTS minibus_capacity_min, DROP COLUMN IF EXISTS minibus_capacity_max,
  DROP COLUMN IF EXISTS bus_rate_eur,     DROP COLUMN IF EXISTS bus_rate_non_eur,
  DROP COLUMN IF EXISTS bus_capacity_min,     DROP COLUMN IF EXISTS bus_capacity_max;

COMMENT ON COLUMN public.transportation_rates.vehicles IS
  'The vehicles this rate offers: [{key, rate_eur, rate_non_eur, capacity_min, capacity_max}], key = vocabulary vehicle_type key. Absent = not offered. The only per-vehicle store since 20261006; read and written via lib/rates/vehicle-bands.ts.';

COMMIT;
