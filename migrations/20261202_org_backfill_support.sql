-- ============================================
-- What the per-company backfills share: who is who, and a review list
-- ============================================
-- A second company (ATS) runs on this install beside Travel2Egypt, and
-- ~100 tables carry no org_id — so their rows are every company's. The
-- batches that follow add org_id table by table and assign each existing
-- row to the company it can be traced to. They all need the same answers,
-- given once here so they cannot drift:
--
--   organizations.slug         a stable handle. 'ats' is the organisation
--                              whose members sign in with @ats-hj.com (as
--                              20261116 and 20261119 identify it); when
--                              exactly one other organisation exists it is
--                              'travel2egypt'. Other installs get no slugs.
--   org_backfill_ats()         ATS's id, or NULL on an install without it.
--   org_backfill_default()     where an UNTRACEABLE OPERATIONAL row goes
--                              (decided 2026-10-12: Travel2Egypt): the one
--                              organisation that is not ATS; on an install
--                              without that pair, the oldest organisation.
--   org_backfill_catalogue_default()
--                              where an untraceable CATALOGUE row goes
--                              (suppliers, rates, tours, content — decided
--                              2026-10-12: the catalogue is mostly ATS's):
--                              ATS where it exists, else the default.
--   org_backfill_user_org(u)   the organisation of a person who belongs to
--                              exactly ONE; NULL for nobody or both — a row
--                              traced only through someone in both companies
--                              cannot be assigned by that person.
--   org_backfill_review        every row a backfill could not trace, or
--                              traced to both companies, with where it was
--                              put and why — for the owner to check. Read it
--                              in the SQL editor:
--                                SELECT * FROM org_backfill_review ORDER BY id;
--
-- The functions are for migrations only: executable by the service role,
-- never by a signed-in user (the same rule as 20261129). The review table
-- has RLS on and no policy, so only the service role and the SQL editor see
-- it.
--
-- Replay-safe: on a bare schema replay (no auth.users, no organisations)
-- every function returns NULL and nothing is written. Two ATS organisations
-- fail the migration, as 20261119 does.
BEGIN;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key ON public.organizations (slug) WHERE slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.org_backfill_ats() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  n int;
  found uuid;
BEGIN
  SELECT id INTO found FROM public.organizations WHERE slug = 'ats';
  IF found IS NOT NULL THEN RETURN found; END IF;
  IF to_regclass('auth.users') IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT m.org_id), min(m.org_id::text)::uuid INTO n, found
    FROM public.organization_members m
    JOIN auth.users u ON u.id = m.user_id
   WHERE lower(u.email) LIKE '%@ats-hj.com';
  IF n > 1 THEN
    RAISE EXCEPTION 'expected one ATS organisation (@ats-hj.com members), found %', n;
  END IF;
  RETURN found;
END
$$;

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
  END IF;
  SELECT id INTO found FROM public.organizations
   WHERE ats IS NULL OR id <> ats
   ORDER BY created_at, id LIMIT 1;
  RETURN found;
END
$$;

CREATE OR REPLACE FUNCTION public.org_backfill_catalogue_default() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(public.org_backfill_ats(), public.org_backfill_default())
$$;

CREATE OR REPLACE FUNCTION public.org_backfill_user_org(p_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT min(org_id::text)::uuid
    FROM public.organization_members
   WHERE user_id = p_user_id
  HAVING count(DISTINCT org_id) = 1
$$;

CREATE TABLE IF NOT EXISTS public.org_backfill_review (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id text NOT NULL,
  assigned_org uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, row_id, reason)
);
ALTER TABLE public.org_backfill_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_review FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.org_backfill_ats()',
    'public.org_backfill_default()',
    'public.org_backfill_catalogue_default()',
    'public.org_backfill_user_org(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END
$$;

-- The slugs, now that the functions can find who is who.
DO $$
DECLARE
  ats uuid := public.org_backfill_ats();
  t2e uuid;
  others int;
BEGIN
  IF ats IS NULL THEN
    RAISE NOTICE 'no ATS organisation — no slugs set';
    RETURN;
  END IF;
  UPDATE public.organizations SET slug = 'ats' WHERE id = ats AND slug IS DISTINCT FROM 'ats';
  SELECT count(*), min(id::text)::uuid INTO others, t2e FROM public.organizations WHERE id <> ats;
  IF others = 1 THEN
    UPDATE public.organizations SET slug = 'travel2egypt' WHERE id = t2e AND slug IS DISTINCT FROM 'travel2egypt';
  ELSE
    RAISE NOTICE '% organisations besides ATS — travel2egypt slug not set; the default is the oldest', others;
  END IF;
END
$$;

COMMIT;
