-- ============================================
-- UNIQUE constraints on business document identifiers
-- M15 + M19 + M31: expense_number, invoice_number, internal_reference are
-- meant to be human-facing unique business identifiers, but the app
-- previously generated them via a racy `COUNT(*) + 1` fallback when the
-- nextval RPC failed. Without DB-level uniqueness duplicates silently
-- landed and broke accounting reconciliation downstream.
--
-- This migration:
--   1. Adds UNIQUE constraints (idempotently) on the three columns.
--   2. Pre-flights for existing duplicates and raises a clear error so the
--      operator can clean them up before re-running.
--
-- The matching app code now retries on a 23505 unique_violation so the
-- DB-level constraint and the per-request retry together survive concurrent
-- writes without ever emitting a duplicate identifier.
--
-- Date: 2026-06-24
-- ============================================

do $$
declare
  dup_expense int;
  dup_invoice int;
  dup_si int;
begin
  -- Pre-flight duplicate checks. If any of these are > 0, the ADD CONSTRAINT
  -- below would fail with a confusing message; surface it cleanly instead.
  select count(*) - count(distinct expense_number) into dup_expense
    from public.expenses
    where expense_number is not null;
  if dup_expense > 0 then
    raise exception 'Cannot add UNIQUE on expenses.expense_number: % duplicate value(s) exist. Reconcile before re-running.', dup_expense;
  end if;

  select count(*) - count(distinct invoice_number) into dup_invoice
    from public.invoices
    where invoice_number is not null;
  if dup_invoice > 0 then
    raise exception 'Cannot add UNIQUE on invoices.invoice_number: % duplicate value(s) exist. Reconcile before re-running.', dup_invoice;
  end if;

  select count(*) - count(distinct internal_reference) into dup_si
    from public.supplier_invoices
    where internal_reference is not null;
  if dup_si > 0 then
    raise exception 'Cannot add UNIQUE on supplier_invoices.internal_reference: % duplicate value(s) exist. Reconcile before re-running.', dup_si;
  end if;
end$$;

-- expenses.expense_number
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_expense_number_key'
  ) then
    alter table public.expenses
      add constraint expenses_expense_number_key unique (expense_number);
  end if;
end$$;

-- invoices.invoice_number
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_invoice_number_key'
  ) then
    alter table public.invoices
      add constraint invoices_invoice_number_key unique (invoice_number);
  end if;
end$$;

-- supplier_invoices.internal_reference
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'supplier_invoices_internal_reference_key'
  ) then
    alter table public.supplier_invoices
      add constraint supplier_invoices_internal_reference_key unique (internal_reference);
  end if;
end$$;

-- ============================================
-- MIGRATION COMPLETE
-- Apply BEFORE deploying the matching M15/M19/M31 app changes. The retry
-- loop relies on the 23505 error code that these constraints produce.
-- ============================================
