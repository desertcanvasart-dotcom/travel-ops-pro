-- Supplier Invoice Matching: three-way match (supplier invoice -> expense -> payment)

-- Sequence for auto-generated internal reference numbers
CREATE SEQUENCE IF NOT EXISTS supplier_invoice_number_seq START 1;

-- Table: supplier_invoices
-- Records supplier-side invoices for three-way matching against expenses
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_number TEXT NOT NULL,     -- Number from supplier's actual invoice
  internal_reference TEXT,                    -- Auto-generated SI-YYYY-NNN
  supplier_name TEXT NOT NULL,
  supplier_id UUID,                           -- Optional FK to suppliers
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  tax_amount DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  line_items JSONB,
  status TEXT DEFAULT 'received' CHECK (status IN ('received', 'matched', 'approved', 'paid', 'disputed', 'cancelled')),
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'partial', 'matched', 'discrepancy')),
  matched_amount DECIMAL(12,2) DEFAULT 0,
  discrepancy_amount DECIMAL(12,2) DEFAULT 0,
  discrepancy_notes TEXT,
  document_url TEXT,
  document_filename TEXT,
  document_storage_path TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  itinerary_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_match_status ON supplier_invoices(match_status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_date ON supplier_invoices(invoice_date);

-- Junction table: links supplier invoices to expenses (many-to-many)
CREATE TABLE IF NOT EXISTS supplier_invoice_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  matched_amount DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_invoice_id, expense_id)
);

CREATE INDEX IF NOT EXISTS idx_sie_supplier_invoice ON supplier_invoice_expenses(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sie_expense ON supplier_invoice_expenses(expense_id);
