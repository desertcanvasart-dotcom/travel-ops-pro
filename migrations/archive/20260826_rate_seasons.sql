-- ============================================
-- Unlimited supplier rate periods for hotels and Nile cruises
-- ============================================
-- Both catalogs carried exactly three hardcoded price levels (low/high/peak)
-- and four date windows — peak got a second window, nothing else did. Real
-- contracts do not fit that: the operator reports six or more dated periods,
-- and how many there are depends on the property. A hotel that prices April,
-- May–September, October–19 December, Christmas/New Year and 6 January–March
-- has five periods and five different rates, and there was nowhere to put the
-- last two.
--
-- `seasons` is an ordered JSONB array of dated periods, each carrying its own
-- complete rate set — the same shape as activity_rates.tiers:
--   [{"name":"High Season","from":"2026-10-01","to":"2026-12-19","rates":{...}}]
--
-- REAL DATES, NOT MONTH-DAY. detectCruiseSeason compared month-day only, so a
-- window entered for one contract year silently applied to every year after
-- it. Contracts are re-issued annually with moved dates; the period a date
-- falls in must be answerable from the contract, not from a wrapped month-day.
--
-- The rates object is entity-specific, matching that catalog's existing column
-- names minus the season prefix:
--   accommodation_rates → pp_double_eur, single_supp_eur, triple_red_eur
--                         (+ the _non_eur trio)
--   nile_cruises        → single_eur, double_eur, triple_eur, suite_eur
--                         (+ the _non_eur quartet)
--
-- The legacy per-season columns are NOT dropped. They still feed the bulk
-- CSV importer and every consumer that reads a base rate off the row, and the
-- rates UI keeps the first period mirrored back onto them. This migration only
-- adds a superset; nothing that reads the old columns changes behaviour.
--
-- Idempotent: safe to run twice.

ALTER TABLE public.accommodation_rates
  ADD COLUMN IF NOT EXISTS seasons JSONB;

ALTER TABLE public.nile_cruises
  ADD COLUMN IF NOT EXISTS seasons JSONB;

COMMENT ON COLUMN public.accommodation_rates.seasons IS
  'Ordered dated rate periods: [{name,from,to,rates:{pp_double_eur,single_supp_eur,triple_red_eur,pp_double_non_eur,single_supp_non_eur,triple_red_non_eur}}]. Real dates including the year. Supersedes the low_/high_/peak_ column triples, which are retained for the bulk importer and legacy readers.';

COMMENT ON COLUMN public.nile_cruises.seasons IS
  'Ordered dated rate periods: [{name,from,to,rates:{single_eur,double_eur,triple_eur,suite_eur,single_non_eur,double_non_eur,triple_non_eur,suite_non_eur}}]. Real dates including the year. Supersedes the rate_low_/rate_high_/rate_peak_ column sets, which are retained for the bulk importer and legacy readers.';

-- ── Backfill: every existing window becomes a period, carrying the rates that
--    window already priced at. A window with no dates entered is skipped — it
--    was never priceable. The two peak windows become two periods sharing the
--    same peak rates, which is exactly what they meant.
--    `WHERE seasons IS NULL` keeps a re-run from clobbering edited periods.

UPDATE public.accommodation_rates AS r
SET seasons = periods.arr
FROM (
  SELECT
    a.id,
    jsonb_agg(p.season ORDER BY p.season ->> 'from') AS arr
  FROM public.accommodation_rates a
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'name', 'Low Season',
      'from', a.low_season_from,
      'to',   a.low_season_to,
      'rates', jsonb_build_object(
        'pp_double_eur',       COALESCE(a.pp_double_eur, 0),
        'single_supp_eur',     COALESCE(a.single_supp_eur, 0),
        'triple_red_eur',      COALESCE(a.triple_red_eur, 0),
        'pp_double_non_eur',   COALESCE(a.pp_double_non_eur, 0),
        'single_supp_non_eur', COALESCE(a.single_supp_non_eur, 0),
        'triple_red_non_eur',  COALESCE(a.triple_red_non_eur, 0)
      )
    ) AS season
    WHERE a.low_season_from IS NOT NULL AND a.low_season_to IS NOT NULL

    UNION ALL
    SELECT jsonb_build_object(
      'name', 'High Season',
      'from', a.high_season_from,
      'to',   a.high_season_to,
      'rates', jsonb_build_object(
        'pp_double_eur',       COALESCE(a.high_pp_double_eur, 0),
        'single_supp_eur',     COALESCE(a.high_single_supp_eur, 0),
        'triple_red_eur',      COALESCE(a.high_triple_red_eur, 0),
        'pp_double_non_eur',   COALESCE(a.high_pp_double_non_eur, 0),
        'single_supp_non_eur', COALESCE(a.high_single_supp_non_eur, 0),
        'triple_red_non_eur',  COALESCE(a.high_triple_red_non_eur, 0)
      )
    )
    WHERE a.high_season_from IS NOT NULL AND a.high_season_to IS NOT NULL

    UNION ALL
    SELECT jsonb_build_object(
      'name', 'Peak Season',
      'from', a.peak_season_from,
      'to',   a.peak_season_to,
      'rates', jsonb_build_object(
        'pp_double_eur',       COALESCE(a.peak_pp_double_eur, 0),
        'single_supp_eur',     COALESCE(a.peak_single_supp_eur, 0),
        'triple_red_eur',      COALESCE(a.peak_triple_red_eur, 0),
        'pp_double_non_eur',   COALESCE(a.peak_pp_double_non_eur, 0),
        'single_supp_non_eur', COALESCE(a.peak_single_supp_non_eur, 0),
        'triple_red_non_eur',  COALESCE(a.peak_triple_red_non_eur, 0)
      )
    )
    WHERE a.peak_season_from IS NOT NULL AND a.peak_season_to IS NOT NULL

    UNION ALL
    SELECT jsonb_build_object(
      'name', 'Peak Season 2',
      'from', a.peak_season_2_from,
      'to',   a.peak_season_2_to,
      'rates', jsonb_build_object(
        'pp_double_eur',       COALESCE(a.peak_pp_double_eur, 0),
        'single_supp_eur',     COALESCE(a.peak_single_supp_eur, 0),
        'triple_red_eur',      COALESCE(a.peak_triple_red_eur, 0),
        'pp_double_non_eur',   COALESCE(a.peak_pp_double_non_eur, 0),
        'single_supp_non_eur', COALESCE(a.peak_single_supp_non_eur, 0),
        'triple_red_non_eur',  COALESCE(a.peak_triple_red_non_eur, 0)
      )
    )
    WHERE a.peak_season_2_from IS NOT NULL AND a.peak_season_2_to IS NOT NULL
  ) AS p
  WHERE a.seasons IS NULL
  GROUP BY a.id
) AS periods
WHERE r.id = periods.id AND r.seasons IS NULL;

UPDATE public.nile_cruises AS r
SET seasons = periods.arr
FROM (
  SELECT
    c.id,
    jsonb_agg(p.season ORDER BY p.season ->> 'from') AS arr
  FROM public.nile_cruises c
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'name', 'Low Season',
      'from', c.low_season_start,
      'to',   c.low_season_end,
      'rates', jsonb_build_object(
        'single_eur',     COALESCE(c.rate_low_single_eur, 0),
        'double_eur',     COALESCE(c.rate_low_double_eur, 0),
        'triple_eur',     COALESCE(c.rate_low_triple_eur, 0),
        'suite_eur',      COALESCE(c.rate_low_suite_eur, 0),
        'single_non_eur', COALESCE(c.rate_low_single_non_eur, 0),
        'double_non_eur', COALESCE(c.rate_low_double_non_eur, 0),
        'triple_non_eur', COALESCE(c.rate_low_triple_non_eur, 0),
        'suite_non_eur',  COALESCE(c.rate_low_suite_non_eur, 0)
      )
    ) AS season
    WHERE c.low_season_start IS NOT NULL AND c.low_season_end IS NOT NULL

    UNION ALL
    SELECT jsonb_build_object(
      'name', 'High Season',
      'from', c.high_season_start,
      'to',   c.high_season_end,
      'rates', jsonb_build_object(
        'single_eur',     COALESCE(c.rate_high_single_eur, 0),
        'double_eur',     COALESCE(c.rate_high_double_eur, 0),
        'triple_eur',     COALESCE(c.rate_high_triple_eur, 0),
        'suite_eur',      COALESCE(c.rate_high_suite_eur, 0),
        'single_non_eur', COALESCE(c.rate_high_single_non_eur, 0),
        'double_non_eur', COALESCE(c.rate_high_double_non_eur, 0),
        'triple_non_eur', COALESCE(c.rate_high_triple_non_eur, 0),
        'suite_non_eur',  COALESCE(c.rate_high_suite_non_eur, 0)
      )
    )
    WHERE c.high_season_start IS NOT NULL AND c.high_season_end IS NOT NULL

    UNION ALL
    SELECT jsonb_build_object(
      'name', 'Peak Season',
      'from', c.peak_season_1_start,
      'to',   c.peak_season_1_end,
      'rates', jsonb_build_object(
        'single_eur',     COALESCE(c.rate_peak_single_eur, 0),
        'double_eur',     COALESCE(c.rate_peak_double_eur, 0),
        'triple_eur',     COALESCE(c.rate_peak_triple_eur, 0),
        'suite_eur',      COALESCE(c.rate_peak_suite_eur, 0),
        'single_non_eur', COALESCE(c.rate_peak_single_non_eur, 0),
        'double_non_eur', COALESCE(c.rate_peak_double_non_eur, 0),
        'triple_non_eur', COALESCE(c.rate_peak_triple_non_eur, 0),
        'suite_non_eur',  COALESCE(c.rate_peak_suite_non_eur, 0)
      )
    )
    WHERE c.peak_season_1_start IS NOT NULL AND c.peak_season_1_end IS NOT NULL

    UNION ALL
    SELECT jsonb_build_object(
      'name', 'Peak Season 2',
      'from', c.peak_season_2_start,
      'to',   c.peak_season_2_end,
      'rates', jsonb_build_object(
        'single_eur',     COALESCE(c.rate_peak_single_eur, 0),
        'double_eur',     COALESCE(c.rate_peak_double_eur, 0),
        'triple_eur',     COALESCE(c.rate_peak_triple_eur, 0),
        'suite_eur',      COALESCE(c.rate_peak_suite_eur, 0),
        'single_non_eur', COALESCE(c.rate_peak_single_non_eur, 0),
        'double_non_eur', COALESCE(c.rate_peak_double_non_eur, 0),
        'triple_non_eur', COALESCE(c.rate_peak_triple_non_eur, 0),
        'suite_non_eur',  COALESCE(c.rate_peak_suite_non_eur, 0)
      )
    )
    WHERE c.peak_season_2_start IS NOT NULL AND c.peak_season_2_end IS NOT NULL
  ) AS p
  WHERE c.seasons IS NULL
  GROUP BY c.id
) AS periods
WHERE r.id = periods.id AND r.seasons IS NULL;
