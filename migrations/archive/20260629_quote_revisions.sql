-- ============================================================
-- quote_revisions — revision history for tour_quotes (snapshot + revert)
-- ============================================================
-- Ported from the sibling app (autoura-saas migration 003), but adapted:
--   * NEW table name `quote_revisions` — ours already has `quote_versions`,
--     which is the per-LANGUAGE translation system (en/ja), NOT revision
--     history. The two must not collide.
--   * Targets ours' quote table `tour_quotes` (sibling used b2b_quotes/b2c_quotes).
--   * Unscoped to match tour_quotes (this app is single-org; tour_quotes has no
--     org_id). Access is via service-role routes behind the /api/* auth gate.
--   * quote_type defaults to 'b2b' so a future B2C model (Q5-C) can reuse the
--     same table with quote_type='b2c'.
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  quote_type VARCHAR(10) NOT NULL DEFAULT 'b2b' CHECK (quote_type IN ('b2c', 'b2b')),
  quote_id UUID NOT NULL,

  version_number INTEGER NOT NULL,
  is_current BOOLEAN DEFAULT false,

  -- Complete snapshot of the quote row at this revision.
  quote_data JSONB NOT NULL,

  -- Change tracking
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_reason TEXT,
  change_summary TEXT,
  changes_diff JSONB,                    -- {field: changed-bool} summary

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (quote_type, quote_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_quote_revisions_quote ON quote_revisions(quote_type, quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_revisions_current ON quote_revisions(is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_quote_revisions_changed_at ON quote_revisions(changed_at DESC);

-- Lightweight version pointers on the quote itself.
ALTER TABLE tour_quotes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE tour_quotes ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE tour_quotes ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- create_quote_revision — snapshot the current tour_quotes row
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_quote_revision(
  p_quote_id UUID,
  p_changed_by UUID DEFAULT NULL,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_quote tour_quotes%ROWTYPE;
  v_version_number INTEGER;
  v_revision_id UUID;
  v_prev JSONB;
  v_diff JSONB;
BEGIN
  SELECT * INTO v_quote FROM tour_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version_number
    FROM quote_revisions
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id;

  SELECT quote_data INTO v_prev
    FROM quote_revisions
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id
   ORDER BY version_number DESC
   LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_diff := jsonb_build_object(
      'status_changed',        (v_prev->>'status')        IS DISTINCT FROM v_quote.status,
      'selling_price_changed', (v_prev->>'selling_price')::numeric IS DISTINCT FROM v_quote.selling_price,
      'total_cost_changed',    (v_prev->>'total_cost')::numeric    IS DISTINCT FROM v_quote.total_cost,
      'margin_changed',        (v_prev->>'margin_percent')::numeric IS DISTINCT FROM v_quote.margin_percent
    );
  END IF;

  UPDATE quote_revisions SET is_current = false
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND is_current = true;

  INSERT INTO quote_revisions (
    quote_type, quote_id, version_number, is_current,
    quote_data, changed_by, change_reason, changes_diff
  ) VALUES (
    'b2b', p_quote_id, v_version_number, true,
    to_jsonb(v_quote), p_changed_by, p_change_reason, v_diff
  )
  RETURNING id INTO v_revision_id;

  UPDATE tour_quotes
     SET version = v_version_number,
         last_modified_by = p_changed_by,
         last_modified_at = NOW()
   WHERE id = p_quote_id;

  RETURN v_revision_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- revert_quote_to_revision — restore a prior revision's data,
-- then snapshot the result as a new revision.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION revert_quote_to_revision(
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
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND version_number = p_version_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number;
  END IF;

  UPDATE tour_quotes SET
    variation_id        = NULLIF(d->>'variation_id','')::uuid,
    itinerary_id        = NULLIF(d->>'itinerary_id','')::uuid,
    trip_name           = d->>'trip_name',
    partner_id          = NULLIF(d->>'partner_id','')::uuid,
    client_name         = d->>'client_name',
    client_email        = d->>'client_email',
    client_phone        = d->>'client_phone',
    client_nationality  = d->>'client_nationality',
    travel_date         = NULLIF(d->>'travel_date','')::date,
    num_adults          = NULLIF(d->>'num_adults','')::integer,
    num_children        = NULLIF(d->>'num_children','')::integer,
    services_snapshot   = d->'services_snapshot',
    total_cost          = NULLIF(d->>'total_cost','')::numeric,
    margin_percent      = NULLIF(d->>'margin_percent','')::numeric,
    margin_amount       = NULLIF(d->>'margin_amount','')::numeric,
    selling_price       = NULLIF(d->>'selling_price','')::numeric,
    price_per_person    = NULLIF(d->>'price_per_person','')::numeric,
    currency            = d->>'currency',
    tour_leader_included = NULLIF(d->>'tour_leader_included','')::boolean,
    tour_leader_cost    = NULLIF(d->>'tour_leader_cost','')::numeric,
    single_supplement   = NULLIF(d->>'single_supplement','')::numeric,
    is_eur_passport     = NULLIF(d->>'is_eur_passport','')::boolean,
    season              = d->>'season',
    status              = d->>'status',
    valid_until         = NULLIF(d->>'valid_until','')::date,
    notes               = d->>'notes',
    updated_at          = NOW()
  WHERE id = p_quote_id;

  SELECT create_quote_revision(
    p_quote_id, p_reverted_by,
    p_revert_reason || ' (v' || p_version_number || ')'
  ) INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Backfill: one initial revision per existing quote.
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT q.id FROM tour_quotes q
    WHERE NOT EXISTS (
      SELECT 1 FROM quote_revisions v
      WHERE v.quote_type = 'b2b' AND v.quote_id = q.id
    )
  LOOP
    PERFORM create_quote_revision(r.id, NULL, 'Initial revision snapshot');
  END LOOP;
END $$;

COMMENT ON TABLE quote_revisions IS 'Revision history (snapshot + revert) for tour_quotes. Distinct from quote_versions, which is the per-language translation system.';
