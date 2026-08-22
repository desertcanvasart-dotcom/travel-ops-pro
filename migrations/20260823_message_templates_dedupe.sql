-- ============================================
-- One row per template per language
-- ============================================
-- The template seeds were applied twice: 16 (name, channel) pairs existed as
-- two identical rows (none ever used). One pair — "Quotation Email" / email —
-- had two different bodies (2025-12-12 and 2026-04-02); the operator keeps the
-- newer, whose wording matches the rest of the April-2026 set.
--
-- Keeps the EARLIEST row of each identical pair, drops the rest, then adds the
-- unique index that makes a double-applied seed impossible. Idempotent.
-- ============================================

-- 1. The one pair with different bodies: drop the older Quotation Email.
DELETE FROM public.message_templates
WHERE name = 'Quotation Email' AND channel = 'email' AND language = 'en'
  AND id <> (
    SELECT id FROM public.message_templates
    WHERE name = 'Quotation Email' AND channel = 'email' AND language = 'en'
    ORDER BY created_at DESC LIMIT 1
  );

-- 2. Identical duplicates: keep the earliest of each (name, channel, language).
DELETE FROM public.message_templates t
USING public.message_templates keep
WHERE keep.name = t.name
  AND keep.channel = t.channel
  AND keep.language = t.language
  AND keep.created_at < t.created_at
  AND keep.body = t.body;

-- 3. Never again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_name_channel_language
  ON public.message_templates (name, channel, language);
