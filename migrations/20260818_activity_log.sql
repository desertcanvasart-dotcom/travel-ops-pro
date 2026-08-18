-- ============================================================
-- Activity log: who did what, when — append-only
-- ============================================================
-- Captured in middleware for EVERY authenticated mutating API call, so no
-- screen or code path can skip it. Rows are immutable by trigger: nobody
-- edits or deletes history, including admins — an audit trail someone can
-- clean up is not an audit trail.

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  user_id uuid NOT NULL,
  user_email text,
  method text NOT NULL,
  path text NOT NULL,
  action text NOT NULL,        -- create | update | delete | action
  entity_type text,            -- derived from the path: rates/attractions, bookings, …
  entity_id text,              -- id segment of the path when present
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_org_created_idx ON public.activity_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_user_idx ON public.activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON public.activity_log (entity_type, created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
-- No policies: nothing reads or writes it through the anon/authenticated
-- keys. The service role writes; the admin-gated API reads.

CREATE OR REPLACE FUNCTION public.activity_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only';
END $$;

DROP TRIGGER IF EXISTS activity_log_no_update ON public.activity_log;
CREATE TRIGGER activity_log_no_update
  BEFORE UPDATE OR DELETE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_log_immutable();

COMMENT ON TABLE public.activity_log IS
  'Append-only audit trail, written by middleware for every authenticated mutating API request. Trigger blocks UPDATE/DELETE for every role.';
