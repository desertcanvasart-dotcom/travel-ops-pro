-- ============================================================================
-- 20270124 — a hotel's area (zone) within its city
-- ============================================================================
-- Ported from autoura-saas #831 (its migration 470), step 2 of the transport
-- zones plan. A transfer to a West Bank hotel costs more than one to an East
-- Bank hotel; the hotel says which part of its city it is in. The value is a
-- key from the company's zones for that city (city_zones, 20270123). Empty =
-- the city's default zone, so nothing changes until a hotel is given an area.
--
-- On the hotel's rate row, beside its city: the row pricing chooses for a city
-- and tier. accommodation_rates is already per company (org_id, company RLS).
--
-- No foreign key: a zone is (city, key), and the row's city is free text
-- matched ignoring capitals. The app checks the key against the city's zones
-- on every save and import; deleting a zone a hotel is in is refused.
--
-- No row changes. Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.accommodation_rates ADD COLUMN IF NOT EXISTS zone text;

ALTER TABLE public.accommodation_rates DROP CONSTRAINT IF EXISTS accommodation_rates_zone_key;
ALTER TABLE public.accommodation_rates ADD CONSTRAINT accommodation_rates_zone_key
  CHECK (zone IS NULL OR zone ~ '^[a-z0-9][a-z0-9_]{0,59}$');

COMMENT ON COLUMN public.accommodation_rates.zone IS
  'The hotel''s area in its city: a city_zones key. NULL = the city''s default zone.';

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM accommodation_rates WHERE zone IS NOT NULL;  -- 0
