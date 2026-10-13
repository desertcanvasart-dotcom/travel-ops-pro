-- ============================================
-- A departure's seat holds: one seat rule, open dates only, released on cancel
-- ============================================
-- 20261213 made a website order's seat hold atomic (hold_departure_seats,
-- under the departure row's lock). The Operate audit found what was left:
--
--   1. The seat rule. Seats free = max_pax − (the LARGER of booked_pax and
--      the confirmed holds) − the pending holds. But booked_pax is the
--      office's count of seats sold OUTSIDE the app (or a partner's count on
--      a mirrored departure) — a confirmed hold is never in it — so taking the
--      larger of the two hid one or the other. Now, everywhere
--      (lib/departures/seats.ts and this file):
--
--        taken = booked_pax + confirmed holds + pending holds
--        free  = max_pax − taken, never below 0
--
--   2. Which dates take holds. Only status <> 'cancelled' was refused, so a
--      date the office closed by hand (Full) or never published (Draft) still
--      took web-order holds. A hold is now placed only on an Open, Limited or
--      Guaranteed departure — the statuses /api/departures/check calls
--      bookable. Anything else returns held = false, free = 0.
--
--   3. Lowering the seats. PUT /api/departures/[id] refused max_pax below
--      booked_pax only, and without the departure's lock: six pending holds
--      and max_pax lowered to 4 left the date held past its maximum.
--      set_departure_seats(org, departure, max_pax, booked_pax) changes either
--      number under the same row lock hold_departure_seats takes, and refuses
--      (ok = false, reason 'below_taken') when max_pax would fall under
--      booked_pax + the live holds. A null argument keeps the stored value.
--      It returns jsonb { ok, reason, max_pax, booked_pax, held, taken }.
--
--   4. Cancelling a departure. Its pending holds stayed pending — seats
--      "taken" on a date that will not run, invisible to the office. A
--      trigger now releases them (status 'cancelled') whenever a departure
--      becomes Cancelled, whoever changes it: the departures screens, a PUT,
--      or an integration's sync of a mirrored departure (which the route
--      never sees — that is why this is a trigger and not route code).
--      Confirmed holds are left alone: those are seats the office sold, and
--      rehoming them is the office's call; the departure page lists them.
--
-- DATA: pending holds on departures that are ALREADY cancelled are released
-- once, the same as the trigger would have. Nothing else changes.
--
-- Both functions are SECURITY DEFINER with a fixed search_path and
-- executable by service_role only (20261129_revoke_definer_functions has the
-- rule): every caller is a server route on the service-role client, and a
-- signed-in user must not change any company's seats by naming its id. The
-- trigger function is not callable on its own.
--
-- Idempotent (CREATE OR REPLACE, DROP TRIGGER IF EXISTS, the release only
-- touches rows still pending) and guarded on both tables existing.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tour_departures') IS NULL OR to_regclass('public.departure_bookings') IS NULL THEN
    RETURN;
  END IF;

  -- 1 + 2. The hold: same signature, same answer shape, new rule and statuses.
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

    -- The lock: a concurrent hold (or seat change) on this departure waits
    -- here, then sees this one's row when it counts. Open dates only.
    SELECT max_pax, booked_pax INTO v_max, v_booked
      FROM tour_departures
     WHERE id = p_departure_id AND org_id = p_org_id AND status IN ('open', 'limited', 'guaranteed')
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

    -- lib/departures/seats.ts: booked_pax + confirmed + pending; never below 0.
    v_free := GREATEST(0, COALESCE(v_max, 0) - (COALESCE(v_booked, 0) + v_confirmed + v_pending));

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

  -- 3. Changing the seats under the lock.
  CREATE OR REPLACE FUNCTION public.set_departure_seats(
    p_org_id uuid,
    p_departure_id uuid,
    p_max_pax integer DEFAULT NULL,
    p_booked_pax integer DEFAULT NULL
  ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  DECLARE
    v_max integer;
    v_booked integer;
    v_held integer;
  BEGIN
    IF p_org_id IS NULL OR p_departure_id IS NULL THEN
      RAISE EXCEPTION 'set_departure_seats: an organisation and a departure are required';
    END IF;
    IF p_max_pax IS NOT NULL AND p_max_pax < 1 THEN
      RAISE EXCEPTION 'set_departure_seats: max_pax must be at least 1';
    END IF;
    IF p_booked_pax IS NOT NULL AND p_booked_pax < 0 THEN
      RAISE EXCEPTION 'set_departure_seats: booked_pax must not be negative';
    END IF;

    SELECT max_pax, booked_pax INTO v_max, v_booked
      FROM tour_departures
     WHERE id = p_departure_id AND org_id = p_org_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    v_max := COALESCE(p_max_pax, v_max, 0);
    v_booked := COALESCE(p_booked_pax, v_booked, 0);

    SELECT COALESCE(SUM(pax), 0) INTO v_held
      FROM departure_bookings
     WHERE org_id = p_org_id AND departure_id = p_departure_id
       AND status IN ('pending', 'confirmed');

    IF v_booked + v_held > v_max THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'below_taken',
        'max_pax', v_max, 'booked_pax', v_booked, 'held', v_held, 'taken', v_booked + v_held);
    END IF;

    UPDATE tour_departures
       SET max_pax = v_max, booked_pax = v_booked, updated_at = now()
     WHERE id = p_departure_id AND org_id = p_org_id;

    RETURN jsonb_build_object('ok', true, 'reason', NULL,
      'max_pax', v_max, 'booked_pax', v_booked, 'held', v_held, 'taken', v_booked + v_held);
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.set_departure_seats(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.set_departure_seats(uuid, uuid, integer, integer) TO service_role;

  -- 4. A cancelled departure releases its pending holds.
  CREATE OR REPLACE FUNCTION public.release_holds_on_departure_cancel() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
  BEGIN
    UPDATE departure_bookings
       SET status = 'cancelled', updated_at = now()
     WHERE departure_id = NEW.id AND org_id = NEW.org_id AND status = 'pending';
    RETURN NEW;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.release_holds_on_departure_cancel() FROM PUBLIC, anon, authenticated;

  DROP TRIGGER IF EXISTS tour_departures_cancel_releases_holds ON public.tour_departures;
  CREATE TRIGGER tour_departures_cancel_releases_holds
    AFTER UPDATE OF status ON public.tour_departures
    FOR EACH ROW
    WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
    EXECUTE FUNCTION public.release_holds_on_departure_cancel();

  -- DATA: pending holds already sitting on cancelled departures.
  UPDATE public.departure_bookings b
     SET status = 'cancelled', updated_at = now()
    FROM public.tour_departures d
   WHERE d.id = b.departure_id AND d.org_id = b.org_id
     AND d.status = 'cancelled' AND b.status = 'pending';
END
$$;

COMMIT;
