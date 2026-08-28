-- ============================================================================
-- organization_members.user_id → auth.users, with ON DELETE CASCADE
-- ============================================================================
--
-- WHY
--
-- organization_members.user_id was declared `uuid not null` with NO foreign
-- key (migrations/20260624_organizations_phase1.sql). Deleting an auth user
-- therefore leaves their membership row behind for ever. Production has three
-- such rows right now: two from June seeding and one from the invited manager
-- egypt@ats-hj.com, whose stranded account had to be deleted by hand.
--
-- The members page stitches memberships onto user_profiles in code, so an
-- orphan renders as a member with no name and no email — a row the operator
-- cannot identify and, since the person no longer exists, cannot meaningfully
-- remove either.
--
-- WHAT THIS DELETES
--
-- Step 1 removes every membership whose user is already gone from auth.users.
-- That is the ONLY data this migration destroys, it is already unusable, and
-- the rows are listed in the NOTICE before they go so the run is auditable.
-- Nothing else references those ids (checked: itineraries.assigned_to and
-- tasks.assigned_to hold none of them).
--
-- Step 2 adds the constraint so it cannot happen again: removing a user now
-- takes their membership with them.

BEGIN;

-- 1. Report, then remove, the memberships whose user no longer exists.
DO $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT m.org_id, m.user_id, m.role, m.created_at
    FROM public.organization_members m
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE u.id IS NULL
  LOOP
    RAISE NOTICE 'Removing orphaned membership: user_id=% role=% created=%', r.user_id, r.role, r.created_at;
    n := n + 1;
  END LOOP;

  DELETE FROM public.organization_members m
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);

  RAISE NOTICE 'Orphaned memberships removed: %', n;
END $$;

-- 2. The constraint that makes the orphan class impossible.
ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_user_id_fkey;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check (run after COMMIT):
--
--   -- No orphans left, and none can be created:
--   SELECT count(*) FROM public.organization_members m
--   LEFT JOIN auth.users u ON u.id = m.user_id
--   WHERE u.id IS NULL;                              -- expect 0
--
--   -- The constraint exists and cascades:
--   SELECT confdeltype FROM pg_constraint
--   WHERE conname = 'organization_members_user_id_fkey';   -- expect 'c'
