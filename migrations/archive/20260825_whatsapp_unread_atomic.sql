-- ============================================
-- ATOMIC unread_count for WhatsApp conversations
-- ============================================
-- The inbound webhook used to SELECT unread_count, add 1 in JavaScript, and
-- UPDATE the result back. Two messages arriving at the same time both read the
-- same value and both wrote the same value, so one increment was lost and the
-- inbox badge silently under-counted. PostgREST cannot express
-- `unread_count = unread_count + 1`, so the increment moves into the database
-- as a function the webhook calls once.
--
-- SECURITY: called only by the service-role webhook client. Marked SECURITY
-- INVOKER (the default) deliberately — it must not become a way to write to
-- this table with more privilege than the caller already has.

CREATE OR REPLACE FUNCTION public.bump_whatsapp_conversation(
  p_conversation_id UUID,
  p_last_message    TEXT
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.whatsapp_conversations
     SET last_message    = p_last_message,
         last_message_at = NOW(),
         -- COALESCE: the column is nullable on older rows, and NULL + 1 is NULL.
         unread_count    = COALESCE(unread_count, 0) + 1,
         updated_at      = NOW()
   WHERE id = p_conversation_id;
$$;

COMMENT ON FUNCTION public.bump_whatsapp_conversation(UUID, TEXT) IS
  'Atomically record the latest inbound WhatsApp message and increment the unread badge. Replaces a lossy read-modify-write in app/api/whatsapp/webhook.';

-- PostgREST exposes functions to whoever holds EXECUTE. Only the roles that
-- already run the webhook need it; anon must never be able to inflate a badge.
REVOKE ALL ON FUNCTION public.bump_whatsapp_conversation(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_whatsapp_conversation(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.bump_whatsapp_conversation(UUID, TEXT) TO service_role;

-- Twilio retries are only safe if a redelivered message collides instead of
-- being stored twice. The webhook now relies on that collision (23505) to
-- recognise a duplicate, so the constraint must actually exist.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_message_sid_key
  ON public.whatsapp_messages (message_sid)
  WHERE message_sid IS NOT NULL;
