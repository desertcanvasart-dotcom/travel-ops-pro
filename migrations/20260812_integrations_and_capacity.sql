-- =====================================================================
-- Partner integrations: two-way departures / capacity sync
-- =====================================================================
-- Built to connect to ANY external platform, not one named partner. The first
-- customer's seat-pooling platform ("Sawa") is one row in `integrations` and one
-- adapter in lib/integrations/adapters — nothing about it is in the schema.
--
-- Two directions, deliberately asymmetric in trust:
--
--   INBOUND   the partner POSTs their departures to us. They prove it is them
--             with an HMAC signature over the raw body, using a secret we
--             generated. We mirror what they send into tour_departures.
--
--   OUTBOUND  the partner GETs our blackout/availability calendar with an API
--             key we issued. We store only a HASH of that key, so a leak of
--             this database does not hand anyone a working credential.
--
-- Idempotency is a first-class concern: webhooks get retried, and a retried
-- delivery must not create a second departure. integration_events records every
-- delivery keyed by the partner's own event id.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. INTEGRATIONS — one row per connected external system, per org
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Which adapter interprets this partner's payloads. 'generic' is our own
  -- documented canonical shape; anything else names a specific platform.
  -- A slug, not an enum: adding a partner must not require a migration.
  provider VARCHAR(50) NOT NULL DEFAULT 'generic',

  -- Operator-facing label, e.g. "Sawa — Cairo seat pool".
  name VARCHAR(120) NOT NULL,

  -- The opaque id in this connection's inbound webhook URL:
  --   POST /api/webhooks/integrations/{endpoint_token}
  --
  -- Deliberately NOT the org id. A partner should never be handed an internal
  -- identifier: it is the same value across every connection, it appears in
  -- their logs and config, and it invites probing other endpoints with it.
  -- A per-connection token reveals nothing, and revoking one partner's access
  -- does not touch another's.
  --
  -- This is an IDENTIFIER, not the credential — the HMAC signature is what
  -- authenticates. Stored in plaintext because it must be looked up, and
  -- hashing it would buy nothing while inbound_secret sits alongside it.
  endpoint_token VARCHAR(64),

  direction VARCHAR(10) NOT NULL DEFAULT 'both'
    CHECK (direction IN ('inbound', 'outbound', 'both')),

  is_active BOOLEAN NOT NULL DEFAULT true,

  -- INBOUND: the shared secret the partner signs their webhook bodies with.
  -- Readable by us because HMAC verification needs the original secret.
  inbound_secret TEXT,

  -- OUTBOUND: only ever a SHA-256 hash of the issued key. The plaintext is
  -- shown once, at creation, and is unrecoverable afterwards — losing it means
  -- rotating, which is the correct and safe outcome.
  outbound_key_hash TEXT,
  -- First few characters, so the UI can say WHICH key is installed without
  -- being able to reconstruct it ("tops_live_a1b2…").
  outbound_key_prefix VARCHAR(24),
  outbound_key_issued_at TIMESTAMPTZ,

  -- Adapter-specific mapping config (field names, tour-code translation, the
  -- partner's timezone). JSONB so a new partner needs no schema change.
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,

  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- One connection per provider per org. A second Sawa connection would make
  -- inbound routing ambiguous (which secret verifies this delivery?).
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON public.integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON public.integrations(provider) WHERE is_active;

-- The outbound API resolves an inbound Bearer key to its integration by hash,
-- with no org context yet — so this lookup must be indexed and unique. Unique
-- also means one key can never resolve to two orgs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_outbound_key_hash
  ON public.integrations(outbound_key_hash) WHERE outbound_key_hash IS NOT NULL;

-- The inbound webhook resolves a connection from the URL token alone, with no
-- org context — so this must be indexed, and unique so one token can never
-- address two connections.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_endpoint_token
  ON public.integrations(endpoint_token) WHERE endpoint_token IS NOT NULL;

COMMENT ON COLUMN public.integrations.outbound_key_hash IS
  'SHA-256 of the issued API key. The plaintext is shown once at creation and '
  'never stored — a database leak must not yield a usable credential.';
COMMENT ON COLUMN public.integrations.provider IS
  'Adapter slug (lib/integrations/registry.ts). A slug rather than an enum so '
  'onboarding a new partner platform needs no migration.';

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integrations_org_all ON public.integrations;
CREATE POLICY integrations_org_all ON public.integrations
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

CREATE OR REPLACE FUNCTION public.update_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_integrations_updated_at();

-- ---------------------------------------------------------------------
-- 2. INTEGRATION EVENTS — the delivery log, and the idempotency key
-- ---------------------------------------------------------------------
-- Every inbound delivery is recorded BEFORE it is applied. Partners retry on
-- timeout, and without this a retry would mirror the same departures twice.
CREATE TABLE IF NOT EXISTS public.integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,

  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type VARCHAR(60) NOT NULL DEFAULT 'departures.sync',

  -- The PARTNER's id for this delivery. The uniqueness constraint below is what
  -- actually makes retries safe; the application check is only a fast path.
  external_event_id VARCHAR(200),

  status VARCHAR(20) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'skipped')),

  payload JSONB,
  result JSONB,
  error TEXT,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_integration_events_org ON public.integration_events(org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_events_integration ON public.integration_events(integration_id, received_at DESC);

-- Partial: an event with no id from the partner cannot be de-duplicated, and
-- must not collide with every other such event on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_events_external
  ON public.integration_events(integration_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_events_org_all ON public.integration_events;
CREATE POLICY integration_events_org_all ON public.integration_events
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

-- ---------------------------------------------------------------------
-- 3. DEPARTURE PROVENANCE — mirrored rows live alongside local ones
-- ---------------------------------------------------------------------
-- Decision: mirrored departures go in tour_departures rather than a separate
-- table, so the calendar, availability check and booking flow all read ONE
-- place. The cost of that is an external sync could silently overwrite an
-- operator's edit — so mirrored rows carry provenance and are marked
-- externally_managed, and the UI blocks local edits on them.
ALTER TABLE public.tour_departures
  ADD COLUMN IF NOT EXISTS source_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS externally_managed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tour_departures.externally_managed IS
  'True when this departure is mirrored from a partner platform. The partner is '
  'the source of truth for seats and status; local edits are blocked so a sync '
  'cannot silently discard them.';

-- The upsert target for inbound sync. Partial so purely local departures (no
-- external_id) never collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_departures_external
  ON public.tour_departures(source_integration_id, external_id)
  WHERE source_integration_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tour_departures_externally_managed
  ON public.tour_departures(org_id, externally_managed) WHERE externally_managed;

-- ---------------------------------------------------------------------
-- 4. DEPARTURE BOOKINGS — declared by the code, never created
-- ---------------------------------------------------------------------
-- app/api/departures/[id]/route.ts embeds `bookings:departure_bookings(...)`
-- and inserts into departure_bookings, but no migration ever created it, so
-- that route has always failed. Same partial-migration failure mode as the
-- bookings module and exchange_rate_snapshots before it.
CREATE TABLE IF NOT EXISTS public.departure_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  departure_id UUID NOT NULL REFERENCES public.tour_departures(id) ON DELETE CASCADE,
  itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,

  client_name VARCHAR(255),
  pax INTEGER NOT NULL DEFAULT 1 CHECK (pax > 0),

  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departure_bookings_departure ON public.departure_bookings(departure_id);
CREATE INDEX IF NOT EXISTS idx_departure_bookings_org ON public.departure_bookings(org_id);

ALTER TABLE public.departure_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS departure_bookings_org_all ON public.departure_bookings;
CREATE POLICY departure_bookings_org_all ON public.departure_bookings
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

DROP TRIGGER IF EXISTS trg_departure_bookings_updated_at ON public.departure_bookings;
CREATE TRIGGER trg_departure_bookings_updated_at
  BEFORE UPDATE ON public.departure_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_integrations_updated_at();
