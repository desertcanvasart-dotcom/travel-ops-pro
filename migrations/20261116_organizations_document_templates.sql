-- ============================================================================
-- 20261116 — which operator documents an organization has
-- ============================================================================
--
-- The operations sheet (Cairo / upper-Egypt guide columns), the 日程表 and the
-- printed guest questionnaire are ATS's own paper, and every organization was
-- offered them. Which ones an org has is now a list on the org:
--
--   document_templates  slugs from lib/documents/org-templates.ts
--                       ('ats-operations-sheet', 'ats-daily-itinerary',
--                        'ats-questionnaire'); empty = none
--
-- New organizations start with none. ATS keeps all three: the organizations
-- whose members sign in with an @ats-hj.com address. Additive and replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS document_templates TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.document_templates IS
  'Operator documents this org has (lib/documents/org-templates.ts). Empty = none.';

DO $$
DECLARE
  granted TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'organizations'
                    AND column_name = 'document_templates') THEN
    RAISE EXCEPTION 'organizations.document_templates missing';
  END IF;

  -- ATS keeps its documents. auth.users is absent on a bare schema replay.
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE public.organizations o
       SET document_templates = ARRAY['ats-operations-sheet', 'ats-daily-itinerary', 'ats-questionnaire']
     WHERE EXISTS (
       SELECT 1
         FROM public.organization_members m
         JOIN auth.users u ON u.id = m.user_id
        WHERE m.org_id = o.id
          AND lower(u.email) LIKE '%@ats-hj.com'
     );

    SELECT string_agg(name, ', ') INTO granted
      FROM public.organizations
     WHERE document_templates <> '{}';
    RAISE NOTICE 'ATS documents kept by: %', coalesce(granted, '(no organization)');
  END IF;
END $$;

COMMIT;
