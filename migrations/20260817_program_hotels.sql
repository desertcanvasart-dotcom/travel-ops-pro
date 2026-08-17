-- ============================================================
-- Programme hotels: the 利用ホテル table the import dropped
-- ============================================================
-- The A.T.S source documents list each programme's standard hotels — name,
-- phone, address filled; check-in/out left blank for the departure. The parser
-- has always captured this table; the importer never stored it, so the digital
-- 日程表 printed an empty scaffold where the office's originals list hotels.
--
-- APPLY BEFORE DEPLOYING the code that reads this column.

ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS hotels jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tour_templates.hotels IS
  'Programme standard hotels as in the source 利用ホテル table: [{hotel, check_in, check_out, phone, address}]. check_in/out stay null at programme level — they are per-departure.';
