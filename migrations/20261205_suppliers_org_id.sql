-- ============================================
-- Suppliers belong to one company: suppliers and supplier_properties get an
-- org_id; a supplier both companies use becomes one row per company
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and suppliers had no org_id, so every supplier was both
-- companies':
--   - /api/suppliers (list, detail, edit, delete, import, export), the guide,
--     airport-staff and hotel-staff screens, the supplier properties panel
--     and every picker listed, edited and deleted the other company's
--     guides, hotels, drivers and their bank details;
--   - supplier_code was unique across the install, so the second company
--     could not hold its own SUP-0001, and a code lookup (CSV rate import,
--     lib/suppliers/resolve-supplier.ts) linked a rate to the other
--     company's supplier;
--   - /api/supplier-rates returned the rates of ANY supplier id;
--   - the pricing engine and the AI service builder picked guides from
--     both companies.
-- And through PostgREST (RLS), with nothing but a session:
--   suppliers            "suppliers_authenticated_all" TO authenticated
--                        USING (true) WITH CHECK (true)        (20260829)
--   supplier_properties  "supplier_properties_authenticated_all" TO
--                        authenticated USING (true) WITH CHECK (true)
--                                                              (20260831)
-- Both dropped. In their place:
--   select               user_is_in_org(org_id) — the itinerary editor reads
--                        suppliers in the browser (app/itineraries/[id]/edit)
--                        and agents open trips;
--   insert/update/delete user_is_in_org(org_id) AND is_manager_or_above() —
--                        the suppliers screen is manager-and-above.
-- (Every other caller is an API route on the service role, which RLS does
-- not apply to; these are the second wall.) The views airport_staff, guides
-- and hotel_staff are security_invoker, so they inherit the suppliers
-- policies.
--
-- WHAT THIS DOES.
--   suppliers.org_id     REFERENCES organizations ON DELETE CASCADE, NOT
--                        NULL, no DEFAULT (the code stamps it).
--   supplier_properties.org_id
--                        denormalised from its supplier — a BEFORE INSERT/
--                        UPDATE trigger sets it from the supplier every
--                        time, so a property can never sit in another
--                        company than its supplier.
--   supplier_code        UNIQUE (supplier_code) → UNIQUE (org_id,
--                        supplier_code): both companies can hold SUP-0001.
--                        suppliers_assign_code() (20261029) still mints from
--                        the ONE shared sequence suppliers_code_seq (so a
--                        number is never handed out twice, and a deleted
--                        supplier's code is never reused for another — the
--                        code is a business key other installs link rates
--                        by), but "is this code taken?" is now asked within
--                        the new row's company. A company's numbers are
--                        therefore not consecutive; they are unique within it.
--   views                airport_staff, guides and hotel_staff expose
--                        org_id; their INSTEAD OF triggers stamp it on insert
--                        (from the row given — the routes pass the caller's
--                        company) and never change it on update. hotel_staff
--                        had NO instead-of triggers: an insert through it
--                        failed (is_active is computed, type has no default)
--                        so /api/resources/hotel-staff POST never worked; it
--                        gets the same three triggers as airport_staff here.
--                        guides_view_insert never set types, so the
--                        type-in-types check refused every insert through it;
--                        it sets types now. airport_staff_view_delete
--                        removed the role before deleting, leaving a
--                        single-role row with a NULL type that NOT NULL
--                        refused — no airport assistant could be deleted;
--                        it deletes first now (hotel_staff the same).
--   copy maps            org_backfill_supplier_copies (original_id, copy_id,
--                        org_id) and org_backfill_property_copies, filled
--                        below. Migration 20261206 (rate tables) reads them
--                        to point each company's rates at its own copy. RLS
--                        on, no policy: service role and the SQL editor only.
--
-- BACKFILL — every supplier goes to the company that uses it. Helpers from
-- 20261202 (org_backfill_*). For each supplier, the set of companies of the
-- rows that point at it (each row's own org_id, or its parent's):
--     expenses.supplier_id, supplier_invoices.supplier_id,
--     supplier_documents.supplier_id, booking_extras.supplier_id,
--     commissions.supplier_id, extras_catalogue.supplier_id,
--     itineraries.assigned_guide_id / assigned_airport_staff_id /
--       assigned_hotel_staff_id, bookings.assigned_guide_id (no FK, but it
--       holds a supplier id — app/api/bookings/[id]),
--     itinerary_services.supplier_id / sold_by_supplier_id (→ itinerary_days
--       → itineraries.org_id),
--     itinerary_resources.resource_id where it is a supplier (guide,
--       airport_staff, hotel_staff assignments; → itineraries.org_id),
--     booking_supplier_status.supplier_id (→ bookings.org_id).
--   (b2b_partners has no supplier column — nothing to trace there.)
--   1. exactly one company uses it → that company.
--   2. BOTH companies use it → COPIED. The original stays with the company
--      that uses it MOST (count of the rows above); a tie goes to the
--      catalogue default (ATS), then the lower org id. A copy (same fields,
--      same supplier_code — the code is unique per company now, and keeping
--      it lets the other company's existing CSV exports still link; new id)
--      is made for each other company, with copies of its supplier_properties,
--      and that company's rows above are pointed at its copy. Original and
--      copy are listed in review: 'used by both companies — copied'.
--   3. nobody uses it → the companies of whoever CREATED its rates: INSERT
--      rows of rate_audit_log (only INSERTs — the service-role EUR→USD
--      cut-over wrote UPDATEs) for the rate tables' supplier_id, changed_by
--      → org_backfill_user_org (a person in both companies counts for
--      neither). One company → that company; both → copied as in 2.
--   4. still nothing → the catalogue default (ATS — the catalogue is mostly
--      ATS's, decided 2026-10-12) + review: 'no trip, booking, expense, bill,
--      document or rate creator traces it — catalogue default'.
--   supplier_properties: the supplier's company.
-- Rate rows are NOT touched here: a rate of a copied supplier still points
-- at the original. 20261206 assigns the rates and repoints them through the
-- copy maps.
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name = 'suppliers' ORDER BY id;
--   SELECT * FROM org_backfill_supplier_copies;
--
-- DEPLOY ORDER: apply this migration FIRST, then deploy the code. The code
-- selects, filters and inserts suppliers.org_id and fails without it. Between
-- the migration and the deploy the old code inserts suppliers without an
-- org_id, which NOT NULL refuses — deploy promptly.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS; the backfill plans
-- only suppliers still without an org; copies are made only where the copy
-- map has none; repointing only moves rows still pointing at another
-- company's original; review rows ON CONFLICT DO NOTHING; policies dropped
-- before created; every table and column guarded. On a bare replay (no
-- organisations) nothing is written.
BEGIN;

-- pg_temp helpers for this migration only.
CREATE OR REPLACE FUNCTION pg_temp.has_col(t text, c text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = c)
$$;
CREATE OR REPLACE FUNCTION pg_temp.set_trigger(t text, trg text, enabled boolean) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || t) IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = trg) THEN
    EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I', t, CASE WHEN enabled THEN 'ENABLE' ELSE 'DISABLE' END, trg);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Columns, copy maps, the per-company code
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    ALTER TABLE public.supplier_properties ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- supplier_code is unique per company from here on (a copy keeps its
-- original's code).
DROP INDEX IF EXISTS public.suppliers_supplier_code_key;

CREATE TABLE IF NOT EXISTS public.org_backfill_supplier_copies (
  original_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  copy_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (original_id, org_id)
);
ALTER TABLE public.org_backfill_supplier_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_supplier_copies FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS public.org_backfill_property_copies (
      original_id uuid NOT NULL REFERENCES public.supplier_properties(id) ON DELETE CASCADE,
      copy_id uuid NOT NULL REFERENCES public.supplier_properties(id) ON DELETE CASCADE,
      org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (original_id, org_id)
    );
    ALTER TABLE public.org_backfill_property_copies ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.org_backfill_property_copies FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

-- The code trigger of 20261029, with "taken" asked within the row's company.
-- Same contract otherwise: mint when blank, never blank a code on update,
-- an explicit SUP-#### fast-forwards the shared sequence past itself.
CREATE OR REPLACE FUNCTION public.suppliers_assign_code()
RETURNS trigger AS $$
DECLARE
  candidate  text;
  spent      bigint;
  seq_last   bigint;
  seq_called boolean;
  attempts   integer := 0;
BEGIN
  IF NEW.supplier_code IS NULL OR btrim(NEW.supplier_code) = '' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.supplier_code := OLD.supplier_code;
      RETURN NEW;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'suppliers_assign_code: no free supplier code after % attempts', attempts;
      END IF;
      candidate := 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.suppliers
         WHERE supplier_code = candidate AND org_id IS NOT DISTINCT FROM NEW.org_id
      );
    END LOOP;

    NEW.supplier_code := candidate;
    RETURN NEW;
  END IF;

  IF NEW.supplier_code ~ '^SUP-[0-9]+$' THEN
    spent := substring(NEW.supplier_code from 5)::bigint;
    SELECT last_value, is_called INTO seq_last, seq_called
      FROM public.suppliers_code_seq;
    IF spent > seq_last OR (spent = seq_last AND NOT seq_called) THEN
      PERFORM setval('public.suppliers_code_seq', spent, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sup_use (supplier_id uuid NOT NULL, org_id uuid NOT NULL, signal text NOT NULL) ON COMMIT DROP;

DO $$
DECLARE
  dflt uuid;
  cat uuid;
  spec text[];
  tbl text;
  col text;
  cols text;
  pcols text;
  rec record;
  new_id uuid;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF dflt IS NULL OR cat IS NULL THEN
    RAISE NOTICE 'suppliers: no organisations — nothing to backfill';
    RETURN;
  END IF;

  -- The backfill must not stamp every row as just edited, nor recompute a
  -- trip's totals because a service's supplier id moved to the copy.
  PERFORM pg_temp.set_trigger('suppliers', 'set_updated_at', false);
  PERFORM pg_temp.set_trigger('suppliers', 'update_suppliers_timestamp', false);

  -- 1–2. Who uses each supplier still without a company.
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'supplier_id'],
    ARRAY['supplier_invoices', 'supplier_id'],
    ARRAY['supplier_documents', 'supplier_id'],
    ARRAY['booking_extras', 'supplier_id'],
    ARRAY['commissions', 'supplier_id'],
    ARRAY['extras_catalogue', 'supplier_id'],
    ARRAY['itineraries', 'assigned_guide_id'],
    ARRAY['itineraries', 'assigned_airport_staff_id'],
    ARRAY['itineraries', 'assigned_hotel_staff_id'],
    ARRAY['bookings', 'assigned_guide_id']
  ] LOOP
    tbl := spec[1];
    col := spec[2];
    IF NOT pg_temp.has_col(tbl, col) OR NOT pg_temp.has_col(tbl, 'org_id') THEN CONTINUE; END IF;
    EXECUTE format($f$
      INSERT INTO _sup_use (supplier_id, org_id, signal)
      SELECT s.id, r.org_id, 'use'
        FROM public.%1$I r JOIN public.suppliers s ON s.id = r.%2$I
       WHERE r.org_id IS NOT NULL AND s.org_id IS NULL
    $f$, tbl, col);
  END LOOP;

  IF pg_temp.has_col('itinerary_services', 'itinerary_day_id') AND to_regclass('public.itinerary_days') IS NOT NULL THEN
    FOREACH col IN ARRAY ARRAY['supplier_id', 'sold_by_supplier_id'] LOOP
      IF NOT pg_temp.has_col('itinerary_services', col) THEN CONTINUE; END IF;
      EXECUTE format($f$
        INSERT INTO _sup_use (supplier_id, org_id, signal)
        SELECT s.id, i.org_id, 'use'
          FROM public.itinerary_services r
          JOIN public.itinerary_days d ON d.id = r.itinerary_day_id
          JOIN public.itineraries i ON i.id = d.itinerary_id
          JOIN public.suppliers s ON s.id = r.%1$I
         WHERE i.org_id IS NOT NULL AND s.org_id IS NULL
      $f$, col);
    END LOOP;
  END IF;

  IF pg_temp.has_col('itinerary_resources', 'resource_id') THEN
    INSERT INTO _sup_use (supplier_id, org_id, signal)
    SELECT s.id, i.org_id, 'use'
      FROM public.itinerary_resources r
      JOIN public.itineraries i ON i.id = r.itinerary_id
      JOIN public.suppliers s ON s.id = r.resource_id
     WHERE i.org_id IS NOT NULL AND s.org_id IS NULL;
  END IF;

  IF pg_temp.has_col('booking_supplier_status', 'supplier_id') THEN
    INSERT INTO _sup_use (supplier_id, org_id, signal)
    SELECT s.id, b.org_id, 'use'
      FROM public.booking_supplier_status r
      JOIN public.bookings b ON b.id = r.booking_id
      JOIN public.suppliers s ON s.id = r.supplier_id
     WHERE b.org_id IS NOT NULL AND s.org_id IS NULL;
  END IF;

  -- 3. Nobody uses it: who created its rates (INSERT rows only).
  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    FOREACH tbl IN ARRAY ARRAY[
      'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'assistant_rates',
      'entrance_fees', 'flight_rates', 'guide_rates', 'hotel_staff_rates', 'meal_rates',
      'nile_cruises', 'seasonal_rates', 'sleeping_train_rates', 'train_rates',
      'transportation_rates', 'vehicle_rates'
    ] LOOP
      IF NOT pg_temp.has_col(tbl, 'supplier_id') THEN CONTINUE; END IF;
      EXECUTE format($f$
        INSERT INTO _sup_use (supplier_id, org_id, signal)
        SELECT s.id, public.org_backfill_user_org(l.changed_by), 'rate'
          FROM public.%1$I r
          JOIN public.suppliers s ON s.id = r.supplier_id
          JOIN public.rate_audit_log l ON l.table_name = %1$L AND l.record_id = r.id AND l.action = 'INSERT'
         WHERE s.org_id IS NULL AND l.changed_by IS NOT NULL
           AND public.org_backfill_user_org(l.changed_by) IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM _sup_use u WHERE u.supplier_id = s.id AND u.signal = 'use')
      $f$, tbl);
    END LOOP;
  END IF;

  -- The plan: per supplier, its companies ranked — most rows first, a tie to
  -- the catalogue default, then the lower id. Rank 1 keeps the original;
  -- every other company gets a copy.
  CREATE TEMP TABLE _sup_plan ON COMMIT DROP AS
  SELECT supplier_id, org_id, n,
         row_number() OVER (PARTITION BY supplier_id ORDER BY n DESC, (org_id = cat) DESC, org_id::text) AS rnk,
         count(*) OVER (PARTITION BY supplier_id) AS orgs
    FROM (SELECT supplier_id, org_id, count(*) AS n FROM _sup_use GROUP BY supplier_id, org_id) g;

  UPDATE public.suppliers s SET org_id = p.org_id
    FROM _sup_plan p
   WHERE p.supplier_id = s.id AND p.rnk = 1 AND s.org_id IS NULL;

  -- 4. Nothing traces it: the catalogue default, listed.
  WITH filled AS (
    UPDATE public.suppliers SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'suppliers', id::text, cat, 'no trip, booking, expense, bill, document or rate creator traces it — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- supplier_properties: the supplier's company.
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    UPDATE public.supplier_properties sp SET org_id = s.org_id
      FROM public.suppliers s
     WHERE s.id = sp.supplier_id AND sp.org_id IS DISTINCT FROM s.org_id;
  END IF;

  -- 2. Copies for every other company that uses it.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name NOT IN ('id', 'org_id')
     AND is_generated = 'NEVER';
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO pcols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'supplier_properties'
       AND column_name NOT IN ('id', 'org_id', 'supplier_id') AND is_generated = 'NEVER';
  END IF;

  FOR rec IN
    SELECT p.supplier_id, p.org_id
      FROM _sup_plan p
     WHERE p.rnk > 1
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_supplier_copies m
                        WHERE m.original_id = p.supplier_id AND m.org_id = p.org_id)
     ORDER BY p.supplier_id, p.rnk
  LOOP
    EXECUTE format('INSERT INTO public.suppliers (org_id, %1$s) SELECT $1, %1$s FROM public.suppliers WHERE id = $2 RETURNING id', cols)
      INTO new_id USING rec.org_id, rec.supplier_id;
    INSERT INTO public.org_backfill_supplier_copies (original_id, copy_id, org_id)
    VALUES (rec.supplier_id, new_id, rec.org_id);
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'suppliers', s.id::text, s.org_id, 'used by both companies — copied'
      FROM public.suppliers s WHERE s.id IN (rec.supplier_id, new_id)
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;

    IF pcols IS NOT NULL THEN
      EXECUTE format($f$
        WITH src AS (
          SELECT id, %1$s FROM public.supplier_properties WHERE supplier_id = $1
        ), ins AS (
          INSERT INTO public.supplier_properties (supplier_id, org_id, %1$s)
          SELECT $2, $3, %1$s FROM src ORDER BY id
          RETURNING id, property_type, name
        )
        INSERT INTO public.org_backfill_property_copies (original_id, copy_id, org_id)
        SELECT src.id, ins.id, $3
          FROM src JOIN ins ON ins.property_type = src.property_type AND ins.name = src.name
      $f$, pcols) USING rec.supplier_id, new_id, rec.org_id;
    END IF;
  END LOOP;

  PERFORM pg_temp.set_trigger('suppliers', 'set_updated_at', true);
  PERFORM pg_temp.set_trigger('suppliers', 'update_suppliers_timestamp', true);
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's rows point at its own copy (runs on every replay: it only
-- moves rows still pointing at another company's original).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
  tbl text;
  col text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_backfill_supplier_copies) THEN RETURN; END IF;

  -- The repoint is not an edit: no updated_at bump, no totals recompute.
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'set_updated_at'], ARRAY['supplier_invoices', 'set_updated_at'],
    ARRAY['supplier_documents', 'set_updated_at'], ARRAY['supplier_documents', 'supplier_documents_updated_at'],
    ARRAY['commissions', 'set_updated_at'], ARRAY['commissions', 'update_commissions_timestamp'],
    ARRAY['itineraries', 'set_updated_at'], ARRAY['bookings', 'set_updated_at'],
    ARRAY['itinerary_resources', 'set_updated_at'], ARRAY['booking_supplier_status', 'set_updated_at'],
    ARRAY['itinerary_services', 'trg_recalc_on_service_update']
  ] LOOP
    PERFORM pg_temp.set_trigger(spec[1], spec[2], false);
  END LOOP;

  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'supplier_id'],
    ARRAY['supplier_invoices', 'supplier_id'],
    ARRAY['supplier_documents', 'supplier_id'],
    ARRAY['booking_extras', 'supplier_id'],
    ARRAY['commissions', 'supplier_id'],
    ARRAY['extras_catalogue', 'supplier_id'],
    ARRAY['itineraries', 'assigned_guide_id'],
    ARRAY['itineraries', 'assigned_airport_staff_id'],
    ARRAY['itineraries', 'assigned_hotel_staff_id'],
    ARRAY['bookings', 'assigned_guide_id']
  ] LOOP
    tbl := spec[1];
    col := spec[2];
    IF NOT pg_temp.has_col(tbl, col) OR NOT pg_temp.has_col(tbl, 'org_id') THEN CONTINUE; END IF;
    EXECUTE format($f$
      UPDATE public.%1$I r SET %2$I = m.copy_id
        FROM public.org_backfill_supplier_copies m
       WHERE r.%2$I = m.original_id AND r.org_id = m.org_id
    $f$, tbl, col);
  END LOOP;

  IF pg_temp.has_col('itinerary_services', 'itinerary_day_id') AND to_regclass('public.itinerary_days') IS NOT NULL THEN
    FOREACH col IN ARRAY ARRAY['supplier_id', 'sold_by_supplier_id'] LOOP
      IF NOT pg_temp.has_col('itinerary_services', col) THEN CONTINUE; END IF;
      EXECUTE format($f$
        UPDATE public.itinerary_services r SET %1$I = m.copy_id
          FROM public.itinerary_days d, public.itineraries i, public.org_backfill_supplier_copies m
         WHERE d.id = r.itinerary_day_id AND i.id = d.itinerary_id
           AND r.%1$I = m.original_id AND m.org_id = i.org_id
      $f$, col);
    END LOOP;
  END IF;

  IF pg_temp.has_col('itinerary_resources', 'resource_id') THEN
    UPDATE public.itinerary_resources r SET resource_id = m.copy_id
      FROM public.itineraries i, public.org_backfill_supplier_copies m
     WHERE i.id = r.itinerary_id AND r.resource_id = m.original_id AND m.org_id = i.org_id;
  END IF;

  IF pg_temp.has_col('booking_supplier_status', 'supplier_id') THEN
    UPDATE public.booking_supplier_status r SET supplier_id = m.copy_id
      FROM public.bookings b, public.org_backfill_supplier_copies m
     WHERE b.id = r.booking_id AND r.supplier_id = m.original_id AND m.org_id = b.org_id;
  END IF;

  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'set_updated_at'], ARRAY['supplier_invoices', 'set_updated_at'],
    ARRAY['supplier_documents', 'set_updated_at'], ARRAY['supplier_documents', 'supplier_documents_updated_at'],
    ARRAY['commissions', 'set_updated_at'], ARRAY['commissions', 'update_commissions_timestamp'],
    ARRAY['itineraries', 'set_updated_at'], ARRAY['bookings', 'set_updated_at'],
    ARRAY['itinerary_resources', 'set_updated_at'], ARRAY['booking_supplier_status', 'set_updated_at'],
    ARRAY['itinerary_services', 'trg_recalc_on_service_update']
  ] LOOP
    PERFORM pg_temp.set_trigger(spec[1], spec[2], true);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, the per-company code, the property's company
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'supplier_properties'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_code_key ON public.suppliers (org_id, supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_name ON public.suppliers (org_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_types ON public.suppliers USING gin (types) WHERE org_id IS NOT NULL;

-- A property is always in its supplier's company: set from the supplier on
-- every insert and every change of supplier, whatever the caller sent. As
-- the invoking role (not definer): through PostgREST a user who cannot see
-- the supplier gets NULL here, which NOT NULL refuses.
CREATE OR REPLACE FUNCTION public.supplier_properties_org_from_supplier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.org_id := (SELECT s.org_id FROM public.suppliers s WHERE s.id = NEW.supplier_id);
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_properties_org ON public.supplier_properties (org_id, supplier_id);
    DROP TRIGGER IF EXISTS supplier_properties_org_from_supplier ON public.supplier_properties;
    CREATE TRIGGER supplier_properties_org_from_supplier
      BEFORE INSERT OR UPDATE OF supplier_id, org_id ON public.supplier_properties
      FOR EACH ROW EXECUTE FUNCTION public.supplier_properties_org_from_supplier();
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The staff views: org_id exposed, stamped on insert, kept on update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.airport_staff WITH (security_invoker='on') AS
 SELECT id,
    name,
    service_role AS role,
    airport_location,
    contact_phone AS phone,
    whatsapp,
    contact_email AS email,
    languages,
    shift_times,
    notes,
    ((status)::text = 'active'::text) AS is_active,
    created_at,
    updated_at,
    emergency_contact_name AS emergency_contact,
    tier,
    is_preferred,
    org_id
   FROM public.suppliers
  WHERE ('airport_assistant'::text = ANY (types));

CREATE OR REPLACE VIEW public.guides WITH (security_invoker='on') AS
 SELECT id,
    name,
    contact_email AS email,
    contact_phone AS phone,
    languages,
    specialties,
    certification_number,
    license_expiry,
    ((status)::text = 'active'::text) AS is_active,
    max_group_size,
    hourly_rate,
    daily_rate,
    emergency_contact_name,
    emergency_contact_phone,
    address,
    notes,
    profile_photo_url,
    created_at,
    updated_at,
    tier,
    is_preferred,
    city,
    whatsapp,
    org_id
   FROM public.suppliers
  WHERE ('guide'::text = ANY (types));

CREATE OR REPLACE VIEW public.hotel_staff WITH (security_invoker='on') AS
 SELECT id,
    name,
    service_role AS role,
    contact_phone AS phone,
    whatsapp,
    contact_email AS email,
    languages,
    shift_times,
    notes,
    ((status)::text = 'active'::text) AS is_active,
    created_at,
    updated_at,
    emergency_contact_name AS emergency_contact,
    tier,
    is_preferred,
    org_id
   FROM public.suppliers
  WHERE ('hotel_assistant'::text = ANY (types));

CREATE OR REPLACE FUNCTION public.airport_staff_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, org_id, name, type, types, entity_kind, status, service_role, airport_location,
    contact_phone, whatsapp, contact_email, languages, shift_times, notes,
    emergency_contact_name, tier, is_preferred, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.org_id, NEW.name, 'airport_assistant',
    ARRAY['airport_assistant'], 'individual',
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.role, NEW.airport_location, NEW.phone, NEW.whatsapp, NEW.email,
    NEW.languages, NEW.shift_times, NEW.notes, NEW.emergency_contact,
    NEW.tier, COALESCE(NEW.is_preferred, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

-- The company is never changed through the view: an update addresses the
-- row it was given, in the company it is in.
CREATE OR REPLACE FUNCTION public.airport_staff_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                   = NEW.name,
    service_role           = NEW.role,
    airport_location       = NEW.airport_location,
    contact_phone          = NEW.phone,
    whatsapp               = NEW.whatsapp,
    contact_email          = NEW.email,
    languages              = NEW.languages,
    shift_times            = NEW.shift_times,
    notes                  = NEW.notes,
    emergency_contact_name = NEW.emergency_contact,
    tier                   = NEW.tier,
    is_preferred           = NEW.is_preferred,
    status                 = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    updated_at             = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'airport_assistant' = ANY(types);
  NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.airport_staff_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Staff and nothing else: the supplier goes. Staff among other roles:
  -- only this role goes. (Before, the role was removed first, which left a
  -- single-role row with no type — refused by NOT NULL, so no airport staff
  -- member could ever be deleted.)
  DELETE FROM public.suppliers
   WHERE id = OLD.id AND org_id = OLD.org_id AND (types IS NULL OR types <@ ARRAY['airport_assistant']);
  UPDATE public.suppliers
  SET types = array_remove(types, 'airport_assistant'),
      type = CASE WHEN type = 'airport_assistant'
                  THEN (array_remove(types, 'airport_assistant'))[1]
                  ELSE type END,
      updated_at = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'airport_assistant' = ANY(types);
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, org_id, type, types, entity_kind, name, contact_email, contact_phone, languages,
    specialties, certification_number, license_expiry, status, max_group_size,
    hourly_rate, daily_rate, emergency_contact_name, emergency_contact_phone,
    address, notes, profile_photo_url, tier, is_preferred, city, whatsapp,
    created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.org_id, 'guide', ARRAY['guide'], 'individual', NEW.name,
    NEW.email, NEW.phone, NEW.languages, NEW.specialties, NEW.certification_number,
    NEW.license_expiry,
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.max_group_size, NEW.hourly_rate, NEW.daily_rate, NEW.emergency_contact_name,
    NEW.emergency_contact_phone, NEW.address, NEW.notes, NEW.profile_photo_url,
    NEW.tier, COALESCE(NEW.is_preferred, false), NEW.city, NEW.whatsapp,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                    = NEW.name,
    contact_email           = NEW.email,
    contact_phone           = NEW.phone,
    languages               = NEW.languages,
    specialties             = NEW.specialties,
    certification_number    = NEW.certification_number,
    license_expiry          = NEW.license_expiry,
    status                  = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    max_group_size          = NEW.max_group_size,
    hourly_rate             = NEW.hourly_rate,
    daily_rate              = NEW.daily_rate,
    emergency_contact_name  = NEW.emergency_contact_name,
    emergency_contact_phone = NEW.emergency_contact_phone,
    address                 = NEW.address,
    notes                   = NEW.notes,
    profile_photo_url       = NEW.profile_photo_url,
    tier                    = NEW.tier,
    is_preferred            = NEW.is_preferred,
    city                    = NEW.city,
    whatsapp                = NEW.whatsapp,
    updated_at              = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND type = 'guide';
  NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM public.suppliers WHERE id = OLD.id AND org_id = OLD.org_id AND type = 'guide';
  RETURN OLD;
END $$;

-- hotel_staff: the airport_staff triggers, for hotel assistants.
CREATE OR REPLACE FUNCTION public.hotel_staff_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, org_id, name, type, types, entity_kind, status, service_role,
    contact_phone, whatsapp, contact_email, languages, shift_times, notes,
    emergency_contact_name, tier, is_preferred, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.org_id, NEW.name, 'hotel_assistant',
    ARRAY['hotel_assistant'], 'individual',
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.role, NEW.phone, NEW.whatsapp, NEW.email,
    COALESCE(NEW.languages, '{}'), NEW.shift_times, NEW.notes, NEW.emergency_contact,
    NEW.tier, COALESCE(NEW.is_preferred, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hotel_staff_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                   = NEW.name,
    service_role           = NEW.role,
    contact_phone          = NEW.phone,
    whatsapp               = NEW.whatsapp,
    contact_email          = NEW.email,
    languages              = NEW.languages,
    shift_times            = NEW.shift_times,
    notes                  = NEW.notes,
    emergency_contact_name = NEW.emergency_contact,
    tier                   = NEW.tier,
    is_preferred           = NEW.is_preferred,
    status                 = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    updated_at             = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'hotel_assistant' = ANY(types);
  NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hotel_staff_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Staff and nothing else: the supplier goes. Staff among other roles:
  -- only this role goes. (Before, the role was removed first, which left a
  -- single-role row with no type — refused by NOT NULL, so no airport staff
  -- member could ever be deleted.)
  DELETE FROM public.suppliers
   WHERE id = OLD.id AND org_id = OLD.org_id AND (types IS NULL OR types <@ ARRAY['hotel_assistant']);
  UPDATE public.suppliers
  SET types = array_remove(types, 'hotel_assistant'),
      type = CASE WHEN type = 'hotel_assistant'
                  THEN (array_remove(types, 'hotel_assistant'))[1]
                  ELSE type END,
      updated_at = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'hotel_assistant' = ANY(types);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS hotel_staff_view_insert_trg ON public.hotel_staff;
CREATE TRIGGER hotel_staff_view_insert_trg INSTEAD OF INSERT ON public.hotel_staff FOR EACH ROW EXECUTE FUNCTION public.hotel_staff_view_insert();
DROP TRIGGER IF EXISTS hotel_staff_view_update_trg ON public.hotel_staff;
CREATE TRIGGER hotel_staff_view_update_trg INSTEAD OF UPDATE ON public.hotel_staff FOR EACH ROW EXECUTE FUNCTION public.hotel_staff_view_update();
DROP TRIGGER IF EXISTS hotel_staff_view_delete_trg ON public.hotel_staff;
CREATE TRIGGER hotel_staff_view_delete_trg INSTEAD OF DELETE ON public.hotel_staff FOR EACH ROW EXECUTE FUNCTION public.hotel_staff_view_delete();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS suppliers_authenticated_all ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_select ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_insert ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_update ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_delete ON public.suppliers;
CREATE POLICY suppliers_org_select ON public.suppliers FOR SELECT TO authenticated
  USING (public.user_is_in_org(org_id));
CREATE POLICY suppliers_org_insert ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
CREATE POLICY suppliers_org_update ON public.suppliers FOR UPDATE TO authenticated
  USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
  WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
CREATE POLICY suppliers_org_delete ON public.suppliers FOR DELETE TO authenticated
  USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());

DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS supplier_properties_authenticated_all ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_select ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_insert ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_update ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_delete ON public.supplier_properties;
  CREATE POLICY supplier_properties_org_select ON public.supplier_properties FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id));
  CREATE POLICY supplier_properties_org_insert ON public.supplier_properties FOR INSERT TO authenticated
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY supplier_properties_org_update ON public.supplier_properties FOR UPDATE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY supplier_properties_org_delete ON public.supplier_properties FOR DELETE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
END
$$;

COMMIT;
