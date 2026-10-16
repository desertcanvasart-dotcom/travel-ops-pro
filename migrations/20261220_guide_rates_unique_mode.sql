-- ============================================
-- guide_rates: the natural key carries the guide mode and the validity period
-- ============================================
-- uq_guide_rates_natural_key (20261206) is
--
--   (org_id, supplier, guide_language, guide_type, tour_duration, city)
--
-- 20261018 added guide_rates.guide_mode (spot / throughout) and the engine
-- prices a throughout quote ONLY from throughout rows — but the index was
-- never re-created with the mode. So a "Japanese / Egyptologist / Full day /
-- Luxor / Throughout" rate beside the same Spot rate passed the create
-- route's own duplicate check (which does include the mode) and then died on
-- the index with 23505: "Internal server error", and the operator could not
-- enter the one rate a throughout quote needs (Rates audit, Guides & Services
-- #4). Switching an existing rate's mode on edit failed the same way.
--
-- The create routes now also let one service hold more than one validity
-- period (next year's price beside this year's; #5). The index has to agree,
-- or the second period is the same 23505. So the key becomes
--
--   (org_id, supplier, guide_language, guide_type, tour_duration, city,
--    guide_mode, rate_valid_from, rate_valid_to)
--
-- with blank supplier / city / dates read as one identity each (COALESCE), as
-- before.
--
-- Existing data cannot violate the new index: it only ADDS columns to the
-- old key, so any two rows equal on the new key were already equal on the
-- old one, which the old index refused. The guard below checks anyway (an
-- index dropped by hand would have let duplicates in) and stops with the
-- query to find them rather than half-applying.
--
-- Idempotent (DROP IF EXISTS, then CREATE) and guarded on the table and the
-- guide_mode column existing.
BEGIN;

DO $$
DECLARE
  dupes integer;
BEGIN
  IF to_regclass('public.guide_rates') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guide_rates' AND column_name = 'guide_mode'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT 1
    FROM public.guide_rates
    -- A NULL tour_duration never collides in a unique index (NULLs are distinct).
    WHERE tour_duration IS NOT NULL
    GROUP BY org_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language,
             guide_type, tour_duration, COALESCE(city, ''::character varying), guide_mode,
             COALESCE(rate_valid_from, '-infinity'::date), COALESCE(rate_valid_to, 'infinity'::date)
    HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'guide_rates has % duplicate natural key(s); find them with: SELECT org_id, supplier_id, guide_language, guide_type, tour_duration, city, guide_mode, rate_valid_from, rate_valid_to, count(*) FROM public.guide_rates GROUP BY 1,2,3,4,5,6,7,8,9 HAVING count(*) > 1', dupes;
  END IF;

  DROP INDEX IF EXISTS public.uq_guide_rates_natural_key;
  CREATE UNIQUE INDEX uq_guide_rates_natural_key ON public.guide_rates (
    org_id,
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    guide_language,
    guide_type,
    tour_duration,
    COALESCE(city, ''::character varying),
    guide_mode,
    COALESCE(rate_valid_from, '-infinity'::date),
    COALESCE(rate_valid_to, 'infinity'::date)
  );
END
$$;

COMMIT;
