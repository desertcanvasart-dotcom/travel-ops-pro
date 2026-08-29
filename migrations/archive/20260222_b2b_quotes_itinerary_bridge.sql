-- ============================================
-- B2B Quotes: Bridge WhatsApp-parsed itineraries to B2B Quotes
--
-- Changes:
-- 1. Make variation_id nullable (quotes can now come from itineraries)
-- 2. Add itinerary_id FK to link WhatsApp-parsed itineraries
-- 3. Add trip_name for display when no template exists
-- 4. Add source column to distinguish quote origin
-- 5. Add CHECK constraint: must have either variation_id or itinerary_id
-- ============================================

-- Step 1: Make variation_id nullable
ALTER TABLE tour_quotes ALTER COLUMN variation_id DROP NOT NULL;

-- Step 2: Add itinerary_id column
ALTER TABLE tour_quotes ADD COLUMN IF NOT EXISTS itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL;

-- Step 3: Add trip_name column
ALTER TABLE tour_quotes ADD COLUMN IF NOT EXISTS trip_name TEXT;

-- Step 4: Add source column
ALTER TABLE tour_quotes ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'b2b_template';

-- Step 5: Index on itinerary_id
CREATE INDEX IF NOT EXISTS idx_tour_quotes_itinerary_id ON tour_quotes(itinerary_id);

-- Step 6: CHECK constraint ensuring at least one source
ALTER TABLE tour_quotes ADD CONSTRAINT tour_quotes_source_check
  CHECK (variation_id IS NOT NULL OR itinerary_id IS NOT NULL);
