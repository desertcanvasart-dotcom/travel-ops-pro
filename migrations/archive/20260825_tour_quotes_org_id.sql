-- ============================================
-- tour_quotes.org_id — put B2B quotes inside a tenant
-- ============================================
-- The same hole `clients` had before 20260825_clients_org_id.sql: the b2b quote
-- routes all run on the service-role client, which bypasses RLS, and there was
-- no column to scope by — so every organisation on this deployment shared one
-- pool of B2B quotes, complete with partner pricing, margins and customer
-- contact details.
--
-- ORDERING: app/api/b2b/** filters and stamps this column as of the same
-- change. Apply this migration BEFORE (or with) that deploy, or those routes
-- will 42703 on read and 23502 on insert.
--
-- The NOT NULL below is the trap the clients migration walked into: once it is
-- set, ANY insert that does not supply org_id fails. tour_quotes has exactly
-- two insert paths, both server routes, and both stamp it in the same change:
--     app/api/b2b/quotes/route.ts
--     app/api/b2b/quote-from-itinerary/route.ts
-- `quote_versions` deliberately does NOT get a column — it is a child keyed by
-- quote_id and is scoped through its parent quote.
--
-- Idempotent: safe to run twice.

-- 1. The column, nullable to start with so the backfill has something to do.
ALTER TABLE public.tour_quotes
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Backfill from the itinerary the quote was built from or converted into —
--    itineraries are org-scoped, so they are the most reliable statement of
--    whose quote this is.
UPDATE public.tour_quotes q
   SET org_id = i.org_id
  FROM public.itineraries i
 WHERE q.org_id IS NULL
   AND i.org_id IS NOT NULL
   AND i.id = COALESCE(q.itinerary_id, q.converted_to_itinerary_id);

-- 3. Anything still unassigned goes to the oldest organisation — the one that
--    has been running this deployment. Deliberately NOT spread across orgs:
--    guessing an owner for a priced quote is worse than putting it somewhere
--    reviewable. (On the current database this is a no-op: tour_quotes is
--    empty, which is why this migration carries no data risk.)
UPDATE public.tour_quotes
   SET org_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
 WHERE org_id IS NULL;

-- 4. From here on a quote without an owner is a bug, not a state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tour_quotes WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'tour_quotes.org_id backfill incomplete — % rows still NULL (is the organizations table empty?)',
      (SELECT count(*) FROM public.tour_quotes WHERE org_id IS NULL);
  END IF;

  ALTER TABLE public.tour_quotes ALTER COLUMN org_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE '%backfill incomplete%' THEN RAISE; END IF;
    -- already NOT NULL, or no rows to constrain: nothing to do
    NULL;
END $$;

-- 5. Every read is now "this org's quotes, newest first", or a lookup by id
--    within an org.
CREATE INDEX IF NOT EXISTS tour_quotes_org_id_idx ON public.tour_quotes (org_id);
CREATE INDEX IF NOT EXISTS tour_quotes_org_id_created_at_idx
  ON public.tour_quotes (org_id, created_at DESC);

COMMENT ON COLUMN public.tour_quotes.org_id IS
  'Owning organisation. Added 2026-08-25: the b2b quote routes run on the service-role client and had no tenant column to filter by, so /api/b2b/quotes served every org''s quotes to every org.';
