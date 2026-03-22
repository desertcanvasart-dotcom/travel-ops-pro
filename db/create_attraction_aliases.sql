-- ============================================
-- ATTRACTION ALIASES TABLE
-- Maps alternative names to canonical DB names
-- so the AI and pricing system always match.
-- ============================================

-- Create the aliases table
CREATE TABLE IF NOT EXISTS attraction_aliases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_name TEXT NOT NULL,          -- Exact name in entrance_fees.attraction_name or activity_rates.activity_name
  alias TEXT NOT NULL,                   -- Alternative name (e.g., "Temple of Horus" for "Edfu Temple")
  source_table TEXT NOT NULL DEFAULT 'entrance_fees',  -- 'entrance_fees' or 'activity_rates'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate aliases
  UNIQUE(alias)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_attraction_aliases_alias ON attraction_aliases(lower(alias)) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_attraction_aliases_canonical ON attraction_aliases(lower(canonical_name)) WHERE is_active = true;

-- Enable RLS
ALTER TABLE attraction_aliases ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read" ON attraction_aliases
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to manage
CREATE POLICY "Allow authenticated insert" ON attraction_aliases
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON attraction_aliases
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete" ON attraction_aliases
  FOR DELETE TO authenticated USING (true);

-- Allow service role full access (for API routes)
CREATE POLICY "Allow service role full access" ON attraction_aliases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- SEED: Common aliases for Egyptian attractions
-- These map well-known alternative names to
-- the canonical names in your entrance_fees table.
-- ============================================

INSERT INTO attraction_aliases (canonical_name, alias, source_table) VALUES
  -- Giza Plateau (combined ticket covers Pyramids + Sphinx)
  ('Giza Plateau', 'Pyramids of Giza', 'entrance_fees'),
  ('Giza Plateau', 'Pyramids', 'entrance_fees'),
  ('Giza Plateau', 'Great Pyramids', 'entrance_fees'),
  ('Giza Plateau', 'Giza Pyramids', 'entrance_fees'),
  ('Giza Plateau', 'Sphinx', 'entrance_fees'),
  ('Giza Plateau', 'Great Sphinx', 'entrance_fees'),
  ('Giza Plateau', 'Pyramid of Cheops', 'entrance_fees'),
  ('Giza Plateau', 'Pyramid of Khufu', 'entrance_fees'),

  -- Grand Egyptian Museum
  ('Grand Egyptian Museum', 'GEM', 'entrance_fees'),
  ('Grand Egyptian Museum', 'New Grand Egyptian Museum', 'entrance_fees'),
  ('Grand Egyptian Museum', 'Giza Museum', 'entrance_fees'),

  -- Egyptian Museum
  ('Egyptian Museum', 'Cairo Museum', 'entrance_fees'),
  ('Egyptian Museum', 'Museum of Egyptian Antiquities', 'entrance_fees'),

  -- Edfu Temple (also known as Temple of Horus)
  ('Edfu Temple', 'Temple of Horus', 'entrance_fees'),
  ('Edfu Temple', 'Horus Temple', 'entrance_fees'),
  ('Edfu Temple', 'Temple of Edfu', 'entrance_fees'),

  -- Hatshepsut Temple
  ('Hatshepsut Temple', 'Temple of Hatshepsut', 'entrance_fees'),
  ('Hatshepsut Temple', 'Deir el-Bahari', 'entrance_fees'),
  ('Hatshepsut Temple', 'Deir el Bahari', 'entrance_fees'),
  ('Hatshepsut Temple', 'Mortuary Temple of Hatshepsut', 'entrance_fees'),

  -- Karnak Temple
  ('Karnak Temple', 'Karnak Temple Complex', 'entrance_fees'),
  ('Karnak Temple', 'Temple of Karnak', 'entrance_fees'),
  ('Karnak Temple', 'Karnak', 'entrance_fees'),

  -- Luxor Temple
  ('Luxor Temple', 'Temple of Luxor', 'entrance_fees'),

  -- Valley of the Kings
  ('Valley of the Kings', 'Valley of Kings', 'entrance_fees'),
  ('Valley of the Kings', 'Kings Valley', 'entrance_fees'),
  ('Valley of the Kings', 'Royal Tombs', 'entrance_fees'),

  -- Philae Temple
  ('Philae Temple', 'Temple of Isis', 'entrance_fees'),
  ('Philae Temple', 'Temple of Philae', 'entrance_fees'),
  ('Philae Temple', 'Isis Temple', 'entrance_fees'),
  ('Philae Temple', 'Philae', 'entrance_fees'),

  -- Kom Ombo Temple
  ('Kom Ombo Temple', 'Temple of Kom Ombo', 'entrance_fees'),
  ('Kom Ombo Temple', 'Kom Ombo', 'entrance_fees'),
  ('Kom Ombo Temple', 'Temple of Sobek', 'entrance_fees'),

  -- Aswan High Dam
  ('Aswan High Dam', 'High Dam', 'entrance_fees'),
  ('Aswan High Dam', 'Aswan Dam', 'entrance_fees'),

  -- Abu Simbel
  ('Abu Simbel', 'Abu Simbel Temples', 'entrance_fees'),
  ('Abu Simbel', 'Temple of Abu Simbel', 'entrance_fees'),
  ('Abu Simbel', 'Temple of Ramesses II', 'entrance_fees'),

  -- Saladin Citadel
  ('Saladin Citadel', 'Citadel', 'entrance_fees'),
  ('Saladin Citadel', 'Cairo Citadel', 'entrance_fees'),
  ('Saladin Citadel', 'Citadel of Saladin', 'entrance_fees'),

  -- Khan El Khalili
  ('Khan El Khalili', 'Khan el-Khalili', 'entrance_fees'),
  ('Khan El Khalili', 'Khan el Khalili Bazaar', 'entrance_fees'),
  ('Khan El Khalili', 'Khan al-Khalili', 'entrance_fees'),

  -- Colossi of Memnon
  ('Colossi of Memnon', 'Memnon Colossi', 'entrance_fees'),
  ('Colossi of Memnon', 'Colossus of Memnon', 'entrance_fees'),

  -- Unfinished Obelisk
  ('Unfinished Obelisk', 'The Unfinished Obelisk', 'entrance_fees'),

  -- Nubian Village
  ('Nubian Village', 'Nubian Village Visit', 'entrance_fees'),

  -- Alexandria
  ('Qaitbay Citadel', 'Fort Qaitbay', 'entrance_fees'),
  ('Qaitbay Citadel', 'Citadel of Qaitbay', 'entrance_fees'),
  ("Pompey's Pillar", 'Pompey Pillar', 'entrance_fees'),

  -- Catacombs
  ('Catacombs of Kom El Shoqafa', 'Kom El Shoqafa', 'entrance_fees'),
  ('Catacombs of Kom El Shoqafa', 'Catacombs', 'entrance_fees')

ON CONFLICT (alias) DO NOTHING;
