-- ============================================
-- Per-user tables: each person's own row, and profiles within a shared org
-- ============================================
-- Three sets of RLS policies on per-user tables were written for a single-
-- company install. With a second company live, each is a cross-company read
-- or write through PostgREST with nothing but a session — or, for the first,
-- the PUBLIC anon key alone.
--
-- 1. user_settings — "Users can view own settings" USING (true), "Users can
--    insert own settings" WITH CHECK (true), "Users can update own settings"
--    USING (true), and no TO clause, so they applied to PUBLIC, anon
--    included: anyone could read and rewrite every user's email signature,
--    auto-reply text and notification preferences. Now TO authenticated, and
--    only the caller's own row (auth.uid() = user_id). The app reads and
--    writes user_settings only on the service-role client (/api/settings/
--    notifications, /api/settings/email, lib/notification-preferences.ts from
--    lib/notifications.ts), which RLS does not apply to; no browser code
--    touches the table.
--
-- 2. user_preferences — user_preferences_authenticated_all, TO authenticated
--    USING (true) WITH CHECK (true), is OR'd with the owner policies, so any
--    signed-in user could read or overwrite anyone's preferences. Dropped.
--    The owner policies stay and cover every command: "Users can view own
--    preferences" (SELECT), "Users can insert own preferences" (INSERT),
--    "Users can update own preferences" (UPDATE), "Users can delete own
--    preferences" (DELETE), "Users can upsert own preferences" (ALL), each
--    auth.uid() = user_id. The browser reads only its own row
--    (app/settings/page.tsx, app/whatsapp-parser) — unaffected.
--
-- 3. user_profiles — "Managers can view all profiles" USING
--    (is_manager_or_above()), "Admins can update all profiles" and "Admins
--    can delete profiles" USING (is_admin()). Those helpers read
--    user_profiles.role, a mirror of ONE membership, and ask nothing about
--    the profile being touched — so an admin of one company could update
--    (is_active = false locks them out) or delete any other company's
--    people. Now the caller must hold the role IN AN ORGANISATION THE
--    PROFILE'S PERSON ALSO BELONGS TO (organization_members, the one role
--    system — lib/auth/roles.ts), owner included (the owner clears every
--    gate), and still be an active account as before. Own-profile policies
--    are untouched.
--
--    The membership check is a SECURITY DEFINER helper, like user_is_in_org:
--    policies on user_profiles reading organization_members directly would
--    run that table's own RLS on every row. It answers only about the
--    caller (auth.uid()) and returns a boolean; executable by authenticated
--    (policies evaluate it as the signed-in user), not by anon or PUBLIC.
--
-- Idempotent (DROP POLICY IF EXISTS, CREATE OR REPLACE) and guarded on each
-- table existing (to_regclass), like 20261129.
BEGIN;

CREATE OR REPLACE FUNCTION public.user_shares_org_as(p_user_id uuid, p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them ON them.org_id = me.org_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = p_user_id
      AND me.role = ANY (p_roles)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.user_shares_org_as(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_shares_org_as(uuid, text[]) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.user_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
    DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
    DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
    CREATE POLICY "Users can view own settings" ON public.user_settings
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "Users can insert own settings" ON public.user_settings
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can update own settings" ON public.user_settings
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF to_regclass('public.user_preferences') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_preferences_authenticated_all ON public.user_preferences;
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can view all profiles" ON public.user_profiles;
    DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
    DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
    CREATE POLICY "Managers can view all profiles" ON public.user_profiles
      FOR SELECT TO authenticated
      USING (public.is_active_user() AND public.user_shares_org_as(id, ARRAY['owner', 'admin', 'manager']));
    CREATE POLICY "Admins can update all profiles" ON public.user_profiles
      FOR UPDATE TO authenticated
      USING (public.is_active_user() AND public.user_shares_org_as(id, ARRAY['owner', 'admin']));
    CREATE POLICY "Admins can delete profiles" ON public.user_profiles
      FOR DELETE TO authenticated
      USING (public.is_active_user() AND public.user_shares_org_as(id, ARRAY['owner', 'admin']));
  END IF;
END
$$;

COMMIT;
