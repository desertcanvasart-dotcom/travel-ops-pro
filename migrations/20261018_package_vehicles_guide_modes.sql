-- ============================================
-- Transport packages price vehicles like transportation rates; guide modes
-- ============================================
-- Operator, 2026-09-17:
--
-- 1. "The transport package form should be aligned with the transportation
--    form — now they are different, and that will cause trouble."
--    b2b_transport_packages still held five fixed vehicle columns
--    (sedan…bus, a rate and a maximum each), while transportation_rates has
--    carried a `vehicles` list keyed by the agency's own vehicle vocabulary
--    since 20261005. A vehicle added in Settings → Vocabulary could be priced
--    on a road transfer and never on a package, and the two picked a vehicle
--    for a group by different rules.
--
--    Here packages get the same `vehicles` list
--    ([{key, rate_eur, rate_non_eur, capacity_min, capacity_max}],
--    lib/rates/vehicle-bands.ts), backfilled from the columns. The columns
--    stay for now and are no longer written or read once a row has a list;
--    a later migration drops them, as 20261006 did for transportation.
--
-- 2. "Transportation rates always follow the Vocabulary vehicle sizes."
--    A vehicle's passenger band is the vocabulary entry's
--    meta {min_pax, max_pax}, not the row's. The app stamps it on every write
--    and re-stamps every row when the band changes in Settings. The backfill
--    below stamps the package rows. A vehicle the vocabulary does not list
--    (the packages' sedan / minivan / van / minibus on an agency that sells
--    HIACE / Coaster / Bus) keeps the band it was entered with — hiding a
--    vehicle never breaks a rate that prices it — and the form shows it as
--    not in the vocabulary.
--
-- 3. "In the guide vocabulary section we don't have the option to add spot
--    and throughout; same for the guide form."
--    A `guide_mode` vocabulary kind (presets spot, throughout) and a
--    guide_rates.guide_mode column. Every existing rate is a spot rate. A
--    throughout quote prices its guide from throughout rates only — none
--    entered is No rate, never the spot rate (operator: "show no rate until I
--    add one").

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Package vehicles
-- ---------------------------------------------------------------------------
ALTER TABLE public.b2b_transport_packages ADD COLUMN IF NOT EXISTS vehicles jsonb;

COMMENT ON COLUMN public.b2b_transport_packages.vehicles IS
  'The vehicles this package offers: [{key, rate_eur, rate_non_eur, capacity_min, capacity_max}], key = vocabulary vehicle_type key, band = the vocabulary''s. Read via lib/rates/vehicle-bands.ts. The <vehicle>_rate/_capacity columns are no longer read once this is set.';

-- Each column held only a MAXIMUM; a vehicle's band starts one above the
-- previous column's maximum (a blank sedan still ends at its capacity).
UPDATE public.b2b_transport_packages p
SET vehicles = COALESCE((
  SELECT jsonb_agg(
           jsonb_build_object(
             'key', v.key,
             'rate_eur', v.rate,
             'rate_non_eur', NULL,
             'capacity_min', v.cmin,
             'capacity_max', GREATEST(v.cmax, v.cmin))
           ORDER BY GREATEST(v.cmax, v.cmin), v.cmin)
  FROM (VALUES
    ('sedan',   p.sedan_rate,   1,                                          COALESCE(p.sedan_capacity, 3)),
    ('minivan', p.minivan_rate, COALESCE(p.sedan_capacity, 3) + 1,          COALESCE(p.minivan_capacity, 7)),
    ('van',     p.van_rate,     COALESCE(p.minivan_capacity, 7) + 1,        COALESCE(p.van_capacity, 12)),
    ('minibus', p.minibus_rate, COALESCE(p.van_capacity, 12) + 1,           COALESCE(p.minibus_capacity, 20)),
    ('bus',     p.bus_rate,     COALESCE(p.minibus_capacity, 20) + 1,       COALESCE(p.bus_capacity, 50))
  ) AS v(key, rate, cmin, cmax)
  WHERE v.rate IS NOT NULL AND v.rate > 0
), '[]'::jsonb)
WHERE p.vehicles IS NULL;

-- The vocabulary's band for every vehicle it lists, on the package's own org.
-- Guarded on org_id existing: the E2E project's b2b_transport_packages predates
-- the baseline and has no org_id (nor rate_currency) — a fresh install and
-- production both have it (2026-09-17).
DO $stamp$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'b2b_transport_packages' AND column_name = 'org_id'
  ) THEN
    EXECUTE $q$
UPDATE public.b2b_transport_packages p
SET vehicles = (
  SELECT COALESCE(jsonb_agg(stamped.v ORDER BY (stamped.v->>'capacity_max')::int, (stamped.v->>'capacity_min')::int), '[]'::jsonb)
  FROM (
    SELECT CASE
             WHEN ov.key IS NOT NULL
               THEN e.v || jsonb_build_object('capacity_min', (ov.meta->>'min_pax')::int, 'capacity_max', (ov.meta->>'max_pax')::int)
             ELSE e.v
           END AS v
    FROM jsonb_array_elements(p.vehicles) AS e(v)
    LEFT JOIN public.org_vocabularies ov
      ON ov.org_id = p.org_id
     AND ov.kind = 'vehicle_type'
     AND ov.key = e.v->>'key'
     AND (ov.meta->>'min_pax') ~ '^[0-9]+$'
     AND (ov.meta->>'max_pax') ~ '^[0-9]+$'
     AND (ov.meta->>'max_pax')::int >= GREATEST((ov.meta->>'min_pax')::int, 1)
  ) AS stamped
)
WHERE jsonb_typeof(p.vehicles) = 'array' AND jsonb_array_length(p.vehicles) > 0
    $q$;
  END IF;
END
$stamp$;

-- ---------------------------------------------------------------------------
-- 3a. Guide rates carry a mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.guide_rates ADD COLUMN IF NOT EXISTS guide_mode text NOT NULL DEFAULT 'spot';

COMMENT ON COLUMN public.guide_rates.guide_mode IS
  'The org_vocabularies guide_mode key this rate is for: spot (a guide per sightseeing day) or throughout (one guide travels with the group). The engine prices a quote''s guide from rates of its own mode only.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.guide_rates'::regclass AND conname = 'guide_rates_guide_mode_key') THEN
    ALTER TABLE public.guide_rates
      ADD CONSTRAINT guide_rates_guide_mode_key CHECK (guide_mode ~ '^[a-z0-9][a-z0-9_]{0,59}$');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3b. The guide_mode vocabulary kind
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
    'tour_type', 'physical_level', 'tour_audience', 'tour_theme', 'guide_mode'
  ));

-- Presets for one organisation. Gaps only — an agency's own edits are never
-- overwritten, so this is safe to re-run.
CREATE OR REPLACE FUNCTION public.seed_guide_modes(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, description, rank) VALUES
    (p_org, 'guide_mode', 'spot',       'Spot guide',       'スポットガイド', 'A guide in each city on its sightseeing days', 1),
    (p_org, 'guide_mode', 'throughout', 'Throughout guide', '全行程ガイド',   'One guide travels with the group from the first day to the last', 2)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_guide_modes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_guide_modes(uuid) TO service_role;

-- A new organisation gets every preset list (the trigger body is replaced
-- whole, so every seeder is called from here).
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
  PERFORM public.seed_guide_modes(NEW.id);
  RETURN NEW;
END;
$$;

DO $backfill$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_guide_modes(o.id);
  END LOOP;
END
$backfill$;

COMMIT;
