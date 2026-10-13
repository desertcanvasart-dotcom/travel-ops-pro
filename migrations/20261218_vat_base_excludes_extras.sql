-- ============================================
-- VAT is not charged on extras or insurance
-- ============================================
-- The owner's decision (2026-10-13): "VAT is to be added on top of the price,
-- with the token functionality to include and exclude. No taxes over extras
-- or insurance." Migration 20261214 recorded VAT on each document as
-- net × rate; the BASE is now the net less the extras and insurance in it
-- (lib/vat.ts):
--
--   tour_quotes   the catalogue extras' share of the selling price
--                 (services_snapshot lines with rate_source
--                 'extras_catalogue', or of category 'extra' / 'insurance')
--   b2c_quotes    the trip's extras lines' share of the offer's price
--   invoices      the insurance premiums and extras the server adds to the
--                 invoice, plus the trip's extras share of what it bills
--
-- They are still billed, and still in the net and the total; only the VAT
-- leaves them out. vat_amount = vat_base × rate / 100, in the currency's unit.
--
--   vat_base      what the VAT was charged on, recorded when that is LESS
--                 than the net because extras or insurance were left out.
--                 NULL means the whole net was taxed. The marker reads
--                 "VAT 14% included: ¥X (extras and insurance not taxed)"
--                 exactly when it is set.
--
-- Documents issued before this keep the VAT they recorded: nothing here
-- re-rates a vat_amount or a tax_amount, and their vat_base stays NULL ("the
-- whole net"), which is what they taxed. Trips (itineraries) record no amount
-- — their VAT is worked out beside their live total — so they need nothing.
--
-- revert_quote_to_revision / revert_b2c_quote_to_revision restore vat_base
-- with the VAT it belongs to (revisions are to_jsonb snapshots; an older one
-- without the key restores NULL, which is what it taxed). Otherwise identical
-- to 20261214.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, a named constraint added only when
-- missing, CREATE OR REPLACE, each table guarded with to_regclass. Applying it
-- twice changes nothing the second time.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_base numeric;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_quotes_vat_base_nonnegative') THEN
      ALTER TABLE public.tour_quotes
        ADD CONSTRAINT tour_quotes_vat_base_nonnegative CHECK (vat_base IS NULL OR vat_base >= 0);
    END IF;
  END IF;

  IF to_regclass('public.b2c_quotes') IS NOT NULL THEN
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_base numeric;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'b2c_quotes_vat_base_nonnegative') THEN
      ALTER TABLE public.b2c_quotes
        ADD CONSTRAINT b2c_quotes_vat_base_nonnegative CHECK (vat_base IS NULL OR vat_base >= 0);
    END IF;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_base numeric;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_vat_base_nonnegative') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_vat_base_nonnegative CHECK (vat_base IS NULL OR vat_base >= 0);
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------- B2B revert
DO $$
BEGIN
  IF to_regclass('public.tour_quotes') IS NOT NULL AND to_regclass('public.quote_revisions') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
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
          vat_applied = COALESCE(NULLIF(d->>'vat_applied','')::boolean, false),
          vat_rate = NULLIF(d->>'vat_rate','')::numeric,
          vat_amount = COALESCE(NULLIF(d->>'vat_amount','')::numeric, 0),
          vat_base = NULLIF(d->>'vat_base','')::numeric,
          status = d->>'status',
          valid_until = NULLIF(d->>'valid_until','')::date,
          notes = d->>'notes',
          updated_at = NOW()
        WHERE id = p_quote_id;

        SELECT create_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;

  -- -------------------------------------------------------------- B2C revert
  IF to_regclass('public.b2c_quotes') IS NOT NULL AND to_regclass('public.quote_revisions') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.revert_b2c_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
          LANGUAGE plpgsql SECURITY DEFINER
          AS $body$
      DECLARE d JSONB; v_new_id UUID;
      BEGIN
        SELECT quote_data INTO d FROM quote_revisions
         WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND version_number = p_version_number;
        IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

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
          season_name           = d->>'season_name',
          season_uplift_percent = COALESCE(NULLIF(d->>'season_uplift_percent','')::numeric, 0),
          season_uplift_amount  = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0),
          vat_applied      = COALESCE(NULLIF(d->>'vat_applied','')::boolean, false),
          vat_rate         = NULLIF(d->>'vat_rate','')::numeric,
          vat_amount       = COALESCE(NULLIF(d->>'vat_amount','')::numeric, 0),
          vat_base         = NULLIF(d->>'vat_base','')::numeric,
          status           = d->>'status',
          valid_until      = NULLIF(d->>'valid_until','')::date,
          internal_notes   = d->>'internal_notes',
          client_notes     = d->>'client_notes',
          updated_at       = NOW()
        WHERE id = p_quote_id;

        SELECT create_b2c_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
        RETURN v_new_id;
      END;
      $body$
    $f$;
  END IF;
END
$$;

COMMIT;
