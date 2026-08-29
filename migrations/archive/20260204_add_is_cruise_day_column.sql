-- Migration: Add is_cruise_day column to variation_daily_itinerary
-- Purpose: Flag days that use bundled Nile Cruise transport packages
-- When true: Uses cruise transport package pricing instead of individual vehicle costs
-- Package includes: car, horse carriage, felucca, motorboat transfers

-- Add is_cruise_day column to variation_daily_itinerary table
ALTER TABLE variation_daily_itinerary
ADD COLUMN IF NOT EXISTS is_cruise_day BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN variation_daily_itinerary.is_cruise_day IS
'When true, this day uses bundled cruise transport package pricing instead of individual vehicle costs. Package includes car, horse carriage, felucca, and motorboat transfers.';

-- Update index for efficient querying of cruise days
CREATE INDEX IF NOT EXISTS idx_variation_daily_itinerary_cruise_day
ON variation_daily_itinerary (variation_id, is_cruise_day)
WHERE is_cruise_day = TRUE;
