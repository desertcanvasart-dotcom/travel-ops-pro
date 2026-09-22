-- 20261030_departure_grid_pricing.sql
-- Columns the departures grid needs on tour_departures.
--
-- WHY: the office prices a departure sheet by hand — per departure date band it
-- records AIR (round-trip air, per person), 燃油 (a fuel surcharge computed
-- OUTSIDE the system, one number), and LND (everything else on the ground),
-- summed to a 合計 gross web rate. Today that sheet uses one FLAT land figure
-- across every date. The grid replaces the hand sheet with the same layout but
-- prices each band at its own date through calculateAutoPricing, which knows
-- hotel/cruise rate periods and ticket seasons. See
-- handover/feature-specs/6-departures-grid-spec.md.
--
-- tour_departures already carries one row per departure (org_id, template_id,
-- start_date, price_per_person, currency) with a UNIQUE (org_id, template_id,
-- start_date), so a band IS a departure row. This migration adds only what the
-- grid needs on top:
--
--   fuel_surcharge_pp  the manual 燃油 number, per person, in `currency`. The
--                      engine never produces it; the operator types it. NULL =
--                      not yet entered (the grid shows the band as needing it
--                      and totals AIR+LND without pretending fuel is priced).
--   flight_class       the booked air class the office wants recorded per
--                      departure (operator asked for it). Free text for now —
--                      one value per departure; if it turns out to be per-leg
--                      that is a later change, not this one.
--
--   air_pp / land_pp / total_pp / priced_at / price_currency
--                      a CACHE of the last engine run, so the grid renders
--                      without re-pricing every date on every load. NEVER the
--                      source of truth: a "Reprice" refreshes them, and any
--                      read that must be current reprices first. Mirrors how a
--                      saved quote caches the calculator's last result.
--
-- Additive and nullable: no existing row changes, no backfill, safe to replay.
-- The cache columns start NULL (nothing priced yet) and priced_at NULL is the
-- signal "this band has never been priced".

BEGIN;

ALTER TABLE public.tour_departures
  ADD COLUMN IF NOT EXISTS fuel_surcharge_pp numeric(10,2),
  ADD COLUMN IF NOT EXISTS flight_class      character varying(100),
  ADD COLUMN IF NOT EXISTS air_pp            numeric(10,2),
  ADD COLUMN IF NOT EXISTS land_pp           numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_pp          numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_currency    character varying(3),
  ADD COLUMN IF NOT EXISTS priced_at         timestamp with time zone;

COMMENT ON COLUMN public.tour_departures.fuel_surcharge_pp IS
  '燃油 fuel surcharge, per person, in `currency`; computed outside the system, entered by the operator. NULL = not yet entered.';
COMMENT ON COLUMN public.tour_departures.flight_class IS
  'Booked air class recorded for the departure (e.g. economy, premium). Free text; one value per departure.';
COMMENT ON COLUMN public.tour_departures.air_pp IS
  'Cache: per-person AIR from the last engine reprice, in price_currency. Not source of truth — refreshed by Reprice.';
COMMENT ON COLUMN public.tour_departures.land_pp IS
  'Cache: per-person LND from the last engine reprice, in price_currency. Not source of truth — refreshed by Reprice.';
COMMENT ON COLUMN public.tour_departures.total_pp IS
  'Cache: per-person 合計 (AIR + 燃油 + LND) from the last reprice, in price_currency. Not source of truth.';
COMMENT ON COLUMN public.tour_departures.price_currency IS
  'Currency the cached air_pp/land_pp/total_pp are expressed in (e.g. JPY). Separate from `currency`, which labels price_per_person.';
COMMENT ON COLUMN public.tour_departures.priced_at IS
  'When the cache columns were last refreshed by a reprice. NULL = never priced.';

-- Self-verify: every column landed on the table.
DO $verify$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'fuel_surcharge_pp','flight_class','air_pp','land_pp','total_pp','price_currency','priced_at'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tour_departures'
      AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'departure grid columns missing after migration: %', missing;
  END IF;
END
$verify$;

COMMIT;
