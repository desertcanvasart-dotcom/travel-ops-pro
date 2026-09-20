-- ============================================
-- A property's class is the agency's word, not ours
-- ============================================
-- Operator, 2026-09-20, opening the Add property dialog: "why does this drop
-- down menu have these categories which do not exist in the vocabulary
-- section… is this hard coded or is something wrong?"
--
-- Hardcoded. lib/supplier-properties PROPERTY_CATEGORIES has carried
-- '3★ standard' … '5★ luxury' for hotels, four words for ships and four more
-- for trains, none of them reachable from Settings.
--
-- It was written to stop the field being free text — the same hotel class had
-- been spelled five ways across the fleet — and it did not work, because a
-- list nobody can edit is a list people write around. The live data:
--
--     hotel  "4 Stars"     2      ← not in the list
--     hotel  "5 Stars"     2      ← not in the list
--     hotel  "5★ deluxe"   2      ← from the list
--
-- So the list becomes the agency's, one kind per property type. TRAINS ALREADY
-- HAD ONE: `train_class` has been a vocabulary kind since the word lists were
-- unpicked, holding First Class / Second Class AC / Second Class — while the
-- property dialog offered standard/express/VIP/sleeper beside it. Two lists
-- for one thing, disagreeing, is how "4 Stars" gets typed.
--
-- THIS IS NOT THE PRICING TIER. A five-star hotel can be sold in any tier, and
-- the tier is what a rate row is filed under. Nothing prices from the class —
-- it appears on the property card, so the office recognises a property at a
-- glance. That is also why this migration is safe: no rate resolves through it.
--
-- Existing values that match nothing are LEFT ALONE. The form keeps showing a
-- value it does not recognise (SupplierPropertiesPanel has always done this),
-- so "4 Stars" stays on its property until somebody tidies it, rather than
-- disappearing from a page nobody was editing.

BEGIN;

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
    'tour_type', 'physical_level', 'tour_audience', 'tour_theme', 'guide_mode',
    'airport', 'hotel_class', 'ship_category'
  ));

-- The words the dialog already offered, so nothing on screen changes until the
-- agency edits them. The keys are the slugs the form will store.
CREATE OR REPLACE FUNCTION public.seed_property_classes(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, rank) VALUES
    (p_org, 'hotel_class', '3_standard', '3★ standard', 1),
    (p_org, 'hotel_class', '4_superior', '4★ superior', 2),
    (p_org, 'hotel_class', '4_deluxe',   '4★ deluxe',   3),
    (p_org, 'hotel_class', '5_deluxe',   '5★ deluxe',   4),
    (p_org, 'hotel_class', '5_luxury',   '5★ luxury',   5),
    (p_org, 'ship_category', 'budget',   'Budget',      1),
    (p_org, 'ship_category', 'standard', 'Standard',    2),
    (p_org, 'ship_category', 'deluxe',   'Deluxe',      3),
    (p_org, 'ship_category', 'luxury',   'Luxury',      4)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- The baseline default-grants EXECUTE on every new routine to `authenticated`
-- (migration 20261012); a seed writes vocabulary for an org id it is handed.
REVOKE EXECUTE ON FUNCTION public.seed_property_classes(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_property_classes(uuid) FROM authenticated;

DO $seed$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_property_classes(o.id);
  END LOOP;
END
$seed$;

COMMIT;
