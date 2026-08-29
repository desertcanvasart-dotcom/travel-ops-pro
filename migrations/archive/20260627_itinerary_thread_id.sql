-- ============================================
-- Phase 1: connect itineraries back to their originating conversation thread
-- ============================================
-- Closes the provenance chain:
--   communication_threads (origin='concierge', brief_id) → itineraries → bookings
--
-- One itinerary per thread is enforced at the DB level via a partial UNIQUE
-- INDEX, so the operator pressing "Create itinerary from brief" twice cannot
-- mint a duplicate. The helper at lib/concierge/commit-brief-to-itinerary.ts
-- handles the race in code (find-before-insert + 23505 catch).
--
-- PROVENANCE TO THE BRIEF IS TRANSITIVE — not denormalized here.
-- Reach the brief via thread.brief_id (Phase 0 already enforces 1 brief per
-- thread via idx_communication_threads_brief_id_unique). Adding a direct
-- itineraries.brief_id would duplicate the relationship; the 2-hop join is
-- indexed and fast.
--
-- Manually-created itineraries (no inbound conversation) leave thread_id NULL.
-- That's intentional and correct — itineraries.source remains the broad
-- channel tag; thread_id is the precise pointer.
--
-- WhatsApp threads will populate this same column in a later phase. Out of
-- scope here.
-- ============================================

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL;

-- Idempotency: at most one itinerary per thread.
-- Partial index so manually-created itineraries (thread_id IS NULL) are
-- unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_thread_id_unique
  ON itineraries(thread_id)
  WHERE thread_id IS NOT NULL;

COMMENT ON COLUMN itineraries.thread_id IS 'FK to communication_threads when this itinerary was committed from an inbound conversation (Concierge brief in Phase 1; WhatsApp/email later). Traceback to the originating brief is via thread.brief_id — not denormalized here. NULL for manually-created itineraries. `itineraries.source` remains the broad channel tag (b2c_concierge, b2c_whatsapp, etc.) for telemetry.';
