-- ============================================
-- user_profiles: no self-promotion, no self-reactivation; season calendar
-- written by the server only; activity_log carries what changed
-- ============================================
-- Settings audit (User Management, Seasonal Premiums, Activity Log).
--
-- 1. user_profiles. "Users can update own profile" is USING (id = auth.uid())
--    with no column limit, so any signed-in person could run, through
--    PostgREST, `update user_profiles set is_active = true` on their own row
--    (a deactivated person let themselves back in: middleware reads that
--    flag) or `set role = 'admin'` (the mirror is_admin() and
--    is_manager_or_above() read, which 137 rate, tour, content and finance
--    policies call). A BEFORE UPDATE trigger now refuses a change to role,
--    is_active, id or email unless the statement runs as a server role:
--    the service role (every app route that changes them), postgres and the
--    SECURITY DEFINER functions it owns (mirror_membership_role keeps role in
--    step with organization_members). Name, phone, company name and avatar
--    stay the person's own to edit (/api/profile, /api/avatar/upload).
--
--    "Admins can update all profiles" and "Admins can delete profiles" are
--    dropped. The Users page changes and deletes accounts through
--    /api/profiles/[id] on the service role, which checks the target's
--    company, the owner rule and the other-company rule; the policies let a
--    shared-company admin skip all three from a browser, and a deleted
--    profile row reads as an ACTIVE account in middleware. No browser code
--    updates or deletes another person's profile.
--
-- 2. Removing a membership did not touch the mirror: the trigger fired on
--    insert and role change only, so someone removed from the company whose
--    role the mirror held kept that role there. A DELETE trigger now
--    re-mirrors the earliest remaining membership, or viewer when none is
--    left.
--
-- 3. pricing_seasons / pricing_season_dates. pricing_seasons_org_all and
--    pricing_season_dates_org_all were FOR ALL USING user_is_in_org(org_id):
--    any member, a viewer included, could change a premium from the browser,
--    past the admin/manager API gate and the Activity Log. Every write in the
--    app is a service-role route (/api/pricing/seasons, /api/pricing/
--    season-dates), so the browser keeps SELECT for members of the company
--    and loses INSERT, UPDATE and DELETE.
--
-- 4. activity_log.detail (jsonb, nullable): the before and after values a
--    route records for a role change, a removal, an invitation accepted or a
--    season premium change. Older rows have none.
--
-- Idempotent (CREATE OR REPLACE, DROP … IF EXISTS, ADD COLUMN IF NOT
-- EXISTS) and guarded on each table existing. No data is changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.user_profiles_guard_privileged() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- current_user, not auth.role(): inside a SECURITY DEFINER function it is
  -- the function's owner, so the membership mirror still writes role.
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.role IS DISTINCT FROM OLD.role
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
  ) THEN
    RAISE EXCEPTION 'role, active status and email are changed by an administrator, not from a profile'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.user_profiles_guard_privileged() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mirror_membership_role_on_delete() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  first_role text;
BEGIN
  SELECT role INTO first_role
    FROM public.organization_members
    WHERE user_id = OLD.user_id
    ORDER BY created_at ASC
    LIMIT 1;
  UPDATE public.user_profiles
    SET role = CASE WHEN first_role IS NULL THEN 'viewer' WHEN first_role = 'owner' THEN 'admin' ELSE first_role END
    WHERE id = OLD.user_id
      AND role IS DISTINCT FROM CASE WHEN first_role IS NULL THEN 'viewer' WHEN first_role = 'owner' THEN 'admin' ELSE first_role END;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mirror_membership_role_on_delete() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  p record;
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_user_profiles_guard_privileged ON public.user_profiles;
    CREATE TRIGGER trg_user_profiles_guard_privileged
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.user_profiles_guard_privileged();
    DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
    DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
  END IF;

  IF to_regclass('public.organization_members') IS NOT NULL AND to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_organization_members_mirror_role_delete ON public.organization_members;
    CREATE TRIGGER trg_organization_members_mirror_role_delete
      AFTER DELETE ON public.organization_members
      FOR EACH ROW EXECUTE FUNCTION public.mirror_membership_role_on_delete();
  END IF;

  FOREACH t IN ARRAY ARRAY['pricing_seasons', 'pricing_season_dates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;

  IF to_regclass('public.activity_log') IS NOT NULL THEN
    ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS detail jsonb;
  END IF;
END
$$;

COMMIT;
