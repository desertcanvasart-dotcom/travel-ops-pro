-- ============================================================================
-- 20270121 — WhatsApp files: our own copy, and the file's own name
-- ============================================================================
-- Ported from autoura-saas #819 / #820 (its migrations 293 and 466).
--
-- Until now an incoming WhatsApp file was only a link to Twilio
-- (whatsapp_messages.media_url), the inbox showed none of them, and staff
-- could not send a file at all.
--
--   media_storage_path — where OUR copy of the file is, in the PRIVATE
--                        `whatsapp-media` storage bucket:
--                          inbound/<org>/<message sid>.<ext>  (a customer's file)
--                          outbound/<org>/<id>/<file name>   (sent from the inbox)
--                        The org in the path is what lets the media route
--                        check a file belongs to the message's company. Twilio's
--                        link stays in media_url as the fallback.
--   media_filename     — the file's own name ("Plan-2027.pdf"), for the inbox
--                        and for downloads; NULL when it has none.
--
-- whatsapp_messages is per company through its conversation (org_id on
-- whatsapp_conversations); new columns need nothing more. The bucket is
-- created PRIVATE on first use by the app (lib/whatsapp/media-storage.ts):
-- files are read only through /api/whatsapp/media/[id], which checks the
-- caller's company and signs a link for a minute.
--
-- No rows are changed. Copies of files already received are made by
-- scripts/keep-whatsapp-media.ts (a dry run unless --apply).
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_filename text;

COMMENT ON COLUMN public.whatsapp_messages.media_storage_path IS
  'Our copy of the file in the private whatsapp-media bucket (inbound/<org>/<sid>.<ext> or outbound/<org>/<id>/<name>). NULL = only media_url.';
COMMENT ON COLUMN public.whatsapp_messages.media_filename IS
  'The file''s own name, when it has one.';

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM whatsapp_messages WHERE media_storage_path IS NOT NULL;  -- 0
