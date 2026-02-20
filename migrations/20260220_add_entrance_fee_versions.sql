-- ============================================
-- MULTILINGUAL ENTRANCE FEE VERSIONS
-- Migration: Add Entrance Fee Version Table
-- Date: 2026-02-20
-- ============================================
-- Adds per-language versions for attraction names and notes
-- in the entrance_fees (rates) table.
-- ============================================

CREATE TABLE IF NOT EXISTS entrance_fee_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrance_fee_id UUID NOT NULL REFERENCES entrance_fees(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  attraction_name TEXT,
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one version per language per entrance fee
  UNIQUE(entrance_fee_id, language)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entrance_fee_versions_fee_id
  ON entrance_fee_versions(entrance_fee_id);
CREATE INDEX IF NOT EXISTS idx_entrance_fee_versions_language
  ON entrance_fee_versions(language);

-- Auto-update trigger
DROP TRIGGER IF EXISTS update_entrance_fee_versions_updated_at ON entrance_fee_versions;
CREATE TRIGGER update_entrance_fee_versions_updated_at
  BEFORE UPDATE ON entrance_fee_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION COMPLETE
-- Run this in Supabase SQL Editor
-- ============================================
