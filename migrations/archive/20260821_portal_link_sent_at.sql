-- ============================================
-- Track when a per-traveller portal link was last sent  (Phase 2)
-- ============================================
-- The coordinator view shows, per traveller, whether their private link has
-- been sent and lets the operator re-send. That needs a timestamp the mint
-- itself does not carry.
-- ============================================

BEGIN;

ALTER TABLE public.booking_portal_links
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.booking_portal_links.last_sent_at IS
  'When the link was last delivered to the traveller (coordinator "send"/"resend"). NULL = minted but never sent.';

COMMIT;
