-- ============================================
-- A preferred transport supplier, like a preferred hotel
-- ============================================
-- The operator, 2026-11-05: several transport companies quote the same route
-- with the same cars at different prices; the office wants to say which one
-- it uses, the way a hotel is starred Preferred.
--
-- Rates › Transportation already keeps one row per supplier for a route
-- (the POST natural key includes supplier_id). What decided between them was
-- the newest validity start, then the service code — an accident of data
-- entry. A starred row now goes first among the rows valid on the day
-- (lib/auto-pricing-service orderTransportRows).

BEGIN;

ALTER TABLE public.transportation_rates
  ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN NOT NULL DEFAULT false;

COMMIT;
