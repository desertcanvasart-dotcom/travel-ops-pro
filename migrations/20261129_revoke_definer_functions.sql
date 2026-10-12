-- ============================================
-- SECURITY DEFINER functions that only the server calls: service role only
-- ============================================
-- A SECURITY DEFINER function runs with its owner's privileges, so row level
-- security does not apply inside it. Postgres gives PUBLIC execute on every
-- new function, and the baseline's ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
-- ROUTINES TO authenticated (20260829) adds an explicit grant on top — so
-- every one of these could be called through PostgREST's rpc by any signed-in
-- account, and by anon with the public anon key. With a second company live
-- that is a cross-company read or write for each function that takes an id:
--
--   get_org_agent_memories(uuid, ...)   reads ANY organisation's AI agent
--                                       memory (client preferences, notes)
--                                       for the org id passed in.
--   purge_expired_agent_memories()      deletes from agent_memory for every
--                                       organisation.
--   create_quote_revision / create_b2c_quote_revision (quote id, user id, text)
--                                       snapshot any company's quote, with a
--                                       caller-chosen author.
--   revert_quote_to_revision / revert_b2c_quote_to_revision
--                                       OVERWRITE any company's quote with an
--                                       older revision.
--   delete_client_safely(uuid)          deletes any company's client and its
--                                       WhatsApp history. Nothing calls it.
--   log_audit(...)                      writes arbitrary audit_logs rows.
--                                       Nothing calls it.
--
-- The app calls the first six from the server only, on the service-role
-- client: lib/agent-memory.ts (from /api/ai/generate-itinerary, createServer
-- Client), /api/cron/process-agent-memory, and the b2b/b2c quote routes
-- (supabaseAdmin). No browser code calls any of them (grep .rpc( in app/,
-- components/, lib/, hooks/). Revoking the public grants does not touch them.
--
-- Classification of EVERY SECURITY DEFINER function after the replay:
--
--   Revoked here (server-only, act on an id the caller passes / unscoped):
--     get_org_agent_memories, purge_expired_agent_memories,
--     create_quote_revision, create_b2c_quote_revision,
--     revert_quote_to_revision, revert_b2c_quote_to_revision,
--     delete_client_safely, log_audit
--   Kept executable — referenced by RLS policies, which evaluate them as the
--   signed-in user (revoking would break every policy that calls them):
--     user_is_in_org(uuid), user_is_org_owner(uuid), is_active_user(),
--     is_admin(), is_agent_or_above(), is_manager_or_above()
--   Kept — no argument, answers only about the caller (auth.uid()):
--     get_user_role()
--   Kept — trigger functions; Postgres refuses to call them except as a
--   trigger, so rpc cannot reach them:
--     audit_trigger_func, fn_rate_audit_trigger, handle_new_user,
--     mirror_membership_role, seed_org_vocabulary_on_insert,
--     suppliers_assign_code, promote_client_on_booking
--   Already service-role only (earlier migrations):
--     seed_org_vocabulary, seed_cruise_supplements,
--     seed_tour_template_vocabulary, seed_tour_themes, seed_guide_modes,
--     seed_airports, seed_property_classes,
--     refresh_email_conversation_reply_state
--
-- Guarded on the function existing rather than assumed: the migration tests
-- replay every file EXCEPT the one under test, and a database may predate one
-- of these. to_regprocedure returns NULL for a missing signature instead of
-- raising. Idempotent: REVOKE/GRANT of what is already so is a no-op.
BEGIN;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_org_agent_memories(uuid, uuid, text, double precision, integer)',
    'public.purge_expired_agent_memories()',
    'public.create_quote_revision(uuid, uuid, text)',
    'public.create_b2c_quote_revision(uuid, uuid, text)',
    'public.revert_quote_to_revision(uuid, integer, uuid, text)',
    'public.revert_b2c_quote_to_revision(uuid, integer, uuid, text)',
    'public.delete_client_safely(uuid)',
    'public.log_audit(character varying, character varying, uuid, jsonb, jsonb, character varying, text, jsonb)'
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
