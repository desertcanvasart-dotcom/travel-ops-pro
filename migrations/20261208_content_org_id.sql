-- ============================================
-- Content belongs to one company: the content library, its categories,
-- writing rules and prompt templates get an org_id
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and none of the six content tables had an org_id, so every
-- description, category, writing rule and prompt was both companies':
--   - /api/content-library/** (on the signed-in session, so RLS decided)
--     listed, edited and deleted the other company's content items, their
--     tier variations, categories, writing rules and prompt templates;
--     slugs were unique across the install, so a company could not use a
--     slug the other had taken;
--   - the AI itinerary builder (app/api/ai/generate-itinerary, on the
--     service role) wrote one company's trips with the other company's
--     content library, cruise programmes and writing rules, and logged
--     usage into one shared log;
--   - "set as default" on a prompt template un-defaulted the other
--     company's template for that purpose.
-- And through PostgREST, quoted from the baseline (no later migration
-- touched them):
--   content_categories   content_categories_authenticated  ALL TO authenticated USING (true) WITH CHECK (true)
--   content_library      content_library_authenticated     (same)
--   content_variations   content_variations_authenticated  (same)
--   content_usage_log    content_usage_log_authenticated   (same)
--   prompt_templates     prompt_templates_authenticated    (same)
--   writing_rules        writing_rules_authenticated       (same)
-- All six are dropped. In their place: content_categories, content_library,
-- writing_rules, prompt_templates, content_usage_log — select
-- user_is_in_org(org_id); insert / update / delete user_is_in_org(org_id) AND
-- is_manager_or_above() (Communicate › Content Library and Writing Rules are
-- manager-and-above; any member may READ, since generation reads them on the
-- server for agents too). content_variations is a child: its content item's
-- company (EXISTS on content_library), writes manager-and-above.
--
-- WHAT THIS DOES. org_id uuid REFERENCES organizations ON DELETE CASCADE (as
-- itineraries.org_id; no DEFAULT — the code stamps every insert) on
-- content_categories, content_library, content_usage_log, writing_rules,
-- prompt_templates; every row assigned, NOT NULL, indexed.
-- content_variations follows its content item: content_id becomes NOT NULL
-- (a variation with no content item is unreachable — deleted and listed).
--
-- BACKFILL — helpers from 20261202. Each rule fills only rows still NULL.
--
--   content_categories — a private taxonomy: the catalogue default (ATS),
--     and a copy for every other company, so each company has the full set.
--   writing_rules, prompt_templates — the company of the person who created
--     it (org_backfill_user_org(created_by)), else the catalogue default —
--     review: 'no single-company author — catalogue default'. Then a COPY for
--     every other company — review: 'copied for each company'. Decided for
--     the AI style rules and prompts: each company keeps the full current set,
--     so neither loses the generation behaviour it has today; each edits its
--     own from here.
--   content_library — "uses" are tour_day_activities.content_id through its
--     tour template's company (tour_templates.org_id, from 20261207; without
--     it this signal is skipped) and content_usage_log.itinerary_id through
--     the itinerary's company. In order:
--       1. the one company that uses it
--       2. used by BOTH: the catalogue default (ATS) when it is one of them,
--          else the older company — review: 'used by both companies — copied
--          for the other'
--       3. not used: the one company of the people who wrote it
--          (created_by / updated_by, and its variations' created_by /
--          updated_by, each through org_backfill_user_org)
--       4. nothing traces it: the catalogue default — review: 'no tour,
--          itinerary or single-company author — catalogue default'
--     Then an item another company uses is COPIED into that company (new id,
--     same slug — slugs are unique per company now — same everything else,
--     its tier variations copied with it), and that company's tour day
--     activities and usage log rows are pointed at the copy. Both rows are
--     listed: 'used by another company — copied'.
--   Every content item's category_id points at ITS company's copy of the
--   category. content_library.destination_id and writing_rules.destination_id
--   point at the company's copy of the destination (20261206 recorded those
--   in org_backfill_rate_copies, table_name 'destinations'); with no copy
--   there the row is left and listed: 'destination belongs to another
--   company'.
--   content_usage_log — its itinerary's company, else its content item's,
--     else the default (operational) — review: 'no itinerary or content —
--     default'.
--   prompt_templates — one default per purpose per company: where a company
--     ends up with more than one, the most recently updated stays default,
--     the others are listed: 'another default for this purpose — no longer
--     default'.
-- Copies are recorded in org_backfill_content_copies (table_name,
-- original_id, copy_id, org_id) — service role only. Read the list:
--   SELECT * FROM org_backfill_review WHERE table_name IN ('content_categories',
--     'content_library', 'content_variations', 'content_usage_log',
--     'writing_rules', 'prompt_templates') ORDER BY id;
--   SELECT * FROM org_backfill_content_copies ORDER BY table_name, original_id;
--
-- UNIQUE → PER COMPANY: content_categories_slug_key → (org_id, slug);
-- content_library_slug_key and content_library_category_id_slug_key →
-- (org_id, slug) (a category is one company's, so (org_id, slug) also covers
-- the per-category rule); one is_default per purpose → partial unique
-- (org_id, purpose) WHERE is_default.
--
-- DEPLOY ORDER: apply 20261206 (rates/destinations), 20261207 (tours) and
-- then this migration FIRST, then deploy the code. The code filters and
-- stamps org_id on these tables and fails without it; the old code keeps
-- reading on the new schema, but an item it inserts has no org_id and fails
-- NOT NULL — deploy promptly. Without 20261207 this still applies (the tour
-- signal is skipped); without 20261206 destinations are left as they are.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- NULLs, copies are made only for rows placed in this run (or, for content,
-- where none is recorded), review rows ON CONFLICT DO NOTHING, policies
-- dropped before created, tables guarded (to_regclass). On a bare replay (no
-- organisations) nothing is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_content_copies (
  table_name text NOT NULL,
  original_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, original_id, org_id)
);
ALTER TABLE public.org_backfill_content_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_content_copies FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns; set_updated_at off for the backfill (an assignment is not an
-- edit); global uniques dropped (a copy keeps its original's slug).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_variations', 'writing_rules', 'prompt_templates'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at') THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;
END
$$;
ALTER TABLE IF EXISTS public.content_categories DROP CONSTRAINT IF EXISTS content_categories_slug_key;
ALTER TABLE IF EXISTS public.content_library DROP CONSTRAINT IF EXISTS content_library_slug_key;
ALTER TABLE IF EXISTS public.content_library DROP CONSTRAINT IF EXISTS content_library_category_id_slug_key;

-- ---------------------------------------------------------------------------
-- Migration-only helpers (dropped at the end).
-- ---------------------------------------------------------------------------

-- Copy one row into another company: new id, that org; a content item's
-- tier variations come with it.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_content_row(p_table text, p_id uuid, p_org uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
  v record;
  new_vid uuid;
BEGIN
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I, to_jsonb(r) || $1)).* FROM public.%1$I r WHERE r.id = $2',
    p_table) USING jsonb_build_object('id', new_id, 'org_id', p_org), p_id;
  INSERT INTO public.org_backfill_content_copies (table_name, original_id, copy_id, org_id)
  VALUES (p_table, p_id, new_id, p_org);
  IF p_table = 'content_library' AND to_regclass('public.content_variations') IS NOT NULL THEN
    FOR v IN SELECT id FROM public.content_variations WHERE content_id = p_id LOOP
      new_vid := gen_random_uuid();
      INSERT INTO public.content_variations
      SELECT (jsonb_populate_record(NULL::public.content_variations,
               to_jsonb(cv) || jsonb_build_object('id', new_vid, 'content_id', new_id))).*
        FROM public.content_variations cv WHERE cv.id = v.id;
      INSERT INTO public.org_backfill_content_copies (table_name, original_id, copy_id, org_id)
      VALUES ('content_variations', v.id, new_vid, p_org);
    END LOOP;
  END IF;
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  VALUES (p_table, new_id::text, p_org, p_reason)
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  RETURN new_id;
END
$fn$;

-- Rows placed in THIS run, by table: only these are copied for each company
-- (a re-run must not copy what a company created after the first one).
CREATE TEMP TABLE IF NOT EXISTS _org_content_placed (tbl text, id uuid) ON COMMIT DROP;
-- What uses a content item: (content id, company).
CREATE TEMP TABLE IF NOT EXISTS _org_content_use (cid uuid, org uuid) ON COMMIT DROP;

-- One copy per other company of every row placed in this run.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_content_for_each(p_table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  rec record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  FOR rec IN EXECUTE format($q$
    SELECT r.id, o.id AS org
      FROM public.%I r
      JOIN _org_content_placed p ON p.tbl = %L AND p.id = r.id
      CROSS JOIN public.organizations o
     WHERE o.id <> r.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies c WHERE c.table_name = %L AND c.copy_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies c
                        WHERE c.table_name = %L AND c.original_id = r.id AND c.org_id = o.id)
     ORDER BY r.id, o.id
  $q$, p_table, p_table, p_table, p_table) LOOP
    PERFORM public.org_backfill_copy_content_row(p_table, rec.id, rec.org, 'copied for each company');
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Categories, writing rules, prompt templates.
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
    RAISE NOTICE 'content: no organisations — nothing to backfill';
    RETURN;
  END IF;

  -- Each company the full category set.
  IF to_regclass('public.content_categories') IS NOT NULL THEN
    WITH filled AS (
      UPDATE public.content_categories SET org_id = cat WHERE org_id IS NULL RETURNING id
    )
    INSERT INTO _org_content_placed SELECT 'content_categories', id FROM filled;
    PERFORM public.org_backfill_copy_content_for_each('content_categories');
  END IF;

  -- The author's company, else the catalogue default; then one for each.
  FOREACH t IN ARRAY ARRAY['writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($q$
      WITH filled AS (
        UPDATE public.%I r SET org_id = public.org_backfill_user_org(r.created_by)
         WHERE r.org_id IS NULL AND r.created_by IS NOT NULL
           AND public.org_backfill_user_org(r.created_by) IS NOT NULL
        RETURNING r.id
      )
      INSERT INTO _org_content_placed SELECT %L, id FROM filled
    $q$, t, t);
    EXECUTE format($q$
      WITH filled AS (
        UPDATE public.%1$I SET org_id = %2$L::uuid WHERE org_id IS NULL RETURNING id
      ), placed AS (
        INSERT INTO _org_content_placed SELECT %1$L, id FROM filled RETURNING id
      )
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, id::text, %2$L::uuid, 'no single-company author — catalogue default' FROM placed
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $q$, t, cat);
    PERFORM public.org_backfill_copy_content_for_each(t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- The content library.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  rec record;
BEGIN
  IF to_regclass('public.content_library') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN RETURN; END IF;

  -- What uses it, by company.
  DELETE FROM _org_content_use;
  IF to_regclass('public.tour_day_activities') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'org_id') THEN
    EXECUTE $q$
      INSERT INTO _org_content_use
      SELECT DISTINCT a.content_id, t.org_id
        FROM public.tour_day_activities a JOIN public.tour_templates t ON t.id = a.template_id
       WHERE a.content_id IS NOT NULL AND t.org_id IS NOT NULL
    $q$;
  END IF;
  IF to_regclass('public.content_usage_log') IS NOT NULL THEN
    INSERT INTO _org_content_use
    SELECT DISTINCT l.content_id, i.org_id
      FROM public.content_usage_log l JOIN public.itineraries i ON i.id = l.itinerary_id
     WHERE l.content_id IS NOT NULL AND i.org_id IS NOT NULL;
  END IF;
  -- Only items that exist (tour_day_activities.content_id has no FK).
  DELETE FROM _org_content_use u WHERE NOT EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = u.cid);

  -- 1. The one company that uses it.
  UPDATE public.content_library c SET org_id = u.o
    FROM (SELECT cid, min(org::text)::uuid AS o FROM _org_content_use GROUP BY cid HAVING count(DISTINCT org) = 1) u
   WHERE c.org_id IS NULL AND u.cid = c.id;

  -- 2. Both: the catalogue default when it is one of them, else the older.
  WITH filled AS (
    UPDATE public.content_library c SET org_id = coalesce(
        (SELECT x.org FROM _org_content_use x WHERE x.cid = c.id AND x.org = cat LIMIT 1),
        (SELECT x.org FROM _org_content_use x JOIN public.organizations o ON o.id = x.org
          WHERE x.cid = c.id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE c.org_id IS NULL AND c.id IN (SELECT cid FROM _org_content_use)
    RETURNING c.id, c.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_library', id::text, org_id, 'used by both companies — copied for the other' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 3. Not used: the one company of the people who wrote it.
  WITH authors AS (
    SELECT c.id, public.org_backfill_user_org(a.u) AS o
      FROM public.content_library c CROSS JOIN LATERAL (VALUES (c.created_by), (c.updated_by)) AS a(u)
     WHERE c.org_id IS NULL AND a.u IS NOT NULL
    UNION ALL
    SELECT c.id, public.org_backfill_user_org(a.u)
      FROM public.content_library c
      JOIN public.content_variations v ON v.content_id = c.id
      CROSS JOIN LATERAL (VALUES (v.created_by), (v.updated_by)) AS a(u)
     WHERE c.org_id IS NULL AND a.u IS NOT NULL
  )
  UPDATE public.content_library c SET org_id = x.o
    FROM (SELECT id, min(o::text)::uuid AS o FROM authors WHERE o IS NOT NULL GROUP BY id HAVING count(DISTINCT o) = 1) x
   WHERE c.org_id IS NULL AND x.id = c.id;

  -- 4. Nothing traces it.
  WITH filled AS (
    UPDATE public.content_library SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_library', id::text, cat, 'no tour, itinerary or single-company author — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- An item another company uses: a copy for that company.
  FOR rec IN
    SELECT DISTINCT u.cid, u.org, c.org_id AS home
      FROM _org_content_use u JOIN public.content_library c ON c.id = u.cid
     WHERE u.org <> c.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies m
                        WHERE m.table_name = 'content_library' AND m.original_id = u.cid AND m.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies m
                        WHERE m.table_name = 'content_library' AND m.copy_id = u.cid)
  LOOP
    PERFORM public.org_backfill_copy_content_row('content_library', rec.cid, rec.org, 'used by another company — copied');
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('content_library', rec.cid::text, rec.home, 'used by another company — copied')
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
  has_dest_org boolean := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'destinations' AND column_name = 'org_id');
  t text;
BEGIN
  -- Fix-ups, not edits: only triggers that are on are turned off, and only
  -- those are turned back on.
  CREATE TEMP TABLE IF NOT EXISTS _org_content_trg_off (tbl text, tg text) ON COMMIT DROP;
  FOR trg IN
    SELECT c.relname AS tbl, t.tgname AS tg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('tour_day_activities', 'content_usage_log')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', trg.tbl, trg.tg);
    INSERT INTO _org_content_trg_off VALUES (trg.tbl, trg.tg);
  END LOOP;

  -- Tour day activities: their template's company's copy.
  IF to_regclass('public.tour_day_activities') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'org_id') THEN
    EXECUTE $q$
      UPDATE public.tour_day_activities a SET content_id = m.copy_id
        FROM public.tour_templates t, public.org_backfill_content_copies m
       WHERE t.id = a.template_id AND m.table_name = 'content_library'
         AND m.original_id = a.content_id AND m.org_id = t.org_id
    $q$;
  END IF;

  -- Usage log: its itinerary's company's copy (item and tier variation).
  IF to_regclass('public.content_usage_log') IS NOT NULL THEN
    UPDATE public.content_usage_log l SET content_id = m.copy_id
      FROM public.itineraries i, public.org_backfill_content_copies m
     WHERE i.id = l.itinerary_id AND m.table_name = 'content_library'
       AND m.original_id = l.content_id AND m.org_id = i.org_id;
    UPDATE public.content_usage_log l SET variation_id = m.copy_id
      FROM public.itineraries i, public.org_backfill_content_copies m
     WHERE i.id = l.itinerary_id AND m.table_name = 'content_variations'
       AND m.original_id = l.variation_id AND m.org_id = i.org_id;
  END IF;

  -- A content item's category is its company's.
  IF to_regclass('public.content_library') IS NOT NULL THEN
    UPDATE public.content_library c SET category_id = m.copy_id
      FROM public.content_categories k, public.org_backfill_content_copies m
     WHERE k.id = c.category_id AND k.org_id IS DISTINCT FROM c.org_id
       AND m.table_name = 'content_categories' AND m.original_id = c.category_id AND m.org_id = c.org_id;
  END IF;

  -- Destinations: the company's copy (20261206).
  IF has_dest_org THEN
    FOREACH t IN ARRAY ARRAY['content_library', 'writing_rules'] LOOP
      IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
      IF to_regclass('public.org_backfill_rate_copies') IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I r SET destination_id = m.copy_id
                          FROM public.org_backfill_rate_copies m, public.destinations d
                         WHERE m.table_name = ''destinations'' AND m.original_id = r.destination_id AND m.org_id = r.org_id
                           AND d.id = r.destination_id AND d.org_id IS DISTINCT FROM r.org_id', t);
      END IF;
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, r.id::text, r.org_id, 'destination belongs to another company'
          FROM public.%1$I r JOIN public.destinations d ON d.id = r.destination_id
         WHERE d.org_id IS NOT NULL AND r.org_id IS NOT NULL AND d.org_id <> r.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, t);
    END LOOP;
  END IF;

  FOR trg IN SELECT * FROM _org_content_trg_off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', trg.tbl, trg.tg);
  END LOOP;
  DELETE FROM _org_content_trg_off;
END
$$;

-- ---------------------------------------------------------------------------
-- Usage log: its itinerary's company, else its content item's.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def uuid;
BEGIN
  IF to_regclass('public.content_usage_log') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO def;
  IF def IS NULL THEN RETURN; END IF;
  UPDATE public.content_usage_log l SET org_id = i.org_id FROM public.itineraries i
   WHERE l.org_id IS NULL AND i.id = l.itinerary_id AND i.org_id IS NOT NULL;
  UPDATE public.content_usage_log l SET org_id = c.org_id FROM public.content_library c
   WHERE l.org_id IS NULL AND c.id = l.content_id AND c.org_id IS NOT NULL;
  WITH filled AS (
    UPDATE public.content_usage_log SET org_id = def WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_usage_log', id::text, def, 'no itinerary or content — default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- ---------------------------------------------------------------------------
-- A variation belongs to a content item; one with none is unreachable.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.content_variations') IS NULL THEN RETURN; END IF;
  WITH gone AS (
    DELETE FROM public.content_variations WHERE content_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_variations', id::text, NULL, 'no content item — deleted' FROM gone
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  ALTER TABLE public.content_variations ALTER COLUMN content_id SET NOT NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- One default prompt per purpose per company.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.prompt_templates') IS NULL THEN RETURN; END IF;
  WITH ranked AS (
    SELECT id, org_id, row_number() OVER (
             PARTITION BY org_id, purpose
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id) AS n
      FROM public.prompt_templates
     WHERE is_default AND org_id IS NOT NULL
  ), demoted AS (
    UPDATE public.prompt_templates p SET is_default = false
      FROM ranked r WHERE r.id = p.id AND r.n > 1
    RETURNING p.id, p.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'prompt_templates', id::text, org_id, 'another default for this purpose — no longer default' FROM demoted
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_variations', 'writing_rules', 'prompt_templates'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;

  IF to_regclass('public.content_categories') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_categories_org ON public.content_categories (org_id, sort_order);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_categories_org_id_slug_key') THEN
      ALTER TABLE public.content_categories ADD CONSTRAINT content_categories_org_id_slug_key UNIQUE (org_id, slug);
    END IF;
  END IF;
  IF to_regclass('public.content_library') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_library_org ON public.content_library (org_id, category_id);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_library_org_id_slug_key') THEN
      ALTER TABLE public.content_library ADD CONSTRAINT content_library_org_id_slug_key UNIQUE (org_id, slug);
    END IF;
  END IF;
  IF to_regclass('public.content_usage_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_usage_log_org ON public.content_usage_log (org_id, used_at DESC);
  END IF;
  IF to_regclass('public.writing_rules') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_writing_rules_org ON public.writing_rules (org_id, priority DESC);
  END IF;
  IF to_regclass('public.prompt_templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_prompt_templates_org ON public.prompt_templates (org_id, purpose);
    CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_org_purpose_default_key
      ON public.prompt_templates (org_id, purpose) WHERE is_default;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_variations', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated', t);
    END IF;
  END LOOP;

  -- ROOT tables: your company's rows; writes manager-and-above.
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
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

  -- CHILD: a variation is its content item's company's.
  IF to_regclass('public.content_variations') IS NOT NULL THEN
    DROP POLICY IF EXISTS content_variations_org_select ON public.content_variations;
    DROP POLICY IF EXISTS content_variations_org_write ON public.content_variations;
    CREATE POLICY content_variations_org_select ON public.content_variations FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = content_id AND public.user_is_in_org(c.org_id)));
    CREATE POLICY content_variations_org_write ON public.content_variations FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = content_id AND public.user_is_in_org(c.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = content_id AND public.user_is_in_org(c.org_id)));
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.org_backfill_copy_content_for_each(text);
DROP FUNCTION IF EXISTS public.org_backfill_copy_content_row(text, uuid, uuid, text);

COMMIT;
