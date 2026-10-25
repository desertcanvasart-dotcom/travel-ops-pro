-- ============================================
-- 20270109: what a service line's supplier is PAID in
-- ============================================
-- A rate may be entered in its own currency (rate_currency, 20260827): an
-- EGP guide, a JPY flight. Pricing converts every rate to the company's rate
-- currency the moment it is read (lib/rates/rate-currency.ts), so the line's
-- supplier_currency / supplier_cost_original / exchange_rate_used describe
-- the RATE currency — and the pricing grid and the itinerary editor read
-- the line's unit prices in it. They cannot also say "EGP".
--
-- These three columns say what the supplier is actually paid, for payables
-- only (booking supplier rows, vouchers, the expense made on confirmation):
--
--   paid_currency  the currency the rate was entered in (EGP), when it is
--                  neither the rate currency nor the trip's
--   paid_amount    the line's cost in it, as written (EGP/JPY whole units)
--   paid_rate      1 unit of paid_currency in the TRIP's currency at the
--                  time — total_cost ÷ paid_rate is the paid amount after an
--                  edit (lib/paid-currency.ts)
--
-- Prices, totals and margins never read them. Nullable, no backfill: lines
-- priced from now on carry them (the rates used for past trips were never
-- recorded).
-- ============================================

ALTER TABLE public.itinerary_services
  ADD COLUMN IF NOT EXISTS paid_currency text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS paid_rate numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'itinerary_services_paid_currency_check'
      AND conrelid = 'public.itinerary_services'::regclass
  ) THEN
    ALTER TABLE public.itinerary_services
      ADD CONSTRAINT itinerary_services_paid_currency_check
      CHECK (paid_currency IS NULL OR paid_currency IN ('USD', 'EUR', 'GBP', 'EGP', 'JPY'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'itinerary_services_paid_rate_check'
      AND conrelid = 'public.itinerary_services'::regclass
  ) THEN
    ALTER TABLE public.itinerary_services
      ADD CONSTRAINT itinerary_services_paid_rate_check
      CHECK (paid_rate IS NULL OR paid_rate > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.itinerary_services.paid_currency IS
  'Currency the supplier is paid in (the rate''s entered currency) when it differs from the rate and trip currencies. Payables only — prices never read it.';
COMMENT ON COLUMN public.itinerary_services.paid_amount IS
  'The line''s cost in paid_currency when written (EGP/JPY whole units).';
COMMENT ON COLUMN public.itinerary_services.paid_rate IS
  '1 unit of paid_currency in the trip''s currency when written; total_cost / paid_rate is the paid amount after an edit.';
