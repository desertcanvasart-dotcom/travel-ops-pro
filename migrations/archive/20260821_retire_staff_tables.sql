-- ============================================
-- Retiring "staff": the people who meet clients are suppliers
-- ============================================
-- Operator's decision, and the data agreed with them. `airport_staff` held nine
-- rows that were three different things:
--
--   · three of the operator's OWN TEAM with system logins — Shrouq Mohamed
--     (Office Staff), Adham Galal (Tour Leader), Adham Wael (Transfer
--     Coordinator). They are team members; nothing buys their time.
--   · three people already on file as suppliers doing meet-and-greet as well —
--     Abdulrahman, Mina William, Sezar Travel.
--   · three meet-and-greet providers recorded nowhere else — Hasan Matar,
--     Mohamed Moussa, Ahmed.
--
-- End state: an assistant is a supplier, even when they are on the company
-- payroll, because the company buys the service the same way either way.
-- Team membership is a system login, and lives in organization_members.
--
-- Follows the guides retirement (20260627_guides_compat_view.sql) exactly:
-- rename the real table aside, put a view of the same shape over suppliers, and
-- add INSTEAD OF triggers so every existing read and write keeps working while
-- the screens are repointed. Reversible: the data is in _deprecated_airport_staff.
--
-- Requires 20260821_supplier_multi_type.sql (the `types` column).

BEGIN;

-- ============================================
-- 0. Who moves, and who does not
-- ============================================
-- Split by the role the operator recorded, not by a list of names: the six
-- 'Meet & Greet' rows are the service, the other three are job titles inside
-- the company (Office Staff, Tour Leader, Transfer Coordinator — Shrouq
-- Mohamed, Adham Galal, Adham Wael, all three of whom have system logins).
--
-- Their names are spelled differently in user_profiles ("Adham Glal",
-- "Adham Elkomey"), so matching people by name across the two tables would
-- have missed them. The role is the reliable signal.
CREATE TEMP TABLE _pending_airport_staff ON COMMIT DROP AS
SELECT * FROM public.airport_staff
WHERE COALESCE(role, '') NOT IN ('Office Staff', 'Tour Leader', 'Transfer Coordinator');

-- ============================================
-- 1. Columns an assistant needs that suppliers did not carry
-- ============================================
-- Same move the guides merge made: the shape follows the people, not the table.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS airport_location TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shift_times TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_role TEXT;

COMMENT ON COLUMN suppliers.airport_location IS 'Which airport an airport assistant works at.';
COMMENT ON COLUMN suppliers.shift_times IS 'When an assistant is available — free text, as the operator writes it.';
COMMENT ON COLUMN suppliers.service_role IS 'What an assistant does on the ground (Meet & Greet, Transfer Coordinator). Distinct from suppliers.type, which is what they are TO the company.';

-- ============================================
-- 2. The three who already exist as suppliers gain the airport role
-- ============================================
-- Their primary type is left alone: Abdulrahman stays a local operator on the
-- transport screens, and now also appears under Airport Assistants.
UPDATE suppliers s
SET types = array_append(s.types, 'airport_assistant'),
    airport_location = COALESCE(s.airport_location, a.airport_location),
    shift_times      = COALESCE(s.shift_times, a.shift_times),
    service_role     = COALESCE(s.service_role, a.role),
    updated_at       = now()
FROM _pending_airport_staff a
WHERE lower(btrim(s.name)) = lower(btrim(a.name))
  AND NOT ('airport_assistant' = ANY(s.types));

-- ============================================
-- 3. The three recorded nowhere else become suppliers
-- ============================================
INSERT INTO suppliers (
  id, name, type, types, entity_kind, status,
  contact_phone, whatsapp, contact_email, languages,
  airport_location, shift_times, service_role, notes,
  tier, is_preferred, emergency_contact_name, created_at, updated_at
)
SELECT
  a.id, btrim(a.name), 'airport_assistant', ARRAY['airport_assistant'], 'individual',
  CASE WHEN a.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
  a.phone, a.whatsapp, a.email, a.languages,
  a.airport_location, a.shift_times, a.role, a.notes,
  a.tier, COALESCE(a.is_preferred, false), a.emergency_contact,
  COALESCE(a.created_at, now()), now()
FROM _pending_airport_staff a
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers s WHERE lower(btrim(s.name)) = lower(btrim(a.name))
);

-- ============================================
-- 4. The old table steps aside
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'airport_staff' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.airport_staff RENAME TO _deprecated_airport_staff;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hotel_staff' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.hotel_staff RENAME TO _deprecated_hotel_staff;
  END IF;
END $$;

-- ============================================
-- 5. Views in the old shape, sourced from suppliers
-- ============================================
CREATE OR REPLACE VIEW public.airport_staff AS
SELECT
  id,
  name,
  service_role            AS role,
  airport_location,
  contact_phone           AS phone,
  whatsapp,
  contact_email           AS email,
  languages,
  shift_times,
  notes,
  (status = 'active')     AS is_active,
  created_at,
  updated_at,
  emergency_contact_name  AS emergency_contact,
  tier,
  is_preferred
FROM public.suppliers
WHERE 'airport_assistant' = ANY(types);

CREATE OR REPLACE VIEW public.hotel_staff AS
SELECT
  id,
  name,
  service_role            AS role,
  contact_phone           AS phone,
  whatsapp,
  contact_email           AS email,
  languages,
  shift_times,
  notes,
  (status = 'active')     AS is_active,
  created_at,
  updated_at,
  emergency_contact_name  AS emergency_contact,
  tier,
  is_preferred
FROM public.suppliers
WHERE 'hotel_assistant' = ANY(types);

-- ============================================
-- 6. Writes through the views land in suppliers
-- ============================================
CREATE OR REPLACE FUNCTION public.airport_staff_view_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, name, type, types, entity_kind, status, service_role, airport_location,
    contact_phone, whatsapp, contact_email, languages, shift_times, notes,
    emergency_contact_name, tier, is_preferred, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.name, 'airport_assistant',
    ARRAY['airport_assistant'], 'individual',
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.role, NEW.airport_location, NEW.phone, NEW.whatsapp, NEW.email,
    NEW.languages, NEW.shift_times, NEW.notes, NEW.emergency_contact,
    NEW.tier, COALESCE(NEW.is_preferred, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.airport_staff_view_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.suppliers SET
    name                   = NEW.name,
    service_role           = NEW.role,
    airport_location       = NEW.airport_location,
    contact_phone          = NEW.phone,
    whatsapp               = NEW.whatsapp,
    contact_email          = NEW.email,
    languages              = NEW.languages,
    shift_times            = NEW.shift_times,
    notes                  = NEW.notes,
    emergency_contact_name = NEW.emergency_contact,
    tier                   = NEW.tier,
    is_preferred           = NEW.is_preferred,
    status                 = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    updated_at             = now()
  WHERE id = OLD.id AND 'airport_assistant' = ANY(types);
  RETURN NEW;
END $$;

-- Deleting an assistant who ALSO drives must not delete the driver: the role
-- comes off, and only a supplier left with no roles is removed.
CREATE OR REPLACE FUNCTION public.airport_staff_view_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.suppliers
  SET types = array_remove(types, 'airport_assistant'),
      type = CASE WHEN type = 'airport_assistant'
                  THEN (array_remove(types, 'airport_assistant'))[1]
                  ELSE type END,
      updated_at = now()
  WHERE id = OLD.id;
  DELETE FROM public.suppliers WHERE id = OLD.id AND (types IS NULL OR cardinality(types) = 0);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS airport_staff_view_insert_trg ON public.airport_staff;
CREATE TRIGGER airport_staff_view_insert_trg INSTEAD OF INSERT ON public.airport_staff
  FOR EACH ROW EXECUTE FUNCTION public.airport_staff_view_insert();
DROP TRIGGER IF EXISTS airport_staff_view_update_trg ON public.airport_staff;
CREATE TRIGGER airport_staff_view_update_trg INSTEAD OF UPDATE ON public.airport_staff
  FOR EACH ROW EXECUTE FUNCTION public.airport_staff_view_update();
DROP TRIGGER IF EXISTS airport_staff_view_delete_trg ON public.airport_staff;
CREATE TRIGGER airport_staff_view_delete_trg INSTEAD OF DELETE ON public.airport_staff
  FOR EACH ROW EXECUTE FUNCTION public.airport_staff_view_delete();

COMMIT;
