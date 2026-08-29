-- ============================================
-- Retire the deprecated roster tables  ***DESTRUCTIVE — APPLY DELIBERATELY***
-- ============================================
-- The first version of this file just issued DROP TABLE and failed:
--
--   cannot drop table _deprecated_guides because other objects depend on it
--   DETAIL: constraint itineraries_assigned_guide_id_fkey on table itineraries
--           depends on table _deprecated_guides
--           view resource_availability depends on table _deprecated_guides
--
-- DROP ... CASCADE would have obeyed the hint and silently taken a live
-- foreign key with it. Both dependencies are handled explicitly instead, and
-- the first one turns out to be a defect worth fixing on its own.
--
-- THREE FOREIGN KEYS POINT AT THE DEAD TABLES, not the one the error named
-- (Postgres reports the first it meets). Enumerated from PostgREST's own
-- relationship metadata:
--
--   itineraries.assigned_guide_id         -> _deprecated_guides.id
--   itineraries.assigned_airport_staff_id -> _deprecated_airport_staff.id
--   itineraries.assigned_hotel_staff_id   -> _deprecated_hotel_staff.id
--
-- /api/guides serves rows from `suppliers`, so assigning anyone from the
-- current roster violates the constraint. All three columns are empty in
-- production, which is the symptom: these features have been unusable since
-- the merges that made suppliers canonical (guides 2026-06-27, staff
-- 2026-08-21), not merely unused. The calendar reads assigned_guide_id for
-- double-booking detection and its guide filter, so it has been reading a
-- column nothing could ever write.
--
-- resource_availability is a view over the dead table. No application code
-- references it (grepped across app/, lib/, components/) and its guide columns
-- are null in all 7 rows, so it is dropped rather than repointed. To bring it
-- back, recreate it over suppliers WITH (security_invoker = on).
--
--   _deprecated_guides        34 rows — pre-merge guide roster
--   _deprecated_airport_staff  9 rows — superseded 2026-08-21
--   _deprecated_hotel_staff    0 rows
--
-- Export first if you want a copy:  select * from _deprecated_guides;
-- Live rosters are untouched: suppliers holds 100 rows.
-- ============================================

BEGIN;

-- 1. Repoint all three foreign keys at the canonical roster. This is what
--    makes "assign a guide / airport assistant / hotel assistant to a trip"
--    work at all. ON DELETE SET NULL so retiring a supplier never blocks a
--    delete; the trip simply loses that assignment.
ALTER TABLE public.itineraries
  DROP CONSTRAINT IF EXISTS itineraries_assigned_guide_id_fkey,
  DROP CONSTRAINT IF EXISTS itineraries_assigned_airport_staff_id_fkey,
  DROP CONSTRAINT IF EXISTS itineraries_assigned_hotel_staff_id_fkey;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_assigned_guide_id_fkey
    FOREIGN KEY (assigned_guide_id) REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD CONSTRAINT itineraries_assigned_airport_staff_id_fkey
    FOREIGN KEY (assigned_airport_staff_id) REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD CONSTRAINT itineraries_assigned_hotel_staff_id_fkey
    FOREIGN KEY (assigned_hotel_staff_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- No data migration needed: all three columns are empty in production,
-- precisely because nothing could ever satisfy the old constraints.

-- 2. The view over the dead table; unused by the app.
DROP VIEW IF EXISTS public.resource_availability;

-- 3. Now the tables come out cleanly, no CASCADE.
DROP TABLE IF EXISTS public._deprecated_guides;
DROP TABLE IF EXISTS public._deprecated_airport_staff;
DROP TABLE IF EXISTS public._deprecated_hotel_staff;

COMMIT;

-- Verify: assigning a guide now succeeds where it previously raised a foreign
-- key violation.
--   update itineraries set assigned_guide_id = (select id from suppliers where 'guide' = any(types) limit 1)
--    where itinerary_code = '<some trip>';
