-- 20261102_tasks_checklist.sql
-- A generated operations task becomes a checklist: one row per service, each
-- ticked as booked with its confirmation number (lib/tasks/itinerary-tasks.ts).
--
-- checklist — [{ key, day_from, day_to, date_from, date_to, city, name,
--               quantity, nights, supplier, notes,
--               booked, confirmation, booked_at, is_new?, removed? }]
--             The key is the service line as text; regenerating matches rows
--             by it, so a row that has not changed keeps its tick. NULL on
--             tasks made by hand, and on generated tasks until they are next
--             generated (they are converted then).
--
-- Additive: one nullable column.

BEGIN;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS checklist jsonb;

COMMIT;
