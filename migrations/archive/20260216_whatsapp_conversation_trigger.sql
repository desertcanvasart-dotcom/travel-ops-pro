-- ============================================
-- ADD MISSING TRIGGER: Auto-update whatsapp_conversations on new message
-- This mirrors the email trigger in unified-conversations-schema.sql
-- ============================================

-- Function to update whatsapp_conversations when a message is inserted
CREATE OR REPLACE FUNCTION update_whatsapp_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE whatsapp_conversations SET
        last_message = NEW.message_body,
        last_message_at = COALESCE(NEW.sent_at, NOW()),
        unread_count = CASE
            WHEN NEW.direction = 'inbound'
            THEN COALESCE(unread_count, 0) + 1
            ELSE unread_count
        END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on whatsapp_messages table
DROP TRIGGER IF EXISTS trigger_update_whatsapp_conversation ON whatsapp_messages;
CREATE TRIGGER trigger_update_whatsapp_conversation
AFTER INSERT ON whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION update_whatsapp_conversation_on_message();

-- ============================================
-- BACKFILL: Update existing conversations that have NULL metadata
-- This fixes conversations that were created before the trigger existed
-- ============================================
UPDATE whatsapp_conversations wc SET
    last_message = sub.message_body,
    last_message_at = sub.sent_at,
    unread_count = sub.unread,
    updated_at = NOW()
FROM (
    SELECT
        wm.conversation_id,
        wm.message_body,
        wm.sent_at,
        counts.unread
    FROM whatsapp_messages wm
    INNER JOIN (
        SELECT conversation_id, MAX(sent_at) AS max_sent_at,
               COUNT(*) FILTER (WHERE direction = 'inbound') AS unread
        FROM whatsapp_messages
        GROUP BY conversation_id
    ) counts ON counts.conversation_id = wm.conversation_id AND wm.sent_at = counts.max_sent_at
) sub
WHERE wc.id = sub.conversation_id
  AND (wc.last_message_at IS NULL OR wc.last_message IS NULL);
