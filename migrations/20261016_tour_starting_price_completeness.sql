-- ============================================
-- A tour's "Starting from" price says whether it is complete
-- ============================================
-- The Tours page card shows a cached "Starting from" price per person
-- (tour_templates.cached_starting_price). Nothing ever filled it — the only
-- writer was a manual endpoint with no button and no schedule — so every card
-- read N/A (operator, 2026-09-17). It is now refreshed on save, nightly and on
-- demand (lib/tours/starting-price), for 2 travellers with non-EU (Japanese)
-- passports at the cheapest tier whose price is complete.
--
-- A programme whose every tier still has services with no rate shows its
-- cheapest price MARKED incomplete, never as if it were real — so the cache
-- records whether the price is complete and how many services lack a rate.
BEGIN;

ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS cached_price_complete boolean,
  ADD COLUMN IF NOT EXISTS cached_price_gaps integer;

COMMENT ON COLUMN public.tour_templates.cached_price_complete IS
  'Whether cached_starting_price is a complete price. false = cheapest tier still has services with no rate (cached_price_gaps).';
COMMENT ON COLUMN public.tour_templates.cached_price_gaps IS
  'How many services had no rate in the cached starting price (0 when complete).';

COMMIT;
