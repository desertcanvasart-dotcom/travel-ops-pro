-- ============================================
-- Currency belongs to the rate, not the organisation
-- ============================================
-- Accounting records transportation, guiding, meals and other land services
-- in EGYPTIAN POUNDS — the currency the supplier contract is written in and
-- the payable is settled in — while hotels, cruises and most flights are
-- contracted in USD, and Japan-purchased flights in JPY. The system held ONE
-- rate currency for the whole organisation (organizations.rate_currency), so
-- there was nowhere to say that.
--
-- `rate_currency` on each rate row names the currency its numbers are in.
-- NULL means "the organisation default" — every existing row keeps exactly
-- the meaning it has today, which is why there is NO backfill: a backfill
-- could change prices, this cannot.
--
-- The pricing engine converts a COPY of the row's monetary columns into its
-- run currency at read time (lib/rates/rate-currency.ts); the stored numbers
-- are never rewritten. Plan: docs/plans/per-rate-currency.md.
--
-- Deliberately NOT here: accommodation_rates and nile_cruises (contracted in
-- the org currency; their prices live in the `seasons` JSONB and join this
-- model in a later phase), b2b_transport_packages (cruise bundled transport,
-- same phase), and `guides` (a VIEW over suppliers — cannot take a column).
--
-- Idempotent: safe to run twice.

ALTER TABLE public.transportation_rates  ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.guide_rates           ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.meal_rates            ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.entrance_fees         ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.activity_rates        ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.tipping_rates         ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.airport_staff_rates   ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.hotel_staff_rates     ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.flight_rates          ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.train_rates           ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.sleeping_train_rates  ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.fixed_daily_costs     ADD COLUMN IF NOT EXISTS rate_currency TEXT;

-- One constraint per table, name-stable so the second run is a no-op.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transportation_rates', 'guide_rates', 'meal_rates', 'entrance_fees',
    'activity_rates', 'tipping_rates', 'airport_staff_rates',
    'hotel_staff_rates', 'flight_rates', 'train_rates',
    'sleeping_train_rates', 'fixed_daily_costs'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_rate_currency_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (rate_currency IS NULL OR rate_currency IN (''USD'', ''EUR'', ''GBP'', ''EGP'', ''JPY''))',
        t, t || '_rate_currency_check'
      );
    END IF;

    EXECUTE format(
      'COMMENT ON COLUMN public.%I.rate_currency IS ''Currency this row''''s prices are entered in. NULL = the organisation default (organizations.rate_currency). The engine converts a copy at read time; the stored numbers are never rewritten.''',
      t
    );
  END LOOP;
END $$;
