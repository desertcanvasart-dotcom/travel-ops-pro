-- ============================================
-- Migration: Add Cached Pricing Columns to tour_templates
-- File: migrations/add_cached_pricing_columns.sql
--
-- Purpose: Store pre-calculated "starting from" prices
-- to dramatically improve browse page load times.
-- ============================================

-- Add cached pricing columns
ALTER TABLE tour_templates
ADD COLUMN IF NOT EXISTS cached_starting_price DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cached_starting_tier VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cached_price_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for faster queries on cached prices
CREATE INDEX IF NOT EXISTS idx_tour_templates_cached_price
ON tour_templates(cached_starting_price)
WHERE is_active = true;

-- Add a comment explaining the columns
COMMENT ON COLUMN tour_templates.cached_starting_price IS 'Pre-calculated starting from price for browse display';
COMMENT ON COLUMN tour_templates.cached_starting_tier IS 'The tier (budget/standard/deluxe/luxury) of the cached price';
COMMENT ON COLUMN tour_templates.cached_price_updated_at IS 'When the cached price was last calculated';

-- ============================================
-- Initial population of cached prices
-- Run this after adding the columns
-- ============================================

-- You can trigger this via the API: POST /api/tours/recalculate-prices
-- Or run manually in SQL for a quick update based on duration:

UPDATE tour_templates
SET
  cached_starting_price = duration_days * 150,
  cached_starting_tier = 'standard',
  cached_price_updated_at = NOW()
WHERE cached_starting_price IS NULL
  AND is_active = true;
