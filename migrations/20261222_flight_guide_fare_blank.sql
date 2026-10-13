-- ============================================
-- A flight period's blank guide fare is blank again, not 0
-- ============================================
-- Rates → Flights promises "Guide fare: blank = the guide pays the customer
-- rate; 0 = rides free". Since flights took dated periods (20261025) every
-- save went through the generic period sanitizer, which writes 0 for any
-- blank field — right for a FARE (0 prices as a hole), wrong for the guide's
-- seat: the editor removed the number when the box was cleared, the server
-- put 0 back, and the first period's 0 was mirrored onto the guide_rate
-- column. Pricing read that 0 as "the airline carries him", so a throughout
-- guide's flight cost nothing on every fare where nobody typed a guide price.
--
-- The save paths now store a blank guide fare as null (lib/rates/flight-write)
-- and pricing reads null as "the customer fare" (lib/rates/ticket-guide-fare).
-- This turns the 0s those saves left behind back into blanks.
--
-- A 0 stored by a period save cannot be told from a 0 somebody typed: both
-- arrived as 0. Every one is read as blank, because the blank was the form's
-- default and a free seat is the rare case — and pricing a seat the guide
-- does not pay for errs on the side of a quote that covers its costs, where
-- the opposite reading under-quoted every trip. A fare that really carries the
-- guide free shows a blank guide box afterwards and is re-entered as 0.
--
-- Rows from before periods (20261025 built their single period with
-- jsonb_strip_nulls, so a blank stayed absent) and rows without periods are
-- not touched.

BEGIN;

UPDATE public.flight_rates AS f
SET seasons = (
  SELECT jsonb_agg(
           CASE
             WHEN jsonb_typeof(e.p -> 'rates') = 'object'
              AND (e.p -> 'rates' -> 'guide_rate') = '0'::jsonb
             THEN jsonb_set(e.p, '{rates,guide_rate}', 'null'::jsonb)
             ELSE e.p
           END
           ORDER BY e.ord)
  FROM jsonb_array_elements(f.seasons) WITH ORDINALITY AS e(p, ord)
)
WHERE jsonb_typeof(f.seasons) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(f.seasons) AS x(p)
    WHERE jsonb_typeof(x.p -> 'rates') = 'object'
      AND (x.p -> 'rates' -> 'guide_rate') = '0'::jsonb
  );

-- The column is the first period's mirror on a row with periods.
UPDATE public.flight_rates
SET guide_rate = NULL
WHERE guide_rate = 0
  AND jsonb_typeof(seasons) = 'array';

COMMIT;
