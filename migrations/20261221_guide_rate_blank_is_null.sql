-- ============================================
-- A blank throughout-guide rate is NULL, never 0
-- ============================================
-- Every dated rate period carries `guide_rate`: the throughout guide's
-- per-night bed (hotels, ships) or seat (flights). The editor leaves it out
-- when the box is blank, and the save path (lib/rates/rate-seasons
-- sanitizeSeasons) wrote it back as 0 — so blank and 0 became the same
-- number once stored:
--
--   hotels / ships  the hint says "Blank = not given (flagged); 0 = the
--                   supplier gives it free", but the engine had to treat 0
--                   as a hole, so a free bed could not be recorded.
--   flights         the hint says "Blank = the guide pays the customer
--                   fare", but the stored 0 priced the guide's seat at
--                   nothing — every throughout-guide flight under-quoted.
--
-- From now on the save path keeps a blank guide rate OUT of the period, and
-- 0 is stored only when 0 was typed. Existing rows cannot tell the two
-- apart, so every stored 0 is read as the blank it almost always was:
--
--   accommodation_rates / nile_cruises  seasons[].rates.guide_rate = 0 is
--       removed. Pricing is IDENTICAL to before — 0 was already a hole —
--       and a deliberately free bed is entered again as 0.
--   flight_rates  seasons[].rates.guide_rate = 0 is removed and the mirrored
--       guide_rate column 0 becomes NULL: the guide's seat now costs the
--       customer fare, the hint's promise. A seat the airline really gives
--       free is entered again as 0. (Over-quoting a free seat shows on the
--       quote; under-quoting every guide seat did not.)
--
-- Replay-safe: each table guarded with to_regclass, and a second run finds
-- no 0 left to remove.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.drop_zero_guide_rate(seasons jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN jsonb_typeof(s) = 'object'
        AND jsonb_typeof(s -> 'rates') = 'object'
        AND jsonb_typeof(s -> 'rates' -> 'guide_rate') = 'number'
        AND (s -> 'rates' ->> 'guide_rate')::numeric = 0
      THEN jsonb_set(s, '{rates}', (s -> 'rates') - 'guide_rate')
      ELSE s
    END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(seasons) WITH ORDINALITY AS t(s, ord)
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_zero_guide_rate(seasons jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(seasons) AS s
    WHERE jsonb_typeof(s) = 'object'
      AND jsonb_typeof(s -> 'rates') = 'object'
      AND jsonb_typeof(s -> 'rates' -> 'guide_rate') = 'number'
      AND (s -> 'rates' ->> 'guide_rate')::numeric = 0
  )
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accommodation_rates', 'nile_cruises', 'flight_rates'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = 'seasons') THEN
      EXECUTE format(
        'UPDATE public.%I SET seasons = pg_temp.drop_zero_guide_rate(seasons)
           WHERE jsonb_typeof(seasons) = ''array'' AND pg_temp.has_zero_guide_rate(seasons)', t);
    END IF;
  END LOOP;

  IF to_regclass('public.flight_rates') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'flight_rates' AND column_name = 'guide_rate') THEN
    UPDATE public.flight_rates SET guide_rate = NULL WHERE guide_rate = 0;
  END IF;
END $$;

COMMIT;
