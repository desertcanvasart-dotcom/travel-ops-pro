-- ============================================
-- TRANSPORTATION RATES RESTRUCTURE
-- Migration: Convert from one-row-per-vehicle to one-row-per-service
-- with tiered vehicle rates (matching b2b_transport_packages pattern)
-- Date: 2026-02-05
-- ============================================

-- 1. Add vehicle-tier rate columns
ALTER TABLE transportation_rates
ADD COLUMN IF NOT EXISTS sedan_rate_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sedan_rate_non_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS minivan_rate_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS minivan_rate_non_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS van_rate_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS van_rate_non_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS minibus_rate_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS minibus_rate_non_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bus_rate_eur NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bus_rate_non_eur NUMERIC(10,2) DEFAULT NULL;

-- 2. Add capacity range columns for each vehicle tier
ALTER TABLE transportation_rates
ADD COLUMN IF NOT EXISTS sedan_capacity_min INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS sedan_capacity_max INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS minivan_capacity_min INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS minivan_capacity_max INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS van_capacity_min INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS van_capacity_max INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS minibus_capacity_min INTEGER DEFAULT 13,
ADD COLUMN IF NOT EXISTS minibus_capacity_max INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS bus_capacity_min INTEGER DEFAULT 21,
ADD COLUMN IF NOT EXISTS bus_capacity_max INTEGER DEFAULT 45;

-- 3. Add route/description fields (like b2b_transport_packages)
ALTER TABLE transportation_rates
ADD COLUMN IF NOT EXISTS route_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS includes TEXT DEFAULT NULL;

-- ============================================
-- 4. DATA MIGRATION
-- Merge vehicle-specific rows into single service rows
-- Strategy: For each group of (service_type, city, origin_city, destination_city, route_name),
--   keep the first row and populate its vehicle-tier columns from the other rows.
-- ============================================

-- Step 4a: Populate vehicle-tier columns from existing vehicle_type + base_rate data
-- Update rows where vehicle_type matches each tier

-- Sedan rates
UPDATE transportation_rates t SET
  sedan_rate_eur = sub.base_rate_eur,
  sedan_rate_non_eur = COALESCE(sub.base_rate_non_eur, sub.base_rate_eur)
FROM transportation_rates sub
WHERE t.id = sub.id
AND LOWER(sub.vehicle_type) IN ('sedan', 'car', 'saloon')
AND sub.sedan_rate_eur IS NULL;

-- Minivan rates
UPDATE transportation_rates t SET
  minivan_rate_eur = sub.base_rate_eur,
  minivan_rate_non_eur = COALESCE(sub.base_rate_non_eur, sub.base_rate_eur)
FROM transportation_rates sub
WHERE t.id = sub.id
AND LOWER(sub.vehicle_type) IN ('minivan', 'mini van', 'mpv')
AND sub.minivan_rate_eur IS NULL;

-- Van rates
UPDATE transportation_rates t SET
  van_rate_eur = sub.base_rate_eur,
  van_rate_non_eur = COALESCE(sub.base_rate_non_eur, sub.base_rate_eur)
FROM transportation_rates sub
WHERE t.id = sub.id
AND LOWER(sub.vehicle_type) IN ('van', 'h1', 'hiace')
AND sub.van_rate_eur IS NULL;

-- Minibus rates
UPDATE transportation_rates t SET
  minibus_rate_eur = sub.base_rate_eur,
  minibus_rate_non_eur = COALESCE(sub.base_rate_non_eur, sub.base_rate_eur)
FROM transportation_rates sub
WHERE t.id = sub.id
AND LOWER(sub.vehicle_type) IN ('minibus', 'mini bus', 'coaster')
AND sub.minibus_rate_eur IS NULL;

-- Bus rates
UPDATE transportation_rates t SET
  bus_rate_eur = sub.base_rate_eur,
  bus_rate_non_eur = COALESCE(sub.base_rate_non_eur, sub.base_rate_eur)
FROM transportation_rates sub
WHERE t.id = sub.id
AND LOWER(sub.vehicle_type) IN ('bus', 'coach')
AND sub.bus_rate_eur IS NULL;

-- Step 4b: For each service group, merge all vehicle rates into one "keeper" row
-- The keeper is the row with the lowest id (or first created)

-- Create a temp table to identify keepers and their siblings
-- Grouping by: service_type, city, origin_city, destination_city, route_name
CREATE TEMP TABLE transport_merge AS
WITH groups AS (
  SELECT
    id,
    COALESCE(service_type, '') AS grp_service_type,
    COALESCE(LOWER(city), '') AS grp_city,
    COALESCE(LOWER(origin_city), '') AS grp_origin,
    COALESCE(LOWER(destination_city), '') AS grp_dest,
    COALESCE(route_name, '') AS grp_route_name,
    LOWER(COALESCE(vehicle_type, '')) AS vtype,
    base_rate_eur,
    base_rate_non_eur,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(service_type, ''), COALESCE(LOWER(city), ''),
                   COALESCE(LOWER(origin_city), ''), COALESCE(LOWER(destination_city), ''),
                   COALESCE(route_name, '')
      ORDER BY created_at, id
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY COALESCE(service_type, ''), COALESCE(LOWER(city), ''),
                   COALESCE(LOWER(origin_city), ''), COALESCE(LOWER(destination_city), ''),
                   COALESCE(route_name, '')
      ORDER BY created_at, id
    ) AS keeper_id
  FROM transportation_rates
)
SELECT * FROM groups;

-- Merge sedan rates into keeper
UPDATE transportation_rates t SET
  sedan_rate_eur = COALESCE(t.sedan_rate_eur, m.base_rate_eur),
  sedan_rate_non_eur = COALESCE(t.sedan_rate_non_eur, m.base_rate_non_eur, m.base_rate_eur)
FROM transport_merge m
WHERE t.id = m.keeper_id
AND m.vtype IN ('sedan', 'car', 'saloon')
AND m.keeper_id != m.id
AND t.sedan_rate_eur IS NULL;

-- Merge minivan rates into keeper
UPDATE transportation_rates t SET
  minivan_rate_eur = COALESCE(t.minivan_rate_eur, m.base_rate_eur),
  minivan_rate_non_eur = COALESCE(t.minivan_rate_non_eur, m.base_rate_non_eur, m.base_rate_eur)
FROM transport_merge m
WHERE t.id = m.keeper_id
AND m.vtype IN ('minivan', 'mini van', 'mpv')
AND m.keeper_id != m.id
AND t.minivan_rate_eur IS NULL;

-- Merge van rates into keeper
UPDATE transportation_rates t SET
  van_rate_eur = COALESCE(t.van_rate_eur, m.base_rate_eur),
  van_rate_non_eur = COALESCE(t.van_rate_non_eur, m.base_rate_non_eur, m.base_rate_eur)
FROM transport_merge m
WHERE t.id = m.keeper_id
AND m.vtype IN ('van', 'h1', 'hiace')
AND m.keeper_id != m.id
AND t.van_rate_eur IS NULL;

-- Merge minibus rates into keeper
UPDATE transportation_rates t SET
  minibus_rate_eur = COALESCE(t.minibus_rate_eur, m.base_rate_eur),
  minibus_rate_non_eur = COALESCE(t.minibus_rate_non_eur, m.base_rate_non_eur, m.base_rate_eur)
FROM transport_merge m
WHERE t.id = m.keeper_id
AND m.vtype IN ('minibus', 'mini bus', 'coaster')
AND m.keeper_id != m.id
AND t.minibus_rate_eur IS NULL;

-- Merge bus rates into keeper
UPDATE transportation_rates t SET
  bus_rate_eur = COALESCE(t.bus_rate_eur, m.base_rate_eur),
  bus_rate_non_eur = COALESCE(t.bus_rate_non_eur, m.base_rate_non_eur, m.base_rate_eur)
FROM transport_merge m
WHERE t.id = m.keeper_id
AND m.vtype IN ('bus', 'coach')
AND m.keeper_id != m.id
AND t.bus_rate_eur IS NULL;

-- Step 4c: Clear vehicle_type on keeper rows (no longer needed)
UPDATE transportation_rates t SET
  vehicle_type = NULL
WHERE id IN (SELECT DISTINCT keeper_id FROM transport_merge);

-- Step 4d: Delete non-keeper rows (they've been merged)
DELETE FROM transportation_rates
WHERE id IN (
  SELECT id FROM transport_merge WHERE id != keeper_id
);

-- Cleanup
DROP TABLE IF EXISTS transport_merge;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
