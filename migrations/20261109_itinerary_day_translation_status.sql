-- ============================================================================
-- 20261109 — A translated day knows where it came from
-- ============================================================================
--
-- itinerary_day_versions held a day's text in a language and nothing about
-- it: whether a model wrote it or a person checked it, and which source text
-- it was translated from. So the itinerary page could only say a language was
-- "created" or "not created" — it could not say a Japanese day was
-- machine-made and unread, or that the English it was translated from had been
-- rewritten since and the Japanese now describes a different day.
--
--   status       'machine'  — written by the translator, nobody has read it
--                'reviewed' — saved by a person
--                NULL       — made before this column existed; unknown
--   source_hash  fingerprint of the source day text at translation time
--                (lib/itineraries/content-language.ts dayTextHash). When the
--                source's current fingerprint differs, the row is outdated.
--                NULL — not known, so never reported outdated.
--   translated_at when the text was last written by either path
--
-- Additive and replay-safe. Existing rows keep NULLs: their provenance is
-- genuinely unknown and the page says so rather than guessing.
-- ============================================================================

BEGIN;

ALTER TABLE public.itinerary_day_versions
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS translated_at TIMESTAMPTZ;

ALTER TABLE public.itinerary_day_versions
  DROP CONSTRAINT IF EXISTS itinerary_day_versions_status_check;
ALTER TABLE public.itinerary_day_versions
  ADD CONSTRAINT itinerary_day_versions_status_check
  CHECK (status IS NULL OR status IN ('machine', 'reviewed'));

COMMIT;
