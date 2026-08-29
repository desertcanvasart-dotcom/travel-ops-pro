-- ============================================
-- Terminal failure state for Copilot draft generation
-- ============================================
-- Background: when /api/copilot/drafts errors (e.g. retired Anthropic model
-- returning 404), inbox rows previously stayed at status='draft_pending'
-- forever. The frontend poller (lib/hooks/use-copilot-poller.ts) fires every
-- 10s for draft_pending rows, so the same failing request looped endlessly
-- and the operator saw an eternal "Generating AI draft..." spinner.
--
-- This migration adds 'draft_failed' as a terminal state, plus a column to
-- carry the failure reason to the operator. The poller already gates on
-- status='draft_pending' (use-copilot-poller.ts:48), so anything in
-- 'draft_failed' is naturally skipped — no poller code change required.
-- ============================================

ALTER TABLE communication_inbox
  DROP CONSTRAINT IF EXISTS communication_inbox_status_check;

ALTER TABLE communication_inbox
  ADD CONSTRAINT communication_inbox_status_check
  CHECK (status IN ('new', 'draft_pending', 'draft_ready', 'draft_failed', 'responded', 'skipped'));

ALTER TABLE communication_inbox
  ADD COLUMN IF NOT EXISTS last_error TEXT;

COMMENT ON COLUMN communication_inbox.last_error IS 'Last user-friendly error message from a failed draft generation attempt. NULL when status is not draft_failed.';
