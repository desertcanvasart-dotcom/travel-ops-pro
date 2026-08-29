-- ============================================================
-- Company offices: the letterhead's real shape
-- ============================================================
-- The A.T.S letterhead lists THREE offices — 東京 and 大阪 side by side with
-- 〒 postal codes and TEL/FAX, and the Cairo office as a line across the
-- bottom. One company_address column cannot say that. Offices are an ordered
-- JSONB list so any operator's letterhead shape fits without a migration:
--
--   [{label, postal_code, address, tel, fax}, …]
--
-- The first two render as side-by-side columns, any further offices as
-- full-width lines — the office's own layout.
--
-- APPLY BEFORE DEPLOYING the code that reads this column.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS offices jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.organizations.offices IS
  'Letterhead offices, ordered: [{label, postal_code, address, tel, fax}]. First two print as columns, the rest as full-width lines.';
