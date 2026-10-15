-- ============================================================================
-- 20261130 — who disputed a supplier invoice, and when (AUDIT H32)
-- ============================================================================
--
-- Approving and paying a supplier bill record who and when (approved_by /
-- approved_at, paid_at). Disputing it — which stops it being paid — recorded
-- only the reason, so "who put this on hold?" had no answer but the activity
-- log. The dispute route fills these from now on; disputes made before stay
-- NULL.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS. Safe before the app deploy (nothing
-- reads the columns yet) and after it (the route writes them in a separate
-- update and only warns while they are missing).

ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS disputed_by uuid;
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS disputed_at timestamp with time zone;
