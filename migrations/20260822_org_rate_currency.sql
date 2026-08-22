-- ============================================
-- The currency an operator's SUPPLIER RATES are entered in
-- ============================================
-- Every rate table stores plain numbers in columns named *_eur, and the
-- pricing engine stamped its output 'EUR' unconditionally: the rate currency
-- was welded to a column name. A.T.S buys hotels and Nile cruises in USD and
-- enters its EGP purchases (transport, tips, meals, assistants) as USD
-- equivalents — so its rates are USD, while it BILLS in JPY (default_currency).
--
-- Two org facts, then:
--   default_currency  what the company invoices in                (08-20)
--   rate_currency     what the company's supplier rates are in    (this)
--
-- The *_eur column names stay: "eur" now reads as "the rate currency"; the
-- _eur/_non_eur PAIRS are EU-passport / non-EU-passport price tiers, not
-- currencies, and are untouched. Default 'EUR' keeps every other org exactly
-- as it was.
-- ============================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS rate_currency VARCHAR(3) NOT NULL DEFAULT 'EUR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_rate_currency_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_rate_currency_check
      CHECK (rate_currency IN ('USD','EUR','GBP','EGP','JPY'));
  END IF;
END $$;

-- A.T.S: the one org that bills in yen and buys in dollars. Name-guarded so a
-- re-run on another database does nothing; the Company Profile card edits it.
UPDATE public.organizations
SET rate_currency = 'USD'
WHERE name = 'Default Organization'
  AND default_currency = 'JPY'
  AND rate_currency = 'EUR';

COMMENT ON COLUMN public.organizations.rate_currency IS
  'Currency the company''s supplier rates (the *_eur rate columns) are entered in, and the currency the pricing engine reports. Distinct from default_currency (what the company bills in). Default EUR.';
