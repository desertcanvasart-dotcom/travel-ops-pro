-- ============================================
-- A flight fare gets dated periods, the way a hotel's does
-- ============================================
-- Operator, 2026-09-19: "the validity period — it's only one period, which
-- does not serve the purpose we are trying to achieve. We need to be able to
-- add more than one period, maybe up to five or maybe six, like the hotels."
--
-- flight_rates carried ONE window per row (rate_valid_from / rate_valid_to),
-- so a route sold across four seasons meant four near-identical rows: same
-- airline, same flight number, same cabin, same baggage, retyped, with only
-- the dates and the fare different. Migration 20261023's work made that
-- correct — only one row is valid on a date — but correct is not the same as
-- workable, and it is not what the contract looks like.
--
-- A contract looks like a hotel's: one flight, several dated periods, a fare
-- in each. So flights take the shape the rate periods were built in
-- (20260826_rate_seasons): an ordered JSONB array, each entry a real dated
-- window carrying its own complete rate set, capped at MAX_RATE_PERIODS.
--
-- The season WORD on each period is a vocabulary key (Settings → Vocabulary →
-- Rate seasons), which is how the agency gets to say "Golden Week" and "Obon"
-- rather than a fixed Low/High/Peak nobody outside Egypt uses. The shared
-- RateSeasonsEditor already reads that vocabulary — flights get it by using
-- the same component, not by growing their own copy.
--
-- rate_valid_from / rate_valid_to / season / the base fare columns STAY, and
-- are mirrored from the FIRST period on every save (legacyColumnMirror). They
-- are what the date-less readers take — the pricing grid, the CSV export —
-- exactly as the hotels' base columns are. They are a copy, never a fallback:
-- a date no period covers is an unpriced hole, not the first period's price.

BEGIN;

ALTER TABLE public.flight_rates
  ADD COLUMN IF NOT EXISTS seasons JSONB;

COMMENT ON COLUMN public.flight_rates.seasons IS
  'Ordered list of dated rate periods, each {name, season, from, to, rates}. '
  'rates carries RATE_FIELDS.flight (base_rate_eur, tax_eur, base_rate_non_eur, '
  'tax_non_eur, guide_rate). At most MAX_RATE_PERIODS entries; a save over the '
  'limit is REFUSED, never truncated. The row''s own rate_valid_from/to and '
  'fare columns mirror the FIRST period for date-less readers. See '
  'lib/rates/rate-seasons.ts.';

-- Existing rows become ONE period from the window they already had, so an
-- unedited fare prices exactly as it did. Done in SQL rather than left to
-- seasonsFromFlightColumns so the CSV export and the grid see it too.
UPDATE public.flight_rates
SET seasons = jsonb_build_array(jsonb_build_object(
      'name', COALESCE(season, ''),
      'season', COALESCE(season, ''),
      'from', COALESCE(to_char(rate_valid_from, 'YYYY-MM-DD'), '1900-01-01'),
      'to',   COALESCE(to_char(rate_valid_to,   'YYYY-MM-DD'), '2099-12-31'),
      'rates', jsonb_strip_nulls(jsonb_build_object(
        'base_rate_eur',     base_rate_eur,
        'tax_eur',           tax_eur,
        'base_rate_non_eur', base_rate_non_eur,
        'tax_non_eur',       tax_non_eur,
        'guide_rate',        guide_rate
      ))
    ))
WHERE seasons IS NULL
  AND base_rate_eur IS NOT NULL;

COMMIT;
