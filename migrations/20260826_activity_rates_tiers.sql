-- ============================================
-- Tiered (volume-discount) pricing on the activity catalog
-- ============================================
-- Consolidates the "Activity" division of B2B Pricing Rules into the
-- activity_rates catalog. b2b_pricing_rules has been empty in production since
-- launch, yet the pricing engines' activity path pointed only at it — so tiered
-- pricing (felucca cheaper per person for bigger groups) was never expressible
-- through the catalog the operator actually maintains.
--
-- tiers is an ordered JSONB array of pax bands:
--   [{"min_pax":1,"max_pax":8,"rate_eur":25,"rate_non_eur":20,"label":"Small"}, ...]
-- Used when pricing_type = 'tiered' (pricing_type has no CHECK constraint —
-- verified against production 2026-08-26). rate_non_eur is optional and falls
-- back to rate_eur. A group larger than every band gets the last band's rate.
--
-- Idempotent: safe to run twice.

ALTER TABLE public.activity_rates
  ADD COLUMN IF NOT EXISTS tiers JSONB;

COMMENT ON COLUMN public.activity_rates.tiers IS
  'Ordered pax bands for pricing_type=tiered: [{min_pax,max_pax,rate_eur,rate_non_eur?,label?}]. Per-person rate that varies with group size; largest band applies beyond its max.';
