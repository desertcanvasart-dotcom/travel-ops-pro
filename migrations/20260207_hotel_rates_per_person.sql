-- ============================================
-- HOTEL RATES: Per-Person Pricing Migration
-- Convert from per-room (single/double/triple/suite)
-- to per-person (pp_double, single_supp, triple_red)
-- Date: 2026-02-07
-- ============================================

-- 1. Add Low Season per-person columns
ALTER TABLE accommodation_rates
ADD COLUMN IF NOT EXISTS pp_double_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS single_supp_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS triple_red_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pp_double_non_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS single_supp_non_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS triple_red_non_eur NUMERIC(10,2) DEFAULT 0;

-- 2. Add High Season per-person columns
ALTER TABLE accommodation_rates
ADD COLUMN IF NOT EXISTS high_pp_double_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS high_single_supp_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS high_triple_red_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS high_pp_double_non_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS high_single_supp_non_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS high_triple_red_non_eur NUMERIC(10,2) DEFAULT 0;

-- 3. Add Peak Season per-person columns
ALTER TABLE accommodation_rates
ADD COLUMN IF NOT EXISTS peak_pp_double_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_single_supp_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_triple_red_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_pp_double_non_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_single_supp_non_eur NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_triple_red_non_eur NUMERIC(10,2) DEFAULT 0;

-- 4. DATA MIGRATION: Derive per-person values from existing per-room rates
-- Formula: pp_double = double_rate / 2
--          single_supp = single_rate - pp_double
--          triple_red = pp_double - (triple_rate / 3)

-- Low Season EUR
UPDATE accommodation_rates SET
  pp_double_eur = COALESCE(double_rate_eur, 0) / 2,
  single_supp_eur = GREATEST(0, COALESCE(single_rate_eur, 0) - (COALESCE(double_rate_eur, 0) / 2)),
  triple_red_eur = GREATEST(0, (COALESCE(double_rate_eur, 0) / 2) - (COALESCE(triple_rate_eur, 0) / 3))
WHERE pp_double_eur = 0 AND COALESCE(double_rate_eur, 0) > 0;

-- Low Season Non-EUR
UPDATE accommodation_rates SET
  pp_double_non_eur = COALESCE(double_rate_non_eur, 0) / 2,
  single_supp_non_eur = GREATEST(0, COALESCE(single_rate_non_eur, 0) - (COALESCE(double_rate_non_eur, 0) / 2)),
  triple_red_non_eur = GREATEST(0, (COALESCE(double_rate_non_eur, 0) / 2) - (COALESCE(triple_rate_non_eur, 0) / 3))
WHERE pp_double_non_eur = 0 AND COALESCE(double_rate_non_eur, 0) > 0;

-- High Season EUR
UPDATE accommodation_rates SET
  high_pp_double_eur = COALESCE(high_season_double_eur, 0) / 2,
  high_single_supp_eur = GREATEST(0, COALESCE(high_season_single_eur, 0) - (COALESCE(high_season_double_eur, 0) / 2)),
  high_triple_red_eur = GREATEST(0, (COALESCE(high_season_double_eur, 0) / 2) - (COALESCE(high_season_triple_eur, 0) / 3))
WHERE high_pp_double_eur = 0 AND COALESCE(high_season_double_eur, 0) > 0;

-- High Season Non-EUR
UPDATE accommodation_rates SET
  high_pp_double_non_eur = COALESCE(high_season_double_non_eur, 0) / 2,
  high_single_supp_non_eur = GREATEST(0, COALESCE(high_season_single_non_eur, 0) - (COALESCE(high_season_double_non_eur, 0) / 2)),
  high_triple_red_non_eur = GREATEST(0, (COALESCE(high_season_double_non_eur, 0) / 2) - (COALESCE(high_season_triple_non_eur, 0) / 3))
WHERE high_pp_double_non_eur = 0 AND COALESCE(high_season_double_non_eur, 0) > 0;

-- Peak Season EUR
UPDATE accommodation_rates SET
  peak_pp_double_eur = COALESCE(peak_season_double_eur, 0) / 2,
  peak_single_supp_eur = GREATEST(0, COALESCE(peak_season_single_eur, 0) - (COALESCE(peak_season_double_eur, 0) / 2)),
  peak_triple_red_eur = GREATEST(0, (COALESCE(peak_season_double_eur, 0) / 2) - (COALESCE(peak_season_triple_eur, 0) / 3))
WHERE peak_pp_double_eur = 0 AND COALESCE(peak_season_double_eur, 0) > 0;

-- Peak Season Non-EUR
UPDATE accommodation_rates SET
  peak_pp_double_non_eur = COALESCE(peak_season_double_non_eur, 0) / 2,
  peak_single_supp_non_eur = GREATEST(0, COALESCE(peak_season_single_non_eur, 0) - (COALESCE(peak_season_double_non_eur, 0) / 2)),
  peak_triple_red_non_eur = GREATEST(0, (COALESCE(peak_season_double_non_eur, 0) / 2) - (COALESCE(peak_season_triple_non_eur, 0) / 3))
WHERE peak_pp_double_non_eur = 0 AND COALESCE(peak_season_double_non_eur, 0) > 0;

-- ============================================
-- MIGRATION COMPLETE
-- Old columns kept for backward compatibility
-- ============================================
