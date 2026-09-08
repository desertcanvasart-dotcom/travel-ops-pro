-- ============================================================================
-- 20260908 — trip_events + staff_links: the execution layer (ported from the
-- sibling SaaS migrations 285/286, org-scoped for this single-tenant app)
-- ============================================================================
--
-- trip_events: an append-only record of what actually happened on the ground,
-- per trip ("Picked up at CAI 14:32"). The customer's live status, the office
-- board (/ops), and the end-of-trip audit are all views over this table.
--
-- staff_links: a no-login tap-link per assignment. The driver/guide opens a
-- URL (the token IS the credential, same trust model as /portal and /share),
-- taps big Departed/Arrived/Picked-up buttons, and writes trip_events. The
-- page is service-role behind the middleware self-auth allowlist; revoking
-- kills the only URL that exists.
--
-- Adaptations from the sibling: tenant_id -> org_id, get_user_tenant_id() ->
-- user_is_in_org(org_id), and actor_team_member_id is present from the start
-- (this app already has a team_members directory).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- trip_events — append-only checkpoint log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  -- SET NULL not CASCADE: the event happened even if the assignment row is
  -- later removed — history must not vanish with a reassignment.
  itinerary_resource_id UUID REFERENCES public.itinerary_resources(id) ON DELETE SET NULL,
  event_kind VARCHAR(30) NOT NULL
    CHECK (event_kind IN (
      'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
      'checked_in', 'checked_out', 'completed', 'delayed', 'note'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  -- Internal detail. NEVER shown to the customer; sanitizers must not copy it.
  note TEXT,
  actor_name VARCHAR(120),
  actor_team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_events_itinerary
  ON public.trip_events (itinerary_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_events_org
  ON public.trip_events (org_id, occurred_at DESC);

ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_events_org_read ON public.trip_events;
CREATE POLICY trip_events_org_read ON public.trip_events
  FOR SELECT TO authenticated
  USING (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS trip_events_org_insert ON public.trip_events;
CREATE POLICY trip_events_org_insert ON public.trip_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_in_org(org_id));

-- Deliberately NO update/delete policies for authenticated: append-only.
DROP POLICY IF EXISTS trip_events_service_role ON public.trip_events;
CREATE POLICY trip_events_service_role ON public.trip_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- staff_links — no-login tap-links, one active per assignment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  itinerary_resource_id UUID NOT NULL REFERENCES public.itinerary_resources(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Revoke, never delete: the row stays as the record that a link existed.
  revoked_at TIMESTAMPTZ
);

-- One ACTIVE link per assignment — the create endpoint is idempotent against this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_links_active
  ON public.staff_links (itinerary_resource_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_links_org ON public.staff_links (org_id);

ALTER TABLE public.staff_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_links_org ON public.staff_links;
CREATE POLICY staff_links_org ON public.staff_links
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS staff_links_service_role ON public.staff_links;
CREATE POLICY staff_links_service_role ON public.staff_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Self-verifying probe: structure asserted, then behaviour — append-only is
-- enforced, an event round-trips, and a bogus event_kind is refused.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  probe UUID := gen_random_uuid();
  an_org UUID; an_itin UUID; got TEXT; rejected BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trip_events'
               AND cmd IN ('UPDATE','DELETE') AND 'authenticated' = ANY(roles)) THEN
    RAISE EXCEPTION 'append-only violated: authenticated has UPDATE or DELETE on trip_events';
  END IF;

  SELECT o.id, i.id INTO an_org, an_itin
    FROM public.organizations o JOIN public.itineraries i ON i.org_id = o.id LIMIT 1;
  IF an_itin IS NULL THEN
    RAISE NOTICE 'no itinerary to probe with — structure asserted only';
  ELSE
    INSERT INTO public.trip_events (id, org_id, itinerary_id, event_kind, actor_name, note)
    VALUES (probe, an_org, an_itin, 'arrived', 'zz-migration-probe', 'probe');
    SELECT event_kind INTO got FROM public.trip_events WHERE id = probe;
    DELETE FROM public.trip_events WHERE id = probe;
    IF got IS DISTINCT FROM 'arrived' THEN
      RAISE EXCEPTION 'probe event did not round-trip (got %)', got;
    END IF;

    BEGIN
      INSERT INTO public.trip_events (org_id, itinerary_id, event_kind)
      VALUES (an_org, an_itin, 'teleported');
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'a bogus event_kind was accepted';
    END IF;
    RAISE NOTICE 'probe: round-trip ok, bogus kind rejected, append-only enforced';
  END IF;
END $$;

COMMIT;
