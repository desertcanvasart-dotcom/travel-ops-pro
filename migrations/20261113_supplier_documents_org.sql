-- ============================================================================
-- 20261113 — supplier_documents belong to an organization
-- ============================================================================
--
-- Supplier vouchers (hotel / transport / guide / cruise / activity vouchers,
-- service orders) had no org_id. Every route read and wrote them with the
-- service role and no org filter, and the only policy for authenticated was
-- USING (true): any signed-in user of any organization could list, open,
-- edit, delete and send another organization's vouchers — supplier contacts,
-- guest names, prices — by id or straight through PostgREST.
--
--   org_id         added, backfilled from the voucher's trip.
--   trigger        a voucher on a trip ALWAYS carries that trip's org: set on
--                  insert, re-derived when itinerary_id changes, and an
--                  org_id that disagrees with the trip is overwritten. Writers
--                  that forget it cannot create an orphan or a cross-org row.
--   NOT NULL       set when every row has an org. A voucher with no trip
--                  cannot be attributed; if any exist they keep a NULL org_id,
--                  are visible to nobody, and a NOTICE says how many.
--   policies       USING (true) replaced by user_is_in_org(org_id).
--
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.supplier_documents
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.supplier_documents d
   SET org_id = i.org_id
  FROM public.itineraries i
 WHERE d.itinerary_id = i.id
   AND d.org_id IS DISTINCT FROM i.org_id;

CREATE INDEX IF NOT EXISTS idx_supplier_documents_org
  ON public.supplier_documents (org_id, created_at DESC);

-- A voucher on a trip carries the trip's org, whatever the writer sent.
CREATE OR REPLACE FUNCTION public.supplier_documents_org_from_trip()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.itinerary_id IS NOT NULL THEN
    SELECT i.org_id INTO NEW.org_id FROM public.itineraries i WHERE i.id = NEW.itinerary_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supplier_documents_org_from_trip ON public.supplier_documents;
CREATE TRIGGER supplier_documents_org_from_trip
  BEFORE INSERT OR UPDATE OF itinerary_id, org_id ON public.supplier_documents
  FOR EACH ROW EXECUTE FUNCTION public.supplier_documents_org_from_trip();

DO $$
DECLARE orphans INTEGER;
BEGIN
  SELECT count(*) INTO orphans FROM public.supplier_documents WHERE org_id IS NULL;
  IF orphans = 0 THEN
    ALTER TABLE public.supplier_documents ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE NOTICE '% supplier document(s) have no trip and so no org — left with NULL org_id, visible to nobody', orphans;
  END IF;
END $$;

-- Policies: the org's members, and the service role.
DROP POLICY IF EXISTS supplier_documents_authenticated ON public.supplier_documents;
DROP POLICY IF EXISTS supplier_documents_org_members ON public.supplier_documents;
CREATE POLICY supplier_documents_org_members ON public.supplier_documents
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS supplier_documents_service_role ON public.supplier_documents;
CREATE POLICY supplier_documents_service_role ON public.supplier_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Self-verifying probe: no open policy is left for authenticated, and a
-- voucher written with the wrong org (or none) takes its trip's.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  probe UUID := gen_random_uuid();
  an_itin UUID; its_org UUID; other_org UUID; got UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'supplier_documents'
                AND 'authenticated' = ANY(roles)
                AND (qual = 'true' OR with_check = 'true')) THEN
    RAISE EXCEPTION 'supplier_documents still has an open policy for authenticated';
  END IF;

  SELECT i.id, i.org_id INTO an_itin, its_org FROM public.itineraries i LIMIT 1;
  SELECT o.id INTO other_org FROM public.organizations o WHERE o.id IS DISTINCT FROM its_org LIMIT 1;
  IF an_itin IS NULL THEN
    RAISE NOTICE 'no itinerary to probe with — structure asserted only';
  ELSE
    INSERT INTO public.supplier_documents
      (id, itinerary_id, org_id, document_type, document_number, supplier_name, client_name)
    VALUES
      (probe, an_itin, other_org, 'hotel_voucher', 'ZZ-PROBE-' || probe, 'probe', 'probe');
    SELECT org_id INTO got FROM public.supplier_documents WHERE id = probe;
    DELETE FROM public.supplier_documents WHERE id = probe;
    IF got IS DISTINCT FROM its_org THEN
      RAISE EXCEPTION 'a voucher did not take its trip''s org (got %, trip %)', got, its_org;
    END IF;
    RAISE NOTICE 'probe: voucher took its trip''s org';
  END IF;
END $$;

COMMIT;
