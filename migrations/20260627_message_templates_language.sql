-- ============================================
-- message_templates language dimension (Email Tier 3)
-- ============================================
-- The saved message-template library (103 rows) was single-language: a
-- template carried subject/body but no language, so the bilingual (EN+JA)
-- client delivery had no way to maintain a Japanese version of a template in
-- the library — operators had to type JA ad-hoc each time.
--
-- This adds `language` to message_templates. All existing rows are English,
-- so the NOT NULL DEFAULT 'en' backfills them in place. New JA templates are
-- created as their own rows with language='ja'. A CHECK locks the value to
-- our two supported locales.
--
-- Scope note: variants are independent rows tagged by language (no
-- parent/group link). Auto-selecting "the JA sibling of this EN template" when
-- composing to a JA client is a later refinement that would add a
-- template_group_id; it is intentionally NOT added here (no consumer yet).
--
-- Date: 2026-06-27
-- ============================================

DO $$
BEGIN
  -- Add the column with a backfilling default (every existing row -> 'en').
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'language'
  ) THEN
    ALTER TABLE public.message_templates
      ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
  END IF;

  -- Lock the value to supported locales (idempotent: drop-if-exists then add).
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_language_check'
  ) THEN
    ALTER TABLE public.message_templates DROP CONSTRAINT message_templates_language_check;
  END IF;
  ALTER TABLE public.message_templates
    ADD CONSTRAINT message_templates_language_check CHECK (language IN ('en', 'ja'));
END $$;

-- Filter templates by language quickly (the UI/library browses per-language).
CREATE INDEX IF NOT EXISTS idx_message_templates_language
  ON public.message_templates(language);

-- ============================================
-- MIGRATION COMPLETE
-- All 103 pre-existing rows are now language='en'. The templates API + UI
-- accept/filter/display language; JA templates are created as language='ja'.
-- ============================================
