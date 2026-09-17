-- ============================================
-- The office's own email addresses
-- ============================================
-- Operator, 2026-09-17: replies sent from a colleague's address on the office
-- domain (hello@) were stored as the CUSTOMER writing, so answered
-- conversations stayed "awaiting reply" (20261019). The rule
-- (lib/email/office-addresses.ts): the connected mailbox, its domain unless a
-- public provider, and the addresses/domains listed here are the office.
--
-- 1. organizations.office_email_addresses — Settings → Email → Office
--    addresses: full addresses or bare domains.
-- 2. refresh_email_conversation_reply_state(conversation) — the reply state
--    the message trigger keeps, recomputed on demand, for when stored
--    messages are re-classified as ours (lib/email/office-addresses-server).
--    It does not touch counts or snippets.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS office_email_addresses text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.office_email_addresses IS
  'Email addresses or domains that are the office''s own: mail from them is our reply, never a customer. The connected mailbox and its (non-public) domain count without being listed.';

CREATE OR REPLACE FUNCTION public.refresh_email_conversation_reply_state(p_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_out timestamptz;
BEGIN
  SELECT max(sent_at) INTO v_last_out
    FROM public.email_messages
   WHERE conversation_id = p_conversation AND direction = 'outbound';

  UPDATE public.email_conversations c SET
    last_outbound_at = v_last_out,
    last_inbound_at = (
      SELECT max(sent_at) FROM public.email_messages
       WHERE conversation_id = p_conversation AND direction = 'inbound'),
    awaiting_reply_since = (
      SELECT min(sent_at) FROM public.email_messages
       WHERE conversation_id = p_conversation AND direction = 'inbound'
         AND sent_at > COALESCE(v_last_out, '-infinity'::timestamptz)),
    updated_at = now()
  WHERE c.id = p_conversation;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_email_conversation_reply_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_email_conversation_reply_state(uuid) TO service_role;

COMMIT;
