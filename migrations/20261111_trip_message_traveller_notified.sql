-- ============================================================================
-- 20261111 — trip_messages.traveller_notified: what an office reply's email did
-- ============================================================================
--
-- An office reply in the trip chat emails the traveller that it is waiting
-- (lib/trip-chat/notify-traveller.ts). Several replies sent close together
-- used to send several emails; now a reply sent within a few minutes of one
-- that WAS emailed — the traveller not having written since — rides on that
-- email instead. Deciding that needs to know which earlier reply's email
-- actually went, so each outbound row records it:
--
--   sent          the traveller was emailed
--   grouped       covered by the email of a reply sent just before
--   no-recipient | no-link | no-account | failed   — not emailed, and why
--
-- NULL for inbound rows and for replies from before this column.
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.trip_messages ADD COLUMN IF NOT EXISTS traveller_notified TEXT;
ALTER TABLE public.trip_messages DROP CONSTRAINT IF EXISTS trip_messages_traveller_notified_check;
ALTER TABLE public.trip_messages ADD CONSTRAINT trip_messages_traveller_notified_check
  CHECK (traveller_notified IS NULL OR traveller_notified IN
    ('sent', 'grouped', 'no-recipient', 'no-link', 'no-account', 'failed'));

COMMIT;
