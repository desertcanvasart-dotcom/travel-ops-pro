-- ============================================
-- FIX LEGACY CONSTRAINTS ON transportation_rates
-- The restructure migration added tiered vehicle columns but left
-- NOT NULL constraints and unique key on legacy columns that are
-- no longer used by the application.
-- Date: 2026-02-06
-- ============================================

-- 1. Drop NOT NULL on legacy rate columns (tiered columns are used now)
ALTER TABLE transportation_rates ALTER COLUMN base_rate_eur DROP NOT NULL;
ALTER TABLE transportation_rates ALTER COLUMN base_rate_non_eur DROP NOT NULL;

-- 2. Drop unique constraint on service_code
--    (service codes can repeat across different service configurations)
ALTER TABLE transportation_rates DROP CONSTRAINT IF EXISTS transportation_rates_service_code_key;

-- 3. Drop NOT NULL on legacy single-vehicle columns if they exist
ALTER TABLE transportation_rates ALTER COLUMN vehicle_type DROP NOT NULL;
ALTER TABLE transportation_rates ALTER COLUMN capacity_min DROP NOT NULL;
ALTER TABLE transportation_rates ALTER COLUMN capacity_max DROP NOT NULL;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
