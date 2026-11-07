-- ============================================
-- One guide rate, several cities
-- ============================================
-- The operator, 2026-11-07: a guide rate could name one city, but a Cairo
-- guide also works Alexandria, one guide covers Luxor and Aswan together,
-- and some guides work every city.
--
-- guide_rates.cities is the list a rate covers; an empty list is "All
-- cities" (what a rate with no city always meant). `city` stays, holding the
-- list's first city, so the natural key (uq_guide_rates_natural_key), CSV
-- and every reader of `city` are unchanged. Pricing reads the list
-- (lib/guides/guide-cities, lib/pricing/service-rates pickGuideRate).
--
-- Backfill: every existing rate covers exactly the city it names.

BEGIN;

ALTER TABLE public.guide_rates
  ADD COLUMN IF NOT EXISTS cities text[] NOT NULL DEFAULT '{}';

UPDATE public.guide_rates
   SET cities = ARRAY[btrim(city)::text]
 WHERE cardinality(cities) = 0
   AND city IS NOT NULL
   AND btrim(city) <> '';

COMMENT ON COLUMN public.guide_rates.cities IS
  'Every city this guide rate covers; empty = all cities. city holds the first one (lib/guides/guide-cities).';

COMMIT;
