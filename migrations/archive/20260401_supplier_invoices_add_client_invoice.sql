-- Add client invoice link to supplier invoices
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS client_invoice_id UUID;
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_client_invoice ON supplier_invoices(client_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_itinerary ON supplier_invoices(itinerary_id);
