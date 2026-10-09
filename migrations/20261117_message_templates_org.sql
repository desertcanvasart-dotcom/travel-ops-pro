-- ============================================================================
-- 20261117 — message templates belong to an organization
-- ============================================================================
--
-- message_templates had no org: every route read, edited and soft-deleted
-- templates by id with the service role, so one organization could rewrite or
-- switch off the "Booking confirmation" another sends its customers.
--
--   org_id              the owner. NULL = a shared default every org sees,
--                       read-only: editing one saves the org its own copy.
--   source_template_id  on such a copy, the default it replaces — the org's
--                       list shows its copy instead of the default.
--
-- template_send_log.org_id: the organization that sent it — analytics showed
-- every org's sends. Backfilled from the client or trip the send was for.
--
-- Existing templates go to the organization of the member who created them;
-- templates with no creator (seeded) stay shared defaults. Additive and
-- replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS message_templates_org_id_idx ON public.message_templates (org_id);

COMMENT ON COLUMN public.message_templates.org_id IS
  'Owning organization. NULL = shared default, read-only (an edit saves an org copy).';
COMMENT ON COLUMN public.message_templates.source_template_id IS
  'On an org copy of a shared default: the default it replaces in that org''s list.';

-- A template made by a member belongs to that member's organization (the
-- earliest membership when a user is in several).
UPDATE public.message_templates t
   SET org_id = m.org_id
  FROM (
    SELECT DISTINCT ON (user_id) user_id, org_id
      FROM public.organization_members
     ORDER BY user_id, created_at
  ) m
 WHERE t.org_id IS NULL
   AND t.created_by IS NOT NULL
   AND m.user_id = t.created_by;

ALTER TABLE public.template_send_log
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS template_send_log_org_id_idx ON public.template_send_log (org_id, sent_at DESC);

UPDATE public.template_send_log l
   SET org_id = c.org_id
  FROM public.clients c
 WHERE l.org_id IS NULL AND l.client_id = c.id;

UPDATE public.template_send_log l
   SET org_id = i.org_id
  FROM public.itineraries i
 WHERE l.org_id IS NULL AND l.itinerary_id = i.id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'message_templates'
                    AND column_name = 'org_id') THEN
    RAISE EXCEPTION 'message_templates.org_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'template_send_log'
                    AND column_name = 'org_id') THEN
    RAISE EXCEPTION 'template_send_log.org_id missing';
  END IF;
END $$;

COMMIT;

-- Check: how the templates and the send log were assigned.
-- SELECT org_id IS NULL AS shared_default, count(*) FROM public.message_templates GROUP BY 1;
-- SELECT org_id IS NULL AS unassigned, count(*) FROM public.template_send_log GROUP BY 1;
