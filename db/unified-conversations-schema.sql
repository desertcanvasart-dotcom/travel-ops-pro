-- ============================================
-- UNIFIED CONVERSATION SYSTEM - DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- EMAIL CONVERSATIONS (mirrors whatsapp_conversations)
-- ============================================
CREATE TABLE IF NOT EXISTS email_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Gmail identifiers
    thread_id VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id),

    -- Client linking
    client_id UUID REFERENCES clients(id),
    client_name VARCHAR(255),
    client_email VARCHAR(255),

    -- Thread metadata
    subject VARCHAR(500),
    last_message_snippet TEXT,
    last_message_at TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,

    -- Status tracking
    unread_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    is_starred BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false,

    -- Assignment (mirrors WhatsApp)
    assigned_team_member_id UUID REFERENCES team_members(id),
    assigned_at TIMESTAMPTZ,

    -- Gmail sync
    last_sync_at TIMESTAMPTZ,
    gmail_history_id VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for email_conversations
CREATE INDEX IF NOT EXISTS idx_email_conversations_thread_id ON email_conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_conversations_client_id ON email_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_email_conversations_user_id ON email_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_email_conversations_last_message ON email_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_conversations_client_email ON email_conversations(client_email);
CREATE INDEX IF NOT EXISTS idx_email_conversations_status ON email_conversations(status);

-- ============================================
-- EMAIL MESSAGES (mirrors whatsapp_messages)
-- ============================================
CREATE TABLE IF NOT EXISTS email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    conversation_id UUID REFERENCES email_conversations(id) ON DELETE CASCADE,

    -- Gmail identifiers
    message_id VARCHAR(255) NOT NULL UNIQUE,
    thread_id VARCHAR(255) NOT NULL,

    -- Message content
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_address VARCHAR(255) NOT NULL,
    to_addresses TEXT[],
    cc_addresses TEXT[],
    bcc_addresses TEXT[],
    subject VARCHAR(500),
    body_text TEXT,
    body_html TEXT,
    snippet TEXT,

    -- Attachments (stored as JSONB)
    attachments JSONB DEFAULT '[]'::jsonb,

    -- Status
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    labels TEXT[],

    -- Timestamps
    sent_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for email_messages
CREATE INDEX IF NOT EXISTS idx_email_messages_conversation ON email_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id ON email_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_id ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_sent_at ON email_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_from ON email_messages(from_address);
CREATE INDEX IF NOT EXISTS idx_email_messages_direction ON email_messages(direction);

-- ============================================
-- EMAIL SYNC STATE (for incremental sync)
-- ============================================
CREATE TABLE IF NOT EXISTS email_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    last_history_id VARCHAR(50),
    last_full_sync_at TIMESTAMPTZ,
    last_incremental_sync_at TIMESTAMPTZ,
    sync_status VARCHAR(20) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'running', 'failed')),
    error_message TEXT,
    emails_synced INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update email_conversations when messages are inserted
CREATE OR REPLACE FUNCTION update_email_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE email_conversations SET
        last_message_snippet = NEW.snippet,
        last_message_at = NEW.sent_at,
        message_count = message_count + 1,
        unread_count = CASE
            WHEN NEW.direction = 'inbound' AND NOT NEW.is_read
            THEN unread_count + 1
            ELSE unread_count
        END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_email_conversation ON email_messages;
CREATE TRIGGER trigger_update_email_conversation
AFTER INSERT ON email_messages
FOR EACH ROW EXECUTE FUNCTION update_email_conversation_on_message();

-- Auto-link email conversations to clients based on email address
CREATE OR REPLACE FUNCTION auto_link_email_to_client()
RETURNS TRIGGER AS $$
DECLARE
    matched_client RECORD;
BEGIN
    -- Only if client_id is null and client_email is provided
    IF NEW.client_id IS NULL AND NEW.client_email IS NOT NULL THEN
        SELECT id, CONCAT(first_name, ' ', last_name) AS full_name
        INTO matched_client
        FROM clients
        WHERE LOWER(email) = LOWER(NEW.client_email)
        LIMIT 1;

        IF matched_client.id IS NOT NULL THEN
            NEW.client_id := matched_client.id;
            NEW.client_name := matched_client.full_name;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_link_email_client ON email_conversations;
CREATE TRIGGER trigger_auto_link_email_client
BEFORE INSERT OR UPDATE ON email_conversations
FOR EACH ROW EXECUTE FUNCTION auto_link_email_to_client();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_email_conversations_updated_at ON email_conversations;
CREATE TRIGGER trigger_email_conversations_updated_at
BEFORE UPDATE ON email_conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_email_sync_state_updated_at ON email_sync_state;
CREATE TRIGGER trigger_email_sync_state_updated_at
BEFORE UPDATE ON email_sync_state
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- UNIFIED CONVERSATIONS VIEW
-- ============================================
CREATE OR REPLACE VIEW unified_conversations AS
-- WhatsApp conversations
SELECT
    wc.id,
    'whatsapp'::text AS channel,
    wc.phone_number AS identifier,
    wc.client_id,
    wc.client_name,
    NULL::varchar AS client_email,
    wc.phone_number AS contact_info,
    NULL::varchar AS subject,
    wc.last_message AS last_message_snippet,
    wc.last_message_at,
    wc.unread_count,
    wc.status,
    wc.assigned_team_member_id,
    wc.assigned_at,
    wc.created_at,
    wc.updated_at,
    wc.is_hidden
FROM whatsapp_conversations wc
WHERE wc.is_hidden IS NOT TRUE

UNION ALL

-- Email conversations
SELECT
    ec.id,
    'email'::text AS channel,
    ec.thread_id AS identifier,
    ec.client_id,
    ec.client_name,
    ec.client_email,
    ec.client_email AS contact_info,
    ec.subject,
    ec.last_message_snippet,
    ec.last_message_at,
    ec.unread_count,
    ec.status,
    ec.assigned_team_member_id,
    ec.assigned_at,
    ec.created_at,
    ec.updated_at,
    ec.is_hidden
FROM email_conversations ec
WHERE ec.is_hidden IS NOT TRUE;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on new tables
ALTER TABLE email_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sync_state ENABLE ROW LEVEL SECURITY;

-- Policies for email_conversations (allow all for authenticated users - adjust as needed)
CREATE POLICY "Allow all for authenticated users" ON email_conversations
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policies for email_messages
CREATE POLICY "Allow all for authenticated users" ON email_messages
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policies for email_sync_state
CREATE POLICY "Allow all for authenticated users" ON email_sync_state
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================
-- GRANTS (for service role)
-- ============================================
GRANT ALL ON email_conversations TO service_role;
GRANT ALL ON email_messages TO service_role;
GRANT ALL ON email_sync_state TO service_role;
GRANT SELECT ON unified_conversations TO authenticated;
GRANT SELECT ON unified_conversations TO service_role;
