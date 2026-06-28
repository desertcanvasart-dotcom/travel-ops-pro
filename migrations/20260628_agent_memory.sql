-- =====================================================================
-- Agent Memory + Run Log (feedback loop)
-- =====================================================================
-- Ported from the sibling app (autoura-saas migration 154) and adapted to this
-- app's ORG multi-tenancy (org_id, RLS via public.user_is_in_org). The sibling
-- migration also bundled SaaS AI-run metering (subscription_plans /
-- tenant_usage / check_usage_limit / increment_usage) — that billing machinery
-- is DROPPED here; this app keeps only the learning loop.
--
-- agent_memory : per-org accumulated learning (client preference, pricing
--                pattern, inquiry pattern, supplier note), injected into the
--                generate-itinerary system prompt at runtime.
-- agent_runs   : audit log of each AI generation, the source data the
--                process-agent-memory cron turns into memories.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. AGENT MEMORY
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'client_preference',   -- e.g. "This client always requests private tours"
    'pricing_pattern',     -- e.g. "Siwa tours carry a 32% margin here"
    'inquiry_pattern',     -- e.g. "Most inquiries are Spanish-speaking"
    'supplier_note'        -- e.g. "Preferred hotel in Aswan is Sofitel Legend"
  )),

  -- Optional subject linkage (which client/supplier/tour type this is about)
  subject_id   UUID,
  subject_type TEXT CHECK (subject_type IN ('client', 'supplier', 'tour_type', 'destination')),
  subject_name TEXT, -- denormalised for fast prompt injection

  content TEXT NOT NULL,

  -- Confidence 0–1; rises as a pattern repeats. Below 0.3 is not injected.
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  observation_count INTEGER DEFAULT 1,

  -- NULL = pinned (never expires). Set for learned/decay memories.
  expires_at TIMESTAMPTZ DEFAULT NULL,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_org        ON agent_memory(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type       ON agent_memory(org_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_subject    ON agent_memory(org_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_expires    ON agent_memory(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence ON agent_memory(org_id, confidence DESC);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_memory_org_all ON agent_memory;
CREATE POLICY agent_memory_org_all ON agent_memory
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

-- ---------------------------------------------------------------------
-- 2. AGENT RUNS (audit log + memory feedback source)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  agent_type TEXT NOT NULL CHECK (agent_type IN ('itinerary', 'pricing')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Non-sensitive summaries for audit (no PII)
  input_summary  TEXT,
  output_summary TEXT,

  tokens_used INTEGER,
  duration_ms INTEGER,

  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'quota_exceeded')),

  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,

  -- Memory state at time of run (for debugging)
  memories_injected INTEGER DEFAULT 0,

  -- Whether the feedback cron has already turned this run into memories
  processed_for_memory BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_org        ON agent_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type       ON agent_runs(org_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created    ON agent_runs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_itinerary  ON agent_runs(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_unprocessed ON agent_runs(created_at) WHERE processed_for_memory = FALSE;

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_org_all ON agent_runs;
CREATE POLICY agent_runs_org_all ON agent_runs
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

-- ---------------------------------------------------------------------
-- 3. updated_at trigger for agent_memory
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_agent_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_memory_updated_at ON agent_memory;
CREATE TRIGGER trg_agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW EXECUTE FUNCTION update_agent_memory_updated_at();

-- ---------------------------------------------------------------------
-- 4. Memory expiry cleanup (called by the feedback cron)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_agent_memories()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM agent_memory
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 5. Get active memories for an org (called before building the prompt)
-- Returns memories above a confidence threshold, most-relevant first, and
-- touches last_accessed_at on the returned set.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_org_agent_memories(
  p_org_id        UUID,
  p_subject_id    UUID DEFAULT NULL,
  p_subject_type  TEXT DEFAULT NULL,
  p_min_confidence FLOAT DEFAULT 0.3,
  p_limit         INTEGER DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  memory_type   TEXT,
  subject_name  TEXT,
  content       TEXT,
  confidence    FLOAT,
  observation_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.memory_type,
    am.subject_name,
    am.content,
    am.confidence,
    am.observation_count
  FROM agent_memory am
  WHERE am.org_id = p_org_id
    AND am.confidence >= p_min_confidence
    AND (am.expires_at IS NULL OR am.expires_at > NOW())
    AND (p_subject_id IS NULL OR am.subject_id = p_subject_id)
    AND (p_subject_type IS NULL OR am.subject_type = p_subject_type)
  ORDER BY
    -- Client-specific memories first (most relevant)
    CASE WHEN am.subject_type = 'client' AND am.subject_id = p_subject_id THEN 0 ELSE 1 END,
    am.confidence DESC,
    am.observation_count DESC
  LIMIT p_limit;

  -- Touch last_accessed_at for this org's active memories.
  UPDATE agent_memory
  SET last_accessed_at = NOW()
  WHERE org_id = p_org_id
    AND confidence >= p_min_confidence
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_org_agent_memories IS
  'Returns active agent memories for an org, optionally filtered by subject. Used by generate-itinerary to build personalised system prompts.';
