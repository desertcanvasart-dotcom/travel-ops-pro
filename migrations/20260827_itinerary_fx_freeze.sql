-- ============================================
-- FX freezes when the itinerary is approved
-- ============================================
-- While a quotation is being prepared it converts at the current rate. The
-- moment it is CONFIRMED, the exchange rates in force are frozen onto the
-- file — otherwise a trip nobody touched would report a different cost and a
-- different margin two months later, purely because the pound moved. From
-- then on a margin only changes when a person deliberately re-prices the
-- file (POST /api/itineraries/[id]/reprice-fx), and that action carries
-- their name. Decided 2026-08-27; plan: docs/plans/per-rate-currency.md §7.
--
-- `fx_frozen` is the snapshot: { base, rates, frozen_at, frozen_by, source }
--   base    — the org's rate currency the rates are quoted against
--   rates   — { USD: 1, EGP: 50.1, JPY: 150.2, ... } (1 base = rate units)
--   source  — 'confirm' (frozen automatically at approval) | 'reprice'
--             (explicitly replaced by an operator)
--
-- NULL = never frozen: every pre-existing itinerary, and drafts. Freezing
-- happens ONCE, at the first transition to confirmed — un-confirming and
-- re-confirming does not silently re-freeze; re-pricing is the explicit path.
--
-- Idempotent: safe to run twice.

ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS fx_frozen JSONB;

COMMENT ON COLUMN public.itineraries.fx_frozen IS
  'Exchange-rate snapshot frozen at first confirmation: {base, rates, frozen_at, frozen_by, source}. NULL = not frozen. Replaced only by the explicit re-price action.';
