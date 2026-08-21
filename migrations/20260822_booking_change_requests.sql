-- ============================================
-- Booking change requests — the re-price guard  (Phase 3)
-- ============================================
-- Adding a traveller beyond the booked count changes the price. The customer
-- must not do it silently: from the portal they REQUEST it, the operator
-- re-prices and approves, and only then are the slots created. Filling slots
-- that already exist stays free (handled elsewhere); this table is the intake
-- and audit for count INCREASES.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  kind TEXT NOT NULL DEFAULT 'add_traveller'
    CHECK (kind IN ('add_traveller')),
  -- How many EXTRA travellers are requested beyond the current booked count.
  requested_count INTEGER NOT NULL CHECK (requested_count > 0),
  note TEXT,

  requested_via TEXT NOT NULL DEFAULT 'portal'
    CHECK (requested_via IN ('portal', 'operator')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_change_requests_booking
  ON public.booking_change_requests (booking_id, status);

-- At most ONE pending add-traveller request per booking — re-asking updates the
-- existing one rather than piling up duplicates for the operator.
CREATE UNIQUE INDEX IF NOT EXISTS uq_change_requests_one_pending
  ON public.booking_change_requests (booking_id)
  WHERE status = 'pending';

-- Deny-by-default: born under the 2026-08-21 lockdown, this table is reached
-- only via the service role in its routes. RLS on, no public policy, so anon
-- and authenticated get nothing directly.
ALTER TABLE public.booking_change_requests ENABLE ROW LEVEL SECURITY;

COMMIT;
