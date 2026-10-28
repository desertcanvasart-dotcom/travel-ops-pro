-- ============================================
-- 20270113: 'owner' is no longer a Team page job label
-- ============================================
-- team_members.role is a job label (who guides, who coordinates) — never an
-- access level. 'owner' was one of the labels, so any admin or manager could
-- mark anyone "Owner" on the Team page, and the roster could then disagree
-- with who actually owns the system. Ownership is the LOGIN role
-- (organization_members) and the Team page now shows it beside the label.
--
-- The label list (lib/team-members.ts TEAM_ROLES) drops 'owner'; this moves
-- every row still carrying it to 'manager', the nearest job label, so editing
-- such a card does not silently fall back to Staff. Running it twice changes
-- nothing.
-- ============================================

DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL THEN RETURN; END IF;
  UPDATE public.team_members SET role = 'manager' WHERE role = 'owner';
END $$;
