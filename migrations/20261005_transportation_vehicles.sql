-- 20261005_transportation_vehicles.sql
-- A transportation rate's vehicles become a LIST on the row.
--
-- WHY: transportation_rates held its vehicles as twenty columns — for each
-- of sedan / minivan / van / minibus / bus a EUR rate, a non-EUR rate and a
-- capacity band — and those five names were hardcoded from the pricing
-- engine to the CSV importer. Settings → Vocabulary → Vehicle types lets the
-- agency define a fleet (suv, 4x4, horse_carriage), and a vehicle it added
-- had nowhere to be priced.
--
-- `vehicles` is a JSONB list of { key, rate_eur, rate_non_eur, capacity_min,
-- capacity_max } keyed by the vocabulary vehicle key — the shape `seasons`
-- took when rate periods stopped being fixed columns. The legacy columns
-- STAY: the importer still reads them, writers mirror the five preset keys
-- into them during the transition, and lib/rates/vehicle-bands.ts reads
-- whichever a row has. They are dropped by a later migration, not this one.
--
-- The backfill copies each row's OWN rates and bands, only vehicles with a
-- rate, ordered by band. It does NOT align bands with the vocabulary's: every
-- production row carries 1-2 / 3-7 / 8-12 / 13-20 / 21-45 while Settings says
-- minivan 3-8, minibus 15-24 — rewriting them here would move an 8-pax group
-- to a cheaper vehicle on 101 rows silently. That is the operator's call, in
-- the form, with the price consequence visible.
--
-- Idempotent: only rows with no list yet. No price changes: the reader
-- applies the same rule to the list as it did to the columns (parity is
-- tested in __tests__/lib/vehicle-bands-parity.test.ts).

BEGIN;

ALTER TABLE public.transportation_rates ADD COLUMN IF NOT EXISTS vehicles jsonb;

COMMENT ON COLUMN public.transportation_rates.vehicles IS
  'The vehicles this rate offers: [{key, rate_eur, rate_non_eur, capacity_min, capacity_max}], key = vocabulary vehicle_type key. Absent = not offered. Read via lib/rates/vehicle-bands.ts; legacy <vehicle>_* columns are mirrored for the five presets until retired.';

UPDATE public.transportation_rates r
SET vehicles = (
  SELECT jsonb_agg(
           jsonb_build_object(
             'key', v.key,
             'rate_eur', v.rate,
             'rate_non_eur', v.rate_non_eur,
             'capacity_min', v.cmin,
             'capacity_max', v.cmax)
           ORDER BY v.cmax, v.cmin)
  FROM (VALUES
    ('sedan',   r.sedan_rate_eur,   r.sedan_rate_non_eur,   r.sedan_capacity_min,   r.sedan_capacity_max),
    ('minivan', r.minivan_rate_eur, r.minivan_rate_non_eur, r.minivan_capacity_min, r.minivan_capacity_max),
    ('van',     r.van_rate_eur,     r.van_rate_non_eur,     r.van_capacity_min,     r.van_capacity_max),
    ('minibus', r.minibus_rate_eur, r.minibus_rate_non_eur, r.minibus_capacity_min, r.minibus_capacity_max),
    ('bus',     r.bus_rate_eur,     r.bus_rate_non_eur,     r.bus_capacity_min,     r.bus_capacity_max)
  ) AS v(key, rate, rate_non_eur, cmin, cmax)
  WHERE v.rate IS NOT NULL AND v.rate > 0
)
WHERE r.vehicles IS NULL;

COMMIT;
