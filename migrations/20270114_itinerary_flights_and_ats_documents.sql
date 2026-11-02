-- ============================================================================
-- 20270114 — a trip's own flights, and two more ATS documents
-- ============================================================================
--
-- The ATS 予約確認書兼請求書 prints the customer's flight schedule (KIX → DXB
-- EK317, DXB → CAI EK927 …). Those flights are booked in Japan and were never
-- stored anywhere — flight_rates is a price list, not a trip's tickets — so
-- the office retyped them on every confirmation. They now live on the trip:
--
--   itineraries.flights  JSONB list, in the order flown:
--     { date, from, to, flight_no, depart, arrive, status }
--   all strings; blanks are allowed (the office fills times as they firm up).
--   Not money, so lib/pricing never reads it.
--
-- And two more operator documents in lib/documents/org-templates.ts:
--   'ats-booking-confirmation'  予約確認書兼請求書
--   'ats-application-form'      参加申込書 (printed from the portal form)
-- Granted to every org that already has the ATS 日程表 — the same orgs whose
-- paper this is. Additive and replay-safe; running it twice changes nothing.
-- ============================================================================

BEGIN;

ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS flights JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.itineraries.flights IS
  'The trip''s own flights in the order flown: [{date, from, to, flight_no, depart, arrive, status}]. Printed on the booking confirmation.';

DO $$
DECLARE
  doc_slug TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'itineraries'
                    AND column_name = 'flights') THEN
    RAISE EXCEPTION 'itineraries.flights missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'organizations'
                    AND column_name = 'document_templates') THEN
    RETURN;
  END IF;

  -- doc_slug, not slug: organizations has its own slug column.
  FOREACH doc_slug IN ARRAY ARRAY['ats-booking-confirmation', 'ats-application-form'] LOOP
    UPDATE public.organizations
       SET document_templates = array_append(document_templates, doc_slug)
     WHERE 'ats-daily-itinerary' = ANY(document_templates)
       AND NOT (doc_slug = ANY(document_templates));
  END LOOP;
END $$;

COMMIT;
