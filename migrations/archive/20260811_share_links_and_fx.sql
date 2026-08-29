-- ============================================================================
-- Share links + FX engine  (ported from autoura-saas, adapted to org_id)
-- ============================================================================
-- Two features in one migration because both were requested together and both
-- are additive (new tables + new nullable columns; no existing column changes).
--
-- 1. itinerary_shares  — the public, revocable itinerary link.
-- 2. exchange_rates / exchange_rate_snapshots — the live rate table and the
--    append-only history that lets money reports convert at the rate on the
--    date the money actually moved.
-- 3. organizations branding columns, needed to brand the share page.
--
-- NOTE ON exchange_rate_snapshots: migration 20260226_multi_currency_services
-- declared this table, but only its ALTER TABLE half ever reached the live
-- database — itinerary_services HAS supplier_currency/supplier_cost_original/
-- exchange_rate_used, while the table itself is absent. lib/currency-service
-- has therefore been writing snapshots into a void (persistExchangeRate
-- swallows the error), so no rate history exists at all. Creating it here is
-- idempotent and fixes that silently-broken half.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Organization branding — the share page is client-facing, so it carries
--    the operator's identity, not the app's. All nullable: an operator who
--    fills in nothing still gets a working (unbranded) page.
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS company_phone TEXT,
  ADD COLUMN IF NOT EXISTS company_website TEXT,
  ADD COLUMN IF NOT EXISTS tagline TEXT;

COMMENT ON COLUMN public.organizations.primary_color IS
  'Brand hex (#RRGGBB) used on the public share page and generated documents. '
  'Validated in code before use — an invalid value falls back to the app green.';

-- ----------------------------------------------------------------------------
-- 2. itinerary_shares — public share links
-- ----------------------------------------------------------------------------
-- Security model:
--   * The public page NEVER reads this table with the anon key. It is a server
--     component using the service role, which validates the token, checks
--     revocation, logs the view, and projects the itinerary through the
--     allowlist in lib/itinerary-share.ts (supplier_cost, profit, margin and
--     internal notes cannot cross it).
--   * So there are NO anon policies here, deliberately: the token list is not
--     browser-queryable, and revocation cannot be bypassed.
--   * Tokens are 192 bits of crypto randomness, generated in TypeScript.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itinerary_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,

  -- base64url of 24 random bytes. Minted in lib/itinerary-share.ts.
  token TEXT NOT NULL UNIQUE,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A revoked share keeps its row as the record of what was shared and when;
  -- the token simply stops resolving. Deleting would erase that trail.
  revoked_at TIMESTAMPTZ,

  -- "Has the client looked?" — an engagement signal, not a ledger.
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);

-- One live link per itinerary: re-sharing returns the same URL instead of
-- minting infinite links, and revoking kills the only link that exists.
-- Partial unique = integrity constraint, not an ON CONFLICT target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_itinerary_shares_active
  ON public.itinerary_shares (itinerary_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_shares_org
  ON public.itinerary_shares (org_id);

ALTER TABLE public.itinerary_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itinerary_shares_org ON public.itinerary_shares;
CREATE POLICY itinerary_shares_org ON public.itinerary_shares
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS itinerary_shares_service_role ON public.itinerary_shares;
CREATE POLICY itinerary_shares_service_role ON public.itinerary_shares
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.itinerary_shares IS
  'Public share links for itineraries. Resolved only by the /share/[token] '
  'server component via the service role — never readable with the anon key. '
  'One active share per itinerary; revocation keeps the row, kills the link.';

-- ----------------------------------------------------------------------------
-- 3. exchange_rates — the LIVE rate table (one row per pair, upserted)
-- ----------------------------------------------------------------------------
-- Deliberately NOT org-scoped: an exchange rate is market data, identical for
-- every organization. Authenticated staff read it; only the service role (the
-- refresh job) writes it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL DEFAULT 'api',
  is_active BOOLEAN NOT NULL DEFAULT true,
  api_fetched_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rates_distinct_currencies CHECK (base_currency <> target_currency)
);

-- One live row per pair. This one IS an upsert target (see the refresh job).
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_rates_pair
  ON public.exchange_rates (base_currency, target_currency);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exchange_rates_read ON public.exchange_rates;
CREATE POLICY exchange_rates_read ON public.exchange_rates
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS exchange_rates_service_role ON public.exchange_rates;
CREATE POLICY exchange_rates_service_role ON public.exchange_rates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.exchange_rates IS
  'Current market rates, one row per currency pair, refreshed by '
  '/api/cron/refresh-exchange-rates. Holds only TODAY''s rate — it cannot '
  'answer "what was the rate in March"; exchange_rate_snapshots does that.';

-- ----------------------------------------------------------------------------
-- 4. exchange_rate_snapshots — the APPEND-ONLY rate history
-- ----------------------------------------------------------------------------
-- This is what makes a real margin possible: a hotel paid in EGP in March is
-- converted at March's rate, not today's. Written by the daily refresh job and
-- (historically) at itinerary generation time.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exchange_rate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL CHECK (rate > 0),
  source TEXT DEFAULT 'frankfurter',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup shape: "newest rate for this pair at or before <date>".
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies
  ON public.exchange_rate_snapshots (base_currency, target_currency, captured_at DESC);

-- The same pair at the same instant is the same observation. Without this, a
-- double cron run doubles the history. Named as the ON CONFLICT target used by
-- lib/exchange-rate-refresh.ts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_rate_snapshots_observation
  ON public.exchange_rate_snapshots (base_currency, target_currency, captured_at);

ALTER TABLE public.exchange_rate_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exchange_rate_snapshots_read ON public.exchange_rate_snapshots;
CREATE POLICY exchange_rate_snapshots_read ON public.exchange_rate_snapshots
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS exchange_rate_snapshots_service_role ON public.exchange_rate_snapshots;
CREATE POLICY exchange_rate_snapshots_service_role ON public.exchange_rate_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.exchange_rate_snapshots IS
  'Append-only exchange rate history. Money reports (per-trip P&L, financial '
  'reports) convert each cost at the rate on its own transaction date by '
  'reading this table. A cost with no usable rate is EXCLUDED and flagged as '
  'an FX hole, never converted at face value.';

-- ============================================================================
-- Supported currencies are enforced in code (lib/exchange-rate-api.ts), not by
-- a CHECK here, so adding one is a code deploy rather than a migration.
-- Currently: EUR (base), USD, GBP, EGP, JPY.
-- ============================================================================

-- ============================================================================
-- Verify after applying:
--   select count(*) from itinerary_shares;                       -- 0, exists
--   select count(*) from exchange_rates;                         -- 0 until refresh
--   select count(*) from exchange_rate_snapshots;                -- 0 until refresh
--   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
--     https://autoura.net/api/cron/refresh-exchange-rates        -- writes both
--   Share an itinerary, open the link signed OUT, revoke, confirm it 404s.
-- ============================================================================
