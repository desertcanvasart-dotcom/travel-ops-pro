-- ============================================
-- "Not priced" must be representable on staff rate rows
-- ============================================
-- 2026-08-21. Two rows were sitting at €0:
--
--   hotel_staff_rates   HOTEL-PORTER-ALL    porter       0
--   airport_staff_rates AIR-CAI-MEETGR-ARR  meet_greet   0
--
-- They came from the rate forms, which default rate_eur to 0 — so saving a row
-- without typing a price stores zero. The engine then reads zero as "no usable
-- rate" (usableRate: no assistant works for free) and records a pricing hole
-- saying "No rate — add it in Rates → …", advice that is wrong when the row is
-- already on the screen. The operator sees a €0 rate and a message telling them
-- to create the rate they are looking at.
--
-- rate_eur is NOT NULL on both tables, so "we have not priced this yet" cannot
-- currently be said at all. This makes it sayable, and converts the existing
-- zeros — which mean exactly that — to NULL.
--
-- Zero and NULL behave identically in the engine (both unusable). The
-- difference is that NULL can be DISPLAYED as unpriced, which is what the rate
-- screens now do instead of printing "€0" for a row that will never charge.
-- ============================================

BEGIN;

ALTER TABLE public.hotel_staff_rates   ALTER COLUMN rate_eur DROP NOT NULL;
ALTER TABLE public.airport_staff_rates ALTER COLUMN rate_eur DROP NOT NULL;

-- A zero here has only ever meant "nobody typed a price".
UPDATE public.hotel_staff_rates   SET rate_eur = NULL WHERE rate_eur = 0;
UPDATE public.airport_staff_rates SET rate_eur = NULL WHERE rate_eur = 0;

COMMENT ON COLUMN public.hotel_staff_rates.rate_eur IS
  'NULL means not priced yet — the engine reports it as an unpriced hole and the rates screen shows a dash. Never store 0 to mean "unknown".';
COMMENT ON COLUMN public.airport_staff_rates.rate_eur IS
  'NULL means not priced yet — the engine reports it as an unpriced hole and the rates screen shows a dash. Never store 0 to mean "unknown".';

COMMIT;
