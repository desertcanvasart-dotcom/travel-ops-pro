-- ============================================================================
-- 20261120 — supplier invoices can name the client invoice they relate to
-- ============================================================================
--
-- The New Supplier Invoice form offers "Client invoice" and POST
-- /api/supplier-invoices always sends client_invoice_id, but the column was
-- only ever added by migrations/archive/20260401_…, which production never
-- ran (the 20260829 baseline has no such column). PostgREST refused the
-- unknown key, so every supplier invoice create failed.
--
-- ON DELETE SET NULL: deleting a client invoice leaves the bill standing.
-- Replay-safe.

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS client_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_client_invoice
  ON public.supplier_invoices (client_invoice_id);
