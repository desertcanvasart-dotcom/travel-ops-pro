-- Guide fares on the ticket catalogues (operator, 2026-09-04).
--
-- A throughout guide ("+1") rides the same trains, sleeping trains and
-- domestic flights as the group, and his fare may differ from the
-- customer's. One nullable column per catalogue, in the row's own
-- rate_currency:
--
--   NULL = no special fare — the guide pays the customer rate (a ticket
--          always has a public price, unlike a hotel bed concession);
--   0    = the guide rides free;
--   n    = the guide's fare.
--
-- The pricing engine does not yet price these legs from the itinerary
-- (the Abu Simbel flight-leg gap); these columns make the catalogue ready
-- so rate entry can start now and the engine work lands on real data.

ALTER TABLE public.train_rates
  ADD COLUMN IF NOT EXISTS guide_rate numeric(10,2);

ALTER TABLE public.sleeping_train_rates
  ADD COLUMN IF NOT EXISTS guide_rate numeric(10,2);

ALTER TABLE public.flight_rates
  ADD COLUMN IF NOT EXISTS guide_rate numeric(10,2);
