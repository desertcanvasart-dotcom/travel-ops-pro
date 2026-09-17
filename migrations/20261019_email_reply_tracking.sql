-- ============================================
-- Email: has the customer been answered, and never the same reply twice
-- ============================================
-- Operator, 2026-09-17: "Do we have something that checks if a customer
-- request has been replied, and a guard for not replying to the same message
-- more than one time?" There was neither. A conversation knew its unread
-- count — whether anyone OPENED it — not whether anyone ANSWERED it; and
-- /api/gmail/send sent whatever reached it, so a second tab, a retried
-- request or two colleagues on one thread each sent their reply.
--
-- 1. email_conversations carries the reply state, kept by the message
--    trigger from the messages themselves:
--      last_inbound_at        the customer's latest message
--      last_outbound_at       our latest message (sent from the app OR from
--                             Gmail directly — sync stores both)
--      awaiting_reply_since   the customer's FIRST message after our last
--                             reply; NULL when answered
--    Recomputed on every insert, so messages synced out of order (sync
--    fetches newest first) cannot leave a wrong state. The old trigger also
--    set last_message_at to whatever message arrived last in the INSERT
--    order — an older message synced late moved the conversation back in
--    time; it now only moves forward.
--
-- 2. email_messages records who sent a reply from the app (sent_by) and the
--    RFC 5322 Message-ID, so a reply can name the message it answers
--    (In-Reply-To / References) and stay in the customer's thread in every
--    mail client, not only in Gmail.
--
-- 3. email_send_claims: one row per send attempt key. The composer makes one
--    key per reply; the send route claims it BEFORE calling Gmail, so a second
--    request with the same key — double click, retry, second tab — is refused
--    by the primary key instead of reaching the customer.

BEGIN;

ALTER TABLE public.email_conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS awaiting_reply_since timestamptz;

COMMENT ON COLUMN public.email_conversations.awaiting_reply_since IS
  'The customer''s first message after our last reply — NULL when the conversation is answered. Maintained by update_email_conversation_on_message().';

CREATE INDEX IF NOT EXISTS idx_email_conversations_awaiting_reply
  ON public.email_conversations (awaiting_reply_since)
  WHERE awaiting_reply_since IS NOT NULL;

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sent_by uuid,
  ADD COLUMN IF NOT EXISTS rfc_message_id text;

COMMENT ON COLUMN public.email_messages.sent_by IS
  'The app user who sent this reply from the app. NULL for inbound mail and for mail sent from Gmail directly.';
COMMENT ON COLUMN public.email_messages.rfc_message_id IS
  'The RFC 5322 Message-ID header, for In-Reply-To / References on a reply.';

CREATE TABLE IF NOT EXISTS public.email_send_claims (
  request_key text PRIMARY KEY,
  user_id uuid,
  thread_id text,
  body_hash text,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  gmail_message_id text,
  gmail_thread_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_send_claims IS
  'One row per email send attempt key (lib/email/send-guard.ts): the send route claims the key before calling Gmail, so the same reply can never be sent twice.';

CREATE INDEX IF NOT EXISTS idx_email_send_claims_thread ON public.email_send_claims (thread_id, created_at DESC);

ALTER TABLE public.email_send_claims ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- The message trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_email_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_out timestamptz;
BEGIN
  SELECT max(sent_at) INTO v_last_out
    FROM public.email_messages
   WHERE conversation_id = NEW.conversation_id AND direction = 'outbound';

  UPDATE public.email_conversations c SET
    last_message_snippet = CASE WHEN c.last_message_at IS NULL OR NEW.sent_at >= c.last_message_at THEN NEW.snippet ELSE c.last_message_snippet END,
    last_message_at = GREATEST(c.last_message_at, NEW.sent_at),
    message_count = c.message_count + 1,
    unread_count = CASE
        WHEN NEW.direction = 'inbound' AND NOT NEW.is_read THEN c.unread_count + 1
        ELSE c.unread_count
      END,
    last_outbound_at = v_last_out,
    last_inbound_at = (
      SELECT max(sent_at) FROM public.email_messages
       WHERE conversation_id = NEW.conversation_id AND direction = 'inbound'),
    awaiting_reply_since = (
      SELECT min(sent_at) FROM public.email_messages
       WHERE conversation_id = NEW.conversation_id AND direction = 'inbound'
         AND sent_at > COALESCE(v_last_out, '-infinity'::timestamptz)),
    updated_at = now()
  WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_email_conversation ON public.email_messages;
CREATE TRIGGER trigger_update_email_conversation
  AFTER INSERT ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_email_conversation_on_message();

-- ---------------------------------------------------------------------------
-- Backfill every conversation from its messages
-- ---------------------------------------------------------------------------
UPDATE public.email_conversations c SET
  last_outbound_at = s.last_out,
  last_inbound_at = s.last_in,
  awaiting_reply_since = (
    SELECT min(m.sent_at) FROM public.email_messages m
     WHERE m.conversation_id = c.id AND m.direction = 'inbound'
       AND m.sent_at > COALESCE(s.last_out, '-infinity'::timestamptz))
FROM (
  SELECT conversation_id,
         max(sent_at) FILTER (WHERE direction = 'outbound') AS last_out,
         max(sent_at) FILTER (WHERE direction = 'inbound')  AS last_in
    FROM public.email_messages
   GROUP BY conversation_id
) s
WHERE s.conversation_id = c.id;

COMMIT;
