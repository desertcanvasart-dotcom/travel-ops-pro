-- ============================================
-- A website order's seat hold: checked and placed in one locked step
-- ============================================
-- An order that arrives through Order Intake (the operator's paste page, the
-- hosted /order form, or the website order emails the mailbox sync reads —
-- lib/intake/process-order.ts) holds seats on the programme's departure for
-- that date, as a PENDING departure_bookings row. Since the Sell audit (#21)
-- the hold is placed only when the party fits the seats left. But the check
-- and the hold were two separate requests: read the holds, count the seats in
-- the app (seatsFree), then insert. Nothing in the database enforces
-- max_pax or maintains booked_pax, so two orders for the last seats arriving
-- at the same moment (the sync and a customer on /order, or two customers)
-- both read "2 free", both inserted, and the departure was held past its
-- maximum — exactly what the check was added to stop.
--
-- hold_departure_seats(org, departure, pax, client, client name, notes) does
-- both under the departure row's lock:
--
--   1. SELECT … FOR UPDATE the departure (this company's, not cancelled). A
--      second caller for the same departure waits here until the first one's
--      transaction ends, then counts the first one's hold.
--   2. Seats free = max_pax − (the larger of booked_pax and the confirmed
--      holds) − the pending holds, never below 0 — the same rule as
--      seatsFree() in lib/intake/process-order.ts, which the preview still
--      uses (booked_pax is the office's own count, kept by hand on the
--      departures grid, and a pending hold is not in it yet).
--   3. The pending hold is inserted only if the party fits.
--
-- It returns jsonb { held, free, id }: held = whether the hold was placed,
-- free = the seats that were free when it checked (before this hold), id =
-- the new departure_bookings row (null when not held). A departure not found
-- for that company, or cancelled, returns held = false, free = 0.
--
-- What the route does when it does not fit is unchanged: the quote is still
-- created, no seats are held, and the result says how many were free.
--
-- SECURITY DEFINER with a fixed search_path, and executable by service_role
-- only: every Order Intake door runs on the service-role client, and a
-- signed-in user (or anon, with the public key) must not be able to place
-- holds on any company's departures by naming its id
-- (20261129_revoke_definer_functions has the rule).
--
-- Idempotent (CREATE OR REPLACE; the REVOKE/GRANT restate the same state)
-- and guarded on both tables existing (to_regclass).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tour_departures') IS NULL OR to_regclass('public.departure_bookings') IS NULL THEN
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.hold_departure_seats(
    p_org_id uuid,
    p_departure_id uuid,
    p_pax integer,
    p_client_id uuid DEFAULT NULL,
    p_client_name text DEFAULT NULL,
    p_notes text DEFAULT NULL
  ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    v_max integer;
    v_booked integer;
    v_confirmed integer;
    v_pending integer;
    v_free integer;
    v_id uuid;
  BEGIN
    IF p_org_id IS NULL OR p_departure_id IS NULL THEN
      RAISE EXCEPTION 'hold_departure_seats: an organisation and a departure are required';
    END IF;
    IF p_pax IS NULL OR p_pax < 1 THEN
      RAISE EXCEPTION 'hold_departure_seats: pax must be at least 1';
    END IF;

    -- The lock: a concurrent hold on this departure waits here, then sees
    -- this one's row when it counts.
    SELECT max_pax, booked_pax INTO v_max, v_booked
      FROM tour_departures
     WHERE id = p_departure_id AND org_id = p_org_id AND status <> 'cancelled'
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('held', false, 'free', 0, 'id', NULL);
    END IF;

    SELECT COALESCE(SUM(pax) FILTER (WHERE status = 'confirmed'), 0),
           COALESCE(SUM(pax) FILTER (WHERE status = 'pending'), 0)
      INTO v_confirmed, v_pending
      FROM departure_bookings
     WHERE org_id = p_org_id AND departure_id = p_departure_id
       AND status IN ('pending', 'confirmed');

    -- seatsFree(): the larger of booked_pax and the confirmed holds, plus
    -- every pending hold; never below 0.
    v_free := GREATEST(0, COALESCE(v_max, 0) - (GREATEST(COALESCE(v_booked, 0), v_confirmed) + v_pending));

    IF p_pax > v_free THEN
      RETURN jsonb_build_object('held', false, 'free', v_free, 'id', NULL);
    END IF;

    INSERT INTO departure_bookings (org_id, departure_id, client_id, client_name, pax, status, notes)
    VALUES (p_org_id, p_departure_id, p_client_id, p_client_name, p_pax, 'pending', p_notes)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('held', true, 'free', v_free, 'id', v_id);
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.hold_departure_seats(uuid, uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.hold_departure_seats(uuid, uuid, integer, uuid, text, text) TO service_role;
END
$$;

COMMIT;
