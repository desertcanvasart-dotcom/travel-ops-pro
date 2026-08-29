-- ============================================
-- MIGRATION: Concierge Brief Webhook ingestion
-- ============================================
-- Receives structured planning briefs from the Travel2Egypt AI
-- Concierge (separate Next.js app) via POST /api/webhooks/concierge.
--
-- Design (see docs/concierge-autoura-webhook-spec.md):
--   - concierge_briefs            : one CURRENT row per conversation_id
--                                   (Scenario A: update-in-place).
--   - concierge_brief_revisions   : append-only history of every accepted
--                                   revision. UNIQUE(conversation_id,
--                                   brief_revision) is the idempotency key.
--   - Each brief upserts a lightweight clients row (status='prospect',
--     client_source='concierge'); client_id is linked back here.
--
-- Idempotency: a replay of an already-stored (conversation_id,
-- brief_revision) is absorbed by the revisions UNIQUE constraint and
-- returns 200 "duplicate_ignored" — never a duplicate row.
--
-- Out-of-order guard: if an OLDER revision arrives after a newer one is
-- already current, the newer revision stays current; the older is filed
-- into history without overwriting (handled in application code, enforced
-- by the monotonic UPDATE guard `brief_revision < :incoming`).
-- ============================================

-- ============================================
-- TABLE 1: concierge_briefs  (current state, one row per conversation)
-- ============================================
CREATE TABLE IF NOT EXISTS concierge_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / versioning (TEXT not UUID: ids are documented as opaque,
  -- so we don't reject a future non-UUID format at the DB layer)
  conversation_id TEXT NOT NULL,
  session_id TEXT,
  brief_revision INT NOT NULL DEFAULT 1,
  is_update BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_version TEXT,
  language TEXT,                         -- raw code: 'en' | 'es'
  submitted_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- visitor.*
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  preferred_contact TEXT,
  visitor_timezone TEXT,

  -- trip.*
  travelers_count INT,
  travelers_detail TEXT,
  dates_specific TEXT,
  dates_window TEXT,
  trip_length_days INT,
  origin_city TEXT,
  nationality TEXT,
  international_flights BOOLEAN,

  -- preferences.*
  destinations JSONB,                    -- string[]
  comfort_level TEXT,
  interests JSONB,                       -- string[]
  must_see JSONB,                        -- string[]
  must_avoid JSONB,                      -- string[]

  -- constraints.*
  constraint_dietary TEXT,
  constraint_mobility TEXT,
  constraint_religious TEXT,
  constraint_medical TEXT,               -- ⚠ sensitive PII — see spec §11 (v2 retention/redaction)

  -- narrative
  brief_summary TEXT,
  full_transcript JSONB,                 -- [{role, content, timestamp}]

  -- follow_up_window.*
  committed_response_by TIMESTAMPTZ,
  cairo_time_label TEXT,
  visitor_local_label TEXT,

  -- Autoura-side derived state
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'in_progress', 'responded', 'archived')),
  is_actionable BOOLEAN NOT NULL DEFAULT TRUE,
  flags TEXT[] NOT NULL DEFAULT '{}',     -- e.g. {'unactionable_no_contact'}

  -- Audit / forward-compat
  raw_payload JSONB NOT NULL,             -- the entire received payload, verbatim
  request_id TEXT,                        -- last X-Request-Id seen for this conversation

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One current row per conversation (Scenario A update-in-place)
  CONSTRAINT uq_concierge_briefs_conversation UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_concierge_briefs_review_status ON concierge_briefs(review_status);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_client_id ON concierge_briefs(client_id);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_received_at ON concierge_briefs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_briefs_actionable ON concierge_briefs(is_actionable);

COMMENT ON TABLE concierge_briefs IS 'Current state of each AI-Concierge planning brief (one row per conversation_id; full history in concierge_brief_revisions).';
COMMENT ON COLUMN concierge_briefs.constraint_medical IS 'Sensitive PII. v2 must define retention/redaction policy (spec §11).';

-- ============================================
-- TABLE 2: concierge_brief_revisions  (append-only history + idempotency)
-- ============================================
CREATE TABLE IF NOT EXISTS concierge_brief_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES concierge_briefs(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  brief_revision INT NOT NULL,
  is_update BOOLEAN,
  payload JSONB NOT NULL,                 -- full payload for this revision
  request_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- THE idempotency key: a replay of the same (conversation, revision)
  -- conflicts here and is absorbed as 200 "duplicate_ignored".
  CONSTRAINT uq_concierge_revision UNIQUE (conversation_id, brief_revision)
);

CREATE INDEX IF NOT EXISTS idx_concierge_revisions_brief_id ON concierge_brief_revisions(brief_id);
CREATE INDEX IF NOT EXISTS idx_concierge_revisions_conversation ON concierge_brief_revisions(conversation_id);

COMMENT ON TABLE concierge_brief_revisions IS 'Append-only log of every accepted brief revision. UNIQUE(conversation_id, brief_revision) provides webhook idempotency.';

-- ============================================
-- ROW LEVEL SECURITY
-- (writes happen via the service-role key in the webhook route, which
--  bypasses RLS; these policies let the authenticated app UI read briefs)
-- ============================================
ALTER TABLE concierge_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_brief_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view concierge briefs"
  ON concierge_briefs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view concierge brief revisions"
  ON concierge_brief_revisions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_concierge_briefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_concierge_briefs_updated_at ON concierge_briefs;
CREATE TRIGGER trigger_concierge_briefs_updated_at
  BEFORE UPDATE ON concierge_briefs
  FOR EACH ROW EXECUTE FUNCTION update_concierge_briefs_updated_at();
