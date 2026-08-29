-- ============================================
-- Per-traveller portal links + booking portal mode  (Phase 1)
-- ============================================
-- Until now one portal link per booking showed EVERY traveller's form and was
-- gated on the lead's family name — fine for a family, wrong for friends, where
-- each person's passport/medical must stay private from the others.
--
-- This adds:
--   * booking_portal_links.passenger_id — NULL = the booking-level link
--     (family mode, shows all forms); set = a private link scoped to ONE
--     traveller (friends mode), gated on THAT traveller's name + date of birth.
--   * bookings.portal_mode — how the booking collects details.
--
-- The read (page loader), the write (travellers route) and the gate all branch
-- on passenger_id. See docs/plans/portal-multi-traveller.md.
-- ============================================

BEGIN;

ALTER TABLE public.booking_portal_links
  ADD COLUMN IF NOT EXISTS passenger_id UUID NULL
    REFERENCES public.booking_passengers(id) ON DELETE CASCADE;

-- The old "one live link per booking" index must become "one live link per
-- (booking, passenger)". NULL passenger_id collapses to the nil uuid so a
-- booking still has at most ONE live booking-level link, while each passenger
-- gets at most one live private link.
DROP INDEX IF EXISTS public.uq_booking_portal_links_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_portal_links_active
  ON public.booking_portal_links
     (booking_id, COALESCE(passenger_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_portal_links_passenger
  ON public.booking_portal_links (passenger_id)
  WHERE passenger_id IS NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS portal_mode TEXT NOT NULL DEFAULT 'family';

-- Idempotent CHECK: add only if absent (ADD CONSTRAINT has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_portal_mode_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_portal_mode_check CHECK (portal_mode IN ('family', 'friends'));
  END IF;
END $$;

COMMENT ON COLUMN public.booking_portal_links.passenger_id IS
  'NULL = booking-level link (family, all forms). Set = private link scoped to one traveller (friends), gated on that traveller name+DOB.';
COMMENT ON COLUMN public.bookings.portal_mode IS
  'family = one link, lead fills all. friends = one private link per traveller.';

COMMIT;
