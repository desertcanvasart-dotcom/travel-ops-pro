-- 20261008_user_profiles_role_mirror.sql
-- user_profiles.role follows organization_members.role — always.
--
-- WHY: organization_members.role is the ONE authority on what a person may
-- do (lib/auth/roles.ts; the middleware, every requireRole and the sidebar
-- read it). user_profiles.role survived only as a DISPLAY MIRROR, kept in
-- step by whichever code path remembered to. Two forgot:
--
--   * invitation acceptance upserts the profile without a role, so a person
--     invited as manager carried a mirror that said `agent` (the column
--     default) from the day they joined;
--   * nothing stopped the mirror being edited on its own, and on production
--     one member invited as viewer had a mirror that said `manager`.
--
-- The second one bit on 13 Sep 2026: the Users page listed the mirror, so its
-- role dropdown already said "Manager" for a member every gate treated as a
-- viewer — and a <select> whose value already matches fires no change. The
-- one screen for fixing a role could not fix that one.
--
-- The app now lists the membership role (lib/auth/profile-roles.ts). This
-- migration makes the mirror unable to drift again: a trigger on the
-- authority rewrites the mirror on every insert and role change, and the
-- backfill below brings every existing profile into line first.
--
-- MAPPING: the mirror's CHECK allows admin / manager / agent / viewer and no
-- owner, so an owner mirrors as `admin` — the middleware's roleAllows treats
-- owner as clearing every gate, which is what admin looks like on a screen.
-- A user in more than one organisation mirrors their EARLIEST membership,
-- the same row lib/auth/current-org.ts and middleware.ts resolve.
--
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER IF EXISTS, and the backfill
-- only touches rows that differ. Run twice, unchanged. Loosening nothing.

BEGIN;

CREATE OR REPLACE FUNCTION public.mirror_membership_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  first_role text;
BEGIN
  -- The earliest membership is the one the app resolves; mirror that one
  -- whichever membership was just written.
  SELECT role INTO first_role
    FROM public.organization_members
    WHERE user_id = NEW.user_id
    ORDER BY created_at ASC
    LIMIT 1;
  IF first_role IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.user_profiles
    SET role = CASE WHEN first_role = 'owner' THEN 'admin' ELSE first_role END
    WHERE id = NEW.user_id
      AND role IS DISTINCT FROM CASE WHEN first_role = 'owner' THEN 'admin' ELSE first_role END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.mirror_membership_role() IS
  'Keeps user_profiles.role (a display mirror) equal to the user''s earliest organization_members.role; owner mirrors as admin.';

DROP TRIGGER IF EXISTS trg_organization_members_mirror_role ON public.organization_members;
CREATE TRIGGER trg_organization_members_mirror_role
  AFTER INSERT OR UPDATE OF role ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.mirror_membership_role();

-- Backfill: every profile with a membership shows that membership's role.
UPDATE public.user_profiles p
  SET role = CASE WHEN m.role = 'owner' THEN 'admin' ELSE m.role END
  FROM (
    SELECT DISTINCT ON (user_id) user_id, role
      FROM public.organization_members
      ORDER BY user_id, created_at ASC
  ) m
  WHERE m.user_id = p.id
    AND p.role IS DISTINCT FROM CASE WHEN m.role = 'owner' THEN 'admin' ELSE m.role END;

DO $verify$
DECLARE
  drift integer;
BEGIN
  SELECT count(*) INTO drift
    FROM public.user_profiles p
    JOIN (
      SELECT DISTINCT ON (user_id) user_id, role
        FROM public.organization_members
        ORDER BY user_id, created_at ASC
    ) m ON m.user_id = p.id
    WHERE p.role IS DISTINCT FROM CASE WHEN m.role = 'owner' THEN 'admin' ELSE m.role END;
  IF drift > 0 THEN
    RAISE EXCEPTION 'user_profiles.role: % profiles still differ from their membership role after backfill', drift;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.organization_members'::regclass
        AND tgname = 'trg_organization_members_mirror_role'
  ) THEN
    RAISE EXCEPTION 'trg_organization_members_mirror_role is missing';
  END IF;
END
$verify$;

COMMIT;
