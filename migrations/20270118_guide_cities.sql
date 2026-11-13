-- ============================================
-- The cities a guide works in belong to the GUIDE, not to each rate
-- ============================================
-- Operator, 2026-11-13: a guide charges the same wherever they guide, and
-- one guide works several cities (a Cairo guide also does Alexandria; one
-- guide covers Luxor and Aswan). 20270117 put the city LIST on every
-- guide_rates row, so a guide with four rates (half day, full day, spot,
-- throughout) carried the same list four times, the natural key only saw
-- the first city, and two rates could cover the same city at once.
--
-- Now:
--   supplier_cities   one row per (supplier, city) — the cities a supplier
--                     works in. Today the pricing engine reads it for
--                     guides (lib/guides/guide-cities). No rows = works in
--                     every city, which is what a rate with no city meant.
--   guide_rates       the PRICE only: language, grade, duration, mode,
--                     validity. city / cities are no longer written or read
--                     (kept in this release so the running build keeps
--                     working during the deploy; a later migration drops
--                     them). The natural key loses city.
--
-- City values are bare city NAMES, as on every rate table — the city
-- vocabulary (destination_cities, or the built-in list on an install
-- without it) is matched by name everywhere in the app.
--
-- Backfill: every guide gets the cities its rates named (20270117's list,
-- or the single city on an older row) — EXCEPT a guide with any rate that
-- named no city: that guide already worked in every city, so it gets no rows.
-- No guide_rates row is UPDATEd (the rate audit trigger would send every
-- member a rate-change digest for a change nobody made).
--
-- Idempotent: CREATE IF NOT EXISTS, backfill ON CONFLICT DO NOTHING, the
-- index swap guarded.
BEGIN;

CREATE TABLE IF NOT EXISTS public.supplier_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  city text NOT NULL CHECK (btrim(city) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_cities_supplier_city
  ON public.supplier_cities (supplier_id, lower(btrim(city)));
CREATE INDEX IF NOT EXISTS idx_supplier_cities_org_city
  ON public.supplier_cities (org_id, lower(btrim(city)));

COMMENT ON TABLE public.supplier_cities IS
  'The cities a supplier works in (one row per city); no rows = every city. Read for guides by lib/guides/guide-cities.';

-- Server-side only, like every company table the app reads through the
-- service-role client.
ALTER TABLE public.supplier_cities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_cities FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.supplier_cities TO service_role;

-- Backfill from the rates (guarded: an install without 20270117's column
-- reads the single city).
DO $$
DECLARE
  has_cities boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guide_rates' AND column_name = 'cities'
  );
BEGIN
  IF to_regclass('public.guide_rates') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format($q$
    WITH named AS (
      SELECT gr.supplier_id,
             COALESCE(s.org_id, gr.org_id) AS org_id,
             btrim(c) AS city
        FROM public.guide_rates gr
        JOIN public.suppliers s ON s.id = gr.supplier_id
        CROSS JOIN LATERAL unnest(%s) AS c
       WHERE gr.supplier_id IS NOT NULL
    ),
    every_city AS (
      -- A guide with a rate naming no city already worked everywhere.
      SELECT DISTINCT gr.supplier_id
        FROM public.guide_rates gr
       WHERE gr.supplier_id IS NOT NULL
         AND NULLIF(btrim(gr.city), '') IS NULL
         %s
    )
    INSERT INTO public.supplier_cities (org_id, supplier_id, city)
    SELECT DISTINCT ON (n.supplier_id, lower(n.city)) n.org_id, n.supplier_id, n.city
      FROM named n
     WHERE n.city IS NOT NULL AND n.city <> ''
       AND n.org_id IS NOT NULL
       AND n.supplier_id NOT IN (SELECT supplier_id FROM every_city)
     ORDER BY n.supplier_id, lower(n.city)
    ON CONFLICT DO NOTHING
  $q$,
    CASE WHEN has_cities
      THEN $e$CASE WHEN cardinality(gr.cities) > 0 THEN gr.cities ELSE ARRAY[gr.city::text] END$e$
      ELSE $e$ARRAY[gr.city::text]$e$ END,
    CASE WHEN has_cities THEN 'AND cardinality(gr.cities) = 0' ELSE '' END
  );
END
$$;

-- The natural key without city: a guide's price is the same in every city,
-- so two rates differing only by city are the same rate. An install that
-- still holds such per-city copies keeps the old key (the app's own
-- duplicate check already ignores city) and is told how to find them.
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
    WHERE tour_duration IS NOT NULL
    GROUP BY org_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language,
             guide_type, tour_duration, guide_mode,
             COALESCE(rate_valid_from, '-infinity'::date), COALESCE(rate_valid_to, 'infinity'::date)
    HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE NOTICE 'guide_rates: % rate(s) differ only by city; natural key left WITH city. Find them with: SELECT org_id, supplier_id, guide_language, guide_type, tour_duration, guide_mode, rate_valid_from, rate_valid_to, count(*) FROM public.guide_rates GROUP BY 1,2,3,4,5,6,7,8 HAVING count(*) > 1', dupes;
    RETURN;
  END IF;

  DROP INDEX IF EXISTS public.uq_guide_rates_natural_key;
  CREATE UNIQUE INDEX uq_guide_rates_natural_key ON public.guide_rates (
    org_id,
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    guide_language,
    guide_type,
    tour_duration,
    guide_mode,
    COALESCE(rate_valid_from, '-infinity'::date),
    COALESCE(rate_valid_to, 'infinity'::date)
  );
END
$$;

COMMENT ON COLUMN public.guide_rates.city IS
  'RETIRED 20270118: not written or read; the cities a guide works in are supplier_cities. Dropped by a later migration.';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guide_rates' AND column_name = 'cities'
  ) THEN
    COMMENT ON COLUMN public.guide_rates.cities IS
      'RETIRED 20270118: not written or read; the cities a guide works in are supplier_cities. Dropped by a later migration.';
  END IF;
END
$$;

COMMIT;
