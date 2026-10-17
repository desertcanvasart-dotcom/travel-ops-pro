-- ============================================
-- VAT, recorded on each client document
-- ============================================
-- The owner's decision (2026-10-13): "Use a recorded tax amount, which is 14%
-- as VAT … on every applicable document, so the user knows if tax is applied
-- or not applied." Two companies (ATS, Travel2Egypt) share this install, so
-- the rate is per company, and each document records its own VAT at the
-- moment it is priced or issued — a later change of rate never re-prices a
-- document already made.
--
-- VAT is added ON TOP of the net price: total incl. VAT = net + vat_amount.
-- Every existing price column (selling_price, total_cost, …) keeps meaning the
-- net, so nothing that reads one changes. The amount is net × rate / 100 in
-- the currency's own unit (whole yen for JPY), computed by the server
-- (lib/vat.ts); an amount sent by a browser is never stored.
--
--   organizations.vat_rate     the company's VAT rate in percent, 14 unless
--                              an admin sets another (Settings › Company
--                              Profile). Read when a document is priced.
--
--   tour_quotes / b2c_quotes
--     vat_applied              whether this quote charges VAT on top
--     vat_rate                 the rate it was priced at (NULL when not applied)
--     vat_amount               the VAT, in the quote's currency (0 when not)
--
--   invoices
--     vat_applied              whether this invoice charges VAT. The rate and
--                              the amount are the invoice's long-standing
--                              tax_rate / tax_amount; total_amount already
--                              includes tax_amount (subtotal + tax − discount).
--
--   itineraries
--     vat_applied, vat_rate    carried from the quote the trip was converted
--                              from (or booked from). Only the flag and the
--                              rate: a trip's client total is re-added from its
--                              lines as the trip is edited, so the VAT shown
--                              beside it is that total at the recorded rate.
--                              Bookings read their trip's.
--
-- Existing rows were issued without VAT: vat_applied false, amount 0 — except
-- invoices that already carry a tax_amount above 0, which are marked applied
-- with the rate and amount they recorded.
--
-- revert_quote_to_revision / revert_b2c_quote_to_revision restore the three
-- VAT columns with the price they belong to (revisions are to_jsonb snapshots;
-- older ones without the keys restore "not applied"). Otherwise identical to
-- 20261121 / 20261211.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, each table guarded
-- with to_regclass. Applying it twice changes nothing the second time.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 14;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_vat_rate_range') THEN
      ALTER TABLE public.organizations
        ADD CONSTRAINT organizations_vat_rate_range CHECK (vat_rate >= 0 AND vat_rate <= 100);
    END IF;
  END IF;

  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_rate numeric;
    ALTER TABLE public.tour_quotes ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('public.b2c_quotes') IS NOT NULL THEN
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_rate numeric;
    ALTER TABLE public.b2c_quotes ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('public.itineraries') IS NOT NULL THEN
    ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS vat_rate numeric;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false;
    -- An invoice that already carries tax was issued with it.
    UPDATE public.invoices SET vat_applied = true
     WHERE vat_applied = false AND COALESCE(tax_amount, 0) > 0;
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
