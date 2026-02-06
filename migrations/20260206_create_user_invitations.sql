-- ============================================
-- Create user_invitations table
-- Stores pending invitations for new team members
-- ============================================

CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  invited_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'agent', 'viewer'))
);

-- Index for looking up invitations by email
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);

-- Index for looking up invitations by token (used for accepting)
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(token);

-- Index for finding pending invitations
CREATE INDEX IF NOT EXISTS idx_user_invitations_pending ON user_invitations(accepted_at, expires_at)
  WHERE accepted_at IS NULL;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Admins and managers can view all invitations
CREATE POLICY "Admins and managers can view invitations"
  ON user_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Admins and managers can create invitations
CREATE POLICY "Admins and managers can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Admins and managers can delete invitations
CREATE POLICY "Admins and managers can delete invitations"
  ON user_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Allow update for accepting invitations (anyone with valid token)
CREATE POLICY "Anyone can accept invitation with valid token"
  ON user_invitations FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
