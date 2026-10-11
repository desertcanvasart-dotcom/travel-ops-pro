-- ============================================================================
-- 20261128 — which Gmail address an email conversation came from
-- ============================================================================
--
-- Disconnecting Gmail deleted the login and nothing else: the conversations
-- synced from that address stayed in Communicate, on client pages and on the
-- dashboard (operator, 2026-10-11). They are the company's history — linked to
-- leads, website orders and drafts — so they are not deleted: the app shows a
-- conversation only while the address it came from is connected
-- (lib/email/connected-mailboxes), and shows it again when that address is
-- connected again.
--
-- email_conversations recorded only the user who synced it (user_id), not the
-- address, so a user who connected a second address could not tell the two
-- apart. mailbox_email records the address; the sync fills it from now on.
--
-- Existing conversations are filled in, in this order:
--   1. the address of its user's current connection, when the conversation
--      was synced since that connection was made, or that address is on one
--      of its messages;
--   2. else the office address on its messages: the sender of its first
--      outbound message, else the first recipient of its first inbound one
--      (not the customer).
-- What is still unknown stays NULL and follows its user (shown while that
-- user has a connection).
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, and every UPDATE touches only rows
-- still NULL. Safe before the app deploy (nothing reads the column yet) and
-- after it (the app lists unscoped until the column exists).

BEGIN;

ALTER TABLE public.email_conversations ADD COLUMN IF NOT EXISTS mailbox_email text;
CREATE INDEX IF NOT EXISTS idx_email_conversations_mailbox_email ON public.email_conversations (mailbox_email);

-- 1. The current connection of the conversation's user.
UPDATE public.email_conversations ec
SET mailbox_email = lower(t.email)
FROM public.gmail_tokens t
WHERE ec.mailbox_email IS NULL
  AND t.user_id = ec.user_id
  AND coalesce(t.email, '') <> ''
  AND (
    ec.created_at >= t.created_at
    OR EXISTS (
      SELECT 1
      FROM public.email_messages m
      WHERE m.conversation_id = ec.id
        AND position(lower(t.email) IN lower(
              coalesce(m.from_address, '') || ' ' ||
              coalesce(array_to_string(m.to_addresses, ' '), '') || ' ' ||
              coalesce(array_to_string(m.cc_addresses, ' '), ''))) > 0
    )
  );

-- 2a. The sender of its first outbound message.
UPDATE public.email_conversations ec
SET mailbox_email = d.addr
FROM (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         lower(trim(coalesce(substring(m.from_address FROM '<([^>]+)>'), m.from_address))) AS addr
  FROM public.email_messages m
  WHERE m.direction = 'outbound' AND m.conversation_id IS NOT NULL
  ORDER BY m.conversation_id, m.sent_at
) d
WHERE ec.mailbox_email IS NULL
  AND d.conversation_id = ec.id
  AND d.addr LIKE '%@%';

-- 2b. The first recipient of its first inbound message that is not the customer.
UPDATE public.email_conversations ec
SET mailbox_email = d.addr
FROM (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         lower(trim(coalesce(substring(m.to_addresses[1] FROM '<([^>]+)>'), m.to_addresses[1]))) AS addr
  FROM public.email_messages m
  WHERE m.direction = 'inbound'
    AND m.conversation_id IS NOT NULL
    AND coalesce(array_length(m.to_addresses, 1), 0) > 0
  ORDER BY m.conversation_id, m.sent_at
) d
WHERE ec.mailbox_email IS NULL
  AND d.conversation_id = ec.id
  AND d.addr LIKE '%@%'
  AND d.addr <> lower(coalesce(ec.client_email, ''));

COMMIT;
