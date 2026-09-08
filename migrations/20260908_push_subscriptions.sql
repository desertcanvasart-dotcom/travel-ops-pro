-- ============================================================================
-- 20260908 — push_subscriptions: browser push for the /ops board
-- (ported from the sibling SaaS migration 287, org-scoped)
-- ============================================================================
-- The office enables browser push so a driver's tap (a trip_events row) alerts
-- the coordinator even with the ops board closed. One row per browser endpoint
-- (UNIQUE), so re-subscribing from the same browser is an upsert, not a dupe.
-- Dead endpoints (404/410 from the push service) are pruned by lib/push.ts.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_org ON public.push_subscriptions (org_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_org ON public.push_subscriptions;
CREATE POLICY push_subscriptions_org ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS push_subscriptions_service_role ON public.push_subscriptions;
CREATE POLICY push_subscriptions_service_role ON public.push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Self-verifying probe: the UNIQUE(endpoint) upsert contract must hold.
DO $$
DECLARE
  an_org UUID; p1 UUID := gen_random_uuid(); dup_refused BOOLEAN := false;
BEGIN
  SELECT id INTO an_org FROM public.organizations LIMIT 1;
  IF an_org IS NULL THEN
    RAISE NOTICE 'no organization to probe with — structure asserted only';
  ELSE
    INSERT INTO public.push_subscriptions (id, org_id, endpoint, p256dh, auth)
    VALUES (p1, an_org, 'https://zz-probe.example/' || p1::text, 'zz', 'zz');
    BEGIN
      INSERT INTO public.push_subscriptions (org_id, endpoint, p256dh, auth)
      VALUES (an_org, 'https://zz-probe.example/' || p1::text, 'zz', 'zz');
    EXCEPTION WHEN unique_violation THEN dup_refused := true;
    END;
    DELETE FROM public.push_subscriptions WHERE id = p1;
    IF NOT dup_refused THEN
      RAISE EXCEPTION 'duplicate endpoint was accepted — UNIQUE(endpoint) missing';
    END IF;
    RAISE NOTICE 'probe: endpoint uniqueness enforced';
  END IF;
END $$;

COMMIT;
