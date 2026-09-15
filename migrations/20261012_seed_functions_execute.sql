-- ============================================
-- The vocabulary seeders may only be called by the service role
-- ============================================
-- Four SECURITY DEFINER functions seed an organisation's preset vocabulary:
--
--   seed_org_vocabulary(uuid, text)      20260908
--   seed_cruise_supplements(uuid)        20261009
--   seed_tour_template_vocabulary(uuid)  20261010
--   seed_tour_themes(uuid)               20261011
--
-- Each takes the organisation id as a plain argument and inserts into it under
-- the definer's privileges, with no check that the caller belongs to that
-- organisation. Each GRANTed execute to service_role — which was never the
-- point, because two other grants already reached further:
--
--   * Postgres gives PUBLIC execute on every new function by default.
--   * The baseline's ALTER DEFAULT PRIVILEGES ... GRANT ALL ON ROUTINES TO
--     authenticated (20260829) adds an explicit grant on top.
--
-- So any signed-in user could call one through PostgREST's rpc with another
-- organisation's id and restore that organisation's preset entries — ones its
-- own admin had deliberately deleted. Nothing is read and nothing is removed,
-- and every install today is a single organisation, so the reach is small; but
-- it is exactly the cross-tenant write the org_id scoping exists to rule out,
-- and it is one statement per function to close.
--
-- The app calls these from the server only, on the service-role client
-- (/api/vocabulary/reset), and the organisations INSERT trigger runs them as
-- their definer — neither path is touched by revoking the public grants.
-- Guarded on the function existing rather than assumed: the migration tests
-- replay every file EXCEPT the one under test, so this runs in databases
-- where one of the four has not been created yet. to_regprocedure returns
-- NULL for a missing signature instead of raising.
BEGIN;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.seed_org_vocabulary(uuid, text)',
    'public.seed_cruise_supplements(uuid)',
    'public.seed_tour_template_vocabulary(uuid)',
    'public.seed_tour_themes(uuid)'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      -- Explicit, so a later ALTER DEFAULT PRIVILEGES change cannot silently
      -- take the one caller that is meant to have it away.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END
$$;

COMMIT;
