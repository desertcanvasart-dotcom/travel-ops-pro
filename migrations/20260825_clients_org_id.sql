-- ============================================
-- clients.org_id — put customers inside a tenant
-- ============================================
-- Every other business table in this schema is scoped by org_id: invoices,
-- expenses, itineraries, bookings, commissions. `clients` never was. It is not
-- that the routes forgot to filter — there was no column to filter ON, so every
-- organisation on this deployment has been reading and writing one shared
-- customer list, complete with phone numbers, emails and internal notes.
--
-- ORDERING: app/api/clients/* filters on this column as of the same change.
-- Apply this migration BEFORE (or with) that deploy, or those routes will 42703.
--
-- Idempotent: safe to run twice.

-- 1. The column, nullable to start with so the backfill has something to do.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Backfill from the work the client already has. A client's itineraries are
--    org-scoped, so they are the most reliable statement of whose customer this
--    is; the earliest one wins if somehow they disagree.
UPDATE public.clients c
   SET org_id = sub.org_id
  FROM (
    SELECT DISTINCT ON (i.client_id) i.client_id, i.org_id
      FROM public.itineraries i
     WHERE i.client_id IS NOT NULL
       AND i.org_id IS NOT NULL
     ORDER BY i.client_id, i.created_at ASC
  ) AS sub
 WHERE c.id = sub.client_id
   AND c.org_id IS NULL;

-- 3. Anything still unassigned (a lead who never got as far as an itinerary)
--    goes to the oldest organisation — the one that has been running this
--    deployment. Deliberately NOT spread across orgs: guessing an owner for a
--    customer record is worse than putting them somewhere reviewable.
UPDATE public.clients
   SET org_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
 WHERE org_id IS NULL;

-- 4. From here on a client without an owner is a bug, not a state.
--    Guarded so a re-run does not fail on the already-set constraint.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clients WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'clients.org_id backfill incomplete — % rows still NULL (is the organizations table empty?)',
      (SELECT count(*) FROM public.clients WHERE org_id IS NULL);
  END IF;

  ALTER TABLE public.clients ALTER COLUMN org_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE '%backfill incomplete%' THEN RAISE; END IF;
    -- already NOT NULL, or no rows to constrain: nothing to do
    NULL;
END $$;

-- 5. Every read is now "this org's clients, ordered by name" or a lookup by
--    phone within an org. Index for both.
CREATE INDEX IF NOT EXISTS clients_org_id_idx ON public.clients (org_id);
CREATE INDEX IF NOT EXISTS clients_org_id_phone_idx ON public.clients (org_id, phone);

COMMENT ON COLUMN public.clients.org_id IS
  'Owning organisation. Added 2026-08-25: clients was the one business table with no tenant boundary, so /api/clients served every org''s customer list to every org.';
