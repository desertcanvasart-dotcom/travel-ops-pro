-- ============================================
-- G2.1 Phase 3+4: retire the guides table behind a compatibility view
-- ============================================
-- End state (operator decision): suppliers(type='guide') is the single source
-- of truth for guides. Rather than edit the 19 code sites that read/write
-- `guides` (13 of them in the LIVE pricing engine, no test suite), we:
--   1. rename the real table  guides -> _deprecated_guides  (data preserved,
--      reversible; holds the discarded non-canonical rows),
--   2. create a thin VIEW  guides  over suppliers(type='guide') mapping the
--      old guides column shape (email<-contact_email, phone<-contact_phone,
--      is_active<-(status='active'), …), so every existing read keeps working,
--   3. add INSTEAD OF triggers so the guides CRUD writes flow into suppliers.
--
-- Net: zero application code changes; the pricing engine reads suppliers via
-- the view; guide management (app/api/guides, app/rates/guides) writes suppliers
-- via the triggers. The `guides` name persists as a view (reads can be
-- repointed to suppliers directly later to drop it).
--
-- Date: 2026-06-27
-- ============================================

-- 1. Rename the base table out of the way (guarded so re-running is safe).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'guides' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.guides RENAME TO _deprecated_guides;
  END IF;
END $$;

-- 2. Compatibility view in the old guides shape, sourced from suppliers.
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
WHERE type = 'guide';

-- 3. INSTEAD OF triggers: translate writes on the view into suppliers writes.
CREATE OR REPLACE FUNCTION public.guides_view_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, type, entity_kind, name, contact_email, contact_phone, languages,
    specialties, certification_number, license_expiry, status, max_group_size,
    hourly_rate, daily_rate, emergency_contact_name, emergency_contact_phone,
    address, notes, profile_photo_url, tier, is_preferred, city, whatsapp,
    created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), 'guide', 'individual', NEW.name,
    NEW.email, NEW.phone, NEW.languages, NEW.specialties, NEW.certification_number,
    NEW.license_expiry,
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.max_group_size, NEW.hourly_rate, NEW.daily_rate, NEW.emergency_contact_name,
    NEW.emergency_contact_phone, NEW.address, NEW.notes, NEW.profile_photo_url,
    NEW.tier, COALESCE(NEW.is_preferred, false), NEW.city, NEW.whatsapp,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.suppliers SET
    name                    = NEW.name,
    contact_email           = NEW.email,
    contact_phone           = NEW.phone,
    languages               = NEW.languages,
    specialties             = NEW.specialties,
    certification_number    = NEW.certification_number,
    license_expiry          = NEW.license_expiry,
    status                  = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    max_group_size          = NEW.max_group_size,
    hourly_rate             = NEW.hourly_rate,
    daily_rate              = NEW.daily_rate,
    emergency_contact_name  = NEW.emergency_contact_name,
    emergency_contact_phone = NEW.emergency_contact_phone,
    address                 = NEW.address,
    notes                   = NEW.notes,
    profile_photo_url       = NEW.profile_photo_url,
    tier                    = NEW.tier,
    is_preferred            = NEW.is_preferred,
    city                    = NEW.city,
    whatsapp                = NEW.whatsapp,
    updated_at              = now()
  WHERE id = OLD.id AND type = 'guide';
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.suppliers WHERE id = OLD.id AND type = 'guide';
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS guides_view_insert_trg ON public.guides;
DROP TRIGGER IF EXISTS guides_view_update_trg ON public.guides;
DROP TRIGGER IF EXISTS guides_view_delete_trg ON public.guides;
CREATE TRIGGER guides_view_insert_trg INSTEAD OF INSERT ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.guides_view_insert();
CREATE TRIGGER guides_view_update_trg INSTEAD OF UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.guides_view_update();
CREATE TRIGGER guides_view_delete_trg INSTEAD OF DELETE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.guides_view_delete();

-- 4. Match the grants the base table had (service_role bypasses RLS; the app
--    uses the service-role key for these routes).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guides TO service_role, authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- `guides` is now a read/write view over suppliers(type='guide'). The original
-- rows live in _deprecated_guides (drop it once you're satisfied). No app code
-- changed — every .from('guides') read/write now resolves to suppliers.
-- ============================================
