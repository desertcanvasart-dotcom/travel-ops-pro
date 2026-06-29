-- ============================================================
-- b2c_quotes — thin priced-offer wrapper over an itinerary
-- ============================================================
-- DEPENDS ON 20260629_quote_revisions.sql (the shared quote_revisions table +
-- create_quote_revision/revert_quote_to_revision for B2B). Apply that first.
--
-- Design (decided with the operator): in this app the ITINERARY is already the
-- B2C customer deliverable (it has pricing, a 'sent' status, PDF + email). So a
-- B2C quote is NOT a second copy of the trip — it's a time-bound PRICED OFFER
-- that references an itinerary. You can issue several offers per itinerary
-- (different margins/tiers) and track accept/reject independently of the
-- itinerary's operational status.
--
-- Revisions reuse the shared quote_revisions table with quote_type='b2c'.
-- ============================================================

CREATE TABLE IF NOT EXISTS b2c_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  quote_number TEXT,

  -- Offer terms
  num_travelers INTEGER NOT NULL DEFAULT 2,
  tier TEXT,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  margin_percent NUMERIC NOT NULL DEFAULT 0,
  margin_amount NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  price_per_person NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  cost_breakdown JSONB,

  -- Offer lifecycle (independent of the itinerary's operational status)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until DATE,
  sent_via TEXT,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,

  internal_notes TEXT,
  client_notes TEXT,

  -- Version pointers (mirror tour_quotes)
  version INTEGER DEFAULT 1,
  last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_modified_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2c_quotes_itinerary ON b2c_quotes(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_org ON b2c_quotes(org_id);
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_status ON b2c_quotes(status);

CREATE OR REPLACE FUNCTION update_b2c_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_b2c_quotes_updated_at ON b2c_quotes;
CREATE TRIGGER trg_b2c_quotes_updated_at
  BEFORE UPDATE ON b2c_quotes
  FOR EACH ROW EXECUTE FUNCTION update_b2c_quotes_updated_at();

-- ------------------------------------------------------------
-- B2C revision snapshot / revert (reuse the shared quote_revisions table).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_b2c_quote_revision(
  p_quote_id UUID,
  p_changed_by UUID DEFAULT NULL,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_quote b2c_quotes%ROWTYPE;
  v_version_number INTEGER;
  v_revision_id UUID;
  v_prev JSONB;
  v_diff JSONB;
BEGIN
  SELECT * INTO v_quote FROM b2c_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B2C quote not found: %', p_quote_id;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version_number
    FROM quote_revisions
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id;

  SELECT quote_data INTO v_prev
    FROM quote_revisions
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id
   ORDER BY version_number DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_diff := jsonb_build_object(
      'status_changed',        (v_prev->>'status')        IS DISTINCT FROM v_quote.status,
      'selling_price_changed', (v_prev->>'selling_price')::numeric IS DISTINCT FROM v_quote.selling_price,
      'margin_changed',        (v_prev->>'margin_percent')::numeric IS DISTINCT FROM v_quote.margin_percent
    );
  END IF;

  UPDATE quote_revisions SET is_current = false
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND is_current = true;

  INSERT INTO quote_revisions (
    quote_type, quote_id, version_number, is_current,
    quote_data, changed_by, change_reason, changes_diff
  ) VALUES (
    'b2c', p_quote_id, v_version_number, true,
    to_jsonb(v_quote), p_changed_by, p_change_reason, v_diff
  )
  RETURNING id INTO v_revision_id;

  UPDATE b2c_quotes
     SET version = v_version_number,
         last_modified_by = p_changed_by,
         last_modified_at = NOW()
   WHERE id = p_quote_id;

  RETURN v_revision_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revert_b2c_quote_to_revision(
  p_quote_id UUID,
  p_version_number INTEGER,
  p_reverted_by UUID DEFAULT NULL,
  p_revert_reason TEXT DEFAULT 'Reverted to previous version'
)
RETURNS UUID AS $$
DECLARE
  d JSONB;
  v_new_id UUID;
BEGIN
  SELECT quote_data INTO d
    FROM quote_revisions
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND version_number = p_version_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number;
  END IF;

  UPDATE b2c_quotes SET
    num_travelers    = NULLIF(d->>'num_travelers','')::integer,
    tier             = d->>'tier',
    total_cost       = NULLIF(d->>'total_cost','')::numeric,
    margin_percent   = NULLIF(d->>'margin_percent','')::numeric,
    margin_amount    = NULLIF(d->>'margin_amount','')::numeric,
    selling_price    = NULLIF(d->>'selling_price','')::numeric,
    price_per_person = NULLIF(d->>'price_per_person','')::numeric,
    currency         = d->>'currency',
    cost_breakdown   = d->'cost_breakdown',
    status           = d->>'status',
    valid_until      = NULLIF(d->>'valid_until','')::date,
    internal_notes   = d->>'internal_notes',
    client_notes     = d->>'client_notes',
    updated_at       = NOW()
  WHERE id = p_quote_id;

  SELECT create_b2c_quote_revision(
    p_quote_id, p_reverted_by,
    p_revert_reason || ' (v' || p_version_number || ')'
  ) INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE b2c_quotes IS 'Time-bound priced offers over an itinerary (B2C). The itinerary remains the deliverable; this tracks offer terms + accept/reject lifecycle + revisions.';
