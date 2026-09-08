-- 20260922_dietary_option_relabel.sql
-- Bilingual backfill for the dietary_option vocabulary.
--
-- Keys + English labels already match the app (the meals page DIETARY_OPTIONS
-- and the restaurants page dietaryOptionsList store raw strings, reached by
-- slugify). The seed left label_ja NULL; the Japanese labels come from the
-- app's own i18n. English is unchanged.
--
-- Built from 20260921 so all prior fixes are retained.
--   1. CREATE OR REPLACEs seed_org_vocabulary with label_ja on the block.
--   2. Backfills existing orgs' label_ja where blank — preserving customization.
--
-- Relabel-only: the keys are frozen; this supplies labels.

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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, behavior, rank) VALUES
      (p_org, 'supplier_type', 'hotel', 'Hotel', 'ホテル', 'hotel', 1),
      (p_org, 'supplier_type', 'transport', 'Transport', '交通', 'transport_company', 2),
      (p_org, 'supplier_type', 'local_operator', 'Local Operator', '現地オペレーター', 'tour_operator', 3),
      (p_org, 'supplier_type', 'driver', 'Driver', 'ドライバー', 'driver', 4),
      (p_org, 'supplier_type', 'guide', 'Guide', 'ガイド', 'guide', 5),
      (p_org, 'supplier_type', 'cruise', 'Cruise', 'クルーズ', 'cruise', 6),
      (p_org, 'supplier_type', 'activity_provider', 'Activity Provider', 'アクティビティプロバイダー', 'activity_provider', 7),
      (p_org, 'supplier_type', 'attraction', 'Attraction', '観光地', 'attraction', 8),
      (p_org, 'supplier_type', 'tour_operator', 'Tour Operator', 'ツアーオペレーター', 'tour_operator', 9),
      (p_org, 'supplier_type', 'ground_handler', 'Ground Handler', 'グランドハンドラー', 'ground_handler', 10),
      (p_org, 'supplier_type', 'train_operator', 'Train Operator', '鉄道会社', 'train_operator', 11),
      (p_org, 'supplier_type', 'air_carrier', 'Air Carrier', '航空会社', 'airline', 12),
      (p_org, 'supplier_type', 'airport_assistant', 'Airport Assistant', '空港アシスタント', 'ground_handler', 13),
      (p_org, 'supplier_type', 'hotel_assistant', 'Hotel Assistant', 'ホテルアシスタント', 'ground_handler', 14),
      (p_org, 'supplier_type', 'restaurant', 'Restaurant', 'レストラン', 'restaurant', 15),
      (p_org, 'supplier_type', 'shop', 'Shop', 'ショップ', 'shop', 16),
      (p_org, 'supplier_type', 'other', 'Other', 'その他', 'other', 17)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'board_basis' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'board_basis', 'ro', 'Room Only', '素泊まり', 1),
      (p_org, 'board_basis', 'bb', 'Bed & Breakfast', '朝食付き', 2),
      (p_org, 'board_basis', 'hb', 'Half Board', 'ハーフボード', 3),
      (p_org, 'board_basis', 'fb', 'Full Board', 'フルボード', 4),
      (p_org, 'board_basis', 'ai', 'All Inclusive', 'オールインクルーシブ', 5)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'cruise_cabin', 'standard', 'Standard', 'スタンダード', 1),
      (p_org, 'cruise_cabin', 'deluxe', 'Deluxe', 'デラックス', 2),
      (p_org, 'cruise_cabin', 'suite', 'Suite', 'スイート', 3)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'sleeper_cabin' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'sleeper_cabin', 'half_twin', 'Half Twin', 'ハーフツイン', 1),
      (p_org, 'sleeper_cabin', 'single', 'Single', 'シングル', 2)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Day-train seat classes (new in 341). The five words the app hardcoded.
  IF p_kind IS NULL OR p_kind = 'train_class' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'train_class', 'first_class', 'First Class', 'ファーストクラス', 1),
      (p_org, 'train_class', 'second_class_ac', 'Second Class AC', 'セカンドクラスAC', 2),
      (p_org, 'train_class', 'second_class', 'Second Class', 'セカンドクラス', 3),
      (p_org, 'train_class', 'third_class', 'Third Class', 'サードクラス', 4),
      (p_org, 'train_class', 'business_class', 'Business Class', 'ビジネスクラス', 5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'meal_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'meal_type', 'breakfast', 'Breakfast', '朝食', 1),
      (p_org, 'meal_type', 'brunch', 'Brunch', 'ブランチ', 2),
      (p_org, 'meal_type', 'lunch', 'Lunch', '昼食', 3),
      (p_org, 'meal_type', 'dinner', 'Dinner', '夕食', 4),
      (p_org, 'meal_type', 'snack', 'Snack', '軽食', 5),
      (p_org, 'meal_type', 'half_board', 'Half Board', 'ハーフボード', 6),
      (p_org, 'meal_type', 'full_board', 'Full Board', 'フルボード', 7)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'attraction_category', 'temple', 'Temple', '神殿', 1),
      (p_org, 'attraction_category', 'pyramid', 'Pyramid', 'ピラミッド', 2),
      (p_org, 'attraction_category', 'museum', 'Museum', '博物館', 3),
      (p_org, 'attraction_category', 'tomb', 'Tomb', '墓', 4),
      (p_org, 'attraction_category', 'church', 'Church', '教会', 5),
      (p_org, 'attraction_category', 'mosque', 'Mosque', 'モスク', 6),
      (p_org, 'attraction_category', 'fortress', 'Fortress', '要塞', 7),
      (p_org, 'attraction_category', 'palace', 'Palace', '宮殿', 8),
      (p_org, 'attraction_category', 'nature', 'Nature', '自然', 9),
      (p_org, 'attraction_category', 'entertainment', 'Entertainment', 'エンターテイメント', 10),
      (p_org, 'attraction_category', 'other', 'Other', 'その他', 11)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'tipping_role', 'guide', 'Guide', 'ガイド', 1),
      (p_org, 'tipping_role', 'driver', 'Driver', 'ドライバー', 2),
      (p_org, 'tipping_role', 'boat_crew', 'Boat Crew', '船員', 3),
      (p_org, 'tipping_role', 'porter', 'Porter', 'ポーター', 4),
      (p_org, 'tipping_role', 'hotel_assistant', 'Hotel Assistant', 'ホテルアシスタント', 5),
      (p_org, 'tipping_role', 'restaurant', 'Restaurant', 'レストラン', 6),
      (p_org, 'tipping_role', 'other', 'Other', 'その他', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'tipping_context' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'tipping_context', 'day_tour', 'Day Tour', '日帰りツアー', 1),
      (p_org, 'tipping_context', 'half_day_tour', 'Half Day Tour', '半日ツアー', 2),
      (p_org, 'tipping_context', 'cruise', 'Cruise', 'クルーズ', 3),
      (p_org, 'tipping_context', 'transfer', 'Transfer', '送迎', 4),
      (p_org, 'tipping_context', 'airport', 'Airport', '空港', 5),
      (p_org, 'tipping_context', 'hotel', 'Hotel', 'ホテル', 6),
      (p_org, 'tipping_context', 'restaurant', 'Restaurant', 'レストラン', 7),
      (p_org, 'tipping_context', 'felucca', 'Felucca', 'ファルーカ', 8),
      (p_org, 'tipping_context', 'motorboat', 'Motorboat', 'モーターボート', 9)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'tipping_unit' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'tipping_unit', 'per_day', 'Per Day', '1日あたり', 1),
      (p_org, 'tipping_unit', 'per_service', 'Per Service', '1サービスあたり', 2),
      (p_org, 'tipping_unit', 'per_cruise', 'Per Cruise', '1クルーズあたり', 3),
      (p_org, 'tipping_unit', 'per_night', 'Per Night', '1泊あたり', 4),
      (p_org, 'tipping_unit', 'per_person', 'Per Person', '1名あたり', 5)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'flight_type', 'domestic', 'Domestic', '国内線', 1),
      (p_org, 'flight_type', 'international', 'International', '国際線', 2)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'flight_cabin' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'flight_cabin', 'economy', 'Economy', 'エコノミー', 1),
      (p_org, 'flight_cabin', 'business', 'Business', 'ビジネス', 2),
      (p_org, 'flight_cabin', 'first', 'First Class', 'ファーストクラス', 3)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'flight_frequency' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'flight_frequency', 'daily', 'Daily', '毎日', 1),
      (p_org, 'flight_frequency', 'weekdays', 'Weekdays Only', '平日のみ', 2),
      (p_org, 'flight_frequency', 'weekends', 'Weekends Only', '週末のみ', 3),
      (p_org, 'flight_frequency', 'mon_wed_fri', 'Mon/Wed/Fri', '月・水・金', 4),
      (p_org, 'flight_frequency', 'tue_thu_sat', 'Tue/Thu/Sat', '火・木・土', 5),
      (p_org, 'flight_frequency', 'weekly', 'Weekly', '週1回', 6),
      (p_org, 'flight_frequency', 'charter', 'Charter/On Demand', 'チャーター／随時', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'airport_service_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'airport_service_type', 'meet_greet', 'Meet & Greet', 'ミート&グリート', 1),
      (p_org, 'airport_service_type', 'customs_assist', 'Customs Assist', '税関アシスト', 2),
      (p_org, 'airport_service_type', 'full_service', 'Full Service', 'フルサービス', 3),
      (p_org, 'airport_service_type', 'vip_service', 'VIP Service', 'VIPサービス', 4)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'hotel_service_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'hotel_service_type', 'porter', 'Porter', 'ポーター', 1),
      (p_org, 'hotel_service_type', 'checkin_assist', 'Check-in Assist', 'チェックインアシスト', 2),
      (p_org, 'hotel_service_type', 'checkout_assist', 'Check-out Assist', 'チェックアウトアシスト', 3),
      (p_org, 'hotel_service_type', 'full_service', 'Full Service', 'フルサービス', 4),
      (p_org, 'hotel_service_type', 'concierge', 'Concierge', 'コンシェルジュ', 5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'cuisine_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'cuisine_type', 'egyptian', 'Egyptian', 'エジプト料理', 1),
      (p_org, 'cuisine_type', 'mediterranean', 'Mediterranean', '地中海料理', 2),
      (p_org, 'cuisine_type', 'italian', 'Italian', 'イタリア料理', 3),
      (p_org, 'cuisine_type', 'middle_eastern', 'Middle Eastern', '中東料理', 4),
      (p_org, 'cuisine_type', 'asian', 'Asian', 'アジア料理', 5),
      (p_org, 'cuisine_type', 'international', 'International', 'インターナショナル', 6),
      (p_org, 'cuisine_type', 'seafood', 'Seafood', 'シーフード', 7),
      (p_org, 'cuisine_type', 'lebanese', 'Lebanese', 'レバノン料理', 8),
      (p_org, 'cuisine_type', 'turkish', 'Turkish', 'トルコ料理', 9),
      (p_org, 'cuisine_type', 'indian', 'Indian', 'インド料理', 10),
      (p_org, 'cuisine_type', 'korean', 'Korean', '韓国料理', 11),
      (p_org, 'cuisine_type', 'chinese', 'Chinese', '中華料理', 12),
      (p_org, 'cuisine_type', 'japanese', 'Japanese', '日本料理', 13),
      (p_org, 'cuisine_type', 'french', 'French', 'フランス料理', 14)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'restaurant_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'restaurant_type', 'fine_dining', 'Fine Dining', 'ファインダイニング', 1),
      (p_org, 'restaurant_type', 'casual_dining', 'Casual Dining', 'カジュアルダイニング', 2),
      (p_org, 'restaurant_type', 'buffet', 'Buffet', 'ビュッフェ', 3),
      (p_org, 'restaurant_type', 'local_restaurant', 'Local Restaurant', 'ローカルレストラン', 4),
      (p_org, 'restaurant_type', 'hotel_restaurant', 'Hotel Restaurant', 'ホテルレストラン', 5),
      (p_org, 'restaurant_type', 'cruise_restaurant', 'Cruise Restaurant', 'クルーズレストラン', 6),
      (p_org, 'restaurant_type', 'street_food', 'Street Food', 'ストリートフード', 7),
      (p_org, 'restaurant_type', 'cafe', 'Café', 'カフェ', 8)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'dietary_option' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'dietary_option', 'vegetarian', 'Vegetarian', 'ベジタリアン', 1),
      (p_org, 'dietary_option', 'vegan', 'Vegan', 'ビーガン', 2),
      (p_org, 'dietary_option', 'halal', 'Halal', 'ハラル', 3),
      (p_org, 'dietary_option', 'gluten_free', 'Gluten-Free', 'グルテンフリー', 4),
      (p_org, 'dietary_option', 'dairy_free', 'Dairy-Free', '乳製品フリー', 5),
      (p_org, 'dietary_option', 'nut_free', 'Nut-Free', 'ナッツフリー', 6),
      (p_org, 'dietary_option', 'kosher', 'Kosher', 'コーシャー', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_category' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'activity_category', 'ancient_sites', 'Ancient Sites', '古代遺跡', 1),
      (p_org, 'activity_category', 'museums', 'Museums', '博物館', 2),
      (p_org, 'activity_category', 'desert_safari', 'Desert Safari', '砂漠サファリ', 3),
      (p_org, 'activity_category', 'water_activities', 'Water Activities', '水上アクティビティ', 4),
      (p_org, 'activity_category', 'cultural_experience', 'Cultural Experience', '文化体験', 5),
      (p_org, 'activity_category', 'adventure', 'Adventure', 'アドベンチャー', 6),
      (p_org, 'activity_category', 'religious_sites', 'Religious Sites', '宗教施設', 7),
      (p_org, 'activity_category', 'nature_wildlife', 'Nature & Wildlife', '自然・野生動物', 8),
      (p_org, 'activity_category', 'entertainment', 'Entertainment', 'エンターテイメント', 9),
      (p_org, 'activity_category', 'shopping_tours', 'Shopping Tours', 'ショッピングツアー', 10),
      (p_org, 'activity_category', 'shows_events', 'Shows & Events', 'ショー・イベント', 11),
      (p_org, 'activity_category', 'nile_experience', 'Nile Experience', 'ナイル川体験', 12),
      (p_org, 'activity_category', 'local_transport', 'Local Transport', '現地交通', 13)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank, is_active) VALUES
      (p_org, 'guide_grade', 'egyptologist', 'Egyptologist', 'エジプト学者', 1, true),
      (p_org, 'guide_grade', 'senior', 'Senior Egyptologist', 'シニアエジプト学者', 2, true),
      (p_org, 'guide_grade', 'licensed', 'Licensed Guide', '公認ガイド', 3, false),
      (p_org, 'guide_grade', 'local', 'Local Guide', 'ローカルガイド', 4, false),
      (p_org, 'guide_grade', 'specialist', 'Specialist', '専門ガイド', 5, false),
      (p_org, 'guide_grade', 'driver_guide', 'Driver Guide', 'ドライバーガイド', 6, false),
      (p_org, 'guide_grade', 'birdwatching', 'Birdwatching Guide', NULL, 7, false),
      (p_org, 'guide_grade', 'bedouin', 'Bedouin Guide', NULL, 8, false)
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

-- Backfill Japanese labels where blank.
  UPDATE org_vocabularies SET label_ja = 'ベジタリアン'
    WHERE kind = 'dietary_option' AND key = 'vegetarian' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'ビーガン'
    WHERE kind = 'dietary_option' AND key = 'vegan' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'ハラル'
    WHERE kind = 'dietary_option' AND key = 'halal' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'グルテンフリー'
    WHERE kind = 'dietary_option' AND key = 'gluten_free' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = '乳製品フリー'
    WHERE kind = 'dietary_option' AND key = 'dairy_free' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'ナッツフリー'
    WHERE kind = 'dietary_option' AND key = 'nut_free' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'コーシャー'
    WHERE kind = 'dietary_option' AND key = 'kosher' AND coalesce(btrim(label_ja), '') = '';

-- Self-verify: all seven dietary options must be bilingual after the backfill.
DO $verify$
DECLARE
  no_ja INTEGER;
BEGIN
  SELECT count(*) INTO no_ja
  FROM org_vocabularies
  WHERE kind = 'dietary_option'
    AND key IN ('vegetarian','vegan','halal','gluten_free','dairy_free','nut_free','kosher')
    AND coalesce(btrim(label_ja), '') = '';
  IF no_ja > 0 THEN
    RAISE EXCEPTION 'dietary_option relabel: % options without a Japanese label', no_ja;
  END IF;
END
$verify$;

COMMIT;
