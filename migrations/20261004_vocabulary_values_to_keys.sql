-- 20261004_vocabulary_values_to_keys.sql
-- Rate rows that stored a vocabulary WORD now store the vocabulary KEY.
--
-- WHY: the meal, train, sleeping-train and activity forms offered their
-- lists as words and stored the word itself ('Lunch', 'First Class',
-- 'Half Twin', 'Water Activities'), while Settings → Vocabulary — and the
-- CSV importer, which resolves to keys — hold 'lunch', 'first_class',
-- 'half_twin', 'water_activities'. The label hook only matched by luck (it
-- slugifies before looking up), the list filters did not match at all once
-- the pickers wrote keys, and the two spellings drifted ('Casual' beside
-- 'Casual Dining'). Since 2026-09 the pickers write keys and readers slugify;
-- this rewrites the rows written before that so one column holds one shape.
--
-- SAFE for the pricing engine, checked column by column: meals are matched
-- with .toLowerCase() === 'lunch'; sleeping-train cabins by a /half|single/
-- test; train class and every activity column are display-only; the sleeper
-- `season` text is informational (dated rates live in the seasons JSONB).
-- guide_rates.guide_language is NOT touched: languages are engine-wide
-- literals ('English') matched against suppliers.languages.
--
-- The slug matches lib/vocabulary slugifyKey: lower-case, accents folded,
-- runs of anything else become one underscore, ends trimmed. Idempotent:
-- a key slugs to itself, so every UPDATE's WHERE is false on a second run.
-- ~50 rows in production on 2026-09-12.

BEGIN;

CREATE OR REPLACE FUNCTION public.vocab_slug(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      lower(translate(t,
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇçÑñ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNn')),
      '[^a-z0-9]+', '_', 'g'),
    '_')
$$;

-- Meals: type, cuisine, restaurant type, dietary options (an array).
UPDATE public.meal_rates SET meal_type = vocab_slug(meal_type)
  WHERE meal_type IS NOT NULL AND meal_type <> vocab_slug(meal_type);
UPDATE public.meal_rates SET cuisine_type = vocab_slug(cuisine_type)
  WHERE cuisine_type IS NOT NULL AND cuisine_type <> vocab_slug(cuisine_type);
UPDATE public.meal_rates SET restaurant_type = vocab_slug(restaurant_type)
  WHERE restaurant_type IS NOT NULL AND restaurant_type <> vocab_slug(restaurant_type);
-- One row held the bare word 'Casual' beside the vocabulary's casual_dining.
UPDATE public.meal_rates SET restaurant_type = 'casual_dining' WHERE restaurant_type = 'casual';
UPDATE public.meal_rates
  SET dietary_options = (SELECT array_agg(vocab_slug(d) ORDER BY ord) FROM unnest(dietary_options) WITH ORDINALITY AS u(d, ord))
  WHERE dietary_options IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(dietary_options) d WHERE d <> vocab_slug(d));

-- Trains: class.
UPDATE public.train_rates SET class_type = vocab_slug(class_type)
  WHERE class_type IS NOT NULL AND class_type <> vocab_slug(class_type);

-- Sleeping trains: cabin ('Half Twin' → half_twin) and the informational season text.
UPDATE public.sleeping_train_rates SET cabin_type = vocab_slug(cabin_type)
  WHERE cabin_type IS NOT NULL AND cabin_type <> vocab_slug(cabin_type);
UPDATE public.sleeping_train_rates SET season = vocab_slug(season)
  WHERE season IS NOT NULL AND season <> vocab_slug(season);

-- Activities: category, type, duration, unit.
UPDATE public.activity_rates SET activity_category = vocab_slug(activity_category)
  WHERE activity_category IS NOT NULL AND activity_category <> vocab_slug(activity_category);
UPDATE public.activity_rates SET activity_type = vocab_slug(activity_type)
  WHERE activity_type IS NOT NULL AND activity_type <> vocab_slug(activity_type);
UPDATE public.activity_rates SET duration = vocab_slug(duration)
  WHERE duration IS NOT NULL AND duration <> vocab_slug(duration);
UPDATE public.activity_rates SET unit_label = vocab_slug(unit_label)
  WHERE unit_label IS NOT NULL AND unit_label <> vocab_slug(unit_label);

DROP FUNCTION public.vocab_slug(text);

COMMIT;
