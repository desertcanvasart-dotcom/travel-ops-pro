-- ============================================
-- The destination becomes data — Phase 1 schema
-- ============================================
-- The pricing engine has always been destination-agnostic (rates key on
-- free-text city; the cost taxonomy is universal). What was hardcoded is the
-- VOCABULARY: a 45-city Egypt list in code and i18n, coordinates in a
-- constants file, Egypt framing in the AI prompts. This migration moves the
-- vocabulary into data. Plan: docs/plans/multi-destination.md.
--
-- destinations            one row per country the agency operates
--   generation_brief      Phase 2: per-destination AI framing (NULL for now)
--   glossary              Phase 2: per-destination travel abbreviations
-- destination_cities      cities per destination, with coordinates, a
--                         Japanese display label, and free-text aliases
--
-- destination_id is added NULLABLE to itineraries (backfilled to Egypt —
-- every existing itinerary IS an Egypt itinerary) and to the three
-- generation-content tables, where NULL means "applies to every destination"
-- so global house-style writing rules stay global.
--
-- Egypt and its 45 cities are seeded from the code's own lists
-- (lib/constants/egypt-cities.ts, egypt-city-coordinates.ts, and the
-- tourBuilder.cities Japanese labels) — behaviour identical by construction
-- until a second destination is added.
--
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.destinations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ja TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  generation_brief TEXT,
  glossary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.destination_cities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  destination_id UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ja TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  lat NUMERIC,
  lng NUMERIC,
  airport_codes TEXT[] NOT NULL DEFAULT '{}',
  timezone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (destination_id, name)
);

CREATE INDEX IF NOT EXISTS idx_destination_cities_destination
  ON public.destination_cities(destination_id) WHERE is_active;

-- Scoping columns. NULLABLE everywhere; NULL = pre-migration meaning.
ALTER TABLE public.itineraries        ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES public.destinations(id);
ALTER TABLE public.writing_rules      ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES public.destinations(id);
ALTER TABLE public.content_library    ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES public.destinations(id);
ALTER TABLE public.attraction_aliases ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES public.destinations(id);

-- RLS: reference data, readable by any signed-in user (the departments
-- pattern); writes go through the service-role API.
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destination_cities ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'destinations' AND policyname = 'destinations_read') THEN
    CREATE POLICY destinations_read ON public.destinations FOR SELECT TO authenticated USING (true);
    CREATE POLICY destinations_service ON public.destinations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'destination_cities' AND policyname = 'destination_cities_read') THEN
    CREATE POLICY destination_cities_read ON public.destination_cities FOR SELECT TO authenticated USING (true);
    CREATE POLICY destination_cities_service ON public.destination_cities FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Seed: Egypt, the default destination ──
INSERT INTO public.destinations (country_code, name, name_ja, is_default)
VALUES ('EG', 'Egypt', 'エジプト', true)
ON CONFLICT (country_code) DO NOTHING;

INSERT INTO public.destination_cities (destination_id, name, name_ja, lat, lng, sort_order)
SELECT d.id, v.name, v.name_ja, v.lat::numeric, v.lng::numeric, v.sort_order
FROM public.destinations d,
  (VALUES
    ('Abu Simbel', 'アブ・シンベル', 22.3372, 31.6258, 1),
    ('Abydos', 'アビドス', 26.1852, 31.9190, 2),
    ('Alamein', 'アラメイン', 30.8340, 28.9564, 3),
    ('Alexandria', 'アレクサンドリア', 31.2001, 29.9187, 4),
    ('Aswan', 'アスワン', 24.0889, 32.8998, 5),
    ('Asyut', 'アシュート', 27.1809, 31.1837, 6),
    ('Bahariya', 'バハレイヤ', 28.3486, 28.8628, 7),
    ('Beni Suef', 'ベニ・スエフ', 29.0661, 31.0994, 8),
    ('Cairo', 'カイロ', 30.0444, 31.2357, 9),
    ('Dahab', 'ダハブ', 28.5007, 34.5133, 10),
    ('Dakhla', 'ダフラ', 25.4948, 29.0009, 11),
    ('Dendera', 'デンデラ', 26.1424, 32.6700, 12),
    ('Edfu', 'エドフ', 24.9779, 32.8734, 13),
    ('El Arish', 'エル・アリーシュ', 31.1311, 33.7956, 14),
    ('El Balyana', 'エル・バルヤナ', 26.2350, 31.8994, 15),
    ('El Gouna', 'エル・グーナ', 27.1827, 33.6807, 16),
    ('El Quseir', 'エル・クセイル', 26.1000, 34.2800, 17),
    ('El Tor', 'エル・トール', 28.2406, 33.6192, 18),
    ('Esna', 'エスナ', 25.2919, 32.5540, 19),
    ('Farafra', 'ファラフラ', 27.0568, 27.9700, 20),
    ('Fayoum', 'ファイユーム', 29.3084, 30.8428, 21),
    ('Giza', 'ギザ', 30.0131, 31.2089, 22),
    ('Hurghada', 'ハルガダ', 27.2579, 33.8116, 23),
    ('Ismailia', 'イスマイリア', 30.5965, 32.2715, 24),
    ('Kharga', 'ハルガ', 25.4397, 30.5590, 25),
    ('Kom Ombo', 'コム・オンボ', 24.4520, 32.9457, 26),
    ('Luxor', 'ルクソール', 25.6872, 32.6396, 27),
    ('Marsa Alam', 'マルサ・アラム', 25.0633, 34.8980, 28),
    ('Memphis', 'メンフィス', 29.8516, 31.2545, 29),
    ('Minya', 'ミニヤ', 28.0871, 30.7500, 30),
    ('Nuweiba', 'ヌウェイバ', 29.0469, 34.6726, 31),
    ('Port Said', 'ポートサイド', 31.2653, 32.3019, 32),
    ('Qena', 'ケナ', 26.1551, 32.7180, 33),
    ('Rafah', 'ラファハ', 31.2747, 34.2383, 34),
    ('Rosetta (Rashid)', 'ロゼッタ（ラシード）', 31.4040, 30.4168, 35),
    ('Safaga', 'サファガ', 26.7472, 33.9360, 36),
    ('Saint Catherine', 'セント・キャサリン', 28.5588, 33.9385, 37),
    ('Saqqara', 'サッカラ', 29.8713, 31.2165, 38),
    ('Sharm El Sheikh', 'シャルム・エル・シェイク', 27.9158, 34.3300, 39),
    ('Sheikh Zuweid', 'シェイク・ズウェイド', 31.2156, 34.0925, 40),
    ('Siwa', 'シーワ', 29.2032, 25.5195, 41),
    ('Sohag', 'ソハーグ', 26.5591, 31.6948, 42),
    ('Suez', 'スエズ', 29.9668, 32.5498, 43),
    ('Taba', 'タバ', 29.4913, 34.8980, 44)
  ) AS v(name, name_ja, lat, lng, sort_order)
WHERE d.country_code = 'EG'
ON CONFLICT (destination_id, name) DO NOTHING;

-- Every existing itinerary is an Egypt itinerary.
UPDATE public.itineraries
SET destination_id = (SELECT id FROM public.destinations WHERE country_code = 'EG')
WHERE destination_id IS NULL;
