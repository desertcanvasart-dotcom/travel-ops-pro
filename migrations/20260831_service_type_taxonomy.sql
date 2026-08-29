-- ============================================
-- One spelling per service type
-- ============================================
-- The app spoke two dialects of its own taxonomy: the AI itinerary writer
-- said `airport_service` / `hotel_service`, the pricing grid's slot mapping
-- emitted `airport_services` / `hotel_services`, and both landed in
-- itinerary_services.service_type. Every consumer coped its own way — the
-- departments table listed all four spellings so routing would not drop rows,
-- which is exactly what the external audit read off the Departments screen:
-- "duplicate service-type values, both routable" (AUT-L02).
--
-- The canon is the SINGULAR (lib/service-types.ts holds the vocabulary and
-- the reasoning). The code now writes only the canon; this migration heals
-- what is stored and guards what comes next.
--
-- On the reference deployment itinerary_services holds zero rows today, so
-- the UPDATE below is a no-op there — but this product is installed on other
-- servers (docs/SELF-HOSTING.md), and any install that priced a trip through
-- the grid before this migration has plural rows to heal.

BEGIN;

-- 1. Heal stored service rows.
UPDATE itinerary_services
SET service_type = CASE service_type
      WHEN 'airport_services' THEN 'airport_service'
      WHEN 'hotel_services'   THEN 'hotel_service'
    END
WHERE service_type IN ('airport_services', 'hotel_services');

-- 2. Collapse the departments' both-spellings workaround. Migration 20260812
--    (and lib/departments.ts) listed both forms so neither dialect's rows
--    fell through routing; with one dialect left, the duplicates are only
--    confusing — they render as two entries meaning the same thing, which is
--    what the audit saw. DISTINCT also drops any duplicate the operator
--    added by hand. (Array order is not semantic here — routing is a lookup.)
UPDATE departments
SET service_types = (
  SELECT array_agg(DISTINCT CASE t
           WHEN 'airport_services' THEN 'airport_service'
           WHEN 'hotel_services'   THEN 'hotel_service'
           ELSE t
         END)
  FROM unnest(service_types) AS t
)
WHERE service_types && ARRAY['airport_services', 'hotel_services'];

-- 3. Refuse a third dialect. NOT VALID on purpose: every NEW row must speak
--    the canon, but an install carrying some unknown legacy value keeps
--    working and can be inspected instead of failing its upgrade halfway.
--    (The two known aliases are already healed above; this is insurance
--    against values we have never seen, not against the ones we have.)
ALTER TABLE itinerary_services
  ADD CONSTRAINT itinerary_services_service_type_check
  CHECK (service_type IN (
    'accommodation', 'activity', 'airport_service', 'cruise', 'entrance',
    'extra', 'flight', 'guide', 'hotel_service', 'meal', 'supplies', 'tips',
    'transportation'
  )) NOT VALID;

COMMENT ON CONSTRAINT itinerary_services_service_type_check ON itinerary_services IS
  'One vocabulary — lib/service-types.ts. Added 20260831 after the grid and the AI writer spent months writing the same column in two spellings (AUT-L02).';

COMMIT;
