-- ============================================
-- Commissions generated before commissions.service_id: link them to their service
-- ============================================
-- commissions.service_id (20261227) records which service a generated
-- commission came from, so deleting the commission releases the service
-- (itinerary_services.commission_status back to 'pending') and it can be
-- generated again. Every commission generated BEFORE that column carries NULL,
-- so deleting one released nothing and the service stayed 'generated' for ever.
--
-- This links them, conservatively. A generated commission (its notes start
-- "Auto-generated from itinerary", which only the generator writes; a manual
-- commission is never touched) is linked to a service of the SAME trip when
-- exactly ONE service matches on all of:
--
--   supplier  the commission's supplier is the service's supplier or the
--             service's seller (sold_by_supplier_id); a commission with no
--             supplier matches on source_name = the service's supplier_name
--   amount    base_amount equals what the generator based it on: the service's
--             total_cost for a receivable commission, the profit
--             (client_price - total_cost) for a payable one
--   state     the service is still marked 'generated' (a released service has
--             nothing to release)
--
-- Zero matches, or more than one (two identical lunches from one supplier),
-- is NOT guessed: the commission is listed in org_backfill_review
-- (table_name 'commissions') for a person to link or leave. Look at them with
--   SELECT * FROM org_backfill_review WHERE table_name = 'commissions';
--
-- Replay-safe: the column is added IF NOT EXISTS, only commissions with no
-- service_id are considered, and a review row is inserted once per
-- (commission, reason). Each table and column is checked first, so a database
-- without one still migrates. Applying it twice changes nothing the second time.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.commissions') IS NULL
     OR to_regclass('public.itinerary_services') IS NULL
     OR to_regclass('public.itinerary_days') IS NULL THEN
    RETURN;
  END IF;

  -- Same column 20261227 adds, so this file stands on its own.
  ALTER TABLE public.commissions
    ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.itinerary_services(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_commissions_service_id ON public.commissions (service_id) WHERE service_id IS NOT NULL;

  -- The columns the match reads. A database that lacks any of them has
  -- nothing to match on, and is left as it is.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itinerary_services'
         AND column_name IN ('supplier_id', 'sold_by_supplier_id', 'supplier_name', 'total_cost', 'client_price', 'commission_status')) < 6
     OR (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'commissions'
            AND column_name IN ('itinerary_id', 'supplier_id', 'source_name', 'base_amount', 'commission_type', 'notes')) < 6 THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _commission_service_candidates ON COMMIT DROP AS
  SELECT c.id AS commission_id, s.id AS service_id
    FROM public.commissions c
    JOIN public.itinerary_days d ON d.itinerary_id = c.itinerary_id
    JOIN public.itinerary_services s ON s.itinerary_day_id = d.id
   WHERE c.service_id IS NULL
     AND c.itinerary_id IS NOT NULL
     AND c.notes LIKE 'Auto-generated from itinerary%'
     AND s.commission_status = 'generated'
     AND (
           (c.supplier_id IS NOT NULL AND c.supplier_id IN (s.supplier_id, s.sold_by_supplier_id))
        OR (c.supplier_id IS NULL AND c.source_name IS NOT NULL AND lower(c.source_name) = lower(s.supplier_name))
     )
     AND (
           (c.commission_type = 'receivable'
              AND round(COALESCE(c.base_amount, 0), 2) = round(COALESCE(s.total_cost, 0), 2))
        OR (c.commission_type = 'payable'
              AND COALESCE(s.total_cost, 0) > 0 AND COALESCE(s.client_price, 0) > 0
              AND round(COALESCE(c.base_amount, 0), 2) = round(s.client_price - s.total_cost, 2))
     );

  -- Exactly one candidate: link it.
  UPDATE public.commissions c
     SET service_id = m.service_id
    FROM (
      SELECT commission_id, (array_agg(service_id::text))[1]::uuid AS service_id
        FROM _commission_service_candidates
       GROUP BY commission_id
      HAVING count(*) = 1
    ) m
   WHERE c.id = m.commission_id
     AND c.service_id IS NULL;

  -- Everything generated that is still unlinked goes to review, with why.
  IF to_regclass('public.org_backfill_review') IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'commissions', c.id::text, c.org_id,
           CASE WHEN EXISTS (SELECT 1 FROM _commission_service_candidates k WHERE k.commission_id = c.id)
                THEN 'service_id not set: more than one service of the trip matches this commission'
                ELSE 'service_id not set: no service of the trip matches this commission'
           END
      FROM public.commissions c
     WHERE c.service_id IS NULL
       AND c.itinerary_id IS NOT NULL
       AND c.notes LIKE 'Auto-generated from itinerary%'
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$;

COMMIT;
