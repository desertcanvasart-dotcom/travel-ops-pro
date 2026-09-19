-- ============================================
-- "Suppliers Confirmed" with no confirmed supplier: ask, then record who said yes
-- ============================================
-- Operator, 2026-09-19, looking at DEMO-EXT-2026-001: "it has the stamp
-- supplier confirm while in the supplier tab on the same booking no supplier
-- was added — so is it free to assign any status regardless of actually
-- suppliers are assigned, reserved and confirmed?"
--
-- It was. bookings.status is written straight from the header dropdown
-- (PUT /api/bookings/[id]) with no reference to booking_supplier_status. The
-- one automatic promotion — every linked supplier row confirmed → the booking
-- goes supplier_confirmed — lives in the suppliers route and returns early
-- when a booking has no supplier rows at all, so an empty Suppliers tab never
-- triggered it and never blocked it either.
--
-- The rule chosen is confirm-and-proceed, NOT a hard block: staff who settle
-- confirmations by phone or outside the system must still be able to say so,
-- and prod bookings already carry hand-set statuses a hard block would
-- retroactively contradict. So the route asks, and when the operator says yes
-- it records the override here rather than losing it.
--
-- status_override is NULL on every booking whose status is backed by its
-- supplier rows. When it is set it holds, for the CURRENT status only:
--   status      the status that was forced (today always supplier_confirmed)
--   at          when
--   by / by_email   which person clicked through the warning
--   suppliers   {total, confirmed} as they stood at that moment
-- Any later status change clears it — the note describes the status on the
-- booking now, never a previous one.
BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS status_override jsonb;

COMMENT ON COLUMN public.bookings.status_override IS
  'Set when an operator confirmed a status its supplier rows do not back (see PUT /api/bookings/[id]); NULL otherwise. Cleared on any later status change.';

COMMIT;
