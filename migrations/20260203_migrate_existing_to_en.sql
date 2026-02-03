-- ============================================
-- MULTILINGUAL CONTENT SYSTEM
-- Migration: Populate English Versions from Existing Data
-- Date: 2026-02-03
-- Run AFTER: 20260203_add_language_versions.sql
-- ============================================

-- ============================================
-- 1. MIGRATE ITINERARIES TO EN VERSIONS
-- ============================================

INSERT INTO itinerary_versions (
  itinerary_id,
  language,
  trip_name,
  notes,
  pickup_location,
  guide_notes,
  vehicle_notes,
  created_at,
  updated_at
)
SELECT
  id AS itinerary_id,
  'en' AS language,
  COALESCE(trip_name, 'Untitled Trip') AS trip_name,
  notes,
  pickup_location,
  guide_notes,
  vehicle_notes,
  created_at,
  COALESCE(updated_at, NOW())
FROM itineraries
WHERE NOT EXISTS (
  SELECT 1 FROM itinerary_versions iv
  WHERE iv.itinerary_id = itineraries.id AND iv.language = 'en'
);

-- ============================================
-- 2. MIGRATE ITINERARY DAYS TO EN VERSIONS
-- ============================================

INSERT INTO itinerary_day_versions (
  itinerary_day_id,
  language,
  title,
  description,
  city,
  overnight_city,
  created_at,
  updated_at
)
SELECT
  id AS itinerary_day_id,
  'en' AS language,
  title,
  description,
  city,
  overnight_city,
  created_at,
  COALESCE(updated_at, NOW())
FROM itinerary_days
WHERE NOT EXISTS (
  SELECT 1 FROM itinerary_day_versions idv
  WHERE idv.itinerary_day_id = itinerary_days.id AND idv.language = 'en'
);

-- ============================================
-- 3. MIGRATE TOUR TEMPLATES TO EN VERSIONS
-- ============================================

INSERT INTO tour_template_versions (
  template_id,
  language,
  template_name,
  short_description,
  long_description,
  highlights,
  main_attractions,
  best_for,
  inclusions,
  exclusions,
  itinerary,
  created_at,
  updated_at
)
SELECT
  id AS template_id,
  'en' AS language,
  COALESCE(template_name, 'Untitled Tour') AS template_name,
  short_description,
  long_description,
  highlights,
  main_attractions,
  best_for,
  inclusions,
  exclusions,
  itinerary,
  created_at,
  COALESCE(updated_at, NOW())
FROM tour_templates
WHERE NOT EXISTS (
  SELECT 1 FROM tour_template_versions ttv
  WHERE ttv.template_id = tour_templates.id AND ttv.language = 'en'
);

-- ============================================
-- 4. MIGRATE TOUR VARIATIONS TO EN VERSIONS
-- ============================================

INSERT INTO tour_variation_versions (
  variation_id,
  language,
  variation_name,
  inclusions,
  exclusions,
  optional_extras,
  created_at,
  updated_at
)
SELECT
  id AS variation_id,
  'en' AS language,
  COALESCE(variation_name, 'Default Variation') AS variation_name,
  inclusions,
  exclusions,
  optional_extras,
  created_at,
  COALESCE(updated_at, NOW())
FROM tour_variations
WHERE NOT EXISTS (
  SELECT 1 FROM tour_variation_versions tvv
  WHERE tvv.variation_id = tour_variations.id AND tvv.language = 'en'
);

-- ============================================
-- 5. MIGRATE TOUR QUOTES TO EN VERSIONS
-- ============================================

INSERT INTO quote_versions (
  quote_id,
  language,
  title,
  notes,
  created_at,
  updated_at
)
SELECT
  id AS quote_id,
  'en' AS language,
  -- Generate title from tour variation if available
  COALESCE(
    (SELECT tv.variation_name || ' - Quote ' || q.quote_number
     FROM tour_variations tv
     WHERE tv.id = q.variation_id),
    'Quote ' || quote_number
  ) AS title,
  notes,
  created_at,
  COALESCE(updated_at, NOW())
FROM tour_quotes q
WHERE NOT EXISTS (
  SELECT 1 FROM quote_versions qv
  WHERE qv.quote_id = q.id AND qv.language = 'en'
);

-- ============================================
-- 6. VERIFICATION QUERIES
-- Run these to verify the migration worked
-- ============================================

-- Check itinerary versions count
-- SELECT 'Itinerary Versions' as table_name, COUNT(*) as count FROM itinerary_versions WHERE language = 'en';

-- Check itinerary day versions count
-- SELECT 'Itinerary Day Versions' as table_name, COUNT(*) as count FROM itinerary_day_versions WHERE language = 'en';

-- Check tour template versions count
-- SELECT 'Tour Template Versions' as table_name, COUNT(*) as count FROM tour_template_versions WHERE language = 'en';

-- Check tour variation versions count
-- SELECT 'Tour Variation Versions' as table_name, COUNT(*) as count FROM tour_variation_versions WHERE language = 'en';

-- Check quote versions count
-- SELECT 'Quote Versions' as table_name, COUNT(*) as count FROM quote_versions WHERE language = 'en';

-- ============================================
-- MIGRATION COMPLETE
-- All existing content now has English versions
-- ============================================
