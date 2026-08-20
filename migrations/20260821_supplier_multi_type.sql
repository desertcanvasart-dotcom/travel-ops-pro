-- ============================================
-- A supplier can be more than one thing
-- ============================================
-- Abdulrahman drives transfers AND meets clients at the airport. Sezar Travel
-- runs vehicles AND does meet-and-greet. With a single `type` column the
-- operator had to pick which half of the truth to record, and the other half
-- disappeared from the screen that needed it.
--
-- `types` is the full set; `type` stays as the PRIMARY one. Keeping both is
-- deliberate: `type` is what every list badge, the guides compatibility view
-- and a dozen filters already read, and a rename would be a bigger change than
-- the problem. The CHECK below stops them from disagreeing.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS types TEXT[] NOT NULL DEFAULT '{}';

-- Everyone starts as exactly what they already were.
UPDATE suppliers SET types = ARRAY[type] WHERE (types IS NULL OR types = '{}') AND type IS NOT NULL;

-- The vocabulary is the same list `type` is checked against; a supplier cannot
-- acquire a role that does not exist.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_types_vocab_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_types_vocab_check
  CHECK (types <@ ARRAY[
    'hotel','transport','local_operator','driver','guide','cruise',
    'activity_provider','attraction','tour_operator','ground_handler',
    'restaurant','shop','train_operator','air_carrier',
    'airport_assistant','hotel_assistant','other'
  ]::TEXT[]);

-- The primary type must be one of the roles the supplier actually has.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_type_in_types_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_type_in_types_check
  CHECK (type IS NULL OR type = ANY(types));

-- Containment is how every picker will ask "who does this?".
CREATE INDEX IF NOT EXISTS idx_suppliers_types ON suppliers USING GIN (types);

COMMENT ON COLUMN suppliers.types IS
  'Every role this supplier fills. Pickers ask "types @> [role]"; `type` is the primary role kept for badges and the guides view, and is always one of these.';

-- The guides compatibility view was keyed on the single type. A guide who also
-- drives must not vanish from the guide roster because their primary role is
-- something else.
CREATE OR REPLACE VIEW public.guides AS
SELECT
  id,
  name,
  contact_email                AS email,
  contact_phone                AS phone,
  languages,
  specialties,
  certification_number,
  license_expiry,
  (status = 'active')          AS is_active,
  max_group_size,
  hourly_rate,
  daily_rate,
  emergency_contact_name,
  emergency_contact_phone,
  address,
  notes,
  profile_photo_url,
  created_at,
  updated_at,
  tier,
  is_preferred,
  city,
  whatsapp
FROM public.suppliers
WHERE 'guide' = ANY(types);
