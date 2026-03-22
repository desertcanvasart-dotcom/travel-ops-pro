-- Add generation_warnings column to itineraries table
-- Stores pricing/service warnings from itinerary generation for visibility
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS generation_warnings JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN itineraries.generation_warnings IS 'Array of warning strings from itinerary generation (missing rates, unmatched attractions, etc.)';
