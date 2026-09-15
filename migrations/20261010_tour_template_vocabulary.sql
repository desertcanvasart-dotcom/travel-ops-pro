-- ============================================
-- Tour templates follow the agency's own vocabulary
-- ============================================
-- The tour template form (app/tours/manage) was the last significant form
-- still driven by lists hardcoded in the page: TOUR_TYPES, PHYSICAL_LEVELS and
-- BEST_FOR_OPTIONS, plus a TIER_CONFIG of exactly four tiers.
--
-- The tier one was a live defect, not just a rigidity. `tier` has been a
-- vocabulary kind since migration 20261001 and the hotel and meal rate pages
-- read it (useTierOptions), so an agency could add a fifth tier in
-- Settings -> Vocabulary, see it offered on those rate pages, and then find no
-- way to create a tour variation for it: the variation builder rendered its
-- own four built-ins and only RELABELLED them. The setting took, and the one
-- screen that had to honour it ignored it -- the same shape as the role-mirror
-- drift of 20261008.
--
-- Three new kinds here, and the tier fix is in the app.
--
--   tour_type       tour_templates.tour_type. meta carries {min_days, max_days},
--                   which the form's duration auto-suggest reads -- exactly how
--                   vehicle_type carries {min_pax, max_pax}. Stored value is the
--                   KEY.
--   physical_level  tour_templates.physical_level. The label is the level and
--                   the description is the gloss ("Easy" / "Suitable for all"),
--                   rather than the one run-together string the form used.
--                   Stored value is the KEY.
--   tour_audience   tour_templates.best_for -- the "Best for" checkboxes.
--
-- tour_audience is DELIBERATELY LABEL-VALUED, which no other kind is. best_for
-- is in TOUR_TEMPLATE_TRANSLATION_FIELDS (lib/translation-utils.ts): it is
-- machine-translated per language version alongside highlights and inclusions,
-- and translated copies already exist. Storing keys there would mean
-- translating a key, migrating every existing language version, and teaching
-- every reader to resolve it -- to gain nothing, because the value is display
-- prose and not a reference to anything. So the agency edits the OFFERED list
-- and the column keeps holding the words. Renaming an entry therefore does not
-- retitle tours already saved, which is correct for prose: those rows hold a
-- translated phrase, not a pointer.
--
-- tour_templates.tour_type and .physical_level are plain varchar with no CHECK,
-- so an agency-defined value needs no column change -- only the form's picker
-- was ever the constraint.

BEGIN;

-- ---------------------------------------------------------------------------
-- The three kinds
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
        AND pg_get_constraintdef(oid) LIKE '%kind%'
        AND pg_get_constraintdef(oid) LIKE '%cruise_supplement%'
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
    'tour_type', 'physical_level', 'tour_audience'
  ));

-- ---------------------------------------------------------------------------
-- Presets for one organisation. Gaps only — an agency's own edits and
-- deletions are never overwritten, so this is safe to re-run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_tour_template_vocabulary(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
  total integer := 0;
BEGIN
  -- min_days/max_days drive the form's duration auto-suggest: entering 1 day
  -- picks a single-day type, 2+ picks the first type whose range admits it.
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, meta, rank) VALUES
    (p_org, 'tour_type', 'half_day',  'Half Day Tour',  '半日ツアー',           '{"min_days":1,"max_days":1}'::jsonb,  1),
    (p_org, 'tour_type', 'day_tour',  'Day Tour',       '1日ツアー',            '{"min_days":1,"max_days":1}'::jsonb,  2),
    (p_org, 'tour_type', 'multi_day', 'Multi-Day Tour', '複数日ツアー',         '{"min_days":2,"max_days":99}'::jsonb, 3),
    (p_org, 'tour_type', 'stopover',  'Stopover Tour',  'ストップオーバーツアー', '{"min_days":1,"max_days":1}'::jsonb,  4)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, description, rank) VALUES
    (p_org, 'physical_level', 'easy',        'Easy',        '易しい',    'Suitable for all',       1),
    (p_org, 'physical_level', 'moderate',    'Moderate',    '普通',      'Some walking',           2),
    (p_org, 'physical_level', 'challenging', 'Challenging', 'ややきつい', 'Active travellers',      3),
    (p_org, 'physical_level', 'demanding',   'Demanding',   'きつい',    'Fit travellers only',    4)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- The label IS the stored value for this kind — see the file header.
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
    (p_org, 'tour_audience', 'families',            'Families',            'ファミリー',           1),
    (p_org, 'tour_audience', 'couples',             'Couples',             'カップル',             2),
    (p_org, 'tour_audience', 'solo_travelers',      'Solo Travelers',      '一人旅',               3),
    (p_org, 'tour_audience', 'groups',              'Groups',              'グループ',             4),
    (p_org, 'tour_audience', 'seniors',             'Seniors',             'シニア',               5),
    (p_org, 'tour_audience', 'history_buffs',       'History Buffs',       '歴史愛好家',           6),
    (p_org, 'tour_audience', 'adventure_seekers',   'Adventure Seekers',   'アドベンチャー志向',    7),
    (p_org, 'tour_audience', 'photography',         'Photography',         '写真撮影',             8),
    (p_org, 'tour_audience', 'relaxation',          'Relaxation',          'リラックス',           9),
    (p_org, 'tour_audience', 'first_time_visitors', 'First-time Visitors', '初めての方',          10),
    (p_org, 'tour_audience', 'repeat_visitors',     'Repeat Visitors',     'リピーター',          11),
    (p_org, 'tour_audience', 'luxury_travelers',    'Luxury Travelers',    'ラグジュアリー志向',   12),
    (p_org, 'tour_audience', 'budget_travelers',    'Budget Travelers',    '予算重視',            13)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  RETURN total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_tour_template_vocabulary(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- A new organisation gets every preset list. One trigger function, extended —
-- the relabel migrations replace seed_org_vocabulary's whole body, so a kind
-- seeded separately has to be called from here or a future reseed drops it.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_vocabulary ON public.organizations;
CREATE TRIGGER trg_seed_org_vocabulary
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_org_vocabulary_on_insert();

-- ---------------------------------------------------------------------------
-- Backfill: every existing organisation gets the presets (gaps only).
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_tour_template_vocabulary(o.id);
  END LOOP;
END
$backfill$;

COMMIT;
