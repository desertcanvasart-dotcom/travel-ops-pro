-- ============================================
-- A share link remembers what was approved about its price
-- ============================================
-- Since #449 a share link for an itinerary with services that have no cost is
-- only created when the operator says "share anyway". That approval was not
-- recorded, and the public page never looked again: a service that lost its
-- cost AFTER the link went out still showed the traveller a total that left it
-- out (review of #449).
--
-- The link now records exactly which gaps were approved, when, and by whom.
-- The public page re-checks on every view and shows the price only while every
-- current gap is one of those. A new gap withholds the price until the
-- operator looks again (lib/itineraries/share-approval.ts).
--
-- incomplete_approved_gaps is a list of {day, name}; NULL means nothing was
-- approved, so any gap withholds the price. No FK on the approver: the row is a
-- record, and it must survive the user leaving.
BEGIN;

ALTER TABLE public.itinerary_shares
  ADD COLUMN IF NOT EXISTS incomplete_approved_gaps jsonb,
  ADD COLUMN IF NOT EXISTS incomplete_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS incomplete_approved_by uuid;

COMMENT ON COLUMN public.itinerary_shares.incomplete_approved_gaps IS
  'Services with no cost the operator approved sharing, as [{day, name}]. The public page withholds the price if any other gap appears.';

COMMIT;
