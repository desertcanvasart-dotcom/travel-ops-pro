-- ============================================
-- Invoice and receipt numbers per company; VAT recorded on a trip payment;
-- a payment can no longer overdraw an invoice
-- ============================================
-- INVOICE NUMBERS (INV-YYYY-NNN, -DEP / -FIN for a deposit and its final) came
-- from ONE install-wide sequence (rpc nextval('invoice_number_seq')) under one
-- UNIQUE (invoice_number). Each company's numbers skipped whenever the other
-- issued an invoice, so either could read the other's volume off the gaps, and
-- a tax document series is expected to run without them. Where the nextval
-- helper function was never created, the route fell back to the highest number
-- across EVERY company, compared as text ('INV-2026-999' sorts above
-- 'INV-2026-1000'), so the 1,000th invoice of a year failed as a duplicate.
--
-- RECEIPT NUMBERS did not exist: a receipt printed the payment's transaction
-- reference (a bank reference, "wire", the invoice number...) or RCP- and the
-- first eight characters of the payment id. Two payments with the same
-- reference had the same receipt number.
--
-- From here, as quotes (20261211), bookings (20261212) and voucher numbers
-- (20261216):
--
--   invoice_number_counters   one row per (company, kind, year): the last number
--                             handed out, locked by the INSERT … ON CONFLICT DO
--                             UPDATE that increments it. kind is 'invoice' or
--                             'receipt'.
--   next_invoice_number()     the next free INV-YYYY-NNN for a company. The
--                             first call for a company and year carries on after
--                             that company's own highest well-formed number
--                             (read as a number, so 1000 follows 999); a number
--                             the company already holds, with or without a
--                             -DEP / -FIN suffix, is skipped. Service role only.
--   UNIQUE (org_id, invoice_number)   replaces UNIQUE (invoice_number): both
--                             companies may hold INV-2026-001.
--   payments.receipt_number, invoice_payments.receipt_number   the receipt's own
--                             number, RCP-YYYY-NNNN, per company, from
--                             next_receipt_number(). One series across both
--                             tables. A trip payment is numbered when it is
--                             completed and is not a refund (a pending, failed
--                             or refunded payment has no receipt); an invoice
--                             payment when it is recorded.
--   invoice_payments.org_id   the invoice's company, set by a trigger, so the
--                             receipt number can be unique per company.
--
-- EXISTING NUMBERS ARE NOT CHANGED. Invoice numbers were unique install-wide,
-- so they are unique per company. For receipts, a payment already receipted
-- keeps the number it showed: its transaction reference, when that is filled
-- in and no other payment of the company has the same one; every other
-- payment is numbered from the series, per company, oldest first. Rows that
-- already have a receipt number are never touched (a second run changes
-- nothing).
--
-- VAT ON A TRIP PAYMENT is recorded on the payment (vat_applied, vat_rate,
-- vat_amount, vat_base), as an invoice records its own. It was worked out from
-- the trip every time the receipt was opened, so a trip whose VAT was switched
-- later reprinted an old receipt with different VAT than the copy already sent.
-- Existing rows stay NULL = "not recorded": the receipt keeps reading the trip
-- for those, as before. New rows are written by POST /api/payments.
--
-- OVERPAYMENT: the route read the balance and then inserted, so two payments
-- recorded at once both passed. A BEFORE INSERT trigger on invoice_payments
-- now locks the invoice row and refuses an amount above its balance (the same
-- 0.01 allowance as the route), so the second waits for the first.
--
-- Counter table and both number functions: RLS on, no policy, service role
-- only (the trigger functions are SECURITY DEFINER and call them as owner).
-- No policy on an existing table is touched.
--
-- Replay-safe: CREATE … IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS,
-- each table guarded with to_regclass and each column with IF NOT EXISTS.
-- Applying it twice changes nothing the second time.
BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice', 'receipt')),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, kind, year)
);
ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_number_counters TO service_role;

-- ── 1. Columns ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL THEN
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_number text;
    -- NULL = not recorded (a row from before this migration).
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_applied boolean;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_rate numeric;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_amount numeric;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vat_base numeric;
  END IF;

  IF to_regclass('public.invoice_payments') IS NOT NULL THEN
    ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS receipt_number text;
    ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS org_id uuid;
    IF to_regclass('public.invoices') IS NOT NULL THEN
      UPDATE public.invoice_payments ip SET org_id = i.org_id
        FROM public.invoices i WHERE i.id = ip.invoice_id AND ip.org_id IS NULL;
    END IF;
  END IF;
END
$$;

-- ── 2. Invoice numbers: per company, no race ──────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN RETURN; END IF;

  -- Unique per company. The install-wide key goes only once this one is in place.
  CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_invoice_number_key
    ON public.invoices (org_id, invoice_number);
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

  CREATE OR REPLACE FUNCTION public.next_invoice_number(p_org uuid, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    pattern text;
    seed bigint := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_invoice_number: an invoice must belong to a company'; END IF;
    pattern := '^INV-' || p_year || '-([0-9]{1,9})(-DEP|-FIN)?$';

    -- First number of the year for this company: carry on after its own
    -- highest well-formed number, compared as a number (a malformed one is
    -- ignored, not cast).
    IF NOT EXISTS (SELECT 1 FROM invoice_number_counters WHERE org_id = p_org AND kind = 'invoice' AND year = p_year) THEN
      SELECT COALESCE(MAX((regexp_match(invoice_number, pattern))[1]::bigint), 0) INTO seed
        FROM invoices WHERE org_id = p_org AND invoice_number ~ pattern;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_invoice_number: no free number after % attempts', attempts;
      END IF;
      INSERT INTO invoice_number_counters AS c (org_id, kind, year, last_value)
        VALUES (p_org, 'invoice', p_year, (seed + 1)::integer)
        ON CONFLICT (org_id, kind, year) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      -- Three digits as before; a fourth is added, never cut off (lpad truncates).
      candidate := 'INV-' || p_year || '-' || CASE WHEN length(n::text) < 3 THEN lpad(n::text, 3, '0') ELSE n::text END;
      -- The deposit / final suffix is added to the number by the caller, so
      -- the number is free only if none of its three forms is taken.
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM invoices
         WHERE org_id = p_org AND invoice_number IN (candidate, candidate || '-DEP', candidate || '-FIN'));
    END LOOP;
    RETURN candidate;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid, integer) TO service_role;
END
$$;

-- ── 3. Receipt numbers: one series per company across both payment tables ─
DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL OR to_regclass('public.invoice_payments') IS NULL THEN RETURN; END IF;

  CREATE OR REPLACE FUNCTION public.next_receipt_number(p_org uuid, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    pattern text;
    seed bigint := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_receipt_number: a receipt must belong to a company'; END IF;
    pattern := '^RCP-' || p_year || '-([0-9]{1,9})$';

    IF NOT EXISTS (SELECT 1 FROM invoice_number_counters WHERE org_id = p_org AND kind = 'receipt' AND year = p_year) THEN
      SELECT GREATEST(
        COALESCE((SELECT MAX((regexp_match(receipt_number, pattern))[1]::bigint)
                    FROM payments WHERE org_id = p_org AND receipt_number ~ pattern), 0),
        COALESCE((SELECT MAX((regexp_match(receipt_number, pattern))[1]::bigint)
                    FROM invoice_payments WHERE org_id = p_org AND receipt_number ~ pattern), 0)
      ) INTO seed;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_receipt_number: no free number after % attempts', attempts;
      END IF;
      INSERT INTO invoice_number_counters AS c (org_id, kind, year, last_value)
        VALUES (p_org, 'receipt', p_year, (seed + 1)::integer)
        ON CONFLICT (org_id, kind, year) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      candidate := 'RCP-' || p_year || '-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM payments WHERE org_id = p_org AND receipt_number = candidate)
            AND NOT EXISTS (SELECT 1 FROM invoice_payments WHERE org_id = p_org AND receipt_number = candidate);
    END LOOP;
    RETURN candidate;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_receipt_number(uuid, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_receipt_number(uuid, integer) TO service_role;

  -- A trip payment: numbered once it is a completed, non-refund payment.
  CREATE OR REPLACE FUNCTION public.assign_payment_receipt_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    IF (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
       AND NEW.payment_status = 'completed'
       AND COALESCE(NEW.payment_type, '') <> 'refund' THEN
      NEW.receipt_number := next_receipt_number(NEW.org_id, EXTRACT(YEAR FROM NOW())::integer);
    END IF;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS trigger_assign_payment_receipt_number ON public.payments;
  CREATE TRIGGER trigger_assign_payment_receipt_number
    BEFORE INSERT OR UPDATE OF payment_status, payment_type, receipt_number ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.assign_payment_receipt_number();

  -- An invoice payment: numbered when recorded, in its invoice's company.
  CREATE OR REPLACE FUNCTION public.assign_invoice_payment_receipt_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    IF NEW.org_id IS NULL THEN
      SELECT i.org_id INTO NEW.org_id FROM invoices i WHERE i.id = NEW.invoice_id;
    END IF;
    IF NEW.org_id IS NOT NULL AND (NEW.receipt_number IS NULL OR NEW.receipt_number = '') THEN
      NEW.receipt_number := next_receipt_number(NEW.org_id, EXTRACT(YEAR FROM NOW())::integer);
    END IF;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS trigger_assign_invoice_payment_receipt_number ON public.invoice_payments;
  CREATE TRIGGER trigger_assign_invoice_payment_receipt_number
    BEFORE INSERT ON public.invoice_payments
    FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_payment_receipt_number();

  -- ── Backfill ────────────────────────────────────────────────────────────
  -- Per company, oldest first, only rows with no receipt number yet. A payment
  -- keeps the number it already showed (its transaction reference) when that
  -- is filled in and no other payment of the company has the same one.
  DECLARE
    r record;
    ref text;
  BEGIN
    FOR r IN
      SELECT 'p' AS src, id, org_id, created_at, transaction_reference AS ref
        FROM payments
       WHERE receipt_number IS NULL AND payment_status = 'completed' AND COALESCE(payment_type, '') <> 'refund'
      UNION ALL
      SELECT 'i', id, org_id, created_at, transaction_reference
        FROM invoice_payments
       WHERE receipt_number IS NULL AND org_id IS NOT NULL
      ORDER BY org_id, created_at, id
    LOOP
      ref := NULLIF(btrim(r.ref), '');
      IF ref IS NOT NULL
         AND (SELECT count(*) FROM payments WHERE org_id = r.org_id AND btrim(transaction_reference) = ref)
           + (SELECT count(*) FROM invoice_payments WHERE org_id = r.org_id AND btrim(transaction_reference) = ref) = 1
         AND NOT EXISTS (SELECT 1 FROM payments WHERE org_id = r.org_id AND receipt_number = ref)
         AND NOT EXISTS (SELECT 1 FROM invoice_payments WHERE org_id = r.org_id AND receipt_number = ref) THEN
        NULL; -- ref stays
      ELSE
        ref := next_receipt_number(r.org_id, EXTRACT(YEAR FROM COALESCE(r.created_at, NOW()))::integer);
      END IF;
      IF r.src = 'p' THEN
        UPDATE payments SET receipt_number = ref WHERE id = r.id;
      ELSE
        UPDATE invoice_payments SET receipt_number = ref WHERE id = r.id;
      END IF;
    END LOOP;
  END;

  -- One receipt number per company. After the backfill, so it can hold.
  CREATE UNIQUE INDEX IF NOT EXISTS payments_org_receipt_number_key
    ON public.payments (org_id, receipt_number) WHERE receipt_number IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_org_receipt_number_key
    ON public.invoice_payments (org_id, receipt_number) WHERE receipt_number IS NOT NULL;
END
$$;

-- ── 4. A payment cannot overdraw an invoice ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.invoice_payments') IS NULL OR to_regclass('public.invoices') IS NULL THEN RETURN; END IF;

  CREATE OR REPLACE FUNCTION public.invoice_payment_within_balance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    due numeric;
  BEGIN
    -- The row lock is what serialises two payments recorded at once.
    SELECT balance_due INTO due FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF FOUND AND NEW.amount > COALESCE(due, 0) + 0.01 THEN
      RAISE EXCEPTION 'Payment amount exceeds balance due (%)', due USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS trigger_invoice_payment_within_balance ON public.invoice_payments;
  CREATE TRIGGER trigger_invoice_payment_within_balance
    BEFORE INSERT ON public.invoice_payments
    FOR EACH ROW EXECUTE FUNCTION public.invoice_payment_within_balance();
END
$$;

COMMIT;
