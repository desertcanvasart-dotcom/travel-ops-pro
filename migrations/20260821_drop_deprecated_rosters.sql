-- ============================================
-- Drop the retired roster tables  ***DESTRUCTIVE — APPLY DELIBERATELY***
-- ============================================
-- Kept as a SEPARATE migration on purpose. 20260821_lock_public_schema.sql
-- already makes these unreachable by the anonymous key, so nothing is exposed
-- while this waits. This file only removes the data, and that cannot be undone.
--
--   _deprecated_guides        34 rows — the dirty pre-merge guide roster,
--                             superseded 2026-06-27 when suppliers(type=guide)
--                             became canonical and `guides` became a view.
--   _deprecated_airport_staff  9 rows — superseded 2026-08-21 by suppliers
--                             (types @> 'airport_assistant').
--   _deprecated_hotel_staff    0 rows.
--
-- Before applying, if you want a copy:
--   select * from _deprecated_guides;         -- export to CSV from the editor
--
-- The live rosters are unaffected: suppliers holds 100 rows, of which 9 carry
-- the guide role and 6 the airport-assistant role.
-- ============================================

BEGIN;

DROP TABLE IF EXISTS public._deprecated_guides;
DROP TABLE IF EXISTS public._deprecated_airport_staff;
DROP TABLE IF EXISTS public._deprecated_hotel_staff;

COMMIT;
