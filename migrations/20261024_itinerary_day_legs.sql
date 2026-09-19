-- ============================================
-- An itinerary day can name the route its flight actually flies
-- ============================================
-- A ticket leg runs FROM the previous day's city TO this day's city. That
-- inference is right for a domestic hop and useless for the flight the
-- customers arrive on: day 1 has no day before it, so an international
-- arrival has no origin to infer, and the leg is simply never collected.
--
-- Migration 20261023 made it possible to PRICE Tokyo→Cairo. This makes it
-- possible to SELL it — to put that flight on a real trip rather than only in
-- a tour template or a calculator scratchpad.
--
-- The tour-template side has carried leg_from / leg_to / leg_assist since
-- 2026-09-17 (lib/pricing/flight-leg, the NMS803 day-2 connection). They live
-- in that side's itinerary JSONB, so itinerary_days never got the columns and
-- the itinerary editor never got the fields. Same three names, same meanings,
-- same sanitizers — an itinerary and the template it came from should not
-- disagree about what a leg is.

BEGIN;

ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS leg_from TEXT,
  ADD COLUMN IF NOT EXISTS leg_to TEXT,
  ADD COLUMN IF NOT EXISTS leg_assist JSONB;

COMMENT ON COLUMN public.itinerary_days.leg_from IS
  'The CITY this day''s flight or train leaves from, when it is not the '
  'previous day''s city — an international arrival has no previous day. The '
  'engine resolves it to airports through the airport vocabulary, so it must '
  'be a city some airport serves. Null = infer, as before.';
COMMENT ON COLUMN public.itinerary_days.leg_to IS
  'The CITY this day''s flight or train arrives in, when it is not this day''s '
  'own city. Null = infer.';
COMMENT ON COLUMN public.itinerary_days.leg_assist IS
  '{"from":bool,"to":bool} — whether the party is met at each end''s airport. '
  'Sanitised by lib/pricing/flight-leg sanitizeLegAssist.';

COMMIT;
