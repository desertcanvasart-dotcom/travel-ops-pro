-- ============================================================
-- Company profile: the two fields branding still lacks
-- ============================================================
-- organizations already carries logo_url / primary_color / secondary_color /
-- contact_email / company_phone / company_website / tagline — added long ago,
-- never editable, never used. The Company Profile settings card now edits
-- them, and documents + the customer portal render them. Two facts had no
-- column at all:
--
--   company_address    the postal address printed on invoices and letterheads
--   document_contacts  operator-defined contact slots for document headers,
--                      as {key: value} — the A.T.S 日程表 header reads
--                      cairo_guide / south_guide / emergency_japan /
--                      cairo_office. JSONB so another operator's documents
--                      can define their own slots without a migration.
--
-- APPLY BEFORE DEPLOYING the code that reads these columns. Harmless on a
-- database still running old code.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS document_contacts jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.company_address IS
  'Postal address as printed on documents (letterhead, invoices). Operator writes it in whatever language their documents use.';
COMMENT ON COLUMN public.organizations.document_contacts IS
  'Operator-defined contact slots for document headers, {key: value}. A.T.S 日程表 reads cairo_guide, south_guide, emergency_japan, cairo_office.';
