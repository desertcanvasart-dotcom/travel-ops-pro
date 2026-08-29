-- Add num_infants column to itineraries table
-- For tracking infant passengers (ages 0-3) who get FREE pricing except flights

ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS num_infants INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN itineraries.num_infants IS 'Number of infant passengers (ages 0-3). Infants are FREE except for flight costs.';
