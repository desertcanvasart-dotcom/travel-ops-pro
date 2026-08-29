-- ============================================
-- A client's booking count is the number of CONFIRMED trips, from one writer
-- ============================================
-- clients.total_bookings_count / total_revenue_generated / average_booking_value
-- had two writers:
--
--   * recompute_client_revenue() (20260821_client_revenue.sql) — recomputes
--     all three from INVOICES whenever an invoice changes.
--   * update_booking_stats (a production-only trigger, versioned 2026-08-22)
--     — did `+1` and `+ total_cost` on EVERY itinerary insert, drafts
--     included, and never decremented on delete or cancellation.
--
-- Whichever fired last won, and the count drifted upward forever. Operator
-- decision 2026-08-22: a booking is a CONFIRMED trip.
--
-- One writer, one definition:
--   total_bookings_count    = the client's itineraries with status IN
--                             ('confirmed', 'completed')  — cancelled, draft,
--                             pending and quoted do not count
--   total_revenue_generated = unchanged: billed on non-draft, non-cancelled
--                             invoices, in the client's dominant currency
--   average_booking_value   = revenue / confirmed trips (0 when none)
--
-- The count is RECOMPUTED from the table (never incremented), on insert, on a
-- change of status or client, and on delete — for both the old and the new
-- client when a trip moves. The +1 trigger and its function are dropped.
-- Backfilled for every client at the end. Idempotent.
-- ============================================

-- ---------- 1. one recompute, now counting confirmed trips ----------
CREATE OR REPLACE FUNCTION public.recompute_client_revenue(p_client UUID)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_revenue   JSONB := '{}'::jsonb;
  v_collected JSONB := '{}'::jsonb;
  v_bookings  INTEGER := 0;
  v_currency  TEXT;
  v_total     NUMERIC := 0;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  -- Money: what has been billed and collected, per currency, from invoices.
  SELECT
    COALESCE(jsonb_object_agg(cur, billed) FILTER (WHERE billed <> 0), '{}'::jsonb),
    COALESCE(jsonb_object_agg(cur, paid)   FILTER (WHERE paid   <> 0), '{}'::jsonb)
  INTO v_revenue, v_collected
  FROM (
    SELECT
      UPPER(COALESCE(i.currency, 'EUR')) AS cur,
      SUM(COALESCE(i.total_amount, 0))   AS billed,
      SUM(COALESCE(i.amount_paid, 0))    AS paid
    FROM invoices i
    WHERE i.client_id = p_client
      AND COALESCE(i.status, '') NOT IN ('draft', 'cancelled')
    GROUP BY UPPER(COALESCE(i.currency, 'EUR'))
  ) per_currency;

  -- Bookings: confirmed trips. Counted, never incremented.
  SELECT COUNT(*)
  INTO v_bookings
  FROM itineraries t
  WHERE t.client_id = p_client
    AND t.status IN ('confirmed', 'completed');

  SELECT key, value::numeric
  INTO v_currency, v_total
  FROM jsonb_each_text(v_revenue)
  ORDER BY value::numeric DESC
  LIMIT 1;

  UPDATE clients SET
    revenue_by_currency     = v_revenue,
    collected_by_currency   = v_collected,
    revenue_currency        = v_currency,
    total_revenue_generated = COALESCE(v_total, 0),
    total_bookings_count    = COALESCE(v_bookings, 0),
    average_booking_value   = CASE WHEN COALESCE(v_bookings, 0) > 0
                                   THEN COALESCE(v_total, 0) / v_bookings
                                   ELSE 0 END,
    updated_at              = now()
  WHERE id = p_client;
END $$;

-- ---------- 2. trips keep the count current — old AND new client ----------
CREATE OR REPLACE FUNCTION public.itineraries_touch_client_stats()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.client_id IS NOT NULL THEN
    PERFORM public.recompute_client_revenue(OLD.client_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
    PERFORM public.recompute_client_revenue(NEW.client_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS itineraries_client_stats_trg ON public.itineraries;
CREATE TRIGGER itineraries_client_stats_trg
  AFTER INSERT OR UPDATE OF status, client_id OR DELETE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.itineraries_touch_client_stats();

-- ---------- 3. the +1 writer goes ----------
DROP TRIGGER IF EXISTS update_booking_stats ON public.itineraries;
DROP FUNCTION IF EXISTS public.update_client_booking_stats();

-- ---------- 4. backfill: every client's figures from the table, once ----------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM clients c
    WHERE c.total_bookings_count <> 0
       OR EXISTS (SELECT 1 FROM itineraries t WHERE t.client_id = c.id)
       OR EXISTS (SELECT 1 FROM invoices  i WHERE i.client_id = c.id)
  LOOP
    PERFORM public.recompute_client_revenue(r.id);
  END LOOP;
END $$;

COMMENT ON COLUMN public.clients.total_bookings_count IS
  'Number of this client''s trips with status confirmed or completed. Recomputed by recompute_client_revenue() on any trip status/client change or delete — never incremented.';
