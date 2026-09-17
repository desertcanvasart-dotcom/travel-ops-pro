-- ============================================
-- A road transfer says what shape of trip it is
-- ============================================
-- Operator, 2026-09-17: the same road route costs differently one way, there
-- and back the same day, and going one day and driving back the next. The
-- rate sheet said so only in route NAMES (…-ONEWAY, …-OVER-DAY, …-SAME-DAY,
-- …-RETURN, …-OVERNIGHT, …-NEXT-DAY-RETURN) — pricing never reads names — and
-- the 2026-09-16 sheet import folded the office's own day_trip / overnight
-- types into one. Marsa Alam → Aswan exists both OVERNIGHT and OVER-DAY with
-- nothing pricing could tell apart.
--
-- trip_shape on road transfers (intercity, intercity_with_sightseeing):
--   one_way | same_day_return | overnight_return
-- Other transport types leave it NULL. Pricing finds a road transfer by
-- departure → destination → shape (lib/pricing/road-trips).
--
-- Existing rows are filled from their names, by the meanings the operator
-- confirmed: OVERNIGHT or NEXT-DAY-RETURN = overnight return (checked first,
-- as NEXT-DAY-RETURN contains RETURN); OVER-DAY, SAME-DAY or RETURN = same-day
-- return; anything else = one way, which is how every such row has priced.
BEGIN;

ALTER TABLE public.transportation_rates
  ADD COLUMN IF NOT EXISTS trip_shape text;

DO $shape$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.transportation_rates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%trip_shape%'
  ) THEN
    ALTER TABLE public.transportation_rates
      ADD CONSTRAINT transportation_rates_trip_shape_check
      CHECK (trip_shape IS NULL OR trip_shape IN ('one_way', 'same_day_return', 'overnight_return'));
  END IF;
END
$shape$;

UPDATE public.transportation_rates
SET trip_shape = CASE
    WHEN upper(coalesce(service_code, '') || ' ' || coalesce(route_name, '')) ~ '(NEXT-DAY-RETURN|OVERNIGHT)' THEN 'overnight_return'
    WHEN upper(coalesce(service_code, '') || ' ' || coalesce(route_name, '')) ~ '(OVER-DAY|SAME-DAY|RETURN)' THEN 'same_day_return'
    ELSE 'one_way'
  END
WHERE service_type IN ('intercity', 'intercity_with_sightseeing')
  AND trip_shape IS NULL;

COMMENT ON COLUMN public.transportation_rates.trip_shape IS
  'Road transfers only: one_way | same_day_return | overnight_return. Pricing matches a road transfer by departure (city/origin_city) → destination_city → trip_shape.';

COMMIT;
