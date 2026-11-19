-- ============================================================================
-- 20270120 — a company blocks WhatsApp numbers
-- ============================================================================
-- Ported from autoura-saas #816 (its migration 465). Until now every inbound
-- WhatsApp message was filed: a spammer or an abusive sender became a
-- conversation, counted as unread and got an AI draft.
--
-- One row = one number this company does not want to hear from. Per company:
-- one company blocking a number never touches another company's inbox.
--
-- What blocking does (app/api/whatsapp/webhook, lib/whatsapp-blocked.ts): a
-- message from the number to this company is NOT stored — no conversation, no
-- message, no unread count, no Copilot draft, no auto-reply. Only two things
-- are kept, on this row, so a manager can see the block is working: how many
-- messages were ignored and when the last one came. Never what they said.
--
-- It blocks inside the app only: the sender's WhatsApp still delivers to the
-- number. Twilio has no way to block a sender.
--
--   phone_number           — E.164 ("+2010…"), as lib/whatsapp-phone.ts
--                            toWhatsAppE164 writes it. One row per number.
--   reason                 — the manager's own note, optional.
--   blocked_by             — the login who blocked it.
--   blocked_message_count  — messages ignored since it was blocked.
--   last_blocked_at        — when the last one came.
--
-- Who: everyone in the company sees the list; owners, admins and managers
-- block and unblock (checked in app/api/whatsapp/blocked). The table is read
-- and written server-side only, through the service-role client filtered by
-- org_id, like every company table since 20270118.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_blocked_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number text NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  reason text,
  blocked_by uuid,
  blocked_message_count integer NOT NULL DEFAULT 0,
  last_blocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_blocked_numbers_one_per_company UNIQUE (org_id, phone_number)
);

COMMENT ON TABLE public.whatsapp_blocked_numbers IS
  'Numbers a company blocked on WhatsApp: their messages are not stored, counted '
  'as unread or drafted (20270120). Inside the app only.';
COMMENT ON COLUMN public.whatsapp_blocked_numbers.phone_number IS 'E.164, e.g. +201001234567.';
COMMENT ON COLUMN public.whatsapp_blocked_numbers.blocked_message_count IS
  'Messages ignored since the block. Their content is never kept.';

-- Server-side only, like every company table the app reads through the
-- service-role client.
ALTER TABLE public.whatsapp_blocked_numbers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_blocked_numbers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_blocked_numbers TO service_role;

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM whatsapp_blocked_numbers;   -- 0: nothing is blocked yet
