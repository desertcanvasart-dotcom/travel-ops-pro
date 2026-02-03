-- ============================================
-- MULTILINGUAL CONTENT SYSTEM
-- Migration: Add Language Version Tables
-- Date: 2026-02-03
-- ============================================

-- ============================================
-- 1. ITINERARY VERSIONS
-- Stores language-specific content for itineraries
-- ============================================

CREATE TABLE IF NOT EXISTS itinerary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  trip_name TEXT NOT NULL,
  notes TEXT,
  pickup_location TEXT,
  guide_notes TEXT,
  vehicle_notes TEXT,

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one version per language per itinerary
  UNIQUE(itinerary_id, language)
);

-- ============================================
-- 2. ITINERARY DAY VERSIONS
-- Stores language-specific content for each day
-- ============================================

CREATE TABLE IF NOT EXISTS itinerary_day_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  title TEXT,
  description TEXT,
  city TEXT,
  overnight_city TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(itinerary_day_id, language)
);

-- ============================================
-- 3. TOUR TEMPLATE VERSIONS
-- Stores language-specific content for tour templates
-- ============================================

CREATE TABLE IF NOT EXISTS tour_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES tour_templates(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  template_name TEXT NOT NULL,
  short_description TEXT,
  long_description TEXT,
  highlights TEXT[],
  main_attractions TEXT[],
  best_for TEXT[],
  inclusions TEXT[],
  exclusions TEXT[],
  itinerary JSONB,  -- Day-by-day descriptions: [{day: 1, title: "", description: "", meals: []}]

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(template_id, language)
);

-- ============================================
-- 4. TOUR VARIATION VERSIONS
-- Stores language-specific content for tour variations
-- ============================================

CREATE TABLE IF NOT EXISTS tour_variation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id UUID NOT NULL REFERENCES tour_variations(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  variation_name TEXT NOT NULL,
  inclusions TEXT[],
  exclusions TEXT[],
  optional_extras TEXT[],

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(variation_id, language)
);

-- ============================================
-- 5. QUOTE VERSIONS
-- Stores language-specific content for B2B quotes
-- ============================================

CREATE TABLE IF NOT EXISTS quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES b2b_quotes(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  title TEXT,
  notes TEXT,
  terms_conditions TEXT,
  special_requests TEXT,

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(quote_id, language)
);

-- ============================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================

-- Itinerary versions
CREATE INDEX IF NOT EXISTS idx_itinerary_versions_itinerary_id
  ON itinerary_versions(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_versions_language
  ON itinerary_versions(language);

-- Itinerary day versions
CREATE INDEX IF NOT EXISTS idx_itinerary_day_versions_day_id
  ON itinerary_day_versions(itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_day_versions_language
  ON itinerary_day_versions(language);

-- Tour template versions
CREATE INDEX IF NOT EXISTS idx_tour_template_versions_template_id
  ON tour_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_tour_template_versions_language
  ON tour_template_versions(language);

-- Tour variation versions
CREATE INDEX IF NOT EXISTS idx_tour_variation_versions_variation_id
  ON tour_variation_versions(variation_id);
CREATE INDEX IF NOT EXISTS idx_tour_variation_versions_language
  ON tour_variation_versions(language);

-- Quote versions
CREATE INDEX IF NOT EXISTS idx_quote_versions_quote_id
  ON quote_versions(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_versions_language
  ON quote_versions(language);

-- ============================================
-- 7. UPDATED_AT TRIGGERS
-- Automatically update updated_at on changes
-- ============================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for each version table
DROP TRIGGER IF EXISTS update_itinerary_versions_updated_at ON itinerary_versions;
CREATE TRIGGER update_itinerary_versions_updated_at
  BEFORE UPDATE ON itinerary_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_itinerary_day_versions_updated_at ON itinerary_day_versions;
CREATE TRIGGER update_itinerary_day_versions_updated_at
  BEFORE UPDATE ON itinerary_day_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tour_template_versions_updated_at ON tour_template_versions;
CREATE TRIGGER update_tour_template_versions_updated_at
  BEFORE UPDATE ON tour_template_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tour_variation_versions_updated_at ON tour_variation_versions;
CREATE TRIGGER update_tour_variation_versions_updated_at
  BEFORE UPDATE ON tour_variation_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quote_versions_updated_at ON quote_versions;
CREATE TRIGGER update_quote_versions_updated_at
  BEFORE UPDATE ON quote_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. VIEWS FOR EASY QUERYING
-- Get entities with their available languages
-- ============================================

-- View: Itineraries with available languages
CREATE OR REPLACE VIEW itineraries_with_languages AS
SELECT
  i.*,
  COALESCE(ARRAY_AGG(DISTINCT iv.language) FILTER (WHERE iv.language IS NOT NULL), ARRAY[]::VARCHAR[]) AS available_languages,
  COUNT(DISTINCT iv.language) AS version_count
FROM itineraries i
LEFT JOIN itinerary_versions iv ON i.id = iv.itinerary_id
GROUP BY i.id;

-- View: Tour templates with available languages
CREATE OR REPLACE VIEW tour_templates_with_languages AS
SELECT
  t.*,
  COALESCE(ARRAY_AGG(DISTINCT tv.language) FILTER (WHERE tv.language IS NOT NULL), ARRAY[]::VARCHAR[]) AS available_languages,
  COUNT(DISTINCT tv.language) AS version_count
FROM tour_templates t
LEFT JOIN tour_template_versions tv ON t.id = tv.template_id
GROUP BY t.id;

-- View: Quotes with available languages
CREATE OR REPLACE VIEW quotes_with_languages AS
SELECT
  q.*,
  COALESCE(ARRAY_AGG(DISTINCT qv.language) FILTER (WHERE qv.language IS NOT NULL), ARRAY[]::VARCHAR[]) AS available_languages,
  COUNT(DISTINCT qv.language) AS version_count
FROM b2b_quotes q
LEFT JOIN quote_versions qv ON q.id = qv.quote_id
GROUP BY q.id;

-- ============================================
-- MIGRATION COMPLETE
-- Next: Run data migration to populate EN versions
-- ============================================
