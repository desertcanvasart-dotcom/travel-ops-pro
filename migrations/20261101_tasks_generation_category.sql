-- 20261101_tasks_generation_category.sql
-- Generated operations tasks become one per service category per itinerary
-- (lib/tasks/itinerary-tasks.ts), and generating again syncs them instead of
-- adding a second full set.
--
-- service_type        — the category a generated task covers ('accommodation',
--                       'transportation', …). NULL on tasks created by hand and
--                       on the old AI-written tasks; those are never touched.
-- generation_snapshot — what the task listed when last generated
--                       ({header, lines}), so a regenerate can tell whether the
--                       itinerary changed and say exactly what changed.
--
-- Additive: two nullable columns and an index.

BEGIN;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS service_type character varying(50);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS generation_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_generated_per_itinerary
  ON public.tasks USING btree (linked_id, service_type)
  WHERE (linked_type = 'itinerary' AND service_type IS NOT NULL);

COMMIT;
