-- 20261009_accommodation_supplements.sql
-- Supplements on hotel and cruise rates, priced from the agency's own list.
--
-- WHY: Settings → Vocabulary has carried a "Hotel supplements" list since
-- the white-label port (20260908) — Nile View, Upper Floor, Half Board — and
-- its description promised a grouped dropdown on the hotel rate form. No
-- form and no engine ever read it: it was the only vocabulary kind with no
-- consumer, copied in from the sibling product without the screen that used
-- it there. The operator noticed (13 Sep 2026): "shouldn't that appear under
-- the hotel rates form?"
--
-- WHAT: `supplements` JSONB on accommodation_rates and nile_cruises — the
-- list of supplements a rate carries, [{ key, name }], `key` a vocabulary
-- key. The PRICE per person per night lives inside each dated period's
-- rates (`seasons[].rates.supp:<key>:eur / :non_eur`, lib/rates/supplements),
-- so no new money column is added here: the period model already resolves
-- by date, converts by currency and mirrors nothing for these.
--
-- A new vocabulary kind, `cruise_supplement`, so a cruise's extras (a deck,
-- a balcony) are a list of their own — other markets sell them even where
-- Nile cruises do not — with presets seeded for every existing organisation
-- and for every future one (the on-insert seeder now covers it).
--
-- The kind CHECK on org_vocabularies is found by DEFINITION, not by name:
-- it was declared inline in 20260908 and carries whatever name Postgres gave
-- it (postgrest-embed-fk-trap: never guard a migration on a constraint
-- NAME). Loosening only — every existing row already satisfies the new list.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO
-- NOTHING, DROP TRIGGER IF EXISTS. Run twice, unchanged.

BEGIN;

-- ---------------------------------------------------------------------------
-- The list on the rate row
-- ---------------------------------------------------------------------------
ALTER TABLE public.accommodation_rates
  ADD COLUMN IF NOT EXISTS supplements jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.nile_cruises
  ADD COLUMN IF NOT EXISTS supplements jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.accommodation_rates DROP CONSTRAINT IF EXISTS accommodation_rates_supplements_is_array;
ALTER TABLE public.accommodation_rates
  ADD CONSTRAINT accommodation_rates_supplements_is_array CHECK (jsonb_typeof(supplements) = 'array');
ALTER TABLE public.nile_cruises DROP CONSTRAINT IF EXISTS nile_cruises_supplements_is_array;
ALTER TABLE public.nile_cruises
  ADD CONSTRAINT nile_cruises_supplements_is_array CHECK (jsonb_typeof(supplements) = 'array');

COMMENT ON COLUMN public.accommodation_rates.supplements IS
  'Supplements this rate carries: [{key, name}], key = org_vocabularies hotel_supplement key. Per-night prices live in seasons[].rates.supp:<key>:eur/:non_eur.';
COMMENT ON COLUMN public.nile_cruises.supplements IS
  'Supplements this cruise carries: [{key, name}], key = org_vocabularies cruise_supplement key. Per-night prices live in seasons[].rates.supp:<key>:eur/:non_eur.';

-- ---------------------------------------------------------------------------
-- The vocabulary kind: cruise_supplement
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
        AND pg_get_constraintdef(oid) LIKE '%hotel_supplement%'
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
    'airport_direction', 'activity_pricing_type', 'cruise_supplement'
  ));

-- Presets for one organisation; the description is the group the form
-- shows them under. Gaps only — an agency's own edits are never overwritten.
CREATE OR REPLACE FUNCTION public.seed_cruise_supplements(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, description, rank) VALUES
    (p_org, 'cruise_supplement', 'upper_deck',       'Upper Deck',       '上層デッキ',          'Deck',  1),
    (p_org, 'cruise_supplement', 'panoramic_window', 'Panoramic Window', 'パノラマウィンドウ',  'Cabin', 2),
    (p_org, 'cruise_supplement', 'private_balcony',  'Private Balcony',  'プライベートバルコニー', 'Cabin', 3)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_cruise_supplements(uuid) TO service_role;

-- A new organisation gets every preset list: the existing seeder, then this
-- kind. One trigger function, so a future reseed of seed_org_vocabulary
-- (the relabel migrations replace its whole body) cannot drop this kind.
CREATE OR REPLACE FUNCTION public.seed_org_vocabulary_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.seed_org_vocabulary(NEW.id, NULL);
  PERFORM public.seed_cruise_supplements(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_vocabulary ON public.organizations;
CREATE TRIGGER trg_seed_org_vocabulary
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_org_vocabulary_on_insert();

-- Backfill: every existing organisation gets the presets (gaps only).
DO $backfill$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_cruise_supplements(o.id);
  END LOOP;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  bad integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accommodation_rates' AND column_name = 'supplements'
  ) THEN RAISE EXCEPTION 'accommodation_rates.supplements is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'nile_cruises' AND column_name = 'supplements'
  ) THEN RAISE EXCEPTION 'nile_cruises.supplements is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.org_vocabularies'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%cruise_supplement%'
  ) THEN RAISE EXCEPTION 'org_vocabularies kind CHECK does not admit cruise_supplement'; END IF;
  SELECT count(*) INTO bad
    FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_vocabularies v WHERE v.org_id = o.id AND v.kind = 'cruise_supplement'
    );
  IF bad > 0 THEN
    RAISE EXCEPTION 'cruise_supplement: % organisation(s) without presets after backfill', bad;
  END IF;
END
$verify$;

COMMIT;
