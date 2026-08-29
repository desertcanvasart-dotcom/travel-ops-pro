-- Migration: Add preferred_language column to users table
-- Run this in Supabase SQL editor

-- Add the column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'preferred_language'
    ) THEN
        ALTER TABLE users ADD COLUMN preferred_language VARCHAR(5) DEFAULT 'en';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN users.preferred_language IS 'User preferred UI language (en = English, ja = Japanese)';

-- Create index for faster lookups (optional, but recommended for larger user bases)
CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON users(preferred_language);

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'preferred_language';
