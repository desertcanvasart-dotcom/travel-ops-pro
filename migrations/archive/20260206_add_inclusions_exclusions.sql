-- ============================================
-- Add inclusions and exclusions to itineraries table
-- Stores what's included and not included in the tour package
-- ============================================

-- Add inclusions column (array of text items)
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS inclusions TEXT[] DEFAULT ARRAY[
  'Private transportation throughout: all airport transfers',
  'Licensed private guiding: Egyptologist-naturalist for sightseeing',
  'Entrance fees to all sites listed',
  'Accommodation as specified in the itinerary',
  'Curated lunches in clean, reliable restaurants',
  'Tips for drivers, porters, and hotel concierge',
  'All taxes and service charges'
]::TEXT[];

-- Add exclusions column (array of text items)
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS exclusions TEXT[] DEFAULT ARRAY[
  'International flights',
  'Meals not specified in the itinerary',
  'Gratuities for your guide (appreciated but not obligatory)',
  'Travel insurance',
  'Personal expenses',
  'Visa fees (if applicable)',
  'Optional activities not mentioned in the itinerary'
]::TEXT[];

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
