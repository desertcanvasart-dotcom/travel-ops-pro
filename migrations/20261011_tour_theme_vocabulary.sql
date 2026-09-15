-- ============================================
-- Tour themes become the agency's own vocabulary
-- ============================================
-- 20261010 brought the tour template form's tour types, physical levels and
-- "Best for" list under Settings -> Vocabulary. The THEME picker was left out
-- on the reasoning that themes were "already customizable" because they live
-- in a table rather than in a constant. That was wrong, and the operator
-- caught it: /api/tours/categories has a GET and a POST, the GET is the only
-- one anything calls, and there is no screen anywhere in the app that adds,
-- renames, reorders or removes a theme. An agency cannot change them at all.
--
-- Three further things were wrong with the old home:
--
--   * public.tour_categories has NO org_id. It is one global list, so every
--     organisation on an install shares it — which is not a shape a product
--     customers self-host can keep.
--   * The ten seeded themes are Egypt-specific (Nile Cruise, Desert
--     Adventure). That is the same baked-in-destination problem the
--     vocabulary work has been unpicking everywhere else.
--   * The link is a UUID, so it cannot travel. lib/tours/template-csv.ts says
--     so in its own header: the theme is left out of the tour sheet because it
--     is an "install-local UUID link" that does not "survive a move to another
--     install". A vocabulary KEY does survive one.
--
-- So: a `tour_theme` kind, and a text `theme_key` on the template.
--
-- tour_categories and tour_templates.category_id are deliberately LEFT IN
-- PLACE and untouched. Nothing reads category_id after this except the code
-- being replaced, the column costs nothing where it sits, and leaving it makes
-- the change reversible by reverting the app alone. The content library is
-- unaffected either way — it has its own content_categories table.

BEGIN;

-- ---------------------------------------------------------------------------
-- The kind
-- ---------------------------------------------------------------------------
DO $kind$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.org_vocabularies'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%kind = ANY%'
  LOOP
    EXECUTE format('ALTER TABLE public.org_vocabularies DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$kind$;

ALTER TABLE public.org_vocabularies
  ADD CONSTRAINT org_vocabularies_kind_check CHECK (kind IN (
    'tier', 'supplier_type', 'board_basis', 'vehicle_type',
    'cruise_cabin', 'sleeper_cabin', 'meal_type', 'hotel_property_type',
    'train_class', 'attraction_category', 'attraction_fee_type', 'tipping_role',
    'tipping_context', 'tipping_unit', 'transport_service_type', 'flight_type',
    'flight_cabin', 'flight_frequency', 'airport_service_type', 'hotel_service_type',
    'cuisine_type', 'restaurant_type', 'dietary_option', 'activity_category',
    'activity_type', 'activity_duration', 'activity_unit', 'guide_grade',
    'guide_duration', 'guide_language', 'rate_season', 'airline', 'hotel_supplement',
    'airport_direction', 'activity_pricing_type', 'cruise_supplement',
    'tour_type', 'physical_level', 'tour_audience', 'tour_theme'
  ));

-- ---------------------------------------------------------------------------
-- The portable link on the template
-- ---------------------------------------------------------------------------
ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS theme_key TEXT;

COMMENT ON COLUMN public.tour_templates.theme_key IS
  'The org_vocabularies tour_theme key this tour is filed under. Replaces the '
  'category_id UUID, which could not travel between installs. category_id is '
  'kept for now and no longer read.';

CREATE INDEX IF NOT EXISTS idx_tour_templates_theme_key
  ON public.tour_templates (theme_key);

-- ---------------------------------------------------------------------------
-- Presets. The agency's EXISTING themes, so nothing on screen changes: the
-- keys are the old category_code lowercased, which is already key-shaped
-- (NILE_CRUISE -> nile_cruise). Seeded from the live table where it has rows
-- so an install keeps whatever it had, and from the built-in Egypt list
-- otherwise.
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
  IF EXISTS (SELECT 1 FROM public.tour_categories) THEN
    INSERT INTO public.org_vocabularies (org_id, kind, key, label, description, rank)
    SELECT
      p_org,
      'tour_theme',
      lower(regexp_replace(c.category_code, '[^A-Za-z0-9_]', '_', 'g')),
      c.category_name,
      c.description,
      COALESCE(c.sort_order, 999)
    FROM public.tour_categories c
    WHERE c.is_active IS NOT FALSE
      AND lower(regexp_replace(c.category_code, '[^A-Za-z0-9_]', '_', 'g')) ~ '^[a-z0-9][a-z0-9_]{0,59}$'
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

GRANT EXECUTE ON FUNCTION public.seed_tour_themes(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- A new organisation gets every preset list. The relabel migrations replace
-- seed_org_vocabulary's whole body, so a separately-seeded kind must be called
-- from HERE or a future reseed silently drops it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_org_vocabulary_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.seed_org_vocabulary(NEW.id, NULL);
  PERFORM public.seed_cruise_supplements(NEW.id);
  PERFORM public.seed_tour_template_vocabulary(NEW.id);
  PERFORM public.seed_tour_themes(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_vocabulary ON public.organizations;
CREATE TRIGGER trg_seed_org_vocabulary
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_org_vocabulary_on_insert();

-- ---------------------------------------------------------------------------
-- Backfill: the presets for every existing organisation, then each template's
-- theme_key from the theme it already points at. A template whose category_id
-- matches nothing is left NULL rather than guessed — it had no usable theme
-- either way.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_tour_themes(o.id);
  END LOOP;
END
$backfill$;

UPDATE public.tour_templates t
   SET theme_key = lower(regexp_replace(c.category_code, '[^A-Za-z0-9_]', '_', 'g'))
  FROM public.tour_categories c
 WHERE t.category_id = c.id
   AND t.theme_key IS NULL;

COMMIT;
