-- Add destination column to hotel_staff_rates
-- Allows per-city hotel service rates (e.g., different porter rates for Cairo vs Luxor)
-- NULL means "all destinations" (default/fallback rate)
ALTER TABLE hotel_staff_rates
  ADD COLUMN IF NOT EXISTS destination TEXT DEFAULT NULL;

-- Add index for destination-based lookups
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_destination
  ON hotel_staff_rates (destination);

-- Note: hotel_category is a TEXT column, so 'deluxe' is supported without schema changes.
-- No enum alteration needed.

COMMENT ON COLUMN hotel_staff_rates.destination IS 'Egyptian city this rate applies to. NULL means all destinations (fallback).';
