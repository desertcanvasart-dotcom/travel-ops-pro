-- Accounting Software Sync: tokens + sync log
-- Supports Xero and QuickBooks push-only integration

-- Table: accounting_tokens
-- Stores OAuth2 tokens for connected accounting providers (follows gmail_tokens pattern)
CREATE TABLE IF NOT EXISTS accounting_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('xero', 'quickbooks')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  tenant_id TEXT,          -- Xero organization/tenant ID
  realm_id TEXT,           -- QuickBooks company/realm ID
  company_name TEXT,       -- Display name of connected company
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_accounting_tokens_user_id ON accounting_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_accounting_tokens_provider ON accounting_tokens(provider);

-- Table: accounting_sync_log
-- Tracks every push to external accounting system
CREATE TABLE IF NOT EXISTS accounting_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('xero', 'quickbooks')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'expense', 'invoice_payment', 'expense_payment', 'contact')),
  entity_id UUID NOT NULL,
  external_id TEXT,        -- ID in the external system
  external_number TEXT,    -- Number/reference in external system
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON accounting_sync_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON accounting_sync_log(sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_log_retry ON accounting_sync_log(sync_status, next_retry_at) WHERE sync_status = 'failed';
