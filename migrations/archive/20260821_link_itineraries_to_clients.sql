-- ============================================
-- Trips that know whose they are
-- ============================================
-- `itineraries.client_id` exists and NOT ONE ROW HAS EVER HAD IT SET. Every
-- trip carries the client's name and email as text instead, so a client's
-- Booking History — which looks trips up by client_id — has always been empty,
-- for every client, while their invoices (which DO carry client_id) showed
-- revenue against them. That is the contradiction the operator hit: ¥1,099,897
-- billed, and "No bookings yet" beside it.
--
-- Backfilled BY EMAIL ONLY, and only where exactly one client matches. Names in
-- this table include "Unnamed Client" and "Smoke Tester"; matching on those
-- would attach trips to the wrong people, and a wrong link is worse than a
-- missing one. Anything unmatched keeps client_id NULL and still appears in the
-- booking history, which now also matches on the email the trip carries.

UPDATE itineraries i
SET client_id = c.id,
    updated_at = now()
FROM clients c
WHERE i.client_id IS NULL
  AND i.client_email IS NOT NULL
  AND btrim(i.client_email) <> ''
  AND lower(btrim(c.email)) = lower(btrim(i.client_email))
  AND (
    SELECT COUNT(*) FROM clients c2
    WHERE lower(btrim(c2.email)) = lower(btrim(i.client_email))
  ) = 1;

COMMENT ON COLUMN itineraries.client_id IS
  'The CRM client this trip belongs to. Set when a trip is created from a client''s page; backfilled by email for older rows. May be NULL for trips typed before the link existed — the booking history also matches on client_email for those.';
