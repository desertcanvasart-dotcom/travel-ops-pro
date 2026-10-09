-- ============================================================================
-- 20261119 — the seeded message templates are ATS's, not shared defaults
-- ============================================================================
--
-- The templates seeded before 20261117 (org_id NULL) were written for ATS and
-- every organization saw them as shared defaults. Decided 2026-10-09: they
-- belong to ATS. ATS is the organization whose members sign in with an
-- @ats-hj.com address (as 20261116 identifies it).
--
--   * each shared default becomes ATS's own template;
--   * where ATS already edited one (an active copy made from it, or under the
--     same name, channel and language), the copy stands and the default is
--     moved to ATS inactive — uq_message_templates_org_name counts active
--     rows only;
--   * other organizations keep any copies they made (their own rows); they no
--     longer see the defaults. New organizations start with no templates.
--
-- template_send_log rows keep their template_id. Replay-safe: a second run
-- finds no org_id NULL rows; a bare schema replay (no auth.users, no ATS)
-- changes nothing. Two ATS organizations fail the migration; none leaves the
-- defaults shared, with a NOTICE.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  ats UUID;
  n_orgs INT;
  moved INT;
  retired INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.message_templates WHERE org_id IS NULL) THEN
    RAISE NOTICE 'no shared message templates — nothing to move';
    RETURN;
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE NOTICE 'auth.users absent (schema replay) — shared templates left as they are';
    RETURN;
  END IF;

  SELECT count(DISTINCT m.org_id), min(m.org_id::text)::uuid
    INTO n_orgs, ats
    FROM public.organization_members m
    JOIN auth.users u ON u.id = m.user_id
   WHERE lower(u.email) LIKE '%@ats-hj.com';

  IF n_orgs > 1 THEN
    RAISE EXCEPTION 'expected one ATS organization (@ats-hj.com members), found %', n_orgs;
  END IF;
  IF n_orgs = 0 THEN
    RAISE NOTICE 'no ATS organization (@ats-hj.com members) — shared templates left as they are';
    RETURN;
  END IF;

  -- Defaults ATS has already replaced with its own active copy — made from
  -- it (source_template_id: an edit may rename it or change its language),
  -- or under the same name/channel/language: moved to ATS inactive.
  UPDATE public.message_templates d
     SET org_id = ats, is_active = false, updated_at = now()
   WHERE d.org_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.message_templates c
        WHERE c.org_id = ats AND c.is_active
          AND (c.source_template_id = d.id
               OR (c.name = d.name AND c.channel = d.channel AND c.language IS NOT DISTINCT FROM d.language))
     );
  GET DIAGNOSTICS retired = ROW_COUNT;

  -- The rest become ATS's own.
  UPDATE public.message_templates
     SET org_id = ats, updated_at = now()
   WHERE org_id IS NULL;
  GET DIAGNOSTICS moved = ROW_COUNT;

  RAISE NOTICE 'ATS org %: % templates moved, % already replaced by ATS copies (moved inactive)', ats, moved, retired;

  IF EXISTS (SELECT 1 FROM public.message_templates WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'shared templates remain';
  END IF;
END $$;

COMMIT;
