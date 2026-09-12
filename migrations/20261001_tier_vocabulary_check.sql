-- 20261001_tier_vocabulary_check.sql
-- A rate's tier is whatever Settings → Vocabulary → Service tiers says it can be.
--
-- WHY: the vocabulary screen lets an agency ADD a service tier (the operator
-- added "5 star" beside Budget / Standard / Deluxe / Luxury on 12 Sep 2026),
-- and the hotel and cruise rate forms now offer the whole ladder. But
-- accommodation_rates, meal_rates and content_variations carried a CHECK
-- freezing `tier` to the four preset keys, so a rate filed under the new tier
-- was refused by the database with a constraint error the form could not
-- explain. nile_cruises never had the CHECK — which is why a cruise would
-- have saved while the identical hotel rate failed.
--
-- The LIST now lives in the vocabulary (kind = 'tier') and the app validates
-- against it. What stays in the schema is the SHAPE: a tier is a vocabulary
-- KEY (lib/vocabulary KEY_PATTERN — a lowercase slug), never a free-text
-- label, so "5 star" cannot be stored where "5_star" belongs.
--
-- Loosening only: every existing row holds one of the four preset keys, all
-- of which satisfy the new pattern, so ADD CONSTRAINT validates without a
-- rewrite. Idempotent: DROP IF EXISTS before every ADD.

BEGIN;

ALTER TABLE public.accommodation_rates DROP CONSTRAINT IF EXISTS accommodation_rates_tier_check;
ALTER TABLE public.meal_rates          DROP CONSTRAINT IF EXISTS meal_rates_tier_check;
ALTER TABLE public.content_variations  DROP CONSTRAINT IF EXISTS content_variations_tier_check;

ALTER TABLE public.accommodation_rates DROP CONSTRAINT IF EXISTS accommodation_rates_tier_key_check;
ALTER TABLE public.accommodation_rates
  ADD CONSTRAINT accommodation_rates_tier_key_check
  CHECK (tier IS NULL OR tier ~ '^[a-z0-9][a-z0-9_]{0,59}$');

ALTER TABLE public.meal_rates DROP CONSTRAINT IF EXISTS meal_rates_tier_key_check;
ALTER TABLE public.meal_rates
  ADD CONSTRAINT meal_rates_tier_key_check
  CHECK (tier IS NULL OR tier ~ '^[a-z0-9][a-z0-9_]{0,59}$');

-- content_variations.tier is NOT NULL, so no NULL branch.
ALTER TABLE public.content_variations DROP CONSTRAINT IF EXISTS content_variations_tier_key_check;
ALTER TABLE public.content_variations
  ADD CONSTRAINT content_variations_tier_key_check
  CHECK (tier ~ '^[a-z0-9][a-z0-9_]{0,59}$');

COMMIT;
