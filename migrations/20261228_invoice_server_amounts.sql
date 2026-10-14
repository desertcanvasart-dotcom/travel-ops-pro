-- ============================================
-- Invoice amounts come from the server; a manual override is recorded
-- ============================================
-- POST /api/invoices used the trip price the browser sent (total_amount,
-- full_trip_cost), so an agent could bill any amount for a trip. From here the
-- server works the invoice base out from the saved trip (its priced lines plus
-- the season supplement, the figure the itinerary page shows) and computes a
-- deposit, a final and a full invoice from it. A different amount is a manual
-- override, allowed to admin and manager only, and the invoice records it:
--
--   amount_source    where the figure came from:
--                      'trip'             worked out from the trip's saved total
--                      'parent'           a final worked out from its deposit invoice
--                                         (no trip is linked)
--                      'manual_override'  an admin or manager billed another amount
--                                         for a trip; see override_*
--                      'manual_entry'     an invoice with no trip, typed by an admin
--                                         or manager
--                    NULL on invoices issued before this: their source is unknown.
--   computed_amount  what the server worked out for the tour part of the invoice
--                    (before VAT, without the insurance and extras it adds), in
--                    the invoice's currency. NULL when there was nothing to work
--                    out from.
--   override_amount  the amount billed instead, for the same part. NULL unless
--                    amount_source = 'manual_override'.
--   override_reason  why, in the person's words. Required with an override.
--   override_by      who (auth user id).
--
-- Existing invoices keep every figure; the new columns stay NULL for them.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, named constraints added only when
-- missing, the table guarded with to_regclass. Applying it twice changes
-- nothing the second time.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_source text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS computed_amount numeric;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS override_amount numeric;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS override_reason text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS override_by uuid;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_source_known') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_amount_source_known
        CHECK (amount_source IS NULL OR amount_source IN ('trip', 'parent', 'manual_override', 'manual_entry'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_computed_amount_nonnegative') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_computed_amount_nonnegative
        CHECK (computed_amount IS NULL OR computed_amount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_override_amount_nonnegative') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_override_amount_nonnegative
        CHECK (override_amount IS NULL OR override_amount >= 0);
    END IF;

    -- An override says why: a figure with no reason is not an override.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_override_has_reason') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_override_has_reason
        CHECK (
          (amount_source IS DISTINCT FROM 'manual_override')
          OR (override_amount IS NOT NULL AND length(btrim(COALESCE(override_reason, ''))) > 0)
        );
    END IF;
  END IF;
END
$$;

COMMIT;
