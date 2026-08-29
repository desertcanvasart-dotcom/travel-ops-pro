-- ============================================
-- Add inclusions/exclusions to itinerary_versions table
-- Enables per-language versioning for inclusions/exclusions
-- (base itineraries table keeps English as source of truth)
-- ============================================

ALTER TABLE itinerary_versions
ADD COLUMN IF NOT EXISTS inclusions TEXT[],
ADD COLUMN IF NOT EXISTS exclusions TEXT[];

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
