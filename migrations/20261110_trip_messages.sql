-- ============================================================================
-- 20261110 — trip_messages: the thread between the traveller and the office
-- ============================================================================
--
-- The traveller writes to the office from the trip's share page
-- (/share/[token]) and reads the replies; the office answers from the
-- itinerary page. One thread per trip, so coordination stops leaking into
-- personal WhatsApp side-channels. Ported from the sibling SaaS migrations
-- 291/292/297, org-scoped for this app, without the unified-conversations
-- link (this app's inbox has no trip channel).
--
--   DIRECTION IS PINNED. authenticated (the office) may only INSERT
--   direction='outbound' — a user cannot forge a traveller message. Inbound
--   rows are written only by the service role behind the token-guarded
--   share route.
--
--   A RECORD, NOT A DRAFT. The office may update exactly one column,
--   is_read (column grant); nothing may be deleted by the app.
--
--   notify_outcome says what the office notification for an INBOUND message
--   actually did, so "the traveller wrote and nobody was told" is visible:
--     pending | push_sent | email_sent | no_recipients | not_configured | failed
--   NULL for outbound rows.
--
--   sender_name is display text: the traveller's typed name inbound, the
--   team member's name outbound (team_member_id records who).
--
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.trip_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  sender_name VARCHAR(120),
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  notify_outcome TEXT CHECK (notify_outcome IS NULL OR notify_outcome IN
    ('pending', 'push_sent', 'email_sent', 'no_recipients', 'not_configured', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_messages_itinerary
  ON public.trip_messages (itinerary_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trip_messages_org
  ON public.trip_messages (org_id, created_at DESC);

ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_messages_org_read ON public.trip_messages;
CREATE POLICY trip_messages_org_read ON public.trip_messages
  FOR SELECT TO authenticated
  USING (public.user_is_in_org(org_id));

-- The office can only speak as the office.
DROP POLICY IF EXISTS trip_messages_org_insert ON public.trip_messages;
CREATE POLICY trip_messages_org_insert ON public.trip_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_in_org(org_id) AND direction = 'outbound');

-- Marking the traveller's messages read is the only update the app needs.
DROP POLICY IF EXISTS trip_messages_org_mark_read ON public.trip_messages;
CREATE POLICY trip_messages_org_mark_read ON public.trip_messages
  FOR UPDATE TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));
REVOKE UPDATE ON public.trip_messages FROM authenticated;
GRANT UPDATE (is_read) ON public.trip_messages TO authenticated;

-- Deliberately NO delete policy for authenticated.
DROP POLICY IF EXISTS trip_messages_service_role ON public.trip_messages;
CREATE POLICY trip_messages_service_role ON public.trip_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Self-verifying probe: no delete for the app, a message round-trips, and a
-- bogus direction is refused.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  probe UUID := gen_random_uuid();
  an_org UUID; an_itin UUID; got TEXT; rejected BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trip_messages'
               AND cmd = 'DELETE' AND 'authenticated' = ANY(roles)) THEN
    RAISE EXCEPTION 'authenticated must not delete trip_messages';
  END IF;

  SELECT o.id, i.id INTO an_org, an_itin
    FROM public.organizations o JOIN public.itineraries i ON i.org_id = o.id LIMIT 1;
  IF an_itin IS NULL THEN
    RAISE NOTICE 'no itinerary to probe with — structure asserted only';
  ELSE
    INSERT INTO public.trip_messages (id, org_id, itinerary_id, direction, content, sender_name)
    VALUES (probe, an_org, an_itin, 'inbound', 'zz-migration-probe', 'probe');
    SELECT direction INTO got FROM public.trip_messages WHERE id = probe;
    DELETE FROM public.trip_messages WHERE id = probe;
    IF got IS DISTINCT FROM 'inbound' THEN
      RAISE EXCEPTION 'probe message did not round-trip (got %)', got;
    END IF;

    BEGIN
      INSERT INTO public.trip_messages (org_id, itinerary_id, direction, content)
      VALUES (an_org, an_itin, 'sideways', 'probe');
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'a bogus direction was accepted';
    END IF;
    RAISE NOTICE 'probe: round-trip ok, bogus direction rejected';
  END IF;
END $$;

COMMIT;
