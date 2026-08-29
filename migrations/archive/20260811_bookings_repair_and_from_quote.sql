-- ============================================================================
-- Bookings: schema repair + quote→booking conversion
-- ============================================================================
-- Two things at once, because the second cannot work without the first.
--
-- PART 1 — REPAIR. The bookings module is currently NON-FUNCTIONAL in prod:
--
--   a) `create_bookings_tables.sql` declares deposit_paid_date, emergency_phone,
--      cancelled_at and cancellation_reason, but none of them reached the live
--      table. Same failure mode as exchange_rate_snapshots: a migration whose
--      CREATE ran but whose later statements did not.
--
--   b) `POST /api/bookings` inserts partner_id and partner_name, which have
--      NEVER existed on this table. Every call fails with PGRST204 ("Could not
--      find the 'partner_id' column"), which is why `bookings` has 0 rows.
--
--   c) `record_booking_payment()` (migration 20260624) writes deposit_paid_date,
--      so recording a booking payment fails at runtime too.
--
--   d) `booking_passengers` was never created — migration 20260629 is unapplied,
--      so /api/bookings/[id]/passengers is broken. It is NOT re-declared here;
--      apply 20260629_booking_passengers.sql as well.
--
-- PART 2 — FEATURE. quote_id / quote_type / deposit_percent, so an accepted
-- quote converts to a booking in one call with an explicit deposit percentage,
-- and one quote can never produce two bookings (and two deposits).
--
-- All additive: ADD COLUMN IF NOT EXISTS only, no type changes, no drops.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1a — columns the original migration declared but never created
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_paid_date DATE,
  ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN public.bookings.deposit_paid_date IS
  'Set by record_booking_payment() on the FIRST transition to deposit_paid. '
  'Its absence broke every booking payment until 2026-08-11.';

-- ----------------------------------------------------------------------------
-- PART 1b — partner columns the API has always inserted
-- ----------------------------------------------------------------------------
-- Denormalised partner_name alongside the FK matches how client_name/email are
-- already denormalised onto this table: a booking is an operational record and
-- should keep reading correctly even if the partner row is later renamed.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.b2b_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_bookings_partner_id
  ON public.bookings (partner_id);

-- ----------------------------------------------------------------------------
-- PART 2 — quote → booking link
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS quote_id UUID,
  ADD COLUMN IF NOT EXISTS quote_type VARCHAR(3),
  ADD COLUMN IF NOT EXISTS deposit_percent NUMERIC(5,2);

-- No FK on quote_id: it points into EITHER tour_quotes (B2B) or b2c_quotes
-- (B2C) depending on quote_type, and Postgres cannot express a conditional
-- reference. quote_type is CHECK-constrained instead, and the route resolves
-- the correct table. (A NULL quote_type means a booking made straight from an
-- itinerary, which is still supported.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_quote_type_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_quote_type_check
      CHECK (quote_type IS NULL OR quote_type IN ('b2b', 'b2c'));
  END IF;
END $$;

-- A percentage is a percentage.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_deposit_percent_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_deposit_percent_check
      CHECK (deposit_percent IS NULL OR (deposit_percent >= 0 AND deposit_percent <= 100));
  END IF;
END $$;

-- THE important constraint. Without it, two concurrent conversions of the same
-- quote both pass the route's "already booked?" check and both insert — two
-- bookings, two deposits, one trip. The route's check is a fast path for a
-- friendly error; THIS is the guarantee.
--
-- Partial (WHERE quote_id IS NOT NULL) so bookings created directly from an
-- itinerary, which have no quote, do not collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_one_per_quote
  ON public.bookings (quote_id, quote_type)
  WHERE quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_quote
  ON public.bookings (quote_id, quote_type);

COMMENT ON COLUMN public.bookings.quote_id IS
  'The quote this booking was converted from. Resolves against tour_quotes '
  'when quote_type = b2b, b2c_quotes when b2c. NULL for bookings created '
  'directly from an itinerary.';
COMMENT ON COLUMN public.bookings.deposit_percent IS
  'The percentage used to compute deposit_amount at conversion time. Stored so '
  'the figure stays explainable later, when a different default may be in use.';

-- ============================================================================
-- Verify after applying:
--
--   -- all 9 columns present:
--   select column_name from information_schema.columns
--    where table_name = 'bookings'
--      and column_name in ('deposit_paid_date','emergency_phone','cancelled_at',
--                          'cancellation_reason','partner_id','partner_name',
--                          'quote_id','quote_type','deposit_percent');
--
--   -- the guarantee exists:
--   select indexname from pg_indexes where indexname = 'uq_bookings_one_per_quote';
--
-- THEN apply migrations/20260629_booking_passengers.sql — it was never applied,
-- so the passenger manifest route is still broken after this migration.
-- ============================================================================
