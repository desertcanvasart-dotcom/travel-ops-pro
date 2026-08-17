-- ============================================================
-- Cached "starting from" prices on tour_templates
-- ============================================================
-- The browse catalogue used to show duration_days × €150 — a placeholder that
-- read as a real price (a 6-day programme showed €900 while the engine's
-- actual cheapest tier was €307.58). These columns hold REAL engine output,
-- written by POST /api/tours/recalculate-prices: cheapest tier at 2 pax,
-- EUR-passport, in EUR (the ground-cost base; display converts).
--
-- APPLY BEFORE DEPLOYING the code that reads these columns — the browse route
-- selects them and errors on a database that lacks them. Applied to a
-- database still running old code it is harmless: old code never touches them.
--
-- A NULL price is meaningful: not yet computed, or the engine cannot price the
-- template. The card shows no price rather than a guess; the detail page's
-- calculator always prices live.

ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS cached_starting_price numeric,
  ADD COLUMN IF NOT EXISTS cached_starting_tier text,
  ADD COLUMN IF NOT EXISTS cached_price_updated_at timestamptz;

COMMENT ON COLUMN public.tour_templates.cached_starting_price IS
  'Engine-computed cheapest per-person price (EUR, 2 pax, EUR-passport), written by /api/tours/recalculate-prices. NULL = not computed or not priceable — never a placeholder.';
COMMENT ON COLUMN public.tour_templates.cached_starting_tier IS
  'Tier the cached starting price came from (cheapest of budget/standard/deluxe/luxury).';
COMMENT ON COLUMN public.tour_templates.cached_price_updated_at IS
  'When the cache was last recomputed; staleness is visible, not hidden.';
