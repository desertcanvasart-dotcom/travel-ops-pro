-- 20261105_departure_class_fares.sql
-- The departures grid sells three flight classes side by side, each with its
-- own published website rate (operator, 2026-10-01).
--
--   air_pp                     (existing) the ECONOMY international fare, per
--                              person, typed by the office.
--   air_business_pp            the business fare, per person.
--   air_oneway_business_pp     business one way, economy the other.
--   web_price_economy          the website rate the office typed for each
--   web_price_business         class. NULL = publish the suggestion: the
--   web_price_oneway_business  total rounded up to end in 999
--                              (lib/pricing/departure-buckets websiteRate).
--
-- NULL fare = that class is not sold / not priced yet for the date. 燃油
-- (fuel_surcharge_pp) stays one number: it is the same whatever the class.
-- flight_class (a free-text label) is no longer shown; the column stays.
--
-- Additive and nullable: no existing row changes, safe to replay.

BEGIN;

ALTER TABLE public.tour_departures
  ADD COLUMN IF NOT EXISTS air_business_pp           numeric(12,2),
  ADD COLUMN IF NOT EXISTS air_oneway_business_pp    numeric(12,2),
  ADD COLUMN IF NOT EXISTS web_price_economy         numeric(12,2),
  ADD COLUMN IF NOT EXISTS web_price_business        numeric(12,2),
  ADD COLUMN IF NOT EXISTS web_price_oneway_business numeric(12,2);

COMMENT ON COLUMN public.tour_departures.air_pp IS
  'Economy international AIR fare, per person, typed by the office in the grid''s target currency. NULL = not entered.';
COMMENT ON COLUMN public.tour_departures.air_business_pp IS
  'Business international AIR fare, per person. NULL = not sold / not entered.';
COMMENT ON COLUMN public.tour_departures.air_oneway_business_pp IS
  'Business one way (economy the other way) AIR fare, per person. NULL = not sold / not entered.';
COMMENT ON COLUMN public.tour_departures.web_price_economy IS
  'Website rate typed for economy. NULL = the total rounded up to end in 999.';
COMMENT ON COLUMN public.tour_departures.web_price_business IS
  'Website rate typed for business. NULL = the total rounded up to end in 999.';
COMMENT ON COLUMN public.tour_departures.web_price_oneway_business IS
  'Website rate typed for one-way business. NULL = the total rounded up to end in 999.';

DO $verify$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'air_business_pp','air_oneway_business_pp',
    'web_price_economy','web_price_business','web_price_oneway_business'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tour_departures' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'departure class fare columns missing after migration: %', missing;
  END IF;
END
$verify$;

COMMIT;
