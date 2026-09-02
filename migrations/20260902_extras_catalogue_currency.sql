-- ============================================
-- Extras catalogue: per-row currency
-- ============================================
-- extras_catalogue was created "in the ORG'S RATE CURRENCY" — the one rate
-- table without a rate_currency column after the 2026-08-27 campaign gave
-- every other one a per-row currency. The operator's rule is that a cost is
-- recorded in the currency the contract is written in (transport and guiding
-- in EGP, hotels in USD), and an airport fast-track or a luggage fee is no
-- different. The form could only say "(USD)" above the amount, which was
-- true but not what the operator wanted recorded.
--
-- Same shape as 20260827_rate_currency: nullable TEXT, NULL = the org's rate
-- currency (exactly what every existing row means today, so no price moves),
-- same five-code CHECK. The engine converts a copy at the fetch boundary
-- (lib/rates/rate-currency.ts, extras_catalogue entry); the stored number is
-- never rewritten.

ALTER TABLE public.extras_catalogue
  ADD COLUMN IF NOT EXISTS rate_currency TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'extras_catalogue_rate_currency_check'
      AND conrelid = 'public.extras_catalogue'::regclass
  ) THEN
    ALTER TABLE public.extras_catalogue
      ADD CONSTRAINT extras_catalogue_rate_currency_check
      CHECK (rate_currency IS NULL OR rate_currency IN ('USD', 'EUR', 'GBP', 'EGP', 'JPY'));
  END IF;
END $$;

COMMENT ON COLUMN public.extras_catalogue.supplier_cost IS
  'What we pay, in rate_currency (NULL = the org''s rate currency). NULL cost = unpriced, never zero.';
COMMENT ON COLUMN public.extras_catalogue.rate_currency IS
  'Currency the cost and selling price were entered in. NULL = the org''s rate currency.';
