-- ============================================================================
-- 20270122 — WhatsApp voice notes: what a message's voice note says
-- ============================================================================
-- Ported from autoura-saas #807 / #808 (voice notes, recorded and
-- transcribed). autoura-saas keeps the transcript in whatsapp_messages.metadata;
-- travel-ops-pro's whatsapp_messages had no such column.
--
--   metadata — a small JSON object about the message:
--     { transcript: { status: 'pending' | 'done' | 'failed', text?, model?, at?, error? } }
--       the words of a customer's voice note (lib/whatsapp/transcript.ts),
--       read by the inbox, the Polish button and translation;
--     { voice_note: true, seconds } on a voice note sent from the inbox.
--
-- whatsapp_messages is per company through its conversation (org_id on
-- whatsapp_conversations); a new column needs nothing more. No rows change.
--
-- Idempotent: safe to re-run. Needs 20270121 (media_storage_path) for voice
-- notes to be sent.
-- ============================================================================

BEGIN;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.whatsapp_messages.metadata IS
  'About the message: { transcript: {status, text, model, at, error} } for a voice note; { voice_note, seconds } on one sent from the inbox.';

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM whatsapp_messages WHERE metadata ? 'transcript';  -- 0
