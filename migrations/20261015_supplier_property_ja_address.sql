-- ============================================
-- A hotel or ship's Japanese name and address, for the 日程表
-- ============================================
-- The 日程表 (customer daily itinerary) lists 利用ホテル — hotel name, phone,
-- address — as the office's own programme document typed it at import, in
-- katakana, and never the hotel a trip was actually priced with; the ship was
-- never named at all ("クルーズ船名：" left blank). Operator decision
-- 2026-09-17: a customer's 日程表 lists the trip's own hotels and ship.
--
-- Rates carry English names, so a new hotel would print in English. The
-- property (supplier_properties — one row per hotel or ship, shared by all of
-- its rate rows) gains the name the office writes for customers and the
-- address it prints. Phone already lives there (contact_phone). Both optional:
-- blank prints the English name / no address, never a guess.
BEGIN;

ALTER TABLE public.supplier_properties
  ADD COLUMN IF NOT EXISTS name_ja text,
  ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.supplier_properties.name_ja IS
  'The name printed on Japanese customer documents (日程表 利用ホテル), e.g. シュタイゲンベルガー ピラミッズ カイロ. Blank = the English name.';
COMMENT ON COLUMN public.supplier_properties.address IS
  'The address printed on customer documents (日程表 利用ホテル).';

COMMIT;
