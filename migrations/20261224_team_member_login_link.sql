-- ============================================
-- team_members.user_id: link existing members to their company's login
-- ============================================
-- People audit (Team Members), finding 12.
--
-- A trip or task assigned to a team member notifies them through
-- team_members.user_id: the bell shows only rows whose team_member_id is a
-- member whose user_id is the viewer (lib/notifications-scope), and the
-- WhatsApp inbox finds "me" the same way. The Team page never set user_id —
-- only WhatsApp Manage Agents did, by email — so a person added on the Team
-- page, then invited and joined, never saw "You now own TRIP" in-app, while
-- the page showed a green "System user" chip (matched by email) as if all
-- were linked.
--
-- The routes now link at create and edit (a login of the SAME company whose
-- email matches, case-insensitive, and only one). This migration does the same
-- for the members that already exist: user_id is set where it is NULL, the
-- member has an email, and exactly ONE login matches it — a login that is a
-- member of the member's own company (organization_members.org_id =
-- team_members.org_id; a login of the other company is never linked, even with
-- the same address) and that is not already another member's login there
-- (team_members_org_user_key: one row per login per company).
--
-- Not linked, and listed in org_backfill_review (20261202) with the member's
-- company, for the owner to look at:
--   * AMBIGUOUS: two or more logins of the company have that email, or two
--     members of the company share an email that matches the same login;
--   * LOGIN TAKEN: the one matching login already belongs to another member;
--   * UNMATCHED: the member has an email and no login of the company has it
--     (usually a guide or driver with no login — nothing to fix; listed so
--     it can be checked). Members with no email are not listed.
-- Read it in the SQL editor:
--   SELECT * FROM org_backfill_review WHERE table_name = 'team_members';
--
-- DATA CHANGED: team_members.user_id only, and only from NULL. Nothing else.
-- Idempotent (a linked member is no longer a candidate; review rows are
-- ON CONFLICT DO NOTHING) and guarded on each table existing (to_regclass).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL
     OR to_regclass('public.organization_members') IS NULL
     OR to_regclass('public.user_profiles') IS NULL THEN
    RETURN;
  END IF;

  -- Each (member, login) pair whose email matches, within the member's company.
  CREATE TEMP TABLE _tm_link_pairs ON COMMIT DROP AS
    SELECT DISTINCT t.id AS member_id, t.org_id, p.id AS user_id
    FROM public.team_members t
    JOIN public.organization_members m ON m.org_id = t.org_id
    JOIN public.user_profiles p ON p.id = m.user_id
    WHERE t.user_id IS NULL
      AND t.email IS NOT NULL AND btrim(t.email) <> ''
      AND lower(btrim(p.email)) = lower(btrim(t.email));

  -- Safe to link: the member has one login, and that login has one member
  -- among the candidates and no member in the company yet.
  CREATE TEMP TABLE _tm_link_ok ON COMMIT DROP AS
    SELECT a.member_id, a.org_id, a.user_id
    FROM _tm_link_pairs a
    WHERE (SELECT count(*) FROM _tm_link_pairs b WHERE b.member_id = a.member_id) = 1
      AND (SELECT count(*) FROM _tm_link_pairs b WHERE b.org_id = a.org_id AND b.user_id = a.user_id) = 1
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members x
        WHERE x.org_id = a.org_id AND x.user_id = a.user_id
      );

  UPDATE public.team_members t
     SET user_id = k.user_id
    FROM _tm_link_ok k
   WHERE t.id = k.member_id AND t.user_id IS NULL;

  IF to_regclass('public.org_backfill_review') IS NOT NULL THEN
    -- Ambiguous, or the login is taken.
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'team_members', p.member_id::text, p.org_id,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.team_members x WHERE x.org_id = p.org_id AND x.user_id = p.user_id)
               THEN 'email matches login ' || p.user_id::text || ' which already belongs to another team member; not linked by 20261224'
             ELSE 'email matches several logins or is shared by several team members of the company; not linked by 20261224'
           END
    FROM _tm_link_pairs p
    WHERE NOT EXISTS (SELECT 1 FROM _tm_link_ok k WHERE k.member_id = p.member_id)
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;

    -- Unmatched: an email, no login of the company has it.
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'team_members', t.id::text, t.org_id,
           'email matches no login of the company; not linked by 20261224'
    FROM public.team_members t
    WHERE t.user_id IS NULL
      AND t.email IS NOT NULL AND btrim(t.email) <> ''
      AND NOT EXISTS (SELECT 1 FROM _tm_link_pairs p WHERE p.member_id = t.id)
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$;

COMMIT;
