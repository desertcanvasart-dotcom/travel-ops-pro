-- ============================================================================
-- 20261123 — WhatsApp: no open table access; one unread per message; every
--            Twilio status recorded
-- ============================================================================
--
-- 1. "Allow all" policies (USING true, every role) sat beside the agent-only
--    ones; permissive policies OR together, so any signed-in account — signup
--    is open — could read, change or delete every conversation and message
--    through the REST API. The app reads these tables with the service role
--    only. (Already run by hand on production 2026-10-10; IF EXISTS.)
-- 2. An inbound message bumped unread_count three times: the webhook's
--    bump_whatsapp_conversation RPC and two AFTER INSERT triggers. The
--    duplicate trigger goes; the remaining one keeps last_message current for
--    every message and leaves counting unread to the RPC.
-- 3. Twilio's "undelivered", "accepted" and "sending" broke the status CHECK,
--    so a message that never arrived stayed "sent".
--
-- Replay-safe.

DROP POLICY IF EXISTS "Allow all for whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Allow all for whatsapp_messages" ON public.whatsapp_messages;

DROP TRIGGER IF EXISTS trigger_update_conversation ON public.whatsapp_messages;

CREATE OR REPLACE FUNCTION public.update_whatsapp_conversation_on_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- unread_count is the webhook's bump_whatsapp_conversation(), not this.
    UPDATE whatsapp_conversations SET
        last_message = NEW.message_body,
        last_message_at = COALESCE(NEW.sent_at, NOW()),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

ALTER TABLE public.whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_status_check
  CHECK (status IS NULL OR status::text = ANY (ARRAY['queued','accepted','sending','sent','delivered','read','failed','undelivered']));
