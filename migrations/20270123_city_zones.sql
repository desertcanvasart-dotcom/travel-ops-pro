-- ============================================================================
-- 20270123 — each company's zones: the parts of a city that change a transfer's price
-- ============================================================================
-- Ported from autoura-saas #830 (its migration 469), step 1 of the transport
-- zones plan. A Cairo airport transfer costs one price to a Downtown hotel and
-- another to a 6th of October one; a Luxor transfer to a West Bank hotel costs
-- more than to an East Bank one. Each city has its own list of zones, ONE of
-- which is the default: the zone a hotel or transport card with no zone
-- belongs to.
--
-- A table, not a vocabulary kind: a zone belongs to a CITY, and vocabulary
-- keys are unique per company across all cities. Each company keeps its own
-- list; nothing is seeded.
--
-- This step only stores the lists. Hotels and transport cards will point at a
-- zone by its key in the next steps; the engine reads them after that. No
-- price changes here.
--
-- Per company: org_id → organizations, RLS on, read and written server-side
-- only through the service-role client filtered by org_id (the
-- supplier_cities pattern, 20270118). Admins change zones
-- (app/api/settings/zones).
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.city_zones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  city        text NOT NULL CHECK (btrim(city) <> ''),
  -- Stable: hotels and cards will point at it, so a rename keeps the key.
  key         text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_]{0,59}$'),
  label       text NOT NULL CHECK (btrim(label) <> ''),
  is_default  boolean NOT NULL DEFAULT false,
  rank        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A zone key is unique within its city (cities compared ignoring capitals and
-- the spaces at the ends, as the rate pages store them as typed).
CREATE UNIQUE INDEX IF NOT EXISTS city_zones_key_idx
  ON public.city_zones (org_id, lower(btrim(city)), key);

-- At most one default per city.
CREATE UNIQUE INDEX IF NOT EXISTS city_zones_one_default_idx
  ON public.city_zones (org_id, lower(btrim(city)))
  WHERE is_default;

COMMENT ON TABLE public.city_zones IS
  'Each company''s zones per city (Luxor: East Bank, West Bank); one default per city. 20270123.';

ALTER TABLE public.city_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_zones FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.city_zones TO service_role;

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM city_zones;  -- 0: nothing is seeded
