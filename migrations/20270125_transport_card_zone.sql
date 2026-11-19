-- ============================================================================
-- 20270125 — a transport rate's pickup area, and the sights a sightseeing rate covers
-- ============================================================================
-- Ported from autoura-saas #832 (its migration 471), step 3 of the transport
-- zones plan.
--
-- zone: which area of its city the rate prices, a key from the company's zones
--   for that city (city_zones, 20270123). Empty = the city's default zone, so
--   every existing rate keeps meaning what it means today. A Luxor airport
--   transfer for West Bank hotels and one for East Bank hotels are two rates.
--
-- covers_sights: for a sightseeing rate, the sights it covers (Luxor East Bank:
--   Karnak Temple, Luxor Temple), by their entrance-fee names. Step 4 picks
--   the smallest rate covering every sight of the day. Empty = not stated.
--
-- travel-ops-pro has no route unique index (the "same rate" rule is the app's,
-- lib/rates/transport-natural-key.ts, which now includes the zone).
--
-- Until step 4 the engine leaves out rates in a NON-default area (they would
-- otherwise compete with the city's rate on the same lookup); rates with no
-- area, or the city's default area, price exactly as before.
--
-- transportation_rates is already per company (org_id, company RLS). No row
-- changes. Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.transportation_rates ADD COLUMN IF NOT EXISTS zone text;
ALTER TABLE public.transportation_rates ADD COLUMN IF NOT EXISTS covers_sights text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.transportation_rates DROP CONSTRAINT IF EXISTS transportation_rates_zone_key;
ALTER TABLE public.transportation_rates ADD CONSTRAINT transportation_rates_zone_key
  CHECK (zone IS NULL OR zone ~ '^[a-z0-9][a-z0-9_]{0,59}$');

COMMENT ON COLUMN public.transportation_rates.zone IS
  'The pickup area in its city: a city_zones key. NULL = the city''s default zone.';
COMMENT ON COLUMN public.transportation_rates.covers_sights IS
  'Sightseeing rates: the entrance-fee names of the sights it covers. Empty = not stated.';

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM transportation_rates WHERE zone IS NOT NULL OR covers_sights <> '{}';  -- 0
