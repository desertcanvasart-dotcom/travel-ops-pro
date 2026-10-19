-- ============================================
-- 20270108: the company backfill on a database with ONE company
-- ============================================
-- org_backfill_default() (20261202) answered "the company that is not ATS".
-- On a database where ATS is the only company there is none, so it returned
-- NULL — and every backfill that needed it stopped with "no organisations —
-- nothing to backfill" while its migration was still recorded as applied:
--
--   20261203  team_members, departments, tasks, notifications
--   20261205  suppliers, supplier_properties
--   20261208  content_usage_log (rows with no trip or content trace)
--   20261209  user_preferences
--
-- Production (ATS only) was left with every supplier, team member, task and
-- department WITHOUT a company. The code reads each company's own rows, so
-- from the October release (#625, 2026-10-16) the rate forms offered no
-- suppliers, and the same held for the Suppliers list, team, departments
-- and tasks (operator, 2026-10-19).
--
-- 1. org_backfill_default() returns ATS when ATS is the only company.
-- 2. With exactly one company, every row of those tables still without a
--    company is that company's — there is no other it could be — and is
--    listed in org_backfill_review. Then org_id is made required where the
--    original migrations meant it to be. updated_at is not bumped: an
--    assignment is not an edit.
-- With several companies nothing is assigned here (the original migrations
-- handle that case); a NOTICE says so.
--
-- Safe to run twice.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_backfill_default() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  ats uuid := public.org_backfill_ats();
  others int;
  found uuid;
BEGIN
  SELECT id INTO found FROM public.organizations WHERE slug = 'travel2egypt';
  IF found IS NOT NULL THEN RETURN found; END IF;
  IF ats IS NOT NULL THEN
    SELECT count(*), min(id::text)::uuid INTO others, found
      FROM public.organizations WHERE id <> ats;
    IF others = 1 THEN RETURN found; END IF;
    -- ATS is the only company: it is the default too.
    IF others = 0 THEN RETURN ats; END IF;
  END IF;
  SELECT id INTO found FROM public.organizations
   WHERE ats IS NULL OR id <> ats
   ORDER BY created_at, id LIMIT 1;
  RETURN found;
END
$$;
REVOKE ALL ON FUNCTION public.org_backfill_default() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  n_orgs int;
  the_org uuid;
  t text;
  nulls boolean;
  trg record;
  tg text;
  disabled text[] := ARRAY[]::text[];
  only_free text;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO n_orgs, the_org FROM public.organizations;
  IF n_orgs <> 1 THEN
    RAISE NOTICE 'single-company backfill: % companies — nothing assigned here', n_orgs;
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'suppliers', 'supplier_properties', 'team_members', 'departments', 'tasks',
    'notifications', 'user_preferences', 'content_usage_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      CONTINUE;
    END IF;

    -- Not an edit: the updated_at triggers stay out of it.
    disabled := ARRAY[]::text[];
    FOR trg IN
      SELECT tgname FROM pg_trigger
       WHERE tgrelid = ('public.' || t)::regclass AND NOT tgisinternal AND tgenabled <> 'D'
         AND tgname IN ('set_updated_at', 'update_suppliers_timestamp', 'update_team_members_updated_at',
                        'update_tasks_updated_at', 'update_departments_updated_at')
    LOOP
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', t, trg.tgname);
      disabled := disabled || trg.tgname::text;
    END LOOP;

    -- user_preferences is one row per person per company: a person who
    -- already has this company's row keeps it; the stray one is left alone.
    only_free := CASE WHEN t = 'user_preferences' THEN
      ' AND NOT EXISTS (SELECT 1 FROM public.user_preferences o WHERE o.user_id = x.user_id AND o.org_id = $1)'
      ELSE '' END;

    EXECUTE format($f$
      WITH filled AS (
        UPDATE public.%1$I x SET org_id = $1 WHERE x.org_id IS NULL%2$s RETURNING x.id
      )
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, id::text, $1, 'the only company — 20270108 (the original backfill stopped on a single-company database)'
        FROM filled
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $f$, t, only_free) USING the_org;

    FOREACH tg IN ARRAY disabled LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', t, tg);
    END LOOP;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF NOT nulls THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
END
$$;

COMMIT;
