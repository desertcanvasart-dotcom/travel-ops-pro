-- ============================================
-- user_invitations and activity_log: closed to signed-in browsers
-- ============================================
-- Settings audit (User Management, Activity Log), critical.
--
-- user_invitations carried a policy named "Allow all for service role" that is
-- USING (true) WITH CHECK (true) for EVERY role (the service role bypasses RLS
-- and never needed it), plus "Anyone can accept invitation with valid token"
-- (UPDATE, USING (true)). With signup open, any account could insert an admin
-- invitation for another company's org_id and accept it through
-- /api/invitations/accept, read other companies' pending tokens, or reset an
-- invitation's accepted/expiry fields. The org policies were no better: any
-- member, a viewer included, could insert an admin invitation for their own
-- company.
--
-- activity_log had activity_log_authenticated: any signed-in user could read
-- every company's audit trail (emails, IPs, org ids) and insert fake entries.
--
-- Every reader and writer of both tables in the app is a server route using
-- the service role (app/api/invitations/*, app/api/activity, lib/activity-log),
-- which bypasses RLS. So every policy on both tables is dropped and table
-- access is revoked from anon and authenticated. RLS stays ENABLED with no
-- policy: deny by default.
--
-- Idempotent; guarded on each table existing. No data is changed.
BEGIN;

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_invitations', 'activity_log'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END
$$;

COMMIT;
