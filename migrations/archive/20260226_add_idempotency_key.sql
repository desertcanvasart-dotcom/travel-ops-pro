-- ============================================
-- Add idempotency_key to itineraries table
-- Prevents duplicate itinerary creation from double-clicks or retries
-- ============================================

-- Add the column (nullable, so existing rows are unaffected)
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Partial unique index: only enforce uniqueness on non-null values
CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_idempotency_key
  ON itineraries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN itineraries.idempotency_key IS 'Client-generated UUID to prevent duplicate itinerary creation from retries or double-clicks';
