-- ============================================================================
-- 20261118 — a template name is unique within an organization, not globally
-- ============================================================================
--
-- uq_message_templates_name_channel_language made (name, channel, language)
-- unique across EVERY organization. Since 20261117 gave templates an org:
--
--   * editing a shared default saves the org its own copy under the same name
--     — which that index refused (23505), so no seeded template could be
--     edited ("Failed to update template");
--   * one organization's "Booking Confirmation" stopped every other from
--     having one.
--
-- Now:
--   shared defaults (org_id NULL)  unique by (name, channel, language)
--   an org's ACTIVE templates      unique by (org_id, name, channel, language)
-- A deleted (is_active = false) copy no longer holds its name. Replay-safe.
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_message_templates_name_channel_language;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_shared_name
  ON public.message_templates (name, channel, language)
  WHERE org_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_org_name
  ON public.message_templates (org_id, name, channel, language)
  WHERE org_id IS NOT NULL AND is_active;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = 'public' AND indexname = 'uq_message_templates_name_channel_language') THEN
    RAISE EXCEPTION 'global message template name index still present';
  END IF;
END $$;

COMMIT;
