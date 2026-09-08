-- 20260909_transport_service_type_reseed.sql
-- Reconcile the transport_service_type vocabulary to THIS app's real keys.
--
-- The original org_vocabularies seed (20260908) carried a transport service
-- taxonomy copied from the sibling SaaS, whose keys (intercity_day_trip,
-- long_day_tour, multi_day, outside_dinner, ...) do NOT match this app's
-- transportation.service_type CHECK constraint (airport_with_sightseeing,
-- city_tour, intercity, intercity_with_sightseeing, extended_day_tour,
-- dinner_transfer, ...). The mismatch meant the white-label relabel could
-- never resolve 6 of the 11 transport categories.
--
-- This migration:
--   1. CREATE OR REPLACEs seed_org_vocabulary with the transport block fixed
--      to the app's 11 keys, seeded BILINGUALLY (label + label_ja) so the
--      vocabulary reproduces today's EN/JA UI out of the box.
--   2. Re-seeds existing orgs: deletes their (wrong-key) transport rows and
--      re-runs the seed for that kind. Safe because those keys never matched
--      any real rate, so nothing depended on them.
--
-- Relabel-only: the transportation.service_type keys themselves are frozen by
-- the DB CHECK constraint; this only supplies the DISPLAY labels.

BEGIN;

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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, meta, rank) VALUES
      (p_org, 'transport_service_type', 'airport_transfer', 'Airport Transfer', '空港送迎', '{"needs_destination": false}', 1),
      (p_org, 'transport_service_type', 'airport_with_sightseeing', 'Airport Transfer + Sightseeing', '空港送迎＋観光', '{"needs_destination": false}', 2),
      (p_org, 'transport_service_type', 'city_transfer', 'City Transfer', '市内送迎', '{"needs_destination": false}', 3),
      (p_org, 'transport_service_type', 'city_tour', 'City Tour', '市内観光ツアー', '{"needs_destination": false}', 4),
      (p_org, 'transport_service_type', 'intercity', 'Intercity', '都市間', '{"needs_destination": true}', 5),
      (p_org, 'transport_service_type', 'intercity_with_sightseeing', 'Intercity + Sightseeing', '都市間＋観光', '{"needs_destination": true}', 6),
      (p_org, 'transport_service_type', 'half_day', 'Half Day', '半日', '{"needs_destination": false}', 7),
      (p_org, 'transport_service_type', 'day_tour', 'Day Tour', '日帰りツアー', '{"needs_destination": false}', 8),
      (p_org, 'transport_service_type', 'extended_day_tour', 'Extended Day Tour', '拡張日帰りツアー', '{"needs_destination": false}', 9),
      (p_org, 'transport_service_type', 'sound_light', 'Sound & Light', 'サウンド&ライト', '{"needs_destination": false}', 10),
      (p_org, 'transport_service_type', 'dinner_transfer', 'Dinner Transfer', 'ディナー送迎', '{"needs_destination": false}', 11)
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

-- Re-seed existing orgs' transport_service_type rows with the corrected keys.
DO $reseed$
DECLARE
  org RECORD;
BEGIN
  DELETE FROM org_vocabularies WHERE kind = 'transport_service_type';
  FOR org IN SELECT id FROM public.organizations LOOP
    PERFORM seed_org_vocabulary(org.id, 'transport_service_type');
  END LOOP;
END
$reseed$;

-- Self-verify: every org must now have exactly the 11 app keys, bilingual.
DO $verify$
DECLARE
  expected TEXT[] := ARRAY[
    'airport_transfer','airport_with_sightseeing','city_transfer','city_tour',
    'intercity','intercity_with_sightseeing','half_day','day_tour',
    'extended_day_tour','sound_light','dinner_transfer'
  ];
  bad INTEGER;
  missing INTEGER;
  no_ja INTEGER;
BEGIN
  -- any transport row whose key is not one of the 11 expected keys
  SELECT count(*) INTO bad
  FROM org_vocabularies
  WHERE kind = 'transport_service_type' AND key <> ALL(expected);
  IF bad > 0 THEN
    RAISE EXCEPTION 'transport_service_type reseed: % stray rows with unexpected keys', bad;
  END IF;

  -- any org that has vocab at all but is missing one of the 11 transport keys
  SELECT count(*) INTO missing
  FROM public.organizations o
  CROSS JOIN unnest(expected) AS k(key)
  WHERE EXISTS (SELECT 1 FROM org_vocabularies v WHERE v.org_id = o.id)
    AND NOT EXISTS (
      SELECT 1 FROM org_vocabularies v
      WHERE v.org_id = o.id AND v.kind = 'transport_service_type' AND v.key = k.key
    );
  IF missing > 0 THEN
    RAISE EXCEPTION 'transport_service_type reseed: % missing (org,key) pairs', missing;
  END IF;

  -- bilingual seed: no transport row should have a null/blank label_ja
  SELECT count(*) INTO no_ja
  FROM org_vocabularies
  WHERE kind = 'transport_service_type' AND coalesce(btrim(label_ja), '') = '';
  IF no_ja > 0 THEN
    RAISE EXCEPTION 'transport_service_type reseed: % rows without a Japanese label', no_ja;
  END IF;
END
$verify$;

COMMIT;
