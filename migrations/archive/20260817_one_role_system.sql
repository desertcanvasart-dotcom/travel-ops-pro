-- ============================================================
-- One role system: organization_members is the authority
-- ============================================================
-- Until now there were two: middleware and route gates read a GLOBAL
-- user_profiles.role while data access hung off organization membership. They
-- had drifted badly — every member in production carried membership-'owner'
-- (backfill artefact + the invite flow minting owner for every admin invite),
-- so the owner-gates (org rename, payment terms) passed everyone, including
-- agents. user_profiles was quietly doing all the real work.
--
-- APPLY BEFORE DEPLOYING the code that reads membership roles. Applied to a
-- database still running old code it is harmless: the old code reads
-- user_profiles.role, which this does not touch.
--
-- user_profiles keeps the PROFILE (name, avatar, is_active — account-level).
-- Its role column becomes a display mirror; nothing may gate on it.
-- ============================================================

-- 1. Carry the real distinctions over from user_profiles (admin×3, agent×2 in
--    prod today) onto the membership rows that until now all said 'owner'.
UPDATE public.organization_members m
SET role = COALESCE(p.role, 'agent')
FROM public.user_profiles p
WHERE p.id = m.user_id;

-- A member with no profile row gets the least privilege, not a guess.
UPDATE public.organization_members
SET role = 'viewer'
WHERE role NOT IN ('owner', 'admin', 'manager', 'agent', 'viewer');

-- 2. The owner, designated by the operator (2026-08-17). Their LOGIN is
--    travel2egypt69@gmail.com — islamjp69@gmail.com is a contact address with
--    no auth account, which the ownerless-org check caught on first apply.
UPDATE public.organization_members m
SET role = 'owner'
FROM auth.users u
WHERE u.id = m.user_id
  AND lower(u.email) = 'travel2egypt69@gmail.com';

-- The E2E harness org keeps its owner: the smoke user exercises owner-gated
-- routes, and its profile says 'agent' so step 1 just downgraded it.
UPDATE public.organization_members m
SET role = 'owner'
FROM public.organizations o
WHERE o.id = m.org_id
  AND o.name = 'E2E Smoke Org';

-- 3. Only now, with every row in vocabulary, the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_role_check'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_role_check
      CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer'));
  END IF;
END $$;

-- 4. Every org must keep at least one owner or its owner-gated settings lock
--    permanently. Asserted rather than assumed: if this raises, fix the data
--    before the code ships, not after.
DO $$
DECLARE orphan RECORD;
BEGIN
  FOR orphan IN
    SELECT o.id, o.name FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = o.id AND m.role = 'owner'
    )
  LOOP
    RAISE EXCEPTION 'Organization "%" (%) has no owner after backfill', orphan.name, orphan.id;
  END LOOP;
END $$;

COMMENT ON COLUMN public.organization_members.role IS
  'THE role system: owner | admin | manager | agent | viewer. Owner clears every gate (lib/auth/roles.ts) and is transferred, never invited or edited from a profile form.';
COMMENT ON COLUMN public.user_profiles.role IS
  'DEPRECATED as authority — display mirror only, kept in sync by the profiles PATCH route until client contexts read membership. Nothing may gate on this.';
