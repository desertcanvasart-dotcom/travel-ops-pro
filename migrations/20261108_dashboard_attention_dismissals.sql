-- ============================================================================
-- 20261108 — "Needs attention", dismissed (ported from the sibling SaaS
-- migration 397, org-scoped for this app)
-- ============================================================================
--
-- The dashboard's Needs attention list (app/api/dashboard/attention) is built
-- fresh on every load from bookings and email conversations. There was no way
-- to say "seen it, handled elsewhere" — a reply sent from a personal phone, a
-- balance being chased by hand — so the same rows sat at the top for weeks
-- and buried the new ones.
--
-- One row per dismissed item per organisation. The item is named by a stable
-- key (its kind + the record it is about) and remembered with a FINGERPRINT of
-- the state it was dismissed in. The list hides an item only while both still
-- match: when the situation changes — the customer writes again, the balance
-- or its deadline moves, another traveller's form comes in — it comes back,
-- because that is new news (lib/dashboard/attention-dismissals.ts).
--
-- Organisation-wide, not per user: the list is the office's shared to-do.
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_attention_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  dismissed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, item_key)
);

ALTER TABLE public.dashboard_attention_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_attention_dismissals_org ON public.dashboard_attention_dismissals;
CREATE POLICY dashboard_attention_dismissals_org ON public.dashboard_attention_dismissals
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS dashboard_attention_dismissals_service_role ON public.dashboard_attention_dismissals;
CREATE POLICY dashboard_attention_dismissals_service_role ON public.dashboard_attention_dismissals
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
