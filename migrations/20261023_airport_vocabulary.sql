-- ============================================
-- Airports become the agency's own list, and a flight rate names one
-- ============================================
-- Operator, 2026-09-19: "we use international flights from Tokyo and from
-- Osaka to Cairo and other cities in Egypt. But the from and the to tabs only
-- show Egyptian city so there is no way to add international flights."
--
-- Two separate Egypt assumptions were in the way.
--
--   1. The flight rate form's From/To read the DESTINATIONS the agency sells.
--      Tokyo is not a destination — nobody runs a tour there — so it could not
--      be named, and putting it in destinations to work around that would have
--      dropped Tokyo into every hotel, transport and attraction city list and
--      called Japan somewhere this agency sells.
--
--   2. lib/pricing/flight-leg carried NINE hardcoded Egyptian cities and
--      answered 'CAI' for everything else. An install in another country got
--      Cairo for all of its airports, silently.
--
-- So airports become a vocabulary the agency curates, like airlines, tiers and
-- vehicle types before them — and a flight rate stores the airport KEY rather
-- than a city name. That is the real shape of the thing: an airline contract is
-- priced between airports, and a city can have two. Tokyo Narita and Tokyo
-- Haneda are different fares, and were previously the same word.
--
-- Cities stay the vocabulary for everything else. Hotels, transport, guides and
-- the days of a trip all happen in cities; only the ticket happens at an
-- airport. lib/rates/airports.ts is the seam: a leg between two cities is
-- served by whichever airports those cities have, and where a city has more
-- than one the existing "pick the exact flight on the day" path already asks.
--
-- ROUTE COLUMNS. flight_rates.route_from / route_to now hold an airport key.
-- The existing rows hold city names and are NOT converted: the operator
-- confirmed the current contents are dummy data ("we can totally ignore it if
-- we can build the permanent solution"). A row whose route no longer resolves
-- simply does not match a leg, which the engine already reports as a route
-- with no fare — it never prices something wrong. Re-enter them from the form.

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
    'tour_type', 'physical_level', 'tour_audience', 'tour_theme', 'guide_mode',
    'airport'
  ));

COMMENT ON COLUMN public.flight_rates.route_from IS
  'An org_vocabularies airport KEY (kind = airport), not a city name. A fare is '
  'priced between airports: a city with two of them has two fares. See '
  'lib/rates/airports.ts.';
COMMENT ON COLUMN public.flight_rates.route_to IS
  'An org_vocabularies airport KEY (kind = airport), not a city name.';

-- ---------------------------------------------------------------------------
-- Presets — the airports the engine's old hardcoded map knew, so an existing
-- Egypt install starts exactly where it was, plus nothing it did not have.
-- The ORIGIN airports an agency's customers fly from are deliberately NOT
-- seeded: they differ per install, and guessing Japan for everyone would be
-- the same baked-in assumption this migration exists to remove.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_airports(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, meta, rank) VALUES
    (p_org, 'airport', 'cai', 'Cairo',          'カイロ',     '{"iata":"CAI","city":"Cairo","country_code":"EG"}'::jsonb, 1),
    (p_org, 'airport', 'lxr', 'Luxor',          'ルクソール', '{"iata":"LXR","city":"Luxor","country_code":"EG"}'::jsonb, 2),
    (p_org, 'airport', 'asw', 'Aswan',          'アスワン',   '{"iata":"ASW","city":"Aswan","country_code":"EG"}'::jsonb, 3),
    (p_org, 'airport', 'abs', 'Abu Simbel',     'アブシンベル', '{"iata":"ABS","city":"Abu Simbel","country_code":"EG"}'::jsonb, 4),
    (p_org, 'airport', 'hrg', 'Hurghada',       'ハルガダ',   '{"iata":"HRG","city":"Hurghada","country_code":"EG"}'::jsonb, 5),
    (p_org, 'airport', 'ssh', 'Sharm el-Sheikh', 'シャルム',  '{"iata":"SSH","city":"Sharm el-Sheikh","country_code":"EG"}'::jsonb, 6),
    (p_org, 'airport', 'aly', 'Alexandria',     'アレクサンドリア', '{"iata":"ALY","city":"Alexandria","country_code":"EG"}'::jsonb, 7)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- The baseline default-grants EXECUTE on every new routine to `authenticated`
-- (migration 20261012). A seed function writes vocabulary for an org id it is
-- handed, so it stays with the service role that calls it.
REVOKE EXECUTE ON FUNCTION public.seed_airports(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_airports(uuid) FROM authenticated;

DO $seed$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_airports(o.id);
  END LOOP;
END
$seed$;

COMMIT;
