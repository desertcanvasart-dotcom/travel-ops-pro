-- 20260929_rate_season_relabel.sql
-- Bilingual backfill for the rate_season vocabulary — the CAMPAIGN'S LAST kind.
--
-- rate_season is a label tag on rate rows. Two surfaces use it with different
-- representations, both slugify-reached by useVocabLabel:
--   * attractions rate form — stores the KEY (all_year/high_season/…); five
--     options, labelled via rates.attractions.seasons i18n (which supplies the
--     Japanese here).
--   * sleeping-train rate form + row badge — stores the human STRING
--     ('Peak Season' → peak_season, etc.). No i18n; the vocab label is what a
--     ja user will now see.
-- The sleeper form also offers 'Year Round', which slugifies to a key the
-- seed did not have. Rather than change stored data, this migration ADDS a
-- 'year_round' seed entry (bilingual) so that option resolves too — additive,
-- non-destructive. English is unchanged.
--
-- Built from 20260928 so all prior fixes are retained.
--   1. CREATE OR REPLACEs seed_org_vocabulary: label_ja on the six existing
--      rate_season keys + a new 'year_round' entry.
--   2. Adds 'year_round' to existing orgs and backfills label_ja where blank —
--      preserving customization.
--
-- Relabel-plus-one-additive-key: existing keys are unchanged; this supplies
-- labels and the one option the app shipped but the seed lacked.

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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'hotel_property_type', 'hotel',      'Hotel',      'ホテル',        1),
      (p_org, 'hotel_property_type', 'resort',     'Resort',     'リゾート',      2),
      (p_org, 'hotel_property_type', 'apartment',  'Apartment',  'アパートメント', 3),
      (p_org, 'hotel_property_type', 'guesthouse', 'Guesthouse', 'ゲストハウス',   4),
      (p_org, 'hotel_property_type', 'cruise',     'Cruise',     'クルーズ',       5),
      (p_org, 'hotel_property_type', 'camp',       'Camp',       'キャンプ',       6)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'attraction_fee_type', 'standard', 'Standard', '標準', 1),
      (p_org, 'attraction_fee_type', 'free', 'Free Entry', '入場無料', 2),
      (p_org, 'attraction_fee_type', 'donation', 'Donation Based', '寄付ベース', 3),
      (p_org, 'attraction_fee_type', 'included', 'Included in Package', 'パッケージに含む', 4)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'activity_type', 'guided_tour', 'Guided Tour', 'ガイド付きツアー', 1),
      (p_org, 'activity_type', 'self_guided', 'Self-Guided', 'セルフガイド', 2),
      (p_org, 'activity_type', 'excursion', 'Excursion', 'エクスカーション', 3),
      (p_org, 'activity_type', 'day_trip', 'Day Trip', '日帰り旅行', 4),
      (p_org, 'activity_type', 'half_day_trip', 'Half-Day Trip', '半日旅行', 5),
      (p_org, 'activity_type', 'experience', 'Experience', '体験', 6),
      (p_org, 'activity_type', 'workshop', 'Workshop', 'ワークショップ', 7),
      (p_org, 'activity_type', 'show', 'Show', 'ショー', 8),
      (p_org, 'activity_type', 'cruise', 'Cruise', 'クルーズ', 9),
      (p_org, 'activity_type', 'ride', 'Ride', '乗り物', 10),
      (p_org, 'activity_type', 'activity', 'Activity', 'アクティビティ', 11)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_duration' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'activity_duration', '30_minutes', '30 minutes', '30分', 1),
      (p_org, 'activity_duration', '1_hour', '1 hour', '1時間', 2),
      (p_org, 'activity_duration', '1_5_hours', '1.5 hours', '1.5時間', 3),
      (p_org, 'activity_duration', '2_hours', '2 hours', '2時間', 4),
      (p_org, 'activity_duration', '3_hours', '3 hours', '3時間', 5),
      (p_org, 'activity_duration', '4_hours', '4 hours', '4時間', 6),
      (p_org, 'activity_duration', 'half_day_4_5h', 'Half Day (4-5h)', '半日（4〜5時間）', 7),
      (p_org, 'activity_duration', 'full_day_6_8h', 'Full Day (6-8h)', '終日（6〜8時間）', 8),
      (p_org, 'activity_duration', 'extended_day_8_10h', 'Extended Day (8-10h)', '延長日（8〜10時間）', 9),
      (p_org, 'activity_duration', 'multi_day', 'Multi-Day', '複数日', 10)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'activity_unit' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'activity_unit', 'boat', 'boat', 'ボート', 1),
      (p_org, 'activity_unit', 'felucca', 'felucca', 'ファルーカ', 2),
      (p_org, 'activity_unit', 'ride', 'ride', '乗り物', 3),
      (p_org, 'activity_unit', 'quad', 'quad', 'バギー', 4),
      (p_org, 'activity_unit', 'vehicle', 'vehicle', '車両', 5),
      (p_org, 'activity_unit', 'ticket', 'ticket', 'チケット', 6),
      (p_org, 'activity_unit', 'group', 'group', 'グループ', 7),
      (p_org, 'activity_unit', 'session', 'session', 'セッション', 8),
      (p_org, 'activity_unit', 'person', 'person', '名', 9)
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
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'guide_duration', 'half_day', 'Half Day (4h)', '半日（4時間）', 1),
      (p_org, 'guide_duration', 'full_day', 'Full Day (8h)', '終日（8時間）', 2),
      (p_org, 'guide_duration', 'meet_greet', 'Meet & Assist day', '送迎・アシストのみ', 3),
      (p_org, 'guide_duration', 'extended', 'Extended (10h+)', '延長（10時間以上）', 4),
      (p_org, 'guide_duration', 'hourly', 'Hourly', '時間単位', 5)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'guide_language' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'guide_language', 'english', 'English', '英語', 1),
      (p_org, 'guide_language', 'arabic', 'Arabic', 'アラビア語', 2),
      (p_org, 'guide_language', 'french', 'French', 'フランス語', 3),
      (p_org, 'guide_language', 'german', 'German', 'ドイツ語', 4),
      (p_org, 'guide_language', 'spanish', 'Spanish', 'スペイン語', 5),
      (p_org, 'guide_language', 'italian', 'Italian', 'イタリア語', 6),
      (p_org, 'guide_language', 'russian', 'Russian', 'ロシア語', 7),
      (p_org, 'guide_language', 'chinese', 'Chinese', '中国語', 8),
      (p_org, 'guide_language', 'japanese', 'Japanese', '日本語', 9),
      (p_org, 'guide_language', 'portuguese', 'Portuguese', 'ポルトガル語', 10),
      (p_org, 'guide_language', 'dutch', 'Dutch', 'オランダ語', 11),
      (p_org, 'guide_language', 'polish', 'Polish', 'ポーランド語', 12)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  IF p_kind IS NULL OR p_kind = 'rate_season' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'rate_season', 'all_year', 'All Year', '通年', 1),
      (p_org, 'rate_season', 'low_season', 'Low Season', 'ローシーズン', 2),
      (p_org, 'rate_season', 'high_season', 'High Season', 'ハイシーズン', 3),
      (p_org, 'rate_season', 'peak_season', 'Peak Season', 'ピークシーズン', 4),
      (p_org, 'rate_season', 'summer', 'Summer', '夏季', 5),
      (p_org, 'rate_season', 'winter', 'Winter', '冬季', 6),
      (p_org, 'rate_season', 'year_round', 'Year Round', '通年', 7)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Airlines carry their IATA code in meta (fills the flight service code).
  IF p_kind IS NULL OR p_kind = 'airline' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, meta, rank) VALUES
      (p_org, 'airline', 'egyptair', 'EgyptAir', 'エジプト航空', '{"code": "MS"}', 1),
      (p_org, 'airline', 'nile_air', 'Nile Air', 'ナイル・エア', '{"code": "NP"}', 2),
      (p_org, 'airline', 'air_cairo', 'Air Cairo', 'エア・カイロ', '{"code": "SM"}', 3),
      (p_org, 'airline', 'flydubai', 'FlyDubai', 'フライドバイ', '{"code": "FZ"}', 4),
      (p_org, 'airline', 'emirates', 'Emirates', 'エミレーツ航空', '{"code": "EK"}', 5),
      (p_org, 'airline', 'qatar_airways', 'Qatar Airways', 'カタール航空', '{"code": "QR"}', 6),
      (p_org, 'airline', 'turkish_airlines', 'Turkish Airlines', 'トルコ航空', '{"code": "TK"}', 7),
      (p_org, 'airline', 'lufthansa', 'Lufthansa', 'ルフトハンザ航空', '{"code": "LH"}', 8),
      (p_org, 'airline', 'british_airways', 'British Airways', 'ブリティッシュ・エアウェイズ', '{"code": "BA"}', 9),
      (p_org, 'airline', 'air_france', 'Air France', 'エールフランス航空', '{"code": "AF"}', 10),
      (p_org, 'airline', 'klm', 'KLM', 'KLMオランダ航空', '{"code": "KL"}', 11),
      (p_org, 'airline', 'etihad', 'Etihad', 'エティハド航空', '{"code": "EY"}', 12),
      (p_org, 'airline', 'saudia', 'Saudia', 'サウジアラビア航空', '{"code": "SV"}', 13),
      (p_org, 'airline', 'royal_jordanian', 'Royal Jordanian', 'ロイヤル・ヨルダン航空', '{"code": "RJ"}', 14),
      (p_org, 'airline', 'middle_east_airlines', 'Middle East Airlines', 'ミドル・イースト航空', '{"code": "ME"}', 15),
      (p_org, 'airline', 'air_arabia', 'Air Arabia', 'エア・アラビア', '{"code": "G9"}', 16),
      (p_org, 'airline', 'other', 'Other', 'その他', '{}', 17)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Hotel supplements; the description is the group the form shows them under.
  IF p_kind IS NULL OR p_kind = 'hotel_supplement' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, description, rank) VALUES
      (p_org, 'hotel_supplement', 'view_nile', 'Nile View', 'ナイルビュー', 'View', 1),
      (p_org, 'hotel_supplement', 'view_sea', 'Sea View', 'シービュー', 'View', 2),
      (p_org, 'hotel_supplement', 'view_pyramid', 'Pyramid View', 'ピラミッドビュー', 'View', 3),
      (p_org, 'hotel_supplement', 'view_garden', 'Garden View', 'ガーデンビュー', 'View', 4),
      (p_org, 'hotel_supplement', 'view_pool', 'Pool View', 'プールビュー', 'View', 5),
      (p_org, 'hotel_supplement', 'upper_floor', 'Upper Floor', '高層階', 'Room', 6),
      (p_org, 'hotel_supplement', 'half_board', 'Half Board (HB)', 'ハーフボード（HB）', 'Meal Plan', 7),
      (p_org, 'hotel_supplement', 'full_board', 'Full Board (FB)', 'フルボード（FB）', 'Meal Plan', 8),
      (p_org, 'hotel_supplement', 'all_inclusive', 'All Inclusive (AI)', 'オールインクルーシブ（AI）', 'Meal Plan', 9),
      (p_org, 'hotel_supplement', 'ultra_all_inclusive', 'Ultra All Inclusive (UAI)', 'ウルトラオールインクルーシブ（UAI）', 'Meal Plan', 10)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Airport directions. The engine selects by KEY (arrival/departure, or both).
  IF p_kind IS NULL OR p_kind = 'airport_direction' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'airport_direction', 'arrival',   'Arrival',   '到着', 1),
      (p_org, 'airport_direction', 'departure', 'Departure', '出発', 2),
      (p_org, 'airport_direction', 'both',      'Both',      '両方', 3)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  -- Activity pricing types. The engine prices by KEY; the description is the
  -- explanation the form shows under each choice.
  IF p_kind IS NULL OR p_kind = 'activity_pricing_type' THEN
    INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, description, rank) VALUES
      (p_org, 'activity_pricing_type', 'per_person', 'Per Person', '1人当たり', 'Rate multiplied by number of travelers',  1),
      (p_org, 'activity_pricing_type', 'per_unit',   'Per Unit',   'ユニット単位', 'Flat rate per boat/vehicle/ride',         2),
      (p_org, 'activity_pricing_type', 'flat',       'Flat Rate',  '定額料金', 'Single price regardless of group size',   3),
      (p_org, 'activity_pricing_type', 'tiered',     'Tiered',     '段階料金', 'Per-person rate drops as the group grows', 4)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; inserted := inserted + n;
  END IF;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Add the 'year_round' option to existing orgs (the sleeper form ships it but
-- the seed lacked it), then backfill Japanese where blank — preserving
-- customization.
  INSERT INTO org_vocabularies (org_id, kind, key, label, label_ja, rank)
  SELECT id, 'rate_season', 'year_round', 'Year Round', '通年', 7 FROM organizations
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;

  UPDATE org_vocabularies SET label_ja = '通年'
    WHERE kind = 'rate_season' AND key = 'all_year' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'ローシーズン'
    WHERE kind = 'rate_season' AND key = 'low_season' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'ハイシーズン'
    WHERE kind = 'rate_season' AND key = 'high_season' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = 'ピークシーズン'
    WHERE kind = 'rate_season' AND key = 'peak_season' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = '夏季'
    WHERE kind = 'rate_season' AND key = 'summer' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = '冬季'
    WHERE kind = 'rate_season' AND key = 'winter' AND coalesce(btrim(label_ja), '') = '';
  UPDATE org_vocabularies SET label_ja = '通年'
    WHERE kind = 'rate_season' AND key = 'year_round' AND coalesce(btrim(label_ja), '') = '';

-- Self-verify: every seeded rate_season row must be bilingual after the
-- backfill (rows an operator added themselves are exempt).
DO $verify$
DECLARE
  no_ja INTEGER;
BEGIN
  SELECT count(*) INTO no_ja
  FROM org_vocabularies
  WHERE kind = 'rate_season'
    AND key IN ('all_year','low_season','high_season','peak_season','summer','winter','year_round')
    AND coalesce(btrim(label_ja), '') = '';
  IF no_ja > 0 THEN
    RAISE EXCEPTION 'rate_season relabel: % seasons without a Japanese label', no_ja;
  END IF;
END
$verify$;

COMMIT;
