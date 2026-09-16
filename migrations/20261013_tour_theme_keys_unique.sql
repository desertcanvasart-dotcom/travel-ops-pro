-- ============================================
-- Every theme keeps its own key, retired ones included
-- ============================================
-- 20261011 gave each tour_categories row a vocabulary key by lowercasing its
-- category_code. Two things about that were wrong, and both were found by
-- replaying the migration against a database holding the shapes it did not
-- consider (__tests__/migrations/tour-theme-keys-unique.test.ts):
--
--   1. DISTINCT CODES CAN NORMALISE TO ONE KEY. 'DESERT-SAFARI' and
--      'DESERT_SAFARI' both become 'desert_safari'. The seeder's
--      ON CONFLICT DO NOTHING then dropped the second theme silently, and the
--      backfill — which joins on category_id, not on the key — filed BOTH
--      categories' tours under the surviving one. One theme disappeared from
--      Settings and some tours started showing another theme's label.
--
--   2. RETIRED THEMES WERE SKIPPED BUT STILL POINTED AT. The seeder excludes
--      inactive categories (`is_active IS NOT FALSE`); the backfill does not.
--      A tour still filed under a retired theme therefore got a theme_key with
--      no vocabulary entry behind it — an orphan, which the browser renders as
--      the raw key and which no picker can represent.
--
-- The fix is one SELECT. Keys are assigned by row_number() over the normalised
-- code, so the second and later categories sharing one get 'desert_safari_2',
-- 'desert_safari_3' and so on; and inactive categories are seeded too, as
-- INACTIVE entries. An inactive entry is exactly right for a retired theme:
-- useVocabulary resolves labels from `all` (so the tour reads "Desert Safari"
-- and not `desert_safari`) while the pickers offer only `items`, so nobody can
-- newly file a tour under a theme the agency retired.
--
-- WHICH category keeps the base key matters. After a collision the surviving
-- entry carries one category's NAME as its label, so the ordering puts that
-- category first: repairing the split must not swap two themes' labels round.
--
-- What this migration deliberately does NOT do is re-point existing tours.
-- Since 20261011 the tour form writes theme_key and no longer reads
-- category_id, so a tour whose two disagree may simply have been re-filed by
-- hand — indistinguishable, from here, from a tour the backfill mis-filed.
-- Creating the missing themes is unambiguous and enough: the theme reappears
-- in the picker, and the NOTICE below names the tours worth a second look.
BEGIN;

CREATE OR REPLACE FUNCTION public.seed_tour_themes(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tour_categories) THEN
    WITH normalised AS (
      SELECT
        c.category_name,
        c.description,
        c.sort_order,
        c.is_active,
        c.category_code,
        -- A code with nothing key-shaped left in it (punctuation only, or
        -- empty) would fail org_vocabularies' key CHECK and take the whole
        -- statement down with it. It gets a legal base instead and the
        -- row_number below keeps it unique.
        CASE
          WHEN lower(regexp_replace(c.category_code, '[^A-Za-z0-9_]', '_', 'g')) ~ '^[a-z0-9][a-z0-9_]{0,59}$'
          THEN lower(regexp_replace(c.category_code, '[^A-Za-z0-9_]', '_', 'g'))
          ELSE 'theme'
        END AS base
      FROM public.tour_categories c
    ),
    ranked AS (
      SELECT
        nm.*,
        row_number() OVER (
          PARTITION BY nm.base
          ORDER BY
            -- The category that already owns this key keeps it.
            (EXISTS (
              SELECT 1 FROM public.org_vocabularies v
               WHERE v.org_id = p_org AND v.kind = 'tour_theme'
                 AND v.key = nm.base AND v.label = nm.category_name
            )) DESC,
            COALESCE(nm.sort_order, 999),
            nm.category_code
        ) AS pos
      FROM normalised nm
    )
    INSERT INTO public.org_vocabularies (org_id, kind, key, label, description, rank, is_active)
    SELECT
      p_org,
      'tour_theme',
      CASE WHEN pos = 1 THEN base ELSE left(base, 56) || '_' || pos END,
      category_name,
      description,
      COALESCE(sort_order, 999),
      COALESCE(is_active, true)
    FROM ranked
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  ELSE
    INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
      (p_org, 'tour_theme', 'cultural',     'Cultural & Historical', '文化・歴史',     1),
      (p_org, 'tour_theme', 'adventure',    'Adventure & Active',    'アドベンチャー', 2),
      (p_org, 'tour_theme', 'beach',        'Beach & Relaxation',    'ビーチ・リゾート', 3),
      (p_org, 'tour_theme', 'family',       'Family Holiday',        'ファミリー',     4),
      (p_org, 'tour_theme', 'luxury',       'Luxury Experience',     'ラグジュアリー', 5),
      (p_org, 'tour_theme', 'culinary',     'Food & Culinary',       '食・グルメ',     6)
    ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- CREATE OR REPLACE keeps the function's privileges, but 20261012 is the only
-- thing standing between a SECURITY DEFINER seeder and any signed-in caller —
-- restated here so replacing the body can never quietly widen it again.
REVOKE EXECUTE ON FUNCTION public.seed_tour_themes(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_tour_themes(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- The themes 20261011 dropped, for every organisation that already ran it.
-- Existing entries are left exactly as they are (the agency may have relabelled
-- them), so this adds and never edits.
-- ---------------------------------------------------------------------------
DO $repair$
DECLARE
  o RECORD;
  added integer;
  total integer := 0;
BEGIN
  -- Guarded on 20261011 having landed, because the migration tests replay
  -- every file EXCEPT the one under test: without this, the run that excludes
  -- 20261011 reaches a database where 'tour_theme' is not yet a permitted
  -- vocabulary kind and no tour_templates.theme_key exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'theme_key'
  ) THEN
    FOR o IN SELECT id FROM public.organizations LOOP
      added := public.seed_tour_themes(o.id);
      total := total + added;
    END LOOP;
    IF total > 0 THEN
      RAISE NOTICE 'tour themes: restored % vocabulary entry(ies) that 20261011 dropped', total;
    END IF;
  END IF;
END
$repair$;

-- ---------------------------------------------------------------------------
-- Name the tours a collision may have mis-filed. Only tours whose category
-- SHARES its normalised code with another are reported, so a tour deliberately
-- re-filed since 20261011 is not paraded as a fault.
-- ---------------------------------------------------------------------------
DO $report$
DECLARE
  t RECORD;
  n integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'theme_key'
  ) THEN
    FOR t IN
      WITH normalised AS (
        SELECT c.id, c.category_name,
               lower(regexp_replace(c.category_code, '[^A-Za-z0-9_]', '_', 'g')) AS base
          FROM public.tour_categories c
      ),
      collided AS (
        SELECT base FROM normalised GROUP BY base HAVING count(*) > 1
      )
      SELECT tt.template_code, tt.theme_key, nm.category_name
        FROM public.tour_templates tt
        JOIN normalised nm ON nm.id = tt.category_id
        JOIN collided cd ON cd.base = nm.base
       ORDER BY tt.template_code
    LOOP
      n := n + 1;
      RAISE NOTICE 'tour themes: % is filed under "%" but its theme was "%" — check which it should be',
        t.template_code, t.theme_key, t.category_name;
    END LOOP;
    IF n = 0 THEN
      RAISE NOTICE 'tour themes: no theme keys collided on this install';
    END IF;
  END IF;
END
$report$;

COMMIT;
