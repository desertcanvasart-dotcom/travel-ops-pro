-- ============================================
-- The first person to sign up owns the install
-- ============================================
-- Found by installing this product from nothing, at tag v2026.08.29-6, and
-- then trying to use it. The schema built, the app booted, signup succeeded —
-- and the account it created could open the dashboard and nothing else.
-- /clients, /itineraries and /settings all bounced to
-- /dashboard?error=unauthorized, and /api/support-bundle answered 403, so the
-- one tool for diagnosing the install was behind the same locked door.
--
-- THREE THINGS WERE MISSING, and only the first was ever written down.
--
-- 1. `public.handle_new_user()` exists in the baseline. The TRIGGER that calls
--    it does not. The trigger lives on `auth.users`, and the baseline is a
--    `pg_dump --schema=public` of production — a dump of the public schema
--    cannot carry a trigger attached to a table in the auth schema. Production
--    has had that trigger since long before migrations were tracked, so
--    nothing here ever noticed it was not in the repository. On a fresh
--    install no `user_profiles` row is ever created for anybody.
--
-- 2. Nothing in the application ever creates the first `organizations` row.
--    There is no INSERT against that table anywhere in app/ or lib/ — the row
--    on production was made by hand years ago.
--
-- 3. Nothing ever creates the first `organization_members` row either.
--    Membership is the sole authority on roles (lib/auth/roles.ts), and
--    middleware.ts reads it: no membership means `viewer`, and viewer is
--    allowed exactly one route. Settings is admin-only, so the operator could
--    not even reach the page where they would name their own agency. A closed
--    loop: no membership, so no Settings; no Settings, so no organisation; no
--    organisation, so no membership.
--
-- docs/SELF-HOSTING.md promised "sign up the first user, who becomes the owner
-- of the first organization". This is the migration that makes that true.
--
-- WHY THE BOOTSTRAP IS IN THE TRIGGER rather than in a signup route: every way
-- a user can come into existence goes through `auth.users`. The previous
-- install attempt created its user with the GoTrue admin API, got no profile,
-- and the missing row was written off as an artefact of not using the signup
-- form. It was not — the form has the same hole. A rule that lives in the app
-- only protects the paths the app owns.
--
-- IT CANNOT ESCALATE ANYTHING. The bootstrap branch runs only when the install
-- has NO organisation at all. On production, or on any install past its first
-- minute, the condition is false and this behaves exactly as before: create a
-- profile, nothing else. Public signup on an install that already has an
-- organisation still yields a member of nothing, which is what it should yield.
--
-- The new organisation is created with a BLANK name on purpose. SQL cannot
-- read BUSINESS_NAME, and lib/org-identity.ts already falls back per field to
-- the environment when the row's value is empty — so a blank name is complete
-- behaviour, not a hole, and Settings is where the operator replaces it. Blank
-- beats fake; naming it "My Company" would print that on an invoice.

BEGIN;

-- ---------------------------------------------------------------------------
-- The profile-and-bootstrap function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    -- A SECURITY DEFINER function with a caller-controlled search_path is how
    -- privilege escalation gets in. Pin it.
    SET search_path = public, pg_temp
    AS $$
DECLARE
  bootstrap_org_id uuid;
BEGIN
  -- ON CONFLICT, because this must be safe to run against a user who already
  -- has a profile: production may already have the older trigger, and the
  -- backfill below may have got there first.
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Two people signing up in the same second must not create two
  -- organisations. The lock is transaction-scoped and uncontended after the
  -- first user, which is the only time this branch can be taken at all.
  PERFORM pg_advisory_xact_lock(hashtext('autoura:bootstrap_first_organization'));

  IF NOT EXISTS (SELECT 1 FROM public.organizations) THEN
    INSERT INTO public.organizations (name) VALUES ('')
    RETURNING id INTO bootstrap_org_id;

    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (bootstrap_org_id, NEW.id, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the user_profiles row for a new auth user, and — only on an install with no organisation at all — creates that organisation and makes this user its owner.';

-- ---------------------------------------------------------------------------
-- Attach it to auth.users
-- ---------------------------------------------------------------------------
-- Guarded rather than DROP-and-CREATE: production already has a trigger for
-- this function, and dropping a trigger requires ownership of auth.users,
-- which the migration role may not have. Where it already exists this is a
-- no-op; where it does not, this is the fix.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
      AND t.tgfoid = 'public.handle_new_user()'::regprocedure
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created'
         || ' AFTER INSERT ON auth.users'
         || ' FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  -- Say what to do rather than just failing. On hosted Supabase the SQL editor
  -- runs as a role that can do this even when the connection string's role
  -- cannot.
  RAISE EXCEPTION
    'Cannot create the trigger on auth.users as role %. Run this once in the Supabase SQL editor, then re-run npm run migrate: CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();',
    current_user;
END $$;

-- ---------------------------------------------------------------------------
-- Rescue the installs that already hit this
-- ---------------------------------------------------------------------------
-- An install that signed somebody up before this migration has auth users with
-- no profile and, if it never had an organisation, nobody who can administer
-- it. The trigger will not fire retroactively for them.

-- Every auth user gets the profile the trigger would have made. An account
-- with no profile is broken outright: middleware reads is_active from it.
INSERT INTO public.user_profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- And if there is still no organisation, the earliest account becomes its
-- owner — the same person signup would have made the owner. Guarded on the
-- absence of ANY organisation, so this can never touch an install that has one.
DO $$
DECLARE
  bootstrap_org_id uuid;
  first_user_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations) THEN
    RETURN;
  END IF;

  SELECT id INTO first_user_id
  FROM auth.users
  WHERE email IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_user_id IS NULL THEN
    RETURN;  -- Nobody has signed up yet. The trigger will handle the first one.
  END IF;

  INSERT INTO public.organizations (name) VALUES ('')
  RETURNING id INTO bootstrap_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (bootstrap_org_id, first_user_id, 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;
END $$;

COMMIT;
