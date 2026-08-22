-- ============================================
-- The trigger that was unlinking every new trip from its client
-- ============================================
-- Production carried five triggers on itineraries that no migration ever
-- defined (found 2026-08-22 by pg_trigger, after every trip created from a
-- client's page arrived unlinked). One of them is the cause:
--
--   auto_link_client_trigger  BEFORE INSERT
--     SELECT id INTO NEW.client_id FROM clients
--     WHERE LOWER(CONCAT(first_name,' ',last_name)) = LOWER(NEW.client_name)
--     LIMIT 1;
--
-- plpgsql's SELECT … INTO assigns NULL when nothing matches. So unless the
-- typed client_name was exactly "First Last" of an existing client, the
-- trigger overwrote the client_id the application had set — on every insert,
-- before the row was stored. An UPDATE was never affected, which is why the
-- app-side safeguard (lib/itineraries/reassert-client.ts, PR #143) works.
--
-- This migration:
--   1. Rewrites the auto-link so it NEVER overwrites a client_id that was
--      given, and only fills a missing one on an unambiguous match — by
--      email first (what the 08-21 backfill used), then by full name only
--      when exactly one client has that name.
--   2. Brings the other four triggers under version control, with the two
--      near-identical status-upgrade triggers folded into one (their union:
--      pending/quoted → prospect, confirmed/completed → customer).
--   3. Leaves the booking-stats trigger as it was, now versioned. It counts
--      every itinerary insert (drafts included) and never decrements — a
--      separate decision, noted, not changed here.
--
-- Idempotent: every function is CREATE OR REPLACE, every trigger DROP + CREATE.
-- Executed twice in PGlite against a fixture carrying the exact production
-- trigger before hand-off.
-- ============================================

-- ---------- 1. auto-link: fill a missing client, never overwrite one ----------
CREATE OR REPLACE FUNCTION public.auto_link_client_to_itinerary()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  matched UUID;
  n INT;
BEGIN
  -- The application knows which client it meant. Keep it.
  IF NEW.client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- By email: the key the CRM treats as identifying.
  IF NEW.client_email IS NOT NULL AND btrim(NEW.client_email) <> '' THEN
    SELECT id, COUNT(*) OVER () INTO matched, n
    FROM clients
    WHERE lower(btrim(email)) = lower(btrim(NEW.client_email))
    LIMIT 1;
    IF n = 1 THEN
      NEW.client_id := matched;
      RETURN NEW;
    END IF;
  END IF;

  -- By full name, only when it names exactly one client. Two "Ahmed Ali"s
  -- must not be linked to whichever LIMIT 1 happened to return.
  IF NEW.client_name IS NOT NULL AND btrim(NEW.client_name) <> '' THEN
    SELECT id, COUNT(*) OVER () INTO matched, n
    FROM clients
    WHERE lower(btrim(concat_ws(' ', first_name, last_name))) = lower(btrim(NEW.client_name))
    LIMIT 1;
    IF n = 1 THEN
      NEW.client_id := matched;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS auto_link_client_trigger ON public.itineraries;
CREATE TRIGGER auto_link_client_trigger
  BEFORE INSERT ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_client_to_itinerary();

-- ---------- 2. client status follows the trip (one trigger, not two) ----------
CREATE OR REPLACE FUNCTION public.update_client_status_on_booking()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('confirmed', 'completed') THEN
    UPDATE clients SET status = 'customer'
    WHERE id = NEW.client_id AND status IN ('lead', 'prospect');
  ELSIF NEW.status IN ('pending', 'quoted') THEN
    UPDATE clients SET status = 'prospect'
    WHERE id = NEW.client_id AND status = 'lead';
  END IF;
  RETURN NEW;
END $$;

-- The older duplicate (same intent, minus 'quoted', fired on every UPDATE).
DROP TRIGGER IF EXISTS trigger_client_status_upgrade ON public.itineraries;
DROP FUNCTION IF EXISTS public.upgrade_client_status();

DROP TRIGGER IF EXISTS trigger_update_client_status ON public.itineraries;
CREATE TRIGGER trigger_update_client_status
  AFTER INSERT OR UPDATE OF status, client_id ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_client_status_on_booking();

-- ---------- 3. booking stats (unchanged behaviour, now versioned) ----------
CREATE OR REPLACE FUNCTION public.update_client_booking_stats()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    UPDATE clients
    SET total_bookings_count = COALESCE(total_bookings_count, 0) + 1,
        total_revenue_generated = COALESCE(total_revenue_generated, 0) + COALESCE(NEW.total_cost, 0)
    WHERE id = NEW.client_id;
    UPDATE clients
    SET average_booking_value = total_revenue_generated / NULLIF(total_bookings_count, 0)
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS update_booking_stats ON public.itineraries;
CREATE TRIGGER update_booking_stats
  AFTER INSERT ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_client_booking_stats();

-- (set_updated_at is owned by 20260821_updated_at_triggers.sql.)

COMMENT ON FUNCTION public.auto_link_client_to_itinerary() IS
  'BEFORE INSERT on itineraries: fills a MISSING client_id from client_email, else from an unambiguous full-name match. Never overwrites a client_id the application set (the pre-2026-08-22 version did, via SELECT … INTO with no match → NULL).';
