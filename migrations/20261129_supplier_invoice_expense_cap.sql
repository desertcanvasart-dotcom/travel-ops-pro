-- ============================================================================
-- 20261129 — an expense is never matched past its amount (AUDIT M30)
-- ============================================================================
--
-- One expense can be matched to several supplier invoices (a hotel bills a
-- stay in two parts). POST /api/supplier-invoices/[id]/match caps each link at
-- what is left on the expense after its matches elsewhere — but it reads that
-- remainder, then writes, so two matches of the same expense against two
-- invoices at once each saw the whole remainder and together matched more
-- than the expense is worth. Both invoices could then read as fully matched,
-- be approved and be paid.
--
-- The rule now lives on the table. The trigger locks the expense row, so two
-- links to the same expense are written one after the other, and refuses a
-- link that takes the expense's matches on all invoices past its amount
-- (a cent of rounding allowed) with SQLSTATE 23514, which the route answers
-- with 409. The link being replaced (same invoice and expense: the route
-- upserts) is not counted against itself.
--
-- Existing rows are not checked or changed. Replay-safe: CREATE OR REPLACE,
-- DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.supplier_invoice_expenses_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_elsewhere numeric;
BEGIN
  IF NEW.matched_amount IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise every link to this expense: a concurrent match waits here and
  -- then counts this one.
  SELECT amount INTO v_amount FROM expenses WHERE id = NEW.expense_id FOR UPDATE;
  IF v_amount IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(matched_amount), 0) INTO v_elsewhere
    FROM supplier_invoice_expenses
   WHERE expense_id = NEW.expense_id
     AND supplier_invoice_id <> NEW.supplier_invoice_id;

  IF v_elsewhere + NEW.matched_amount > v_amount + 0.01 THEN
    RAISE EXCEPTION 'Expense % is already matched for % of its %', NEW.expense_id, v_elsewhere, v_amount
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_invoice_expenses_cap ON public.supplier_invoice_expenses;
CREATE TRIGGER supplier_invoice_expenses_cap
  BEFORE INSERT OR UPDATE OF matched_amount, expense_id, supplier_invoice_id
  ON public.supplier_invoice_expenses
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoice_expenses_cap();
