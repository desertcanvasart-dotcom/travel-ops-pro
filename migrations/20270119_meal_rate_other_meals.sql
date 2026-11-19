-- ============================================================================
-- 20270119 — one meal price covers several meals (lunch and dinner)
-- ============================================================================
-- Ported from autoura-saas #821 (its migration 467).
--
-- The same menu at the same restaurant and price is often served at lunch and
-- at dinner, and had to be entered twice in Rates → Meals. A meal price now
-- names its meals as a list:
--
--   meal_type        — the first meal, as before (every filter, export and
--                      display keeps its meaning).
--   other_meal_types — the meals the SAME price also covers (meal_type
--                      vocabulary keys).
--
-- A price serves a meal when the meal is `meal_type` or in `other_meal_types`
-- (lib/meals/meal-rate-meals.ts, one rule).
--
-- No rows are changed or merged: every existing row gets an empty list, so
-- every price stays exactly as it is until someone adds a second meal.
--
-- meal_rates is already per company (org_id NOT NULL, company RLS,
-- 20261206_rates_org_id.sql); a new column needs nothing more.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE meal_rates
  ADD COLUMN IF NOT EXISTS other_meal_types TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN meal_rates.other_meal_types IS
  'Meals (meal_type vocabulary keys) this same price also covers, beyond '
  'meal_type. Empty = only meal_type.';

-- The first meal is said in meal_type; a price cannot list further meals
-- without one.
ALTER TABLE meal_rates DROP CONSTRAINT IF EXISTS meal_rates_other_meals_need_meal;
ALTER TABLE meal_rates ADD CONSTRAINT meal_rates_other_meals_need_meal
  CHECK (other_meal_types = '{}' OR (meal_type IS NOT NULL AND btrim(meal_type) <> ''));

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM meal_rates WHERE other_meal_types <> '{}';
--   -- 0 until a price is given a second meal in Rates → Meals
