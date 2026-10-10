-- ============================================================================
-- 20261124 — a trip keeps the season premium it was priced with
-- ============================================================================
--
-- The pricing grid charges a season premium on top of the service lines and
-- stored it only inside itineraries.total_cost. The quote PDF and the
-- trip-page invoice add up the lines, so they dropped it (¥1,000,000) while
-- the contract and the booking read total_cost (¥1,150,000). The premium is
-- now kept on its own; documents print it as its own line.
--
-- Trips priced before this read 0 until they are saved from the grid again.
-- Replay-safe.

ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS season_uplift_amount numeric(12,2) DEFAULT 0 NOT NULL;
