-- ============================================
-- CRUISE PRICING OVERHAUL
-- Migration: Add cabin_allocation to itineraries, is_cruise_day to itinerary_days
-- Date: 2026-02-05
-- ============================================

-- 1. Add cabin_allocation JSONB to itineraries
-- Stores the chosen cabin mix, e.g.:
-- [{"type": "double", "count": 1, "pax": 2}, {"type": "triple", "count": 1, "pax": 3}]
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS cabin_allocation JSONB DEFAULT NULL;

COMMENT ON COLUMN itineraries.cabin_allocation IS
'Stores the cruise cabin allocation as JSON array. Each entry: {type: "single"|"double"|"triple"|"suite", count: number, pax: number}. NULL for non-cruise itineraries.';

-- 2. Add is_cruise_day to itinerary_days
-- Flags which days are cruise days (for cruise-land hybrid pricing)
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS is_cruise_day BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN itinerary_days.is_cruise_day IS
'When true, this day uses cruise pricing (bundled transport, cruise accommodation) instead of land pricing (individual vehicle, hotel).';

CREATE INDEX IF NOT EXISTS idx_itinerary_days_cruise_day
ON itinerary_days (itinerary_id, is_cruise_day)
WHERE is_cruise_day = TRUE;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
