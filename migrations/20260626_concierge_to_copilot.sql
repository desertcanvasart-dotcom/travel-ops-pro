-- ============================================
-- Phase 0: connect concierge_briefs into communication_threads (Copilot inbox)
-- ============================================
-- Adds the columns + DB-level idempotency required for one-brief = one-thread:
--   - communication_threads.brief_id : FK back to concierge_briefs
--   - communication_threads.origin   : provenance dimension (e.g. 'concierge')
--   - partial UNIQUE INDEX on brief_id WHERE brief_id IS NOT NULL
--                                      : the DB guard for find-or-create
-- Additive only. Does not touch the existing `channel` CHECK constraint —
-- a Concierge thread will carry channel='whatsapp' or 'email' derived from
-- briefs.preferred_contact, so existing Copilot draft-routing keeps working.
-- ============================================

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES concierge_briefs(id) ON DELETE SET NULL;

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS origin TEXT;

-- DB-enforced idempotency: at most one thread per brief.
-- Partial index so threads without a brief (WhatsApp, email) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_threads_brief_id_unique
  ON communication_threads(brief_id)
  WHERE brief_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_threads_origin
  ON communication_threads(origin);

COMMENT ON COLUMN communication_threads.brief_id IS 'FK to concierge_briefs when this thread originated from an AI Concierge planning session. NULL for WhatsApp- and email-originated threads.';
COMMENT ON COLUMN communication_threads.origin IS 'Provenance of the inquiry: ''concierge'' for AI Concierge briefs; NULL (legacy) or other values for raw inbound channels. Distinct from `channel`, which records the messaging channel used to reply.';
