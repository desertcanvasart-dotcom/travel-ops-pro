-- ============================================================================
-- 20260908 — org_vocabularies: white-label terminology (ported from the sibling
-- SaaS tenant_vocabularies, migrations 334 + widening 341/344-351)
-- ============================================================================
--
-- Each agency renames/reorders/hides/adds the words the app uses, so the
-- product speaks their language for any destination. Rate rows/quotes store a
-- stable KEY (never shown, never renamed); the UI shows the agency's editable
-- LABEL. The engine keeps reasoning in the fixed preset positions (the 4 tier
-- keys, the fixed service-type set) — vocabulary is a label + ladder-mapping
-- layer, never a replacement.
--
-- Adaptations from the sibling: tenant_id -> org_id, get_user_tenant_id() ->
-- user_is_in_org(org_id), the seed trigger fires on organizations (not tenants),
-- and a nullable label_ja column carries the Japanese label (this app is
-- bilingual EN/JP; the hook returns label_ja for the ja locale, else label).
-- The seed function body is the sibling's 351 preset, mechanically renamed.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_vocabularies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'tier', 'supplier_type', 'board_basis', 'vehicle_type',
    'cruise_cabin', 'sleeper_cabin', 'meal_type', 'hotel_property_type',
    'train_class', 'attraction_category', 'attraction_fee_type', 'tipping_role',
    'tipping_context', 'tipping_unit', 'transport_service_type', 'flight_type',
    'flight_cabin', 'flight_frequency', 'airport_service_type', 'hotel_service_type',
    'cuisine_type', 'restaurant_type', 'dietary_option', 'activity_category',
    'activity_type', 'activity_duration', 'activity_unit', 'guide_grade',
    'guide_duration', 'guide_language', 'rate_season', 'airline', 'hotel_supplement',
    'airport_direction', 'activity_pricing_type'
  )),
  -- Stable machine value: lowercase slug, never shown, never renamed.
  key TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_]{0,59}$'),
  -- The agency's word (default / English).
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  -- The Japanese label; null falls back to `label` for the ja locale.
  label_ja TEXT,
  description TEXT,
  -- supplier_type only: the built-in kind this entry behaves as.
  behavior TEXT,
  rank INTEGER NOT NULL DEFAULT 0,
  -- Kind-specific extras (vehicle_type: {"min_pax":1,"max_pax":2}; airline: {"code":"MS"}).
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_vocabularies_unique_key UNIQUE (org_id, kind, key),
  CONSTRAINT org_vocabularies_behavior_scope
    CHECK (behavior IS NULL OR kind = 'supplier_type')
);

CREATE INDEX IF NOT EXISTS idx_org_vocabularies_lookup
  ON public.org_vocabularies (org_id, kind, rank);

ALTER TABLE public.org_vocabularies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_vocabularies_org ON public.org_vocabularies;
CREATE POLICY org_vocabularies_org ON public.org_vocabularies
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS org_vocabularies_service ON public.org_vocabularies;
CREATE POLICY org_vocabularies_service ON public.org_vocabularies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- seed_org_vocabulary(p_org, p_kind) — the preset (sibling 351, renamed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_org_vocabulary(p_org UUID, p_kind TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  inserted INTEGER := 0;
  n INTEGER;
BEGIN
  IF p_kind IS NULL OR p_kind = 'tier' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, description, rank) VALUES
      (p_org, 'tier', 'budget',   'Budget',   'Cost-effective options',    1),
      (p_org, 'tier', 'standard', 'Standard', 'Comfortable mid-range',     2),
      (p_org, 'tier', 'deluxe',   'Deluxe',   'Superior quality',          3),
      (p_org, 'tier', 'luxury',   'Luxury',   'Top-tier VIP experience',   4)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'supplier_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, behavior, rank) VALUES
      (p_org, 'supplier_type', 'hotel',             'Hotel',             'hotel',             1),
      (p_org, 'supplier_type', 'transport_company', 'Transport Company', 'transport_company', 2),
      (p_org, 'supplier_type', 'airline',           'Airline',           'airline',           3),
      (p_org, 'supplier_type', 'train_operator',    'Train Operator',    'train_operator',    4),
      (p_org, 'supplier_type', 'driver',            'Driver',            'driver',            5),
      (p_org, 'supplier_type', 'guide',             'Guide',             'guide',             6),
      (p_org, 'supplier_type', 'cruise',            'Cruise',            'cruise',            7),
      (p_org, 'supplier_type', 'activity_provider', 'Activity Provider', 'activity_provider', 8),
      (p_org, 'supplier_type', 'attraction',        'Attraction',        'attraction',        9),
      (p_org, 'supplier_type', 'tour_operator',     'Tour Operator',     'tour_operator',     10),
      (p_org, 'supplier_type', 'ground_handler',    'Ground Handler',    'ground_handler',    11),
      (p_org, 'supplier_type', 'restaurant',        'Restaurant',        'restaurant',        12),
      (p_org, 'supplier_type', 'shop',              'Shop',              'shop',              13),
      (p_org, 'supplier_type', 'other',             'Other',             'other',             14)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'board_basis' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'board_basis', 'ro', 'Room Only',       1),
      (p_org, 'board_basis', 'bb', 'Bed & Breakfast', 2),
      (p_org, 'board_basis', 'hb', 'Half Board',      3),
      (p_org, 'board_basis', 'fb', 'Full Board',      4),
      (p_org, 'board_basis', 'ai', 'All Inclusive',   5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'vehicle_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, meta, rank) VALUES
      (p_org, 'vehicle_type', 'sedan',          'Sedan',          '{"min_pax": 1, "max_pax": 2}',  1),
      (p_org, 'vehicle_type', 'suv',            'SUV',            '{"min_pax": 1, "max_pax": 4}',  2),
      (p_org, 'vehicle_type', '4x4',            '4x4',            '{"min_pax": 1, "max_pax": 6}',  3),
      (p_org, 'vehicle_type', 'minivan',        'Minivan',        '{"min_pax": 3, "max_pax": 8}',  4),
      (p_org, 'vehicle_type', 'van',            'Van',            '{"min_pax": 9, "max_pax": 14}', 5),
      (p_org, 'vehicle_type', 'minibus',        'Minibus',        '{"min_pax": 15, "max_pax": 24}', 6),
      (p_org, 'vehicle_type', 'bus',            'Bus',            '{"min_pax": 25, "max_pax": 45}', 7),
      (p_org, 'vehicle_type', 'horse_carriage', 'Horse Carriage', '{"min_pax": 1, "max_pax": 4}',  8)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'cruise_cabin' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'cruise_cabin', 'standard', 'Standard Cabin', 1),
      (p_org, 'cruise_cabin', 'deluxe',   'Deluxe Cabin',   2),
      (p_org, 'cruise_cabin', 'suite',    'Suite',          3)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'sleeper_cabin' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'sleeper_cabin', 'half_twin', 'Half Twin Cabin', 1),
      (p_org, 'sleeper_cabin', 'single',    'Single Cabin',    2)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Day-train seat classes (new in 341). The five words the app hardcoded.
  IF p_kind IS NULL OR p_kind = 'train_class' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'train_class', 'first_class',     'First Class',     1),
      (p_org, 'train_class', 'second_class_ac', 'Second Class AC', 2),
      (p_org, 'train_class', 'second_class',    'Second Class',    3),
      (p_org, 'train_class', 'third_class',     'Third Class',     4),
      (p_org, 'train_class', 'business_class',  'Business Class',  5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'meal_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'meal_type', 'breakfast',  'Breakfast',  1),
      (p_org, 'meal_type', 'brunch',     'Brunch',     2),
      (p_org, 'meal_type', 'lunch',      'Lunch',      3),
      (p_org, 'meal_type', 'dinner',     'Dinner',     4),
      (p_org, 'meal_type', 'snack',      'Snack',      5),
      (p_org, 'meal_type', 'half_board', 'Half Board', 6),
      (p_org, 'meal_type', 'full_board', 'Full Board', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'hotel_property_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'hotel_property_type', 'hotel',      'Hotel',      1),
      (p_org, 'hotel_property_type', 'resort',     'Resort',     2),
      (p_org, 'hotel_property_type', 'apartment',  'Apartment',  3),
      (p_org, 'hotel_property_type', 'guesthouse', 'Guesthouse', 4),
      (p_org, 'hotel_property_type', 'cruise',     'Cruise',     5),
      (p_org, 'hotel_property_type', 'camp',       'Camp',       6)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'attraction_category' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'attraction_category', 'temple', 'Temple', 1),
      (p_org, 'attraction_category', 'pyramid', 'Pyramid', 2),
      (p_org, 'attraction_category', 'museum', 'Museum', 3),
      (p_org, 'attraction_category', 'tomb', 'Tomb', 4),
      (p_org, 'attraction_category', 'church', 'Church', 5),
      (p_org, 'attraction_category', 'mosque', 'Mosque', 6),
      (p_org, 'attraction_category', 'fortress', 'Fortress', 7),
      (p_org, 'attraction_category', 'palace', 'Palace', 8),
      (p_org, 'attraction_category', 'nature', 'Nature', 9),
      (p_org, 'attraction_category', 'entertainment', 'Entertainment', 10),
      (p_org, 'attraction_category', 'other', 'Other', 11)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'attraction_fee_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'attraction_fee_type', 'standard', 'Standard', 1),
      (p_org, 'attraction_fee_type', 'free', 'Free Entry', 2),
      (p_org, 'attraction_fee_type', 'donation', 'Donation Based', 3),
      (p_org, 'attraction_fee_type', 'included', 'Included in Package', 4)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'tipping_role' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'tipping_role', 'guide', 'Guide', 1),
      (p_org, 'tipping_role', 'driver', 'Driver', 2),
      (p_org, 'tipping_role', 'boat_crew', 'Boat Crew', 3),
      (p_org, 'tipping_role', 'porter', 'Porter', 4),
      (p_org, 'tipping_role', 'hotel_staff', 'Hotel Staff', 5),
      (p_org, 'tipping_role', 'restaurant', 'Restaurant', 6),
      (p_org, 'tipping_role', 'other', 'Other', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'tipping_context' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'tipping_context', 'day_tour', 'Day Tour', 1),
      (p_org, 'tipping_context', 'half_day_tour', 'Half Day Tour', 2),
      (p_org, 'tipping_context', 'cruise', 'Cruise', 3),
      (p_org, 'tipping_context', 'transfer', 'Transfer', 4),
      (p_org, 'tipping_context', 'airport', 'Airport', 5),
      (p_org, 'tipping_context', 'hotel', 'Hotel', 6),
      (p_org, 'tipping_context', 'restaurant', 'Restaurant', 7),
      (p_org, 'tipping_context', 'felucca', 'Felucca', 8),
      (p_org, 'tipping_context', 'motorboat', 'Motorboat', 9)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'tipping_unit' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'tipping_unit', 'per_day', 'Per Day', 1),
      (p_org, 'tipping_unit', 'per_service', 'Per Service', 2),
      (p_org, 'tipping_unit', 'per_cruise', 'Per Cruise', 3),
      (p_org, 'tipping_unit', 'per_night', 'Per Night', 4),
      (p_org, 'tipping_unit', 'per_person', 'Per Person', 5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'transport_service_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, meta, rank) VALUES
      (p_org, 'transport_service_type', 'airport_transfer', 'Airport Transfer', '{"needs_destination": false}', 1),
      (p_org, 'transport_service_type', 'city_transfer', 'City Transfer', '{"needs_destination": true}', 2),
      (p_org, 'transport_service_type', 'day_tour', 'Day Tour', '{"needs_destination": false}', 3),
      (p_org, 'transport_service_type', 'half_day', 'Half Day', '{"needs_destination": false}', 4),
      (p_org, 'transport_service_type', 'intercity_day_trip', 'Intercity Day Trip', '{"needs_destination": true}', 5),
      (p_org, 'transport_service_type', 'intercity_dropoff', 'Intercity Drop-off', '{"needs_destination": true}', 6),
      (p_org, 'transport_service_type', 'intercity_overnight', 'Intercity Overnight', '{"needs_destination": true}', 7),
      (p_org, 'transport_service_type', 'long_day_tour', 'Long Day Tour', '{"needs_destination": false}', 8),
      (p_org, 'transport_service_type', 'multi_day', 'Multi-Day', '{"needs_destination": false}', 9),
      (p_org, 'transport_service_type', 'outside_dinner', 'Outside Dinner Transfer', '{"needs_destination": false}', 10),
      (p_org, 'transport_service_type', 'sound_light', 'Sound & Light Transfer', '{"needs_destination": false}', 11)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'flight_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'flight_type', 'domestic', 'Domestic', 1),
      (p_org, 'flight_type', 'international', 'International', 2)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'flight_cabin' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'flight_cabin', 'economy', 'Economy', 1),
      (p_org, 'flight_cabin', 'business', 'Business', 2),
      (p_org, 'flight_cabin', 'first', 'First Class', 3)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'flight_frequency' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'flight_frequency', 'daily', 'Daily', 1),
      (p_org, 'flight_frequency', 'weekdays', 'Weekdays Only', 2),
      (p_org, 'flight_frequency', 'weekends', 'Weekends Only', 3),
      (p_org, 'flight_frequency', 'mon_wed_fri', 'Mon/Wed/Fri', 4),
      (p_org, 'flight_frequency', 'tue_thu_sat', 'Tue/Thu/Sat', 5),
      (p_org, 'flight_frequency', 'weekly', 'Weekly', 6),
      (p_org, 'flight_frequency', 'charter', 'Charter/On Demand', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'airport_service_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'airport_service_type', 'meet_greet', 'Meet & Greet', 1),
      (p_org, 'airport_service_type', 'customs_assist', 'Customs Assist', 2),
      (p_org, 'airport_service_type', 'full_service', 'Full Service', 3),
      (p_org, 'airport_service_type', 'vip_service', 'VIP Service', 4)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'hotel_service_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'hotel_service_type', 'porter', 'Porter', 1),
      (p_org, 'hotel_service_type', 'checkin_assist', 'Check-in Assist', 2),
      (p_org, 'hotel_service_type', 'checkout_assist', 'Check-out Assist', 3),
      (p_org, 'hotel_service_type', 'full_service', 'Full Service', 4),
      (p_org, 'hotel_service_type', 'concierge', 'Concierge', 5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'cuisine_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'cuisine_type', 'egyptian', 'Egyptian', 1),
      (p_org, 'cuisine_type', 'mediterranean', 'Mediterranean', 2),
      (p_org, 'cuisine_type', 'italian', 'Italian', 3),
      (p_org, 'cuisine_type', 'middle_eastern', 'Middle Eastern', 4),
      (p_org, 'cuisine_type', 'asian', 'Asian', 5),
      (p_org, 'cuisine_type', 'international', 'International', 6),
      (p_org, 'cuisine_type', 'seafood', 'Seafood', 7),
      (p_org, 'cuisine_type', 'lebanese', 'Lebanese', 8),
      (p_org, 'cuisine_type', 'turkish', 'Turkish', 9),
      (p_org, 'cuisine_type', 'indian', 'Indian', 10),
      (p_org, 'cuisine_type', 'korean', 'Korean', 11),
      (p_org, 'cuisine_type', 'chinese', 'Chinese', 12),
      (p_org, 'cuisine_type', 'japanese', 'Japanese', 13),
      (p_org, 'cuisine_type', 'french', 'French', 14)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'restaurant_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'restaurant_type', 'fine_dining', 'Fine Dining', 1),
      (p_org, 'restaurant_type', 'casual_dining', 'Casual Dining', 2),
      (p_org, 'restaurant_type', 'buffet', 'Buffet', 3),
      (p_org, 'restaurant_type', 'local_restaurant', 'Local Restaurant', 4),
      (p_org, 'restaurant_type', 'hotel_restaurant', 'Hotel Restaurant', 5),
      (p_org, 'restaurant_type', 'cruise_restaurant', 'Cruise Restaurant', 6),
      (p_org, 'restaurant_type', 'street_food', 'Street Food', 7),
      (p_org, 'restaurant_type', 'cafe', 'Café', 8)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'dietary_option' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'dietary_option', 'vegetarian', 'Vegetarian', 1),
      (p_org, 'dietary_option', 'vegan', 'Vegan', 2),
      (p_org, 'dietary_option', 'halal', 'Halal', 3),
      (p_org, 'dietary_option', 'gluten_free', 'Gluten-Free', 4),
      (p_org, 'dietary_option', 'dairy_free', 'Dairy-Free', 5),
      (p_org, 'dietary_option', 'nut_free', 'Nut-Free', 6),
      (p_org, 'dietary_option', 'kosher', 'Kosher', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_category' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'activity_category', 'ancient_sites', 'Ancient Sites', 1),
      (p_org, 'activity_category', 'museums', 'Museums', 2),
      (p_org, 'activity_category', 'desert_safari', 'Desert Safari', 3),
      (p_org, 'activity_category', 'water_activities', 'Water Activities', 4),
      (p_org, 'activity_category', 'cultural_experience', 'Cultural Experience', 5),
      (p_org, 'activity_category', 'adventure', 'Adventure', 6),
      (p_org, 'activity_category', 'religious_sites', 'Religious Sites', 7),
      (p_org, 'activity_category', 'nature_wildlife', 'Nature & Wildlife', 8),
      (p_org, 'activity_category', 'entertainment', 'Entertainment', 9),
      (p_org, 'activity_category', 'shopping_tours', 'Shopping Tours', 10),
      (p_org, 'activity_category', 'shows_events', 'Shows & Events', 11),
      (p_org, 'activity_category', 'nile_experience', 'Nile Experience', 12),
      (p_org, 'activity_category', 'local_transport', 'Local Transport', 13)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'activity_type', 'guided_tour', 'Guided Tour', 1),
      (p_org, 'activity_type', 'self_guided', 'Self-Guided', 2),
      (p_org, 'activity_type', 'excursion', 'Excursion', 3),
      (p_org, 'activity_type', 'day_trip', 'Day Trip', 4),
      (p_org, 'activity_type', 'half_day_trip', 'Half-Day Trip', 5),
      (p_org, 'activity_type', 'experience', 'Experience', 6),
      (p_org, 'activity_type', 'workshop', 'Workshop', 7),
      (p_org, 'activity_type', 'show', 'Show', 8),
      (p_org, 'activity_type', 'cruise', 'Cruise', 9),
      (p_org, 'activity_type', 'ride', 'Ride', 10),
      (p_org, 'activity_type', 'activity', 'Activity', 11)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_duration' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'activity_duration', '30_minutes', '30 minutes', 1),
      (p_org, 'activity_duration', '1_hour', '1 hour', 2),
      (p_org, 'activity_duration', '1_5_hours', '1.5 hours', 3),
      (p_org, 'activity_duration', '2_hours', '2 hours', 4),
      (p_org, 'activity_duration', '3_hours', '3 hours', 5),
      (p_org, 'activity_duration', '4_hours', '4 hours', 6),
      (p_org, 'activity_duration', 'half_day_4_5h', 'Half Day (4-5h)', 7),
      (p_org, 'activity_duration', 'full_day_6_8h', 'Full Day (6-8h)', 8),
      (p_org, 'activity_duration', 'extended_day_8_10h', 'Extended Day (8-10h)', 9),
      (p_org, 'activity_duration', 'multi_day', 'Multi-Day', 10)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_unit' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'activity_unit', 'boat', 'boat', 1),
      (p_org, 'activity_unit', 'felucca', 'felucca', 2),
      (p_org, 'activity_unit', 'ride', 'ride', 3),
      (p_org, 'activity_unit', 'quad', 'quad', 4),
      (p_org, 'activity_unit', 'vehicle', 'vehicle', 5),
      (p_org, 'activity_unit', 'ticket', 'ticket', 6),
      (p_org, 'activity_unit', 'group', 'group', 7),
      (p_org, 'activity_unit', 'session', 'session', 8),
      (p_org, 'activity_unit', 'person', 'person', 9)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'guide_grade' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank, is_active) VALUES
      (p_org, 'guide_grade', 'egyptologist', 'Egyptologist', 1, true),
      (p_org, 'guide_grade', 'senior', 'Senior guide', 2, true),
      (p_org, 'guide_grade', 'licensed', 'Licensed Guide', 3, false),
      (p_org, 'guide_grade', 'local', 'Local Guide', 4, false),
      (p_org, 'guide_grade', 'specialist', 'Specialist', 5, false),
      (p_org, 'guide_grade', 'driver_guide', 'Driver Guide', 6, false),
      (p_org, 'guide_grade', 'birdwatching', 'Birdwatching Guide', 7, false),
      (p_org, 'guide_grade', 'bedouin', 'Bedouin Guide', 8, false)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'guide_duration' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'guide_duration', 'half_day', 'Half Day (4h)', 1),
      (p_org, 'guide_duration', 'full_day', 'Full Day (8h)', 2),
      (p_org, 'guide_duration', 'meet_greet', 'Meet & Assist day', 3),
      (p_org, 'guide_duration', 'extended', 'Extended (10h+)', 4),
      (p_org, 'guide_duration', 'hourly', 'Hourly', 5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'guide_language' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'guide_language', 'english', 'English', 1),
      (p_org, 'guide_language', 'arabic', 'Arabic', 2),
      (p_org, 'guide_language', 'french', 'French', 3),
      (p_org, 'guide_language', 'german', 'German', 4),
      (p_org, 'guide_language', 'spanish', 'Spanish', 5),
      (p_org, 'guide_language', 'italian', 'Italian', 6),
      (p_org, 'guide_language', 'russian', 'Russian', 7),
      (p_org, 'guide_language', 'chinese', 'Chinese', 8),
      (p_org, 'guide_language', 'japanese', 'Japanese', 9),
      (p_org, 'guide_language', 'portuguese', 'Portuguese', 10),
      (p_org, 'guide_language', 'dutch', 'Dutch', 11),
      (p_org, 'guide_language', 'polish', 'Polish', 12)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'rate_season' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'rate_season', 'all_year', 'All Year', 1),
      (p_org, 'rate_season', 'low_season', 'Low Season', 2),
      (p_org, 'rate_season', 'high_season', 'High Season', 3),
      (p_org, 'rate_season', 'peak_season', 'Peak Season', 4),
      (p_org, 'rate_season', 'summer', 'Summer', 5),
      (p_org, 'rate_season', 'winter', 'Winter', 6)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Airlines carry their IATA code in meta (fills the flight service code).
  IF p_kind IS NULL OR p_kind = 'airline' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, meta, rank) VALUES
      (p_org, 'airline', 'egyptair', 'EgyptAir', '{"code": "MS"}', 1),
      (p_org, 'airline', 'nile_air', 'Nile Air', '{"code": "NP"}', 2),
      (p_org, 'airline', 'air_cairo', 'Air Cairo', '{"code": "SM"}', 3),
      (p_org, 'airline', 'flydubai', 'FlyDubai', '{"code": "FZ"}', 4),
      (p_org, 'airline', 'emirates', 'Emirates', '{"code": "EK"}', 5),
      (p_org, 'airline', 'qatar_airways', 'Qatar Airways', '{"code": "QR"}', 6),
      (p_org, 'airline', 'turkish_airlines', 'Turkish Airlines', '{"code": "TK"}', 7),
      (p_org, 'airline', 'lufthansa', 'Lufthansa', '{"code": "LH"}', 8),
      (p_org, 'airline', 'british_airways', 'British Airways', '{"code": "BA"}', 9),
      (p_org, 'airline', 'air_france', 'Air France', '{"code": "AF"}', 10),
      (p_org, 'airline', 'klm', 'KLM', '{"code": "KL"}', 11),
      (p_org, 'airline', 'etihad', 'Etihad', '{"code": "EY"}', 12),
      (p_org, 'airline', 'saudia', 'Saudia', '{"code": "SV"}', 13),
      (p_org, 'airline', 'royal_jordanian', 'Royal Jordanian', '{"code": "RJ"}', 14),
      (p_org, 'airline', 'middle_east_airlines', 'Middle East Airlines', '{"code": "ME"}', 15),
      (p_org, 'airline', 'air_arabia', 'Air Arabia', '{"code": "G9"}', 16),
      (p_org, 'airline', 'other', 'Other', '{}', 17)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Hotel supplements; the description is the group the form shows them under.
  IF p_kind IS NULL OR p_kind = 'hotel_supplement' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, description, rank) VALUES
      (p_org, 'hotel_supplement', 'view_nile', 'Nile View', 'View', 1),
      (p_org, 'hotel_supplement', 'view_sea', 'Sea View', 'View', 2),
      (p_org, 'hotel_supplement', 'view_pyramid', 'Pyramid View', 'View', 3),
      (p_org, 'hotel_supplement', 'view_garden', 'Garden View', 'View', 4),
      (p_org, 'hotel_supplement', 'view_pool', 'Pool View', 'View', 5),
      (p_org, 'hotel_supplement', 'upper_floor', 'Upper Floor', 'Room', 6),
      (p_org, 'hotel_supplement', 'half_board', 'Half Board (HB)', 'Meal Plan', 7),
      (p_org, 'hotel_supplement', 'full_board', 'Full Board (FB)', 'Meal Plan', 8),
      (p_org, 'hotel_supplement', 'all_inclusive', 'All Inclusive (AI)', 'Meal Plan', 9),
      (p_org, 'hotel_supplement', 'ultra_all_inclusive', 'Ultra All Inclusive (UAI)', 'Meal Plan', 10)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Airport directions. The engine selects by KEY (arrival/departure, or both).
  IF p_kind IS NULL OR p_kind = 'airport_direction' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES
      (p_org, 'airport_direction', 'arrival',   'Arrival',         1),
      (p_org, 'airport_direction', 'departure', 'Departure',       2),
      (p_org, 'airport_direction', 'both',      'Both directions', 3)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Activity pricing types. The engine prices by KEY; the description is the
  -- explanation the form shows under each choice.
  IF p_kind IS NULL OR p_kind = 'activity_pricing_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, description, rank) VALUES
      (p_org, 'activity_pricing_type', 'per_person', 'Per Person', 'Rate multiplied by number of travelers',  1),
      (p_org, 'activity_pricing_type', 'per_unit',   'Per Unit',   'Flat rate per boat/vehicle/ride',         2),
      (p_org, 'activity_pricing_type', 'flat',       'Flat Rate',  'Single price regardless of group size',   3),
      (p_org, 'activity_pricing_type', 'tiered',     'Tiered',     'Per-person rate drops as the group grows', 4)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Auto-seed every new organization; backfill the existing ones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_org_vocabulary_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.seed_org_vocabulary(NEW.id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_org_vocabulary ON public.organizations;
CREATE TRIGGER trg_seed_org_vocabulary
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_org_vocabulary_on_insert();

GRANT EXECUTE ON FUNCTION public.seed_org_vocabulary(UUID, TEXT) TO service_role;

-- Backfill: every existing org gets the preset (gaps only, idempotent).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_org_vocabulary(r.id, NULL);
  END LOOP;
END $$;

COMMIT;
