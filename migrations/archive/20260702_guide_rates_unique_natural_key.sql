-- Enforce the guide_rates natural key at the schema level:
-- (supplier_id, guide_language, guide_type, tour_duration, city).
--
-- Background: POST /api/rates/guides upserts by this key. Before 2026-07-02 the
-- dedup check omitted supplier_id, so saving a rate for a second guide in the
-- same city/language/duration silently overwrote the first guide's row. The
-- route is fixed; this index makes that class of silent overwrite impossible.
--
-- city and supplier_id are nullable. The route treats NULL as a single distinct
-- value (.is('city', null) / .is('supplier_id', null)), so the index uses
-- COALESCE sentinels to make NULLs collide instead of Postgres' default
-- NULLs-are-distinct behavior.

-- Step 1: remove any duplicate rows that already violate the key, keeping the
-- most recently updated row per key. Duplicates are unreachable by the app
-- (the route always reads/updates the first match), so this is safe.
DO $$
DECLARE
  removed integer;
BEGIN
  WITH ranked AS (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY
               COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
               guide_language,
               guide_type,
               tour_duration,
               COALESCE(city, '')
             ORDER BY updated_at DESC NULLS LAST, ctid
           ) AS rn
    FROM guide_rates
  )
  DELETE FROM guide_rates
  WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed > 0 THEN
    RAISE NOTICE 'guide_rates: removed % duplicate row(s) before adding unique index', removed;
  END IF;
END $$;

-- Step 2: unique index on the natural key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_guide_rates_natural_key
  ON guide_rates (
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    guide_language,
    guide_type,
    tour_duration,
    COALESCE(city, '')
  );

-- Same bug existed in POST /api/rates/activities (activity_rates keyed by
-- activity_name + city only, also fixed 2026-07-02). Same treatment here.
-- lower(activity_name) because the route matches the name with ilike.
DO $$
DECLARE
  removed integer;
BEGIN
  WITH ranked AS (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY
               COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
               lower(activity_name),
               COALESCE(city, '')
             ORDER BY updated_at DESC NULLS LAST, ctid
           ) AS rn
    FROM activity_rates
  )
  DELETE FROM activity_rates
  WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed > 0 THEN
    RAISE NOTICE 'activity_rates: removed % duplicate row(s) before adding unique index', removed;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_rates_natural_key
  ON activity_rates (
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(activity_name),
    COALESCE(city, '')
  );

-- transportation_rates had the same route-level bug (also fixed 2026-07-02),
-- but its natural key is conditional (intercity rows key on origin+destination,
-- local rows on city+duration+area per the isIntercityType() list in code), so
-- it can't be expressed as one unique index here. The route-level supplier_id
-- check is the enforcement for that table.
