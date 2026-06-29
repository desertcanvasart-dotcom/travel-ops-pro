-- ============================================================
-- scheduled_sends — queue future template sends; dispatched by cron
-- ============================================================
-- Ported from the sibling app (autoura-saas migration 023), adapted to THIS
-- app's ORG multi-tenancy (org_id + RLS) and dispatched by a new cron
-- (/api/cron/dispatch-scheduled-sends) that reuses our existing send path.
--
-- Also hardens template_send_log (written by /api/templates/send, but with no
-- in-repo DDL): ensure it exists and has a sent_at timestamp the analytics
-- endpoint can rely on. Both statements are idempotent.
-- ============================================================

-- 1. template_send_log safety net (no-op where it already exists) ----------
CREATE TABLE IF NOT EXISTS template_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  client_id UUID,
  recipient_id UUID,
  recipient_type VARCHAR(50),
  channel VARCHAR(20),
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(50),
  subject VARCHAR(255),
  body_preview TEXT,
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guarantee the timestamp column the analytics endpoint orders/filters by.
ALTER TABLE template_send_log ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_template_send_log_sent_at ON template_send_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_send_log_template ON template_send_log(template_id);

-- 2. scheduled_sends --------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,

  -- Recipient
  recipient_type VARCHAR(50) NOT NULL DEFAULT 'client', -- client | hotel | cruise | transport | guide
  recipient_id UUID,
  recipient_contact VARCHAR(255) NOT NULL,              -- email or phone

  -- Message
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  subject TEXT,
  body TEXT NOT NULL,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),

  -- Execution tracking
  sent_at TIMESTAMPTZ,
  error_message TEXT,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_org ON scheduled_sends(org_id);
-- Hot path for the dispatch cron: pending rows whose time has come.
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due ON scheduled_sends(scheduled_for) WHERE status = 'pending';

ALTER TABLE scheduled_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_sends_org_all ON scheduled_sends;
CREATE POLICY scheduled_sends_org_all ON scheduled_sends
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

CREATE OR REPLACE FUNCTION update_scheduled_sends_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_sends_updated_at ON scheduled_sends;
CREATE TRIGGER trg_scheduled_sends_updated_at
  BEFORE UPDATE ON scheduled_sends
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_sends_updated_at();

COMMENT ON TABLE scheduled_sends IS 'Queued future template sends (org-scoped). Dispatched by /api/cron/dispatch-scheduled-sends.';
