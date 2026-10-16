-- ============================================
-- Tours belong to one company: tour templates, their variations and the
-- legacy tours get an org_id; a template both companies use becomes one per
-- company
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and not one tour table had an org_id, so every programme was
-- both companies':
--   - /api/tours/** (the tour manager, browse, detail, versions, day builder,
--     variations and their services, bulk export / import) listed, edited and
--     deleted the other company's programmes; template_code and
--     variation_code were unique across the install, so a company could not
--     use a code the other had taken, and the bulk import (matched on
--     template_code) and scripts/import-programs.mjs (onConflict
--     'template_code') OVERWROTE the other company's programme when the codes
--     matched;
--   - DELETE /api/tours/templates/[id] deleted the other company's programme
--     with its variations, quotes' variation links and departures' links;
--   - /api/tours/recalculate-prices re-priced EVERY company's templates with
--     one company's rates and settings;
--   - the B2B calculator, quote builder, departures, the AI quote builder's
--     tour matcher, the website-order intake (lib/intake/process-order.ts)
--     and the programme itinerary document all read any company's template
--     by id or code.
-- And through PostgREST (RLS, OR'd: one USING (true) opens a table), quoted
-- from the baseline (20260829):
--   tour_templates            "tour_templates_authenticated_all" ALL TO
--                             authenticated USING (true) WITH CHECK (true)
--   tour_variations           "Enable read access for all users" SELECT TO
--                             anon, authenticated USING (true) — ANONYMOUS
--                             read of every programme's variations
--   tours, tour_days, tour_pricing, tour_template_versions,
--   tour_variation_services, tour_variation_versions,
--   variation_daily_itinerary, variation_pricing, variation_services
--                             "<table>_authenticated" ALL TO authenticated
--                             USING (true) WITH CHECK (true)
--   tour_day_activities       "Allow authenticated read/insert/update/
--                             delete" (true)
--   tour_categories, tour_availability, tour_reviews
--                             "<table>_authenticated" ALL (true)
--   tour_template_defaults    "Allow authenticated read/insert/update/delete
--                             defaults" (true)
-- All dropped. Nothing reads tour_variations anonymously: the public pages
-- (share links, the client portal, the order form) go through service-role
-- API routes. In their place:
--   tour_templates, tour_variations
--                             select user_is_in_org(org_id); insert/update/
--                             delete user_is_in_org(org_id) AND
--                             is_manager_or_above() (the tour manager is
--                             manager-and-above)
--   tours (legacy builder)    all user_is_in_org(org_id), as before (no role)
--   CHILD tables              their parent's company (EXISTS on the parent);
--                             writes to a template's / variation's children
--                             also need is_manager_or_above()
-- Every caller is an API route on the service role (RLS does not apply to
-- it); these are the second wall.
--
-- WHAT THIS DOES. org_id uuid REFERENCES organizations ON DELETE CASCADE (as
-- 20261205/20261206; no DEFAULT — the code stamps every insert), NOT NULL,
-- on tour_templates, tour_variations (denormalised from its template — the
-- variation routes, quotes and departures name a variation by id alone) and
-- tours (the legacy builder's root).
-- The CHILD tables get NO org_id; every reader reaches them through their
-- parent (the code checks the parent's company first, then reads the
-- children by the parent's id):
--   tour_template_versions, tour_day_activities  → tour_templates
--   tour_variation_versions, tour_variation_services,
--   variation_daily_itinerary, variation_pricing, variation_services
--                                                → tour_variations
--   tour_days, tour_pricing                      → tours
--
-- BACKFILL — helpers from 20261202. Each rule fills only rows still NULL.
--   tour_templates. "Used by" company X means a row of X that points at it:
--     itineraries.template_id; tour_departures.template_id, or its
--     variation_id's template; tour_quotes.variation_id's template;
--     b2b_partner_pricing.variation_id's template (the partner's company);
--     web_order_intakes.tour_code = template_code (the website order named
--     it). Then, in order:
--     1. used by exactly one company → that company
--     2. used by BOTH → the catalogue default (ATS) when it is one of them,
--        else the older company; COPIED for the other (below) — review:
--        'used by both companies — copied for the other'
--     3. nothing uses it, but it is plainly ATS's: website_url on
--        ats-hj.com, an ATS programme code (scripts/lib/program-code.mjs:
--        [airport][carrier][BZ?][days][seq][-type], e.g. NEK805-CR,
--        MSN-601), or a hotels list (only the ATS programme import writes
--        one) → ATS
--     4. nothing traces it → the catalogue default (ATS — decided
--        2026-10-12, the catalogue is mostly ATS's) — review: 'no trip,
--        departure, quote or web order — catalogue default'
--   COPY. A template another company uses is copied into that company: new
--   id, same template_code (codes are unique per company now), same
--   everything else, with its language versions, day-builder activities,
--   and every variation (same variation_code) with the variation's language
--   versions, services, daily itinerary, pricing and costed services. That
--   company's references are pointed at the copy: itineraries.template_id,
--   tour_departures.template_id / variation_id, tour_quotes.variation_id
--   (and the variation_id in its quote_revisions snapshots, so a revert
--   cannot bring the other company's variation back),
--   b2b_partner_pricing.variation_id, content_usage_log.variation_id (by its
--   itinerary's company). web_order_intakes and tour_departures.tour_code
--   need nothing: the copy keeps the code. Original and copy are listed:
--   'used by another company — copied'. Copies are recorded in
--   org_backfill_tour_copies (table_name, original_id, copy_id, org_id) —
--   RLS on, no policy: service role and the SQL editor only.
--   tour_variations. Its template's company. A variation with NO template:
--     the company of the quotes / departures / partner prices that use it;
--     used by both → copied as templates are; nothing → the catalogue
--     default — review: 'no template, quote, departure or partner price —
--     catalogue default'.
--   tours (the legacy tour builder: nothing else points at a tour) → the
--     catalogue default — every one listed: 'legacy tour — catalogue
--     default'.
--   ORPHANS. tour_days / tour_pricing rows with no tour_id, and
--   variation_daily_itinerary / variation_pricing / variation_services rows
--   with no variation_id, belong to nothing and no screen can reach them:
--   each is saved whole in org_backfill_tour_orphans (table_name, row_id,
--   row_data) — service role only — listed ('no parent — deleted') and
--   deleted; the column is then NOT NULL. A row WITH a parent is never
--   deleted.
--
-- RATES. tour_days.accommodation_id / lunch_meal_id / dinner_meal_id /
-- guide_id and tour_variation_services.rate_id must name a rate of THEIR
-- tour's company. One that names another company's rate is pointed at that
-- company's copy of it (org_backfill_rate_copies, 20261206: the copy made for
-- this company, or the original a copy was made from); with no copy it is
-- left and listed: 'rate belongs to another company'. Without 20261206 this
-- step is skipped.
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name IN ('tour_templates',
--     'tour_variations', 'tours', 'tour_days', 'tour_pricing',
--     'tour_variation_services', 'variation_daily_itinerary',
--     'variation_pricing', 'variation_services') ORDER BY id;
--   SELECT * FROM org_backfill_tour_copies ORDER BY table_name, original_id;
--   SELECT * FROM org_backfill_tour_orphans;
--
-- UNIQUE → PER COMPANY: tour_templates (template_code), tour_variations
-- (variation_code), tours (tour_code) → (org_id, …). The bulk import and
-- scripts/import-programs.mjs match on (org_id, template_code). Child
-- uniques ((template_id, language), (variation_id, day_number) …) stay —
-- their parent is one company's.
--
-- THEMES. tour_categories is retired (20261011 replaced it by the per-company
-- tour_theme vocabulary and tour_templates.theme_key; nothing writes a theme
-- through it). seed_tour_themes(p_org) copied every category into a new
-- company's vocabulary — one install-wide list, so a company's themes leaked
-- into the next company created; it now seeds a fixed default list. The
-- foreign key tour_templates_category_id_fkey, the column category_id (the
-- code no longer reads or writes it) and the table are dropped.
--
-- DEAD objects dropped (grep of app/ lib/ components/ hooks/ scripts/: no
-- reader or writer; only types/database.types.ts named them): tables
-- tour_template_defaults, tour_availability, tour_reviews; view
-- tour_templates_with_languages (tour_overview went in 20261206).
--
-- DEPLOY ORDER: apply 20261205, 20261206 and then this migration FIRST, then
-- deploy the code. The code filters and stamps org_id on these tables and
-- fails without it; the old code keeps reading on the new schema, but a
-- template, variation or tour it inserts has no org_id and fails NOT NULL —
-- deploy promptly. The old code also reads tour_categories, which is gone:
-- the tour list and detail return an error until the new code is deployed.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- NULLs, a copy is made only where none is recorded, review rows ON CONFLICT
-- DO NOTHING, policies dropped before created, tables guarded (to_regclass).
-- On a bare replay (no organisations) nothing is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_tour_copies (
  table_name text NOT NULL,
  original_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, original_id, org_id)
);
ALTER TABLE public.org_backfill_tour_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_tour_copies FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.org_backfill_tour_orphans (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);
ALTER TABLE public.org_backfill_tour_orphans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_tour_orphans FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns; the "updated" stamp off for the backfill (an assignment is not an
-- edit); global uniques dropped (a copy keeps its original's code).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours', 'tour_template_versions', 'tour_variation_versions',
                           'tour_variation_services', 'tour_day_activities', 'variation_pricing', 'variation_services'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at' AND tgenabled = 'O') THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;
END
$$;
ALTER TABLE IF EXISTS public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_template_code_key;
ALTER TABLE IF EXISTS public.tour_variations DROP CONSTRAINT IF EXISTS tour_variations_variation_code_key;
ALTER TABLE IF EXISTS public.tours DROP CONSTRAINT IF EXISTS tours_tour_code_key;

-- ---------------------------------------------------------------------------
-- Migration-only helpers (dropped at the end).
-- ---------------------------------------------------------------------------

-- Copy every row of a child table whose p_fk is p_from, onto p_to.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_tour_children(p_table text, p_fk text, p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I,
       to_jsonb(r) || jsonb_build_object(''id'', gen_random_uuid(), %2$L, $1))).*
       FROM public.%1$I r WHERE r.%2$I = $2',
    p_table, p_fk) USING p_to, p_from;
END
$fn$;

-- Copy one variation into a company (under p_template, which may be NULL),
-- with everything hanging off it.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_variation(p_id uuid, p_org uuid, p_template uuid)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
  child text;
BEGIN
  INSERT INTO public.tour_variations
  SELECT (jsonb_populate_record(NULL::public.tour_variations,
           to_jsonb(v) || jsonb_build_object('id', new_id, 'org_id', p_org, 'template_id', p_template))).*
    FROM public.tour_variations v WHERE v.id = p_id;
  FOREACH child IN ARRAY ARRAY['tour_variation_versions', 'tour_variation_services', 'variation_daily_itinerary',
                               'variation_pricing', 'variation_services'] LOOP
    PERFORM public.org_backfill_copy_tour_children(child, 'variation_id', p_id, new_id);
  END LOOP;
  INSERT INTO public.org_backfill_tour_copies (table_name, original_id, copy_id, org_id)
  VALUES ('tour_variations', p_id, new_id, p_org);
  RETURN new_id;
END
$fn$;

-- Copy one template into a company, with its versions, day activities and
-- every variation.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_template(p_id uuid, p_org uuid)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
  v record;
BEGIN
  INSERT INTO public.tour_templates
  SELECT (jsonb_populate_record(NULL::public.tour_templates,
           to_jsonb(t) || jsonb_build_object('id', new_id, 'org_id', p_org))).*
    FROM public.tour_templates t WHERE t.id = p_id;
  PERFORM public.org_backfill_copy_tour_children('tour_template_versions', 'template_id', p_id, new_id);
  PERFORM public.org_backfill_copy_tour_children('tour_day_activities', 'template_id', p_id, new_id);
  FOR v IN SELECT id FROM public.tour_variations WHERE template_id = p_id ORDER BY id LOOP
    PERFORM public.org_backfill_copy_variation(v.id, p_org, new_id);
  END LOOP;
  INSERT INTO public.org_backfill_tour_copies (table_name, original_id, copy_id, org_id)
  VALUES ('tour_templates', p_id, new_id, p_org);
  RETURN new_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Orphans: children with no parent. Saved whole, listed, deleted.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['tour_days', 'tour_id'],
    ARRAY['tour_pricing', 'tour_id'],
    ARRAY['variation_daily_itinerary', 'variation_id'],
    ARRAY['variation_pricing', 'variation_id'],
    ARRAY['variation_services', 'variation_id']
  ] LOOP
    IF to_regclass('public.' || spec[1]) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($q$
      INSERT INTO public.org_backfill_tour_orphans (table_name, row_id, row_data)
      SELECT %1$L, r.id, to_jsonb(r) FROM public.%1$I r WHERE r.%2$I IS NULL
      ON CONFLICT (table_name, row_id) DO NOTHING
    $q$, spec[1], spec[2]);
    EXECUTE format($q$
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, r.id::text, NULL, 'no parent — deleted' FROM public.%1$I r WHERE r.%2$I IS NULL
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $q$, spec[1], spec[2]);
    EXECUTE format('DELETE FROM public.%I WHERE %I IS NULL', spec[1], spec[2]);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', spec[1], spec[2]);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Who uses what: (template id, company), (variation id, company).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _tour_t_use (tid uuid, org uuid) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _tour_v_use (vid uuid, org uuid) ON COMMIT DROP;

DO $$
BEGIN
  IF to_regclass('public.tour_templates') IS NULL THEN RETURN; END IF;
  DELETE FROM _tour_t_use;
  DELETE FROM _tour_v_use;

  IF to_regclass('public.itineraries') IS NOT NULL THEN
    INSERT INTO _tour_t_use SELECT template_id, org_id FROM public.itineraries
     WHERE template_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.tour_departures') IS NOT NULL THEN
    INSERT INTO _tour_t_use SELECT template_id, org_id FROM public.tour_departures
     WHERE template_id IS NOT NULL AND org_id IS NOT NULL;
    INSERT INTO _tour_v_use SELECT variation_id, org_id FROM public.tour_departures
     WHERE variation_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    INSERT INTO _tour_v_use SELECT variation_id, org_id FROM public.tour_quotes
     WHERE variation_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL AND to_regclass('public.b2b_partners') IS NOT NULL THEN
    INSERT INTO _tour_v_use SELECT pp.variation_id, p.org_id
      FROM public.b2b_partner_pricing pp JOIN public.b2b_partners p ON p.id = pp.partner_id
     WHERE pp.variation_id IS NOT NULL AND p.org_id IS NOT NULL;
  END IF;
  -- A variation's use is its template's use.
  INSERT INTO _tour_t_use SELECT v.template_id, u.org FROM _tour_v_use u
    JOIN public.tour_variations v ON v.id = u.vid WHERE v.template_id IS NOT NULL;
  IF to_regclass('public.web_order_intakes') IS NOT NULL THEN
    INSERT INTO _tour_t_use SELECT t.id, w.org_id FROM public.web_order_intakes w
      JOIN public.tour_templates t ON lower(trim(t.template_code)) = lower(trim(w.tour_code))
     WHERE coalesce(trim(w.tour_code), '') <> '' AND w.org_id IS NOT NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Place templates, variations and tours; copy what another company uses.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  ats uuid;
  rec record;
BEGIN
  IF to_regclass('public.tour_templates') IS NULL THEN RETURN; END IF;
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN
    RAISE NOTICE 'tours: no organisations — nothing to backfill';
    RETURN;
  END IF;
  EXECUTE 'SELECT public.org_backfill_ats()' INTO ats;

  -- 1. Used by exactly one company.
  UPDATE public.tour_templates t SET org_id = u.o
    FROM (SELECT tid, min(org::text)::uuid AS o FROM _tour_t_use GROUP BY tid HAVING count(DISTINCT org) = 1) u
   WHERE t.org_id IS NULL AND u.tid = t.id;

  -- 2. Used by both: the catalogue default when it is one of them, else the
  --    older company.
  WITH filled AS (
    UPDATE public.tour_templates t SET org_id = coalesce(
        (SELECT x.org FROM _tour_t_use x WHERE x.tid = t.id AND x.org = cat LIMIT 1),
        (SELECT x.org FROM _tour_t_use x JOIN public.organizations o ON o.id = x.org
          WHERE x.tid = t.id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE t.org_id IS NULL AND t.id IN (SELECT tid FROM _tour_t_use)
    RETURNING t.id, t.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_templates', id::text, org_id, 'used by both companies — copied for the other' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 3. Plainly ATS's.
  IF ats IS NOT NULL THEN
    UPDATE public.tour_templates SET org_id = ats
     WHERE org_id IS NULL
       AND (coalesce(website_url, '') ILIKE '%ats-hj.com%'
            OR replace(upper(translate(trim(template_code), '－ー–—', '----')), 'BZ', '')
               ~ '^([NK](EK|MS)|(EK|MS)[NK]?)-?[0-9]{3,4}(-?[A-Z]+)*$'
            OR (jsonb_typeof(hotels) = 'array' AND jsonb_array_length(hotels) > 0));
  END IF;

  -- 4. Nothing traces it.
  WITH filled AS (
    UPDATE public.tour_templates SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_templates', id::text, cat, 'no trip, departure, quote or web order — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- Variations: their template's company.
  UPDATE public.tour_variations v SET org_id = t.org_id FROM public.tour_templates t
   WHERE v.org_id IS NULL AND t.id = v.template_id;
  -- No template: the company of what uses it.
  UPDATE public.tour_variations v SET org_id = u.o
    FROM (SELECT vid, min(org::text)::uuid AS o FROM _tour_v_use GROUP BY vid HAVING count(DISTINCT org) = 1) u
   WHERE v.org_id IS NULL AND u.vid = v.id;
  WITH filled AS (
    UPDATE public.tour_variations v SET org_id = coalesce(
        (SELECT x.org FROM _tour_v_use x WHERE x.vid = v.id AND x.org = cat LIMIT 1),
        (SELECT x.org FROM _tour_v_use x JOIN public.organizations o ON o.id = x.org
          WHERE x.vid = v.id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE v.org_id IS NULL AND v.id IN (SELECT vid FROM _tour_v_use)
    RETURNING v.id, v.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_variations', id::text, org_id, 'used by both companies — copied for the other' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  WITH filled AS (
    UPDATE public.tour_variations SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_variations', id::text, cat, 'no template, quote, departure or partner price — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- Legacy tours: nothing points at them.
  IF to_regclass('public.tours') IS NOT NULL THEN
    WITH filled AS (
      UPDATE public.tours SET org_id = cat WHERE org_id IS NULL RETURNING id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'tours', id::text, cat, 'legacy tour — catalogue default' FROM filled
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;

  -- A template another company uses: a copy for that company.
  FOR rec IN
    SELECT DISTINCT u.tid, u.org, t.org_id AS home
      FROM _tour_t_use u JOIN public.tour_templates t ON t.id = u.tid
     WHERE u.org <> t.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_templates' AND c.original_id = u.tid AND c.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_templates' AND c.copy_id = u.tid)
     ORDER BY u.tid, u.org
  LOOP
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('tour_templates', public.org_backfill_copy_template(rec.tid, rec.org)::text, rec.org, 'used by another company — copied'),
           ('tour_templates', rec.tid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;

  -- A template-less variation another company uses: likewise.
  FOR rec IN
    SELECT DISTINCT u.vid, u.org, v.org_id AS home
      FROM _tour_v_use u JOIN public.tour_variations v ON v.id = u.vid
     WHERE v.template_id IS NULL AND u.org <> v.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_variations' AND c.original_id = u.vid AND c.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_variations' AND c.copy_id = u.vid)
     ORDER BY u.vid, u.org
  LOOP
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('tour_variations', public.org_backfill_copy_variation(rec.vid, rec.org, NULL)::text, rec.org, 'used by another company — copied'),
           ('tour_variations', rec.vid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's references point at its own copy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  trg record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies) THEN RETURN; END IF;

  -- Fix-ups, not edits: no recalculation, no "updated" stamp, no revision
  -- rows. Only triggers that are on are turned off, and only those back on.
  CREATE TEMP TABLE IF NOT EXISTS _tour_trg_off (tbl text, tg text) ON COMMIT DROP;
  FOR trg IN
    SELECT c.relname AS tbl, t.tgname AS tg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('itineraries', 'tour_departures', 'tour_quotes', 'b2b_partner_pricing', 'quote_revisions', 'content_usage_log')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', trg.tbl, trg.tg);
    INSERT INTO _tour_trg_off VALUES (trg.tbl, trg.tg);
  END LOOP;

  IF to_regclass('public.itineraries') IS NOT NULL THEN
    UPDATE public.itineraries i SET template_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_templates' AND c.original_id = i.template_id AND c.org_id = i.org_id;
  END IF;
  IF to_regclass('public.tour_departures') IS NOT NULL THEN
    UPDATE public.tour_departures d SET template_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_templates' AND c.original_id = d.template_id AND c.org_id = d.org_id;
    UPDATE public.tour_departures d SET variation_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_variations' AND c.original_id = d.variation_id AND c.org_id = d.org_id;
  END IF;
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    UPDATE public.tour_quotes q SET variation_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_variations' AND c.original_id = q.variation_id AND c.org_id = q.org_id;
    IF to_regclass('public.quote_revisions') IS NOT NULL THEN
      UPDATE public.quote_revisions r
         SET quote_data = jsonb_set(r.quote_data, '{variation_id}', to_jsonb(c.copy_id::text))
        FROM public.tour_quotes q, public.org_backfill_tour_copies c
       WHERE r.quote_type = 'b2b' AND q.id = r.quote_id
         AND c.table_name = 'tour_variations' AND c.org_id = q.org_id
         AND c.original_id::text = r.quote_data ->> 'variation_id';
    END IF;
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL AND to_regclass('public.b2b_partners') IS NOT NULL THEN
    UPDATE public.b2b_partner_pricing pp SET variation_id = c.copy_id
      FROM public.b2b_partners p, public.org_backfill_tour_copies c
     WHERE p.id = pp.partner_id AND c.table_name = 'tour_variations'
       AND c.original_id = pp.variation_id AND c.org_id = p.org_id;
  END IF;
  IF to_regclass('public.content_usage_log') IS NOT NULL AND to_regclass('public.itineraries') IS NOT NULL THEN
    UPDATE public.content_usage_log l SET variation_id = c.copy_id
      FROM public.itineraries i, public.org_backfill_tour_copies c
     WHERE i.id = l.itinerary_id AND c.table_name = 'tour_variations'
       AND c.original_id = l.variation_id AND c.org_id = i.org_id;
  END IF;

  FOR trg IN SELECT * FROM _tour_trg_off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', trg.tbl, trg.tg);
  END LOOP;
  DELETE FROM _tour_trg_off;
END
$$;

-- ---------------------------------------------------------------------------
-- A tour's rates are its own company's (20261206's copies).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  spec text[];
BEGIN
  IF to_regclass('public.org_backfill_rate_copies') IS NULL THEN RETURN; END IF;

  -- Every rate's company. Ids are uuids, unique across the rate tables.
  CREATE TEMP TABLE IF NOT EXISTS _tour_rate_home (id uuid PRIMARY KEY, org uuid) ON COMMIT DROP;
  DELETE FROM _tour_rate_home;
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      CONTINUE;
    END IF;
    EXECUTE format('INSERT INTO _tour_rate_home SELECT id, org_id FROM public.%I ON CONFLICT (id) DO NOTHING', t);
  END LOOP;

  -- The same rate in a given company: the copy made for it, or the original
  -- a copy was made from.
  CREATE TEMP TABLE IF NOT EXISTS _tour_rate_twin (rid uuid, org uuid, twin uuid) ON COMMIT DROP;
  DELETE FROM _tour_rate_twin;
  INSERT INTO _tour_rate_twin SELECT original_id, org_id, copy_id FROM public.org_backfill_rate_copies;
  INSERT INTO _tour_rate_twin SELECT c.copy_id, h.org, c.original_id
    FROM public.org_backfill_rate_copies c JOIN _tour_rate_home h ON h.id = c.original_id;
  INSERT INTO _tour_rate_twin SELECT c1.copy_id, c2.org_id, c2.copy_id
    FROM public.org_backfill_rate_copies c1 JOIN public.org_backfill_rate_copies c2
      ON c2.original_id = c1.original_id AND c2.org_id <> c1.org_id;

  IF to_regclass('public.tour_days') IS NOT NULL AND EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tours' AND column_name = 'org_id') THEN
    FOREACH spec SLICE 1 IN ARRAY ARRAY[
      ARRAY['accommodation_id'], ARRAY['lunch_meal_id'], ARRAY['dinner_meal_id'], ARRAY['guide_id']
    ] LOOP
      EXECUTE format($q$
        UPDATE public.tour_days d SET %1$I = w.twin
          FROM public.tours tr, _tour_rate_home h, _tour_rate_twin w
         WHERE tr.id = d.tour_id AND h.id = d.%1$I AND h.org <> tr.org_id
           AND w.rid = d.%1$I AND w.org = tr.org_id
      $q$, spec[1]);
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT 'tour_days', d.id::text, tr.org_id, 'rate belongs to another company'
          FROM public.tour_days d JOIN public.tours tr ON tr.id = d.tour_id
          JOIN _tour_rate_home h ON h.id = d.%1$I
         WHERE h.org <> tr.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, spec[1]);
    END LOOP;
  END IF;

  IF to_regclass('public.tour_variation_services') IS NOT NULL THEN
    UPDATE public.tour_variation_services s SET rate_id = w.twin
      FROM public.tour_variations v, _tour_rate_home h, _tour_rate_twin w
     WHERE v.id = s.variation_id AND h.id = s.rate_id AND h.org <> v.org_id
       AND w.rid = s.rate_id AND w.org = v.org_id;
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'tour_variation_services', s.id::text, v.org_id, 'rate belongs to another company'
      FROM public.tour_variation_services s JOIN public.tour_variations v ON v.id = s.variation_id
      JOIN _tour_rate_home h ON h.id = s.rate_id
     WHERE h.org <> v.org_id
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours', 'tour_template_versions', 'tour_variation_versions',
                           'tour_variation_services', 'tour_day_activities', 'variation_pricing', 'variation_services'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at' AND tgenabled = 'D') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;

  IF to_regclass('public.tour_templates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_templates_org_id_template_code_key') THEN
    ALTER TABLE public.tour_templates ADD CONSTRAINT tour_templates_org_id_template_code_key UNIQUE (org_id, template_code);
  END IF;
  IF to_regclass('public.tour_variations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_variations_org_id_variation_code_key') THEN
    ALTER TABLE public.tour_variations ADD CONSTRAINT tour_variations_org_id_variation_code_key UNIQUE (org_id, variation_code);
  END IF;
  IF to_regclass('public.tours') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tours_org_id_tour_code_key') THEN
    ALTER TABLE public.tours ADD CONSTRAINT tours_org_id_tour_code_key UNIQUE (org_id, tour_code);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Themes: a fixed default list, never another company's categories; then
-- tour_categories goes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_tour_themes(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
    (p_org, 'tour_theme', 'cultural',     'Cultural & Historical', '文化・歴史',     1),
    (p_org, 'tour_theme', 'adventure',    'Adventure & Active',    'アドベンチャー', 2),
    (p_org, 'tour_theme', 'beach',        'Beach & Relaxation',    'ビーチ・リゾート', 3),
    (p_org, 'tour_theme', 'family',       'Family Holiday',        'ファミリー',     4),
    (p_org, 'tour_theme', 'luxury',       'Luxury Experience',     'ラグジュアリー', 5),
    (p_org, 'tour_theme', 'culinary',     'Food & Culinary',       '食・グルメ',     6)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_tour_themes(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_tour_themes(uuid) TO service_role;

ALTER TABLE IF EXISTS public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_category_id_fkey;
DROP INDEX IF EXISTS public.idx_tour_templates_category;
DROP VIEW IF EXISTS public.tour_templates_with_languages;
ALTER TABLE IF EXISTS public.tour_templates DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS public.tour_categories;

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
      ('tour_templates', 'tour_templates_authenticated_all'),
      ('tour_variations', 'Enable read access for all users'),
      ('tours', 'tours_authenticated'),
      ('tour_days', 'tour_days_authenticated'),
      ('tour_pricing', 'tour_pricing_authenticated'),
      ('tour_template_versions', 'tour_template_versions_authenticated'),
      ('tour_variation_services', 'tour_variation_services_authenticated'),
      ('tour_variation_versions', 'tour_variation_versions_authenticated'),
      ('variation_daily_itinerary', 'variation_daily_itinerary_authenticated'),
      ('variation_pricing', 'variation_pricing_authenticated'),
      ('variation_services', 'variation_services_authenticated'),
      ('tour_day_activities', 'Allow authenticated read'),
      ('tour_day_activities', 'Allow authenticated insert'),
      ('tour_day_activities', 'Allow authenticated update'),
      ('tour_day_activities', 'Allow authenticated delete')
    ) AS v(t, p)
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END IF;
  END LOOP;

  -- Templates and variations: your company's; writes manager-and-above.
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations'] LOOP
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

  -- Legacy tours: your company's (the builder had no role gate).
  IF to_regclass('public.tours') IS NOT NULL THEN
    DROP POLICY IF EXISTS tours_org_all ON public.tours;
    CREATE POLICY tours_org_all ON public.tours FOR ALL TO authenticated
      USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));
  END IF;
  FOREACH t IN ARRAY ARRAY['tour_days', 'tour_pricing'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.tours p WHERE p.id = tour_id AND public.user_is_in_org(p.org_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.tours p WHERE p.id = tour_id AND public.user_is_in_org(p.org_id)))',
      t || '_org_all', t);
  END LOOP;

  -- CHILD tables of a template / a variation: their parent's company.
  FOR t, p IN
    SELECT * FROM (VALUES
      ('tour_template_versions', 'tour_templates|template_id'),
      ('tour_day_activities', 'tour_templates|template_id'),
      ('tour_variation_versions', 'tour_variations|variation_id'),
      ('tour_variation_services', 'tour_variations|variation_id'),
      ('variation_daily_itinerary', 'tour_variations|variation_id'),
      ('variation_pricing', 'tour_variations|variation_id'),
      ('variation_services', 'tour_variations|variation_id')
    ) AS v(t, p)
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I AND public.user_is_in_org(p.org_id)))',
      t || '_org_select', t, split_part(p, '|', 1), split_part(p, '|', 2));
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.%3$I p WHERE p.id = %4$I AND public.user_is_in_org(p.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.%3$I p WHERE p.id = %4$I AND public.user_is_in_org(p.org_id)))',
      t || '_org_write', t, split_part(p, '|', 1), split_part(p, '|', 2));
  END LOOP;
END
$$;
REVOKE ALL ON public.tour_variations FROM anon;

-- ---------------------------------------------------------------------------
-- Dead objects; migration-only helpers
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.tour_template_defaults;
DROP TABLE IF EXISTS public.tour_availability;
DROP TABLE IF EXISTS public.tour_reviews;

DROP FUNCTION IF EXISTS public.org_backfill_copy_template(uuid, uuid);
DROP FUNCTION IF EXISTS public.org_backfill_copy_variation(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.org_backfill_copy_tour_children(text, text, uuid, uuid);

COMMIT;
