-- ============================================================
-- Payment schedule, and the trip cost an invoice is a share of
-- ============================================================
-- Two things a deposit invoice needs and could not previously say.
--
-- 1. WHAT THE TRIP COSTS.
--    /api/invoices computed `fullTripCost` with the comment "Store original
--    trip cost" and then never stored it — there was no column. The PDF
--    therefore reconstructed it by dividing the deposit back out:
--
--        ¥370,873 × 100 / 20 = ¥1,854,365    (the trip is ¥1,854,367)
--
--    That reconstruction cannot recover what rounding removed, so the invoice
--    quoted a trip cost ¥2 below the real one. The same flaw hit euro invoices,
--    losing cents instead of yen.
--
-- 2. WHEN EACH PART IS DUE.
--    The operator's terms are 20% within three days of booking and the balance
--    sixty days before departure, and their paperwork shows both dates. A
--    booking had one `payment_deadline` and nowhere to record the second, nor
--    to record that an exception had been agreed with the customer.
--
-- Nothing is backfilled. There is one invoice in the system and no bookings,
-- so every column below starts NULL and is populated going forward. NULL means
-- "not recorded", which is honest, and the PDF falls back to its old behaviour
-- rather than printing a blank.
-- ============================================================

-- ---------- the operator's standing terms ----------
-- On organizations rather than a settings table: organization_settings exists
-- in this database but has no migration and no code reads it, so building on it
-- would be building on something nobody can see.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS deposit_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS deposit_due_days INTEGER,
  ADD COLUMN IF NOT EXISTS balance_due_days_before_departure INTEGER;

COMMENT ON COLUMN public.organizations.deposit_percent IS
  'Share of the total taken as a deposit. NULL falls back to DEFAULT_PAYMENT_RULE in lib/payment-schedule.ts (20).';
COMMENT ON COLUMN public.organizations.deposit_due_days IS
  'Days after a booking is taken that the deposit falls due. NULL falls back to 3.';
COMMENT ON COLUMN public.organizations.balance_due_days_before_departure IS
  'Days before departure that the balance falls due. NULL falls back to 60.';

-- A percentage outside 0–100 is not a deposit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_deposit_percent_range'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_deposit_percent_range
      CHECK (deposit_percent IS NULL OR (deposit_percent >= 0 AND deposit_percent <= 100));
  END IF;
END $$;

-- Negative day counts would put a deadline before the event it hangs off.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_payment_days_non_negative'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_payment_days_non_negative
      CHECK (
        (deposit_due_days IS NULL OR deposit_due_days >= 0)
        AND (balance_due_days_before_departure IS NULL OR balance_due_days_before_departure >= 0)
      );
  END IF;
END $$;

-- ---------- what the trip costs ----------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS full_trip_cost NUMERIC(12,2);

COMMENT ON COLUMN public.invoices.full_trip_cost IS
  'The whole trip price this invoice is a share of. Set on deposit and final invoices so the breakdown is read rather than reconstructed by dividing the deposit back out, which loses whatever rounding removed.';

-- ---------- the second date, and the fact of an exception ----------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS balance_due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_schedule_overridden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_schedule_note TEXT;

COMMENT ON COLUMN public.bookings.balance_due_date IS
  'When the balance falls due. Derived as departure minus the org rule, or set by hand when an exception was agreed. payment_deadline holds the deposit date.';
COMMENT ON COLUMN public.bookings.payment_schedule_overridden IS
  'True when a human set the dates or the deposit rather than taking the standing rule, so an unusual schedule reads as a decision and not a mistake.';
COMMENT ON COLUMN public.bookings.payment_schedule_note IS
  'What was agreed with the customer, when the schedule departs from the rule.';

-- Finding the bookings whose balance is coming due is the collections query.
CREATE INDEX IF NOT EXISTS idx_bookings_balance_due_date
  ON public.bookings (balance_due_date)
  WHERE balance_due_date IS NOT NULL;
