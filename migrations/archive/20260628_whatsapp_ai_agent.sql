-- =====================================================================
-- WhatsApp AI Agent (draft-gated)
-- =====================================================================
-- Ported/adapted from the sibling app (autoura-saas). The sibling agent
-- auto-SENDS replies; this app runs it DRAFT-GATED — the agent composes a
-- suggested reply (using read-only tools over this org's data) that an operator
-- reviews and sends. So all this migration needs is:
--   1. a per-org on/off flag for the feature
--   2. somewhere to stash the suggested draft on the conversation
-- No autonomous outbound, no new quote/departure tables.
-- =====================================================================

-- 1. Per-org feature flag
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS whatsapp_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.organizations.whatsapp_ai_enabled IS
  'When true, operators can generate AI-suggested WhatsApp reply drafts for this org. Drafts are never sent automatically.';

-- 2. Suggested-draft holder on the conversation (operator reviews then sends)
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ai_draft_reply        TEXT,
  ADD COLUMN IF NOT EXISTS ai_draft_confidence   FLOAT,
  ADD COLUMN IF NOT EXISTS ai_draft_escalate     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_draft_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_conversations.ai_draft_reply IS
  'Latest AI-suggested reply for this conversation (draft-gated — operator reviews and sends).';
COMMENT ON COLUMN whatsapp_conversations.ai_draft_escalate IS
  'True when the AI flagged this conversation for human attention.';
