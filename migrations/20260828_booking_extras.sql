-- ============================================
-- Extras and upgrades — selling something after the trip is sold
-- ============================================
-- Today a confirmed booking's price cannot move. The booking total is copied
-- once at confirmation and PATCH /api/bookings/[id] does not accept total_cost
-- at all, so an extra tour or a business-class upgrade has nowhere to live.
-- The only workaround — hand-editing balance_due — is erased by the customer's
-- next payment, because record_booking_payment() recomputes
-- balance_due = greatest(0, total_cost - total_paid) every time.
--
-- So an extra must move total_cost. This migration is the whole storage for
-- docs/plans/extras-and-upgrades.md (phases E0-E5) — deliberately one
-- migration, not five, because they are applied by hand.
--
-- WHAT AN EXTRA IS: one priced line agreed AFTER the trip was priced. It is a
-- booking-level commercial fact and it never enters itinerary_services — the
-- itinerary edit page recomputes itinerary.total_cost from the sum of its
-- services on every save, so an extra written there would be silently dropped
-- by the next edit.
--
-- AN UPGRADE IS STORED AS A DELTA. unit_price on an upgrade is the difference
-- ("Economy -> Business, +820"), not the new price. The superseded service
-- stays in the itinerary untouched, and one formula totals both kinds.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  -- NULL = the whole booking (an extra day everyone joins). Set = one
  -- traveller's own (their upgrade, their insurance-like purchase), which is
  -- also what a private per-traveller portal link is allowed to touch.
  passenger_id UUID REFERENCES public.booking_passengers(id) ON DELETE CASCADE,

  kind TEXT NOT NULL DEFAULT 'addon'
    CHECK (kind IN ('addon', 'upgrade')),

  title TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- The SELLING price, per unit, in `currency`. NULL until the office prices
  -- it: a customer request arrives unpriced, and a blank price is a hole, not
  -- zero. Confirming without one is refused in the API.
  unit_price NUMERIC,
  currency TEXT,

  -- What we pay for it. NULL is again a hole, never zero — without it the
  -- extra reads as pure margin in the P&L.
  supplier_cost NUMERIC,
  supplier_currency TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- Where the price came from, when it came from the catalog rather than a
  -- person: 'entrance_fee' (entrance_fees.is_addon), 'activity', 'flight_rate'
  -- (a cabin-class delta), or 'manual'.
  source_kind TEXT,
  source_id UUID,

  -- Upgrades: the itinerary service this supersedes. Kept as provenance —
  -- nothing is written back to that row.
  replaces_service_id UUID,

  -- requested  customer asked, no price yet
  -- offered    office has priced it and the customer has not answered
  -- accepted   customer said yes; not yet secured with the supplier
  -- confirmed  MONEY MOVES HERE, and only here
  -- declined   customer said no      (terminal)
  -- withdrawn  office cancelled it   (terminal; reverses a confirmed total)
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'offered', 'accepted', 'confirmed', 'declined', 'withdrawn')),
  requested_via TEXT NOT NULL DEFAULT 'operator'
    CHECK (requested_via IN ('portal', 'operator')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priced_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,

  -- Stamped when the extra reaches an invoice, so it is billed exactly once.
  invoiced_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A price without its currency is not an amount of money.
  CONSTRAINT booking_extras_price_has_currency
    CHECK (unit_price IS NULL OR currency IS NOT NULL),
  CONSTRAINT booking_extras_cost_has_currency
    CHECK (supplier_cost IS NULL OR supplier_currency IS NOT NULL),
  -- Refuse a negative selling price outright; an upgrade delta of zero is a
  -- legitimate goodwill gesture, a negative one is a discount wearing a
  -- disguise and belongs in the trip price.
  CONSTRAINT booking_extras_price_not_negative
    CHECK (unit_price IS NULL OR unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_extras_booking
  ON public.booking_extras (booking_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_extras_passenger
  ON public.booking_extras (passenger_id)
  WHERE passenger_id IS NOT NULL;
-- The invoice sweep: confirmed and not yet billed.
CREATE INDEX IF NOT EXISTS idx_booking_extras_unbilled
  ON public.booking_extras (booking_id)
  WHERE status = 'confirmed' AND invoiced_at IS NULL;

-- Deny-by-default, like booking_change_requests: reached only through the
-- service role in its routes, so anon and authenticated get nothing directly.
ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;

-- ============================================
-- The booking's own two columns
-- ============================================
-- INVARIANT: total_cost = coalesce(base_total_cost, total_cost) + coalesce(extras_total, 0)
--
-- total_cost keeps meaning "what this customer owes for this trip", so the
-- payment RPC, the invoices, the payment schedule and every dashboard keep
-- working untouched. base_total_cost is the agreed tour price WITHOUT extras,
-- and it exists for one specific reason beyond bookkeeping:
-- computeAddTravellerReprice extends the agreed price as oldTotal/oldPax x
-- newPax. Divided from total_cost, one traveller's business-class upgrade
-- would be charged again to every traveller added afterwards. It divides
-- base_total_cost instead.
--
-- Both are NULL on every existing booking and stay NULL until an extra is
-- confirmed. Readers use coalesce(base_total_cost, total_cost), so the code
-- and this migration can land in either order.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS base_total_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS extras_total NUMERIC;

COMMENT ON COLUMN public.bookings.base_total_cost IS
  'The agreed trip price WITHOUT extras. NULL = no extras have ever been confirmed, in which case total_cost is the base. Never divide total_cost per person — divide this.';
COMMENT ON COLUMN public.bookings.extras_total IS
  'Sum of CONFIRMED booking_extras in the booking currency. total_cost = coalesce(base_total_cost, total_cost) + coalesce(extras_total, 0).';

COMMIT;
