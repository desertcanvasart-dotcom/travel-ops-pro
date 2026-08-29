-- ============================================
-- Phase 2 — org_id at intake on conversation tables (THE CHEAP HALF)
-- ============================================
-- M3 Phase 2A added org_id to every financial root entity. communication_threads
-- and concierge_briefs were not part of that pass — today threads are global,
-- and the org an itinerary lands in is decided at commit time by
-- getCurrentOrgId() (the clicker's session). For the solo operation this is
-- trivially correct; for multi-org it would be a misattribution risk on a
-- financial entity.
--
-- THIS MIGRATION SHIPS THE CHEAP HALF: nullable org_id on threads + briefs,
-- backfilled to the single existing org, write-paths stamp at intake.
--
-- THE GATED HALF — NOT in this migration — is the authority flip: making
-- commit READ thread.org_id, gating it behind a membership check, then
-- setting NOT NULL on the column. See DEFERRED_GATES.md → G1. Must ship before
-- a second org onboards.
--
-- WHY NULLABLE NOW (not NOT NULL):
--   - No live pressure: commit still uses getCurrentOrgId() so a NULL
--     thread.org_id doesn't break anything.
--   - Avoids forcing a coordinated app+schema deploy. The intake stamping
--     runs first; the constraint tightens later when the gate trips.
--   - Backfill below makes existing rows non-NULL anyway. The column allows
--     NULL only as a safety valve for edge cases until G1 lands.
-- ============================================

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE concierge_briefs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communication_threads_org_id
  ON communication_threads(org_id);

CREATE INDEX IF NOT EXISTS idx_concierge_briefs_org_id
  ON concierge_briefs(org_id);

-- Backfill existing rows to the single default organization so the column
-- isn't permanently NULL on historical data. Matches the Phase 2A pattern.
DO $$
DECLARE
  v_default_org_id uuid;
BEGIN
  SELECT id INTO v_default_org_id
  FROM organizations
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_org_id IS NULL THEN
    RAISE NOTICE 'No organizations row found — skipping backfill. (Expected if running on a fresh DB.)';
    RETURN;
  END IF;

  UPDATE communication_threads
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  UPDATE concierge_briefs
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;
END $$;

COMMENT ON COLUMN communication_threads.org_id IS 'Org that owns this conversation, stamped at intake (Phase 2). Currently nullable + commit still uses getCurrentOrgId() — see DEFERRED_GATES.md G1 for the authority flip required before any second org onboards.';
COMMENT ON COLUMN concierge_briefs.org_id IS 'Org that owns this Concierge brief, stamped at webhook intake. Inherits from communication_threads.org_id via the thread reference. Nullable for now; see DEFERRED_GATES.md G1.';
