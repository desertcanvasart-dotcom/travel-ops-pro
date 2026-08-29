-- ============================================
-- Traveller document uploads (passport scan + supporting documents)
-- ============================================
-- The portal already collects passport DETAILS as text — number, issued date,
-- expiry, held-vs-applying — and enforces the six-month rule on them. What it
-- could not take was the document itself, so scans arrive by email or LINE and
-- live in an inbox.
--
-- PRIVATE BUCKET, DELIBERATELY. The two buckets this app already has
-- (`avatars`, `documents`) are both `public: true`, which means every object in
-- them is readable by URL with no authentication. That is survivable for a logo
-- and it is already a known deferred problem ("P9") for `documents`. It is not
-- survivable for a passport. This bucket is private and every read goes through
-- a short-lived signed URL issued by an authenticated, org-scoped route.
--
-- The MIME allowlist and size ceiling are set on the bucket as well as in the
-- upload route. The route is the real gate (it sniffs magic bytes, which
-- storage does not), but a second ceiling at the storage layer means a bug in
-- one place is not the whole story.
--
-- RETENTION. Passport scans are the most sensitive thing this system will hold.
-- They are purged after the trip ends (app/api/cron/purge-traveller-documents),
-- keeping the extracted text fields on booking_passengers. `purge_after` is
-- stamped per row at upload time rather than computed at purge time, so
-- changing a booking's dates later cannot silently extend how long a passport
-- image is kept.
--
-- Idempotent: safe to run twice.

-- ── 1. The bucket. Private, 10 MB, images and PDF only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'traveller-documents',
  'traveller-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. The index of what was uploaded.
CREATE TABLE IF NOT EXISTS public.booking_passenger_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES booking_passengers(id) ON DELETE CASCADE,

  -- 'passport' is the one slot with meaning to the engine and to the operator's
  -- chase list; 'other' is whatever the traveller was asked for — a visa page,
  -- an insurance certificate, a vaccination record. The kind is ours, the
  -- label is theirs.
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('passport', 'other')),
  label VARCHAR(120),

  -- Key inside the traveller-documents bucket. Never rendered as a URL; it is
  -- exchanged for a signed URL by an authenticated route.
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  -- Display only, already sanitised. Never used to build the storage key.
  original_filename VARCHAR(255),

  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'portal' = the traveller themselves; 'operator' = entered on their behalf.
  uploaded_via TEXT NOT NULL DEFAULT 'portal' CHECK (uploaded_via IN ('portal', 'operator')),

  -- When the purge job may delete the object. Stamped at upload.
  purge_after TIMESTAMPTZ,
  -- Stamped when the object is gone; the row survives as the audit record of
  -- what was held and when it was destroyed.
  purged_at TIMESTAMPTZ
);

-- One passport per traveller: a re-upload replaces it rather than accumulating
-- versions of the same page. Supporting documents are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_passenger_documents_one_passport
  ON public.booking_passenger_documents(passenger_id)
  WHERE kind = 'passport' AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_passenger_documents_passenger
  ON public.booking_passenger_documents(passenger_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_passenger_documents_booking
  ON public.booking_passenger_documents(booking_id);
-- The purge job's query: due, not yet purged.
CREATE INDEX IF NOT EXISTS idx_passenger_documents_purge
  ON public.booking_passenger_documents(purge_after)
  WHERE purged_at IS NULL;

ALTER TABLE public.booking_passenger_documents ENABLE ROW LEVEL SECURITY;

-- Same posture as every other table here: no anon access at all. The portal
-- reaches this table only through the service role, behind the token gate.
DROP POLICY IF EXISTS booking_passenger_documents_org_all ON public.booking_passenger_documents;
CREATE POLICY booking_passenger_documents_org_all
  ON public.booking_passenger_documents
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

COMMENT ON TABLE public.booking_passenger_documents IS
  'Index of traveller-uploaded documents held in the PRIVATE traveller-documents bucket. Reads are signed URLs from an org-scoped route — never getPublicUrl. Rows outlive the object: purged_at records that the file was destroyed on schedule.';
COMMENT ON COLUMN public.booking_passenger_documents.purge_after IS
  'Stamped at upload from the booking end date, not computed at purge time — moving a booking''s dates later must not silently extend how long a passport image is retained.';
