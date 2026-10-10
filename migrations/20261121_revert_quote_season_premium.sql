-- ============================================================================
-- 20261121 — reverting a B2B quote restores its season premium too
-- ============================================================================
--
-- revert_quote_to_revision predates tour_quotes.season_name /
-- season_uplift_percent / season_uplift_amount, so a revert restored
-- total_cost, margin and selling_price but left the premium of the version
-- being replaced: v1 (no premium) restored under v3's "Peak premium €900"
-- line, and the breakdown no longer added up to the price. Revisions are
-- to_jsonb(tour_quotes) snapshots, so older ones without the keys restore 0.
--
-- Identical to the baseline definition apart from the three season columns.
-- Replay-safe (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.revert_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE d JSONB; v_new_id UUID;
BEGIN
  SELECT quote_data INTO d FROM quote_revisions
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND version_number = p_version_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

  UPDATE tour_quotes SET
    variation_id = NULLIF(d->>'variation_id','')::uuid,
    itinerary_id = NULLIF(d->>'itinerary_id','')::uuid,
    trip_name = d->>'trip_name',
    partner_id = NULLIF(d->>'partner_id','')::uuid,
    client_name = d->>'client_name',
    client_email = d->>'client_email',
    client_phone = d->>'client_phone',
    client_nationality = d->>'client_nationality',
    travel_date = NULLIF(d->>'travel_date','')::date,
    num_adults = NULLIF(d->>'num_adults','')::integer,
    num_children = NULLIF(d->>'num_children','')::integer,
    services_snapshot = d->'services_snapshot',
    total_cost = NULLIF(d->>'total_cost','')::numeric,
    margin_percent = NULLIF(d->>'margin_percent','')::numeric,
    margin_amount = NULLIF(d->>'margin_amount','')::numeric,
    selling_price = NULLIF(d->>'selling_price','')::numeric,
    price_per_person = NULLIF(d->>'price_per_person','')::numeric,
    currency = d->>'currency',
    tour_leader_included = NULLIF(d->>'tour_leader_included','')::boolean,
    tour_leader_cost = NULLIF(d->>'tour_leader_cost','')::numeric,
    single_supplement = NULLIF(d->>'single_supplement','')::numeric,
    is_eur_passport = NULLIF(d->>'is_eur_passport','')::boolean,
    season = d->>'season',
    season_name = d->>'season_name',
    season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
    season_uplift_amount = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
    status = d->>'status',
    valid_until = NULLIF(d->>'valid_until','')::date,
    notes = d->>'notes',
    updated_at = NOW()
  WHERE id = p_quote_id;

  SELECT create_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
  RETURN v_new_id;
END;
$$;
