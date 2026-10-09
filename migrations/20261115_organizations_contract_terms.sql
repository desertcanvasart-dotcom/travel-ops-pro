-- ============================================================================
-- 20261115 — the country and the law a travel contract names
-- ============================================================================
--
-- Every contract said disputes went "under Egyptian law in Cairo courts", that
-- it was "governed by the laws of Egypt" and that the balance was paid "upon
-- arrival in Egypt", and placed the operator in "Cairo, Egypt", whoever the
-- operator was. Both now come from Settings → Company profile:
--
--   operating_country       where the operator runs its trips ("Egypt")
--   contract_governing_law  the law the contract is under ("Egyptian law")
--
-- NULL = the contract names no country. Additive and replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS operating_country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contract_governing_law VARCHAR(255);

COMMENT ON COLUMN public.organizations.operating_country IS
  'Where the operator runs its trips, as travel contracts name it ("Egypt"). NULL = no country named.';
COMMENT ON COLUMN public.organizations.contract_governing_law IS
  'The law travel contracts are governed by ("Egyptian law"). NULL = the law of the operator''s country of registration.';

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'organizations'
         AND column_name IN ('operating_country', 'contract_governing_law')) <> 2 THEN
    RAISE EXCEPTION 'organizations.operating_country / contract_governing_law missing';
  END IF;
END $$;

COMMIT;
