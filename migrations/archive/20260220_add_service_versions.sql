-- ============================================
-- MULTILINGUAL SERVICE VERSIONS
-- Migration: Add Service Version Table
-- Date: 2026-02-20
-- ============================================
-- Adds per-language versions for itinerary service names and notes,
-- following the same pattern as itinerary_day_versions.
-- ============================================

-- ============================================
-- 1. ITINERARY SERVICE VERSIONS
-- Stores language-specific content for services
-- (service_name, notes)
-- ============================================

CREATE TABLE IF NOT EXISTS itinerary_service_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_service_id UUID NOT NULL REFERENCES itinerary_services(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  service_name TEXT,
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one version per language per service
  UNIQUE(itinerary_service_id, language)
);

-- ============================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_itinerary_service_versions_service_id
  ON itinerary_service_versions(itinerary_service_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_service_versions_language
  ON itinerary_service_versions(language);

-- ============================================
-- 3. UPDATED_AT TRIGGER
-- Automatically update updated_at on changes
-- ============================================

DROP TRIGGER IF EXISTS update_itinerary_service_versions_updated_at ON itinerary_service_versions;
CREATE TRIGGER update_itinerary_service_versions_updated_at
  BEFORE UPDATE ON itinerary_service_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION COMPLETE
-- Run this in Supabase SQL Editor
-- ============================================
