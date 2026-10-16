-- ============================================
-- Rates belong to one company: every rate table gets an org_id
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and not one rate table had an org_id, so every rate was both
-- companies':
--   - /api/rates/** listed, edited and deleted the other company's hotels,
--     guides, transport, cruises, fees …; service codes were unique across the
--     install, so a company could not use a code the other had taken, and a
--     bulk import (onConflict 'service_code') OVERWROTE the other company's
--     row when the codes matched;
--   - the pricing engine (lib/auto-pricing-service, the pricing grid, B2B
--     pricing, the AI itinerary builder) priced one company's trips with the
--     other's rates;
--   - restampVehicleBands rewrote EVERY transportation rate with the
--     current company's vehicle vocabulary;
--   - the rate-change digest mailed every company's managers every company's
--     rate changes, and the invariants cron mailed one list of everyone's;
--   - destinations, fixed daily costs, attraction aliases, the fleet
--     (vehicles) and the legacy hotel / cruise / restaurant directories were
--     one shared set.
-- And through PostgREST (RLS, OR'd: one USING (true) opens a table), quoted
-- from the baseline and later migrations:
--   accommodation_rates, activity_rates, airport_staff_rates, guide_rates,
--   hotel_staff_rates, meal_rates, nile_cruises, tipping_rates,
--   transportation_rates          "<table>_authenticated_all" ALL TO
--                                 authenticated USING (true) WITH CHECK (true)
--   entrance_fees                 "entrance_fees_authenticated_all" (same) and
--                                 "Allow authenticated read access" SELECT (true)
--   flight_rates                  "Allow read access to flight_rates",
--                                 "Allow insert/update/delete for authenticated
--                                 users" — TO PUBLIC, (true)
--   train_rates, sleeping_train_rates
--                                 "Allow all for authenticated" ALL TO PUBLIC (true)
--   cruise_contacts               "Enable all access for authenticated users"
--                                 ALL TO PUBLIC (true)
--   assistant_rates, seasonal_rates, vehicle_rates, fixed_daily_costs,
--   hotel_contacts, restaurant_contacts, service_fees, vehicles,
--   entrance_fee_versions, b2b_partner_pricing
--                                 "<table>_authenticated" ALL TO authenticated (true)
--   attraction_aliases            "Allow authenticated read/insert/update/
--                                 delete" (true); "Allow service role full
--                                 access" (kept)
--   destinations, destination_cities
--                                 "<table>_read" SELECT TO authenticated (true);
--                                 "<table>_service" (kept)
--   rate_audit_log                "Authenticated users can read audit log"
--                                 SELECT (true); "Only system can insert audit
--                                 log" WITH CHECK (false) (kept — grants nothing)
--   extras_catalogue              "extras_catalogue_authenticated_all" (true) —
--                                 it HAD an org_id, the policy ignored it
--   b2b_transport_packages        "b2b_transport_packages_authenticated" (true) —
--                                 likewise
-- All of those (true) policies are dropped. In their place, on every table
-- above: select user_is_in_org(org_id); insert/update/delete
-- user_is_in_org(org_id) AND is_manager_or_above() (rates are manager-and-
-- above since #605). The CHILD tables check their parent's company:
-- entrance_fee_versions (entrance_fees), destination_cities (destinations,
-- select only, as before), b2b_partner_pricing (b2b_partners). rate_audit_log:
-- select user_is_in_org(org_id) AND is_manager_or_above(). Every caller is an
-- API route on the service role (RLS does not apply to it); these are the
-- second wall — the one browser read (the itinerary edit page's entrance fee /
-- activity lookups) now sees only its company's rates.
--
-- WHAT THIS DOES. org_id uuid REFERENCES organizations ON DELETE CASCADE (as
-- itineraries.org_id; no DEFAULT — the code stamps every insert) on:
--   accommodation_rates activity_rates airport_staff_rates hotel_staff_rates
--   guide_rates meal_rates nile_cruises flight_rates train_rates
--   sleeping_train_rates transportation_rates tipping_rates entrance_fees
--   service_fees assistant_rates seasonal_rates vehicle_rates
--   fixed_daily_costs attraction_aliases destinations vehicles
--   hotel_contacts cruise_contacts restaurant_contacts rate_audit_log
-- (entrance_fee_versions and destination_cities follow their parent.) Every
-- row assigned, NOT NULL, indexed (org_id, …).
--
-- BACKFILL — helpers from 20261202. Each rule fills only rows still NULL.
-- "Trips that use it" means, for a row R: an itinerary_services line whose
-- notes pin it ("__grid:slot:<slot>|rate_id:<R>[…]", the pricing grid) or
-- whose service_code is R's; an itinerary_resources assignment of R; a
-- b2b_pricing_rules row naming R; itineraries.assigned_vehicle_id /
-- assigned_hotel_id / assigned_restaurant_id / destination_id,
-- bookings.assigned_vehicle_id, tour_departures.assigned_vehicle_id = R —
-- each through that row's company.
--
--   RATES (every *_rates table, nile_cruises, entrance_fees, service_fees;
--   assistant_rates / seasonal_rates / vehicle_rates are barely used and have
--   only the first rule to go on), in order:
--     1. its supplier's company (suppliers.org_id — 20261205 gives suppliers
--        one; without that migration the rule is skipped)
--     2. the company of the person who created it (the rate_audit_log INSERT
--        row's changed_by, when they belong to exactly one company; the
--        EUR→USD cut-over's UPDATE rows are not creations and never count)
--     3. the one company whose trips use it
--     4. used by BOTH companies' trips and nothing above: the catalogue
--        default (ATS) when it is one of them, else the older company —
--        review: 'used by both companies — copied for the other'
--     5. nothing traces it: the catalogue default (ATS — decided 2026-10-12,
--        the catalogue is mostly ATS's) — review: 'no supplier, creator or
--        trip — catalogue default'
--   Then a row used by trips of a company OTHER than the one it landed in is
--   COPIED into that company (new id, same service code — codes are unique
--   per company now — same everything else) and that company's references
--   are pointed at the copy: its itinerary_services pins, its
--   itinerary_resources assignments, its b2b_pricing_rules (service_code
--   lines need nothing: the copy keeps the code). Both rows are listed:
--   'used by another company — copied'. An entrance fee's language versions
--   are copied with it. Copies are recorded in
--   org_backfill_rate_copies (table_name, original_id, copy_id, org_id).
--   A rate (copy or not) whose supplier / property is another company's is
--   pointed at that company's copy of it (org_backfill_supplier_copies /
--   org_backfill_property_copies, from 20261205); with no copy there it is
--   left and listed: 'supplier belongs to another company' / 'property
--   belongs to another company'.
--
--   fixed_daily_costs — nothing traces them: the catalogue default, and a
--     copy for every other company (each company has its own daily costs).
--   destinations — the catalogue default, and a copy (with its cities) for
--     every other company; each company's itineraries.destination_id is
--     pointed at its own copy.
--   attraction_aliases — its destination's company, else the catalogue
--     default; a copy for every other company, pointed at that company's
--     destination.
--   vehicles (fleet), hotel_contacts / cruise_contacts / restaurant_contacts
--     (legacy directories) — the company of the trips (itineraries
--     .assigned_*, itinerary_resources, bookings / tour_departures for
--     vehicles) that use them; used by both: copied as rates are; else the
--     catalogue default + review.
--   rate_audit_log — its rate row's company; a rate since deleted: the
--     company of the person who changed it, else the catalogue default +
--     review ('rate no longer exists — catalogue default').
--
-- NOT REPOINTED HERE (tables without an org_id yet — tours get theirs in the
-- next batch, which repoints them): tour_days.accommodation_id /
-- lunch_meal_id / dinner_meal_id / guide_id, tour_variation_services.rate_id,
-- content_library.destination_id, writing_rules.destination_id. They keep
-- pointing at the original row (in the catalogue default's company).
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name IN (<the tables above>)
--     ORDER BY id;
--   SELECT * FROM org_backfill_rate_copies ORDER BY table_name, original_id;
--
-- UNIQUE → PER COMPANY: every <table>_service_code_key (and the duplicate
-- index idx_flight_rates_service_code) → (org_id, service_code);
-- nile_cruises (cruise_code), fixed_daily_costs (cost_type), vehicles
-- (license_plate), attraction_aliases (alias), destinations (country_code),
-- b2b_transport_packages (package_code) → (org_id, …); uq_guide_rates_natural_key
-- → org_id first. The bulk import's onConflict is 'org_id,service_code'.
--
-- fn_rate_audit_trigger stamps rate_audit_log.org_id from the row
-- (NEW/OLD.org_id).
--
-- DEAD objects dropped (grep of app/ lib/ components/ hooks/ scripts/: no
-- reader or writer; only types/database.types.ts named them):
--   tables meal_costs, outside_cairo_fees, seasonal_adjustments,
--     transportation_contacts, profit_margins, discount_rules, booking_rules,
--     package_type_definitions, destinations_legacy_2025
--   view tour_overview (its only reader of destinations_legacy_2025; no code
--     reads it) and the foreign key tour_templates_primary_destination_id_fkey
--     (the column stays: the templates routes still accept it; nothing in the
--     UI sends it, and the table it pointed at is the dead legacy one).
-- KEPT GLOBAL: exchange_rates, exchange_rate_snapshots (market data).
--
-- DEPLOY ORDER: apply 20261205 (suppliers) and then this migration FIRST,
-- then deploy the code. The code filters and stamps org_id on these tables
-- and fails without it; the old code keeps reading on the new schema, but a
-- rate it inserts has no org_id and fails NOT NULL — deploy promptly.
-- Without 20261205 this still applies (the supplier rule and the supplier
-- remap are skipped).
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- NULLs, a copy is made only where none is recorded, review rows ON CONFLICT
-- DO NOTHING, policies dropped before created, tables guarded (to_regclass).
-- On a bare replay (no organisations) nothing is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_rate_copies (
  table_name text NOT NULL,
  original_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, original_id, org_id)
);
ALTER TABLE public.org_backfill_rate_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_rate_copies FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns; triggers off for the backfill (it must neither stamp every row as
-- just edited nor write an audit row per assignment); global uniques dropped
-- (a copy keeps its original's code).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  trg text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
    'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts', 'rate_audit_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
    FOREACH trg IN ARRAY ARRAY['set_updated_at', 'trg_audit_' || t] LOOP
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = trg) THEN
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', t, trg);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_service_code_key') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, t || '_service_code_key');
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.entrance_fee_versions') AND tgname = 'set_updated_at') THEN
    ALTER TABLE public.entrance_fee_versions DISABLE TRIGGER set_updated_at;
  END IF;
END
$$;
DROP INDEX IF EXISTS public.idx_flight_rates_service_code;
DROP INDEX IF EXISTS public.uq_guide_rates_natural_key;
ALTER TABLE IF EXISTS public.nile_cruises DROP CONSTRAINT IF EXISTS nile_cruises_cruise_code_key;
ALTER TABLE IF EXISTS public.fixed_daily_costs DROP CONSTRAINT IF EXISTS fixed_daily_costs_cost_type_key;
ALTER TABLE IF EXISTS public.vehicles DROP CONSTRAINT IF EXISTS vehicles_license_plate_key;
ALTER TABLE IF EXISTS public.attraction_aliases DROP CONSTRAINT IF EXISTS attraction_aliases_alias_key;
ALTER TABLE IF EXISTS public.destinations DROP CONSTRAINT IF EXISTS destinations_country_code_key;
ALTER TABLE IF EXISTS public.b2b_transport_packages DROP CONSTRAINT IF EXISTS b2b_transport_packages_package_code_key;
-- A database whose b2b_transport_packages and b2b_partners predate org_id
-- (the E2E project's: see 20261018) gets the column here, so the per-company
-- key and the policies below have it. Production and a fresh install have it
-- already (b2b_partners.org_id is NOT NULL there): a no-op.
ALTER TABLE IF EXISTS public.b2b_transport_packages
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.b2b_partners
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Migration-only helpers (dropped at the end).
-- ---------------------------------------------------------------------------

-- Copy one row into another company: new id, that org, children with it.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_catalogue_row(p_table text, p_id uuid, p_org uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I, to_jsonb(r) || $1)).* FROM public.%1$I r WHERE r.id = $2',
    p_table) USING jsonb_build_object('id', new_id, 'org_id', p_org), p_id;
  INSERT INTO public.org_backfill_rate_copies (table_name, original_id, copy_id, org_id)
  VALUES (p_table, p_id, new_id, p_org);
  IF p_table = 'entrance_fees' AND to_regclass('public.entrance_fee_versions') IS NOT NULL THEN
    INSERT INTO public.entrance_fee_versions
    SELECT (jsonb_populate_record(NULL::public.entrance_fee_versions,
             to_jsonb(v) || jsonb_build_object('id', gen_random_uuid(), 'entrance_fee_id', new_id))).*
      FROM public.entrance_fee_versions v WHERE v.entrance_fee_id = p_id;
  ELSIF p_table = 'destinations' AND to_regclass('public.destination_cities') IS NOT NULL THEN
    INSERT INTO public.destination_cities
    SELECT (jsonb_populate_record(NULL::public.destination_cities,
             to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'destination_id', new_id))).*
      FROM public.destination_cities c WHERE c.destination_id = p_id;
  END IF;
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  VALUES (p_table, new_id::text, p_org, p_reason)
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  RETURN new_id;
END
$fn$;

-- Place one rate-like table's rows (rules 1-5 above), then copy each row into
-- every other company whose trips use it.
CREATE OR REPLACE FUNCTION public.org_backfill_place_catalogue(p_table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  cat uuid := public.org_backfill_catalogue_default();
  has_sup boolean;
  has_code boolean;
  rec record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL OR cat IS NULL THEN RETURN; END IF;
  has_sup := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'supplier_id')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'org_id');
  has_code := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'service_code');

  -- This table's uses, by company.
  DELETE FROM _org_t_use;
  EXECUTE format('INSERT INTO _org_t_use SELECT DISTINCT u.rid, u.org FROM _org_rate_use u JOIN public.%I r ON r.id = u.rid', p_table);
  IF has_code AND to_regclass('public.itinerary_services') IS NOT NULL THEN
    EXECUTE format($q$
      INSERT INTO _org_t_use
      SELECT DISTINCT r.id, i.org_id
        FROM public.%I r
        JOIN public.itinerary_services s ON s.service_code = r.service_code
        JOIN public.itinerary_days d ON d.id = s.itinerary_day_id
        JOIN public.itineraries i ON i.id = d.itinerary_id
       WHERE coalesce(r.service_code, '') <> '' AND i.org_id IS NOT NULL
    $q$, p_table);
  END IF;

  -- 1. The supplier's company.
  IF has_sup THEN
    EXECUTE format('UPDATE public.%I r SET org_id = s.org_id FROM public.suppliers s
                     WHERE r.org_id IS NULL AND s.id = r.supplier_id AND s.org_id IS NOT NULL', p_table);
  END IF;

  -- 2. The creator's company (the audit trigger's INSERT row).
  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    EXECUTE format($q$
      UPDATE public.%I r SET org_id = a.o
        FROM (SELECT DISTINCT ON (record_id) record_id, public.org_backfill_user_org(changed_by) AS o
                FROM public.rate_audit_log
               WHERE table_name = %L AND action = 'INSERT' AND changed_by IS NOT NULL
               ORDER BY record_id, changed_at) a
       WHERE r.org_id IS NULL AND a.record_id = r.id AND a.o IS NOT NULL
    $q$, p_table, p_table);
  END IF;

  -- 3. The one company whose trips use it.
  EXECUTE format($q$
    UPDATE public.%I r SET org_id = u.o
      FROM (SELECT rid, min(org::text)::uuid AS o FROM _org_t_use GROUP BY rid HAVING count(DISTINCT org) = 1) u
     WHERE r.org_id IS NULL AND u.rid = r.id
  $q$, p_table);

  -- 4. Both companies' trips: the catalogue default when it is one of them.
  EXECUTE format($q$
    WITH filled AS (
      UPDATE public.%1$I r SET org_id = coalesce(
          (SELECT x.org FROM _org_t_use x WHERE x.rid = r.id AND x.org = %2$L::uuid LIMIT 1),
          (SELECT x.org FROM _org_t_use x JOIN public.organizations o ON o.id = x.org
            WHERE x.rid = r.id ORDER BY o.created_at, o.id LIMIT 1))
       WHERE r.org_id IS NULL AND r.id IN (SELECT rid FROM _org_t_use)
      RETURNING r.id, r.org_id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT %1$L, id::text, org_id, 'used by both companies — copied for the other' FROM filled
    ON CONFLICT (table_name, row_id, reason) DO NOTHING
  $q$, p_table, cat);

  -- 5. Nothing traces it.
  EXECUTE format($q$
    WITH filled AS (
      UPDATE public.%1$I SET org_id = %2$L::uuid WHERE org_id IS NULL RETURNING id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT %1$L, id::text, %2$L::uuid, 'no supplier, creator or trip — catalogue default' FROM filled
    ON CONFLICT (table_name, row_id, reason) DO NOTHING
  $q$, p_table, cat);

  -- A row another company's trips use: a copy for that company.
  FOR rec IN EXECUTE format($q$
    SELECT DISTINCT u.rid, u.org, r.org_id AS home
      FROM _org_t_use u JOIN public.%I r ON r.id = u.rid
     WHERE u.org <> r.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c
                        WHERE c.table_name = %L AND c.original_id = u.rid AND c.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c
                        WHERE c.table_name = %L AND c.copy_id = u.rid)
  $q$, p_table, p_table, p_table) LOOP
    PERFORM public.org_backfill_copy_catalogue_row(p_table, rec.rid, rec.org, 'used by another company — copied');
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES (p_table, rec.rid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;
END
$fn$;

-- One copy per other company of every row (fixed costs, destinations,
-- aliases: nothing traces them to a company, and each needs its own).
CREATE OR REPLACE FUNCTION public.org_backfill_copy_for_each(p_table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  rec record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  FOR rec IN EXECUTE format($q$
    SELECT r.id, o.id AS org
      FROM public.%I r CROSS JOIN public.organizations o
     WHERE o.id <> r.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c WHERE c.table_name = %L AND c.copy_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c
                        WHERE c.table_name = %L AND c.original_id = r.id AND c.org_id = o.id)
     ORDER BY r.id, o.id
  $q$, p_table, p_table, p_table) LOOP
    PERFORM public.org_backfill_copy_catalogue_row(p_table, rec.id, rec.org, 'copied for each company');
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- What trips use: (row id, company). Ids are uuids, unique across tables, so
-- one list serves every table.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _org_rate_use (rid uuid, org uuid) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _org_t_use (rid uuid, org uuid) ON COMMIT DROP;

DO $$
DECLARE
  spec text[];
BEGIN
  IF to_regclass('public.itinerary_services') IS NOT NULL THEN
    INSERT INTO _org_rate_use
    SELECT m[1]::uuid, i.org_id
      FROM public.itinerary_services s
      JOIN public.itinerary_days d ON d.id = s.itinerary_day_id
      JOIN public.itineraries i ON i.id = d.itinerary_id
      CROSS JOIN LATERAL regexp_matches(s.notes, 'rate_id:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', 'g') AS m
     WHERE s.notes LIKE '%rate_id:%' AND i.org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.itinerary_resources') IS NOT NULL THEN
    INSERT INTO _org_rate_use
    SELECT r.resource_id, i.org_id FROM public.itinerary_resources r JOIN public.itineraries i ON i.id = r.itinerary_id
     WHERE i.org_id IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'b2b_pricing_rules' AND column_name = 'org_id') THEN
    INSERT INTO _org_rate_use SELECT rate_id, org_id FROM public.b2b_pricing_rules WHERE rate_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['itineraries', 'assigned_vehicle_id'],
    ARRAY['itineraries', 'assigned_hotel_id'],
    ARRAY['itineraries', 'assigned_restaurant_id'],
    ARRAY['itineraries', 'destination_id'],
    ARRAY['bookings', 'assigned_vehicle_id'],
    ARRAY['tour_departures', 'assigned_vehicle_id']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = spec[2])
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = 'org_id') THEN
      EXECUTE format('INSERT INTO _org_rate_use SELECT %2$I, org_id FROM public.%1$I WHERE %2$I IS NOT NULL AND org_id IS NOT NULL', spec[1], spec[2]);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Place every table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  t text;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN
    RAISE NOTICE 'rates: no organisations — nothing to backfill';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts'
  ] LOOP
    PERFORM public.org_backfill_place_catalogue(t);
  END LOOP;

  -- Each company its own fixed costs and destinations.
  IF to_regclass('public.fixed_daily_costs') IS NOT NULL THEN
    UPDATE public.fixed_daily_costs SET org_id = cat WHERE org_id IS NULL;
    PERFORM public.org_backfill_copy_for_each('fixed_daily_costs');
  END IF;
  IF to_regclass('public.destinations') IS NOT NULL THEN
    UPDATE public.destinations SET org_id = cat WHERE org_id IS NULL;
    PERFORM public.org_backfill_copy_for_each('destinations');
  END IF;
  -- Aliases: their destination's company, else the catalogue default; one
  -- per company, each pointing at that company's destination.
  IF to_regclass('public.attraction_aliases') IS NOT NULL THEN
    UPDATE public.attraction_aliases a SET org_id = d.org_id FROM public.destinations d
     WHERE a.org_id IS NULL AND d.id = a.destination_id AND d.org_id IS NOT NULL;
    UPDATE public.attraction_aliases SET org_id = cat WHERE org_id IS NULL;
    PERFORM public.org_backfill_copy_for_each('attraction_aliases');
    UPDATE public.attraction_aliases a SET destination_id = c.copy_id
      FROM public.org_backfill_rate_copies c
     WHERE c.table_name = 'destinations' AND c.original_id = a.destination_id AND c.org_id = a.org_id;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's references point at its own copy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
  trg record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies) THEN RETURN; END IF;

  -- These are fix-ups, not edits: no recalculation, no "updated" stamp, no
  -- client-status side effects. Only triggers that are on are turned off,
  -- and only those are turned back on.
  CREATE TEMP TABLE IF NOT EXISTS _org_trg_off (tbl text, tg text) ON COMMIT DROP;
  FOR trg IN
    SELECT c.relname AS tbl, t.tgname AS tg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('itinerary_services', 'itinerary_resources', 'b2b_pricing_rules', 'itineraries', 'bookings', 'tour_departures')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', trg.tbl, trg.tg);
    INSERT INTO _org_trg_off VALUES (trg.tbl, trg.tg);
  END LOOP;

  IF to_regclass('public.itinerary_services') IS NOT NULL THEN
    UPDATE public.itinerary_services s
       SET notes = replace(s.notes, 'rate_id:' || c.original_id::text, 'rate_id:' || c.copy_id::text)
      FROM public.itinerary_days d, public.itineraries i, public.org_backfill_rate_copies c
     WHERE d.id = s.itinerary_day_id AND i.id = d.itinerary_id AND c.org_id = i.org_id
       AND s.notes LIKE '%rate_id:' || c.original_id::text || '%';
  END IF;
  IF to_regclass('public.itinerary_resources') IS NOT NULL THEN
    UPDATE public.itinerary_resources r SET resource_id = c.copy_id
      FROM public.itineraries i, public.org_backfill_rate_copies c
     WHERE i.id = r.itinerary_id AND c.original_id = r.resource_id AND c.org_id = i.org_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'b2b_pricing_rules' AND column_name = 'org_id') THEN
    UPDATE public.b2b_pricing_rules p SET rate_id = c.copy_id
      FROM public.org_backfill_rate_copies c
     WHERE c.original_id = p.rate_id AND c.org_id = p.org_id;
  END IF;
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['itineraries', 'assigned_vehicle_id'],
    ARRAY['itineraries', 'assigned_hotel_id'],
    ARRAY['itineraries', 'assigned_restaurant_id'],
    ARRAY['itineraries', 'destination_id'],
    ARRAY['bookings', 'assigned_vehicle_id'],
    ARRAY['tour_departures', 'assigned_vehicle_id']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = spec[2])
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = 'org_id') THEN
      EXECUTE format('UPDATE public.%1$I r SET %2$I = c.copy_id FROM public.org_backfill_rate_copies c
                       WHERE c.original_id = r.%2$I AND c.org_id = r.org_id', spec[1], spec[2]);
    END IF;
  END LOOP;

  FOR trg IN SELECT * FROM _org_trg_off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', trg.tbl, trg.tg);
  END LOOP;
  DELETE FROM _org_trg_off;
END
$$;

-- ---------------------------------------------------------------------------
-- A rate's supplier / property is its own company's (20261205's copies).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  sup_org boolean := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'org_id');
  prop_org boolean := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supplier_properties' AND column_name = 'org_id');
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'entrance_fees', 'assistant_rates', 'seasonal_rates', 'vehicle_rates'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF sup_org AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'supplier_id') THEN
      IF to_regclass('public.org_backfill_supplier_copies') IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I r SET supplier_id = m.copy_id
                          FROM public.org_backfill_supplier_copies m, public.suppliers s
                         WHERE m.original_id = r.supplier_id AND m.org_id = r.org_id
                           AND s.id = r.supplier_id AND s.org_id IS DISTINCT FROM r.org_id', t);
      END IF;
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, r.id::text, r.org_id, 'supplier belongs to another company'
          FROM public.%1$I r JOIN public.suppliers s ON s.id = r.supplier_id
         WHERE s.org_id IS NOT NULL AND s.org_id <> r.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, t);
    END IF;
    IF prop_org AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'property_id') THEN
      IF to_regclass('public.org_backfill_property_copies') IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I r SET property_id = m.copy_id
                          FROM public.org_backfill_property_copies m, public.supplier_properties p
                         WHERE m.original_id = r.property_id AND m.org_id = r.org_id
                           AND p.id = r.property_id AND p.org_id IS DISTINCT FROM r.org_id', t);
      END IF;
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, r.id::text, r.org_id, 'property belongs to another company'
          FROM public.%1$I r JOIN public.supplier_properties p ON p.id = r.property_id
         WHERE p.org_id IS NOT NULL AND p.org_id <> r.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, t);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- rate_audit_log: its rate's company.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  t text;
BEGIN
  IF to_regclass('public.rate_audit_log') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN RETURN; END IF;
  FOR t IN SELECT DISTINCT table_name FROM public.rate_audit_log WHERE org_id IS NULL LOOP
    IF to_regclass('public.' || t) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      CONTINUE;
    END IF;
    EXECUTE format('UPDATE public.rate_audit_log l SET org_id = r.org_id FROM public.%I r
                     WHERE l.org_id IS NULL AND l.table_name = %L AND l.record_id = r.id AND r.org_id IS NOT NULL', t, t);
  END LOOP;
  UPDATE public.rate_audit_log SET org_id = public.org_backfill_user_org(changed_by)
   WHERE org_id IS NULL AND changed_by IS NOT NULL AND public.org_backfill_user_org(changed_by) IS NOT NULL;
  WITH filled AS (
    UPDATE public.rate_audit_log SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'rate_audit_log', id::text, cat, 'rate no longer exists — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- The audit row carries its rate's company.
CREATE OR REPLACE FUNCTION public.fn_rate_audit_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old_record jsonb;
  v_new_record jsonb;
  v_changed_fields jsonb := '{}';
  v_record_id uuid;
  v_org uuid;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_key IN ('updated_at', 'created_at') THEN
        CONTINUE;
      END IF;
      v_old_val := v_old_record -> v_key;
      v_new_val := v_new_record -> v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_val, 'new', v_new_val)
        );
      END IF;
    END LOOP;
    IF v_changed_fields = '{}' THEN
      RETURN NEW;
    END IF;
  END IF;

  v_org := coalesce((v_new_record ->> 'org_id')::uuid, (v_old_record ->> 'org_id')::uuid);
  -- A company being deleted takes its rates with it (ON DELETE CASCADE):
  -- there is no one left to read that trail, and no organisation to file it
  -- under.
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  INSERT INTO public.rate_audit_log (table_name, record_id, action, changed_fields, full_old_record, full_new_record, changed_by, org_id)
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    CASE WHEN v_changed_fields = '{}' THEN NULL ELSE v_changed_fields END,
    v_old_record,
    v_new_record,
    public.fn_rate_audit_actor(),
    v_org
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_rate_audit_trigger() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  trg text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
    'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts', 'rate_audit_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
    -- Tables with a service code are indexed by (org_id, service_code), below.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'service_code') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', 'idx_' || t || '_org', t);
    END IF;
    FOREACH trg IN ARRAY ARRAY['set_updated_at', 'trg_audit_' || t] LOOP
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = trg) THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', t, trg);
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.entrance_fee_versions') AND tgname = 'set_updated_at') THEN
    ALTER TABLE public.entrance_fee_versions ENABLE TRIGGER set_updated_at;
  END IF;

  -- Service codes, per company (literal statements: __tests__/migrations/
  -- bulk-upsert-keys.test.ts reads them — the importer's ON CONFLICT
  -- (org_id, service_code) needs exactly these).
  IF to_regclass('public.accommodation_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accommodation_rates_org_id_service_code_key') THEN
    ALTER TABLE public.accommodation_rates ADD CONSTRAINT accommodation_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.activity_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_rates_org_id_service_code_key') THEN
    ALTER TABLE public.activity_rates ADD CONSTRAINT activity_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.airport_staff_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'airport_staff_rates_org_id_service_code_key') THEN
    ALTER TABLE public.airport_staff_rates ADD CONSTRAINT airport_staff_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.hotel_staff_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotel_staff_rates_org_id_service_code_key') THEN
    ALTER TABLE public.hotel_staff_rates ADD CONSTRAINT hotel_staff_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.guide_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guide_rates_org_id_service_code_key') THEN
    ALTER TABLE public.guide_rates ADD CONSTRAINT guide_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.meal_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_rates_org_id_service_code_key') THEN
    ALTER TABLE public.meal_rates ADD CONSTRAINT meal_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.flight_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_rates_org_id_service_code_key') THEN
    ALTER TABLE public.flight_rates ADD CONSTRAINT flight_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.train_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'train_rates_org_id_service_code_key') THEN
    ALTER TABLE public.train_rates ADD CONSTRAINT train_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.sleeping_train_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sleeping_train_rates_org_id_service_code_key') THEN
    ALTER TABLE public.sleeping_train_rates ADD CONSTRAINT sleeping_train_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.transportation_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transportation_rates_org_id_service_code_key') THEN
    ALTER TABLE public.transportation_rates ADD CONSTRAINT transportation_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.tipping_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipping_rates_org_id_service_code_key') THEN
    ALTER TABLE public.tipping_rates ADD CONSTRAINT tipping_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.entrance_fees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entrance_fees_org_id_service_code_key') THEN
    ALTER TABLE public.entrance_fees ADD CONSTRAINT entrance_fees_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.service_fees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_fees_org_id_service_code_key') THEN
    ALTER TABLE public.service_fees ADD CONSTRAINT service_fees_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_rate_audit_log_org_changed ON public.rate_audit_log (org_id, changed_at DESC);
  END IF;
  IF to_regclass('public.guide_rates') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_guide_rates_natural_key ON public.guide_rates
      (org_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language, guide_type, tour_duration, COALESCE(city, ''::character varying));
  END IF;
  IF to_regclass('public.nile_cruises') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nile_cruises_org_id_cruise_code_key') THEN
    ALTER TABLE public.nile_cruises ADD CONSTRAINT nile_cruises_org_id_cruise_code_key UNIQUE (org_id, cruise_code);
  END IF;
  IF to_regclass('public.fixed_daily_costs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fixed_daily_costs_org_id_cost_type_key') THEN
    ALTER TABLE public.fixed_daily_costs ADD CONSTRAINT fixed_daily_costs_org_id_cost_type_key UNIQUE (org_id, cost_type);
  END IF;
  IF to_regclass('public.vehicles') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_org_id_license_plate_key') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_org_id_license_plate_key UNIQUE (org_id, license_plate);
  END IF;
  IF to_regclass('public.attraction_aliases') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attraction_aliases_org_id_alias_key') THEN
    ALTER TABLE public.attraction_aliases ADD CONSTRAINT attraction_aliases_org_id_alias_key UNIQUE (org_id, alias);
  END IF;
  IF to_regclass('public.destinations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destinations_org_id_country_code_key') THEN
    ALTER TABLE public.destinations ADD CONSTRAINT destinations_org_id_country_code_key UNIQUE (org_id, country_code);
  END IF;
  IF to_regclass('public.b2b_transport_packages') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'b2b_transport_packages_org_id_package_code_key') THEN
    ALTER TABLE public.b2b_transport_packages ADD CONSTRAINT b2b_transport_packages_org_id_package_code_key UNIQUE (org_id, package_code);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  p text;
BEGIN
  -- Every (true) policy, by table.
  FOR t, p IN
    SELECT * FROM (VALUES
      ('accommodation_rates', 'accommodation_rates_authenticated_all'),
      ('activity_rates', 'activity_rates_authenticated_all'),
      ('airport_staff_rates', 'airport_staff_rates_authenticated_all'),
      ('hotel_staff_rates', 'hotel_staff_rates_authenticated_all'),
      ('guide_rates', 'guide_rates_authenticated_all'),
      ('meal_rates', 'meal_rates_authenticated_all'),
      ('nile_cruises', 'nile_cruises_authenticated_all'),
      ('tipping_rates', 'tipping_rates_authenticated_all'),
      ('transportation_rates', 'transportation_rates_authenticated_all'),
      ('entrance_fees', 'entrance_fees_authenticated_all'),
      ('entrance_fees', 'Allow authenticated read access'),
      ('flight_rates', 'Allow read access to flight_rates'),
      ('flight_rates', 'Allow insert for authenticated users'),
      ('flight_rates', 'Allow update for authenticated users'),
      ('flight_rates', 'Allow delete for authenticated users'),
      ('train_rates', 'Allow all for authenticated'),
      ('sleeping_train_rates', 'Allow all for authenticated'),
      ('cruise_contacts', 'Enable all access for authenticated users'),
      ('assistant_rates', 'assistant_rates_authenticated'),
      ('seasonal_rates', 'seasonal_rates_authenticated'),
      ('vehicle_rates', 'vehicle_rates_authenticated'),
      ('fixed_daily_costs', 'fixed_daily_costs_authenticated'),
      ('hotel_contacts', 'hotel_contacts_authenticated'),
      ('restaurant_contacts', 'restaurant_contacts_authenticated'),
      ('service_fees', 'service_fees_authenticated'),
      ('vehicles', 'vehicles_authenticated'),
      ('attraction_aliases', 'Allow authenticated read'),
      ('attraction_aliases', 'Allow authenticated insert'),
      ('attraction_aliases', 'Allow authenticated update'),
      ('attraction_aliases', 'Allow authenticated delete'),
      ('destinations', 'destinations_read'),
      ('extras_catalogue', 'extras_catalogue_authenticated_all'),
      ('b2b_transport_packages', 'b2b_transport_packages_authenticated'),
      ('rate_audit_log', 'Authenticated users can read audit log'),
      ('entrance_fee_versions', 'entrance_fee_versions_authenticated'),
      ('destination_cities', 'destination_cities_read'),
      ('b2b_partner_pricing', 'b2b_partner_pricing_authenticated')
    ) AS v(t, p)
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END IF;
  END LOOP;

  -- ROOT tables: your company's rows; writes manager-and-above.
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
    'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts',
    'extras_catalogue', 'b2b_transport_packages'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above()) WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_delete', t);
  END LOOP;

  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS rate_audit_log_org_select ON public.rate_audit_log;
    CREATE POLICY rate_audit_log_org_select ON public.rate_audit_log FOR SELECT TO authenticated
      USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  END IF;

  -- CHILD tables: their parent's company.
  IF to_regclass('public.entrance_fee_versions') IS NOT NULL THEN
    DROP POLICY IF EXISTS entrance_fee_versions_org_select ON public.entrance_fee_versions;
    DROP POLICY IF EXISTS entrance_fee_versions_org_write ON public.entrance_fee_versions;
    CREATE POLICY entrance_fee_versions_org_select ON public.entrance_fee_versions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.entrance_fees f WHERE f.id = entrance_fee_id AND public.user_is_in_org(f.org_id)));
    CREATE POLICY entrance_fee_versions_org_write ON public.entrance_fee_versions FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.entrance_fees f WHERE f.id = entrance_fee_id AND public.user_is_in_org(f.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.entrance_fees f WHERE f.id = entrance_fee_id AND public.user_is_in_org(f.org_id)));
  END IF;
  IF to_regclass('public.destination_cities') IS NOT NULL THEN
    DROP POLICY IF EXISTS destination_cities_org_select ON public.destination_cities;
    CREATE POLICY destination_cities_org_select ON public.destination_cities FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = destination_id AND public.user_is_in_org(d.org_id)));
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL AND to_regclass('public.b2b_partners') IS NOT NULL THEN
    DROP POLICY IF EXISTS b2b_partner_pricing_org_select ON public.b2b_partner_pricing;
    DROP POLICY IF EXISTS b2b_partner_pricing_org_write ON public.b2b_partner_pricing;
    CREATE POLICY b2b_partner_pricing_org_select ON public.b2b_partner_pricing FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.b2b_partners p WHERE p.id = partner_id AND public.user_is_in_org(p.org_id)));
    CREATE POLICY b2b_partner_pricing_org_write ON public.b2b_partner_pricing FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.b2b_partners p WHERE p.id = partner_id AND public.user_is_in_org(p.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.b2b_partners p WHERE p.id = partner_id AND public.user_is_in_org(p.org_id)));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Dead objects; migration-only helpers
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.tour_overview;
ALTER TABLE IF EXISTS public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_primary_destination_id_fkey;
DROP TABLE IF EXISTS public.destinations_legacy_2025;
DROP TABLE IF EXISTS public.meal_costs;
DROP TABLE IF EXISTS public.outside_cairo_fees;
DROP TABLE IF EXISTS public.seasonal_adjustments;
DROP TABLE IF EXISTS public.transportation_contacts;
DROP TABLE IF EXISTS public.profit_margins;
DROP TABLE IF EXISTS public.discount_rules;
DROP TABLE IF EXISTS public.booking_rules;
DROP TABLE IF EXISTS public.package_type_definitions;

DROP FUNCTION IF EXISTS public.org_backfill_place_catalogue(text);
DROP FUNCTION IF EXISTS public.org_backfill_copy_for_each(text);
DROP FUNCTION IF EXISTS public.org_backfill_copy_catalogue_row(text, uuid, uuid, text);

COMMIT;
