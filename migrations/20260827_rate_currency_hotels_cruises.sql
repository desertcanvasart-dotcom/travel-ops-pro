-- ============================================
-- Per-rate currency: the deferred three
-- ============================================
-- 20260827_rate_currency.sql gave the 12 flat rate tables a currency and
-- deferred hotels, cruises and cruise transport packages because their
-- prices live differently (dated periods in a `seasons` JSONB; vehicle
-- columns on the package). The engine now converts those shapes too
-- (lib/rates/rate-currency.ts handles season rates like activity tiers), so
-- the columns complete the model: NO rate table is currency-blind.
--
-- Same contract as before: NULL = the organisation default, no backfill,
-- currency belongs to the RATE (all of a row's periods share it — a contract
-- is denominated once). Idempotent: safe to run twice.

ALTER TABLE public.accommodation_rates    ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.nile_cruises           ADD COLUMN IF NOT EXISTS rate_currency TEXT;
ALTER TABLE public.b2b_transport_packages ADD COLUMN IF NOT EXISTS rate_currency TEXT;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['accommodation_rates', 'nile_cruises', 'b2b_transport_packages'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_rate_currency_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (rate_currency IS NULL OR rate_currency IN (''USD'', ''EUR'', ''GBP'', ''EGP'', ''JPY''))',
        t, t || '_rate_currency_check'
      );
    END IF;
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.rate_currency IS ''Currency this row''''s prices (including every dated period) are entered in. NULL = organisation default. Converted on a copy at read time; stored numbers never rewritten.''',
      t
    );
  END LOOP;
END $$;
