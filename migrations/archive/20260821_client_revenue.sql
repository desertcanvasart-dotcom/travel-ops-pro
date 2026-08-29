-- ============================================
-- Client revenue that is actually computed
-- ============================================
-- `total_revenue_generated`, `average_booking_value` and `total_bookings_count`
-- have been on the clients table all along and NOTHING has ever written them.
-- Both client screens print them, so every client shows a revenue of zero — and
-- the list can even sort by a column that is null for every row.
--
-- They are now maintained from invoices, which is where the money is.
--
-- WHAT COUNTS. Billed, not quoted: an invoice the client has actually been
-- sent. Draft and cancelled invoices are excluded — the same allow-list the
-- customer portal uses, because a draft is not a bill and a cancelled one is
-- not owed. What has been COLLECTED is tracked separately: money invoiced and
-- money received answer different questions and must not be one number.
--
-- CURRENCY. Per currency, in JSONB. A client billed in yen and euro has two
-- revenues and no single total; inventing one would need an FX rate this
-- migration has no business choosing. The scalar columns are kept for the
-- list's sort and hold the DOMINANT currency's figure, with revenue_currency
-- naming which that is — so the number on screen can always be labelled.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS revenue_by_currency JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS collected_by_currency JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS revenue_currency TEXT;

COMMENT ON COLUMN clients.revenue_by_currency IS
  'Billed per currency, from invoices excluding draft and cancelled. The truth; the scalar columns are a sortable projection of it.';
COMMENT ON COLUMN clients.collected_by_currency IS
  'Received per currency (invoice amount_paid). Money invoiced and money received are different questions.';
COMMENT ON COLUMN clients.total_revenue_generated IS
  'The dominant currency''s billed total, denominated by revenue_currency. Maintained by trigger from invoices — never write it by hand.';

-- ============================================
-- Recompute one client from their invoices
-- ============================================
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

  -- Trips, not invoices: a deposit and a final for one trip are one booking.
  SELECT COUNT(DISTINCT COALESCE(i.itinerary_id::text, i.id::text))
  INTO v_bookings
  FROM invoices i
  WHERE i.client_id = p_client
    AND COALESCE(i.status, '') NOT IN ('draft', 'cancelled');

  -- The dominant currency: the one they are most billed in.
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

-- ============================================
-- Kept current by the invoices that produce it
-- ============================================
CREATE OR REPLACE FUNCTION public.invoices_touch_client_revenue()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Both sides: moving an invoice between clients has to correct the one it left.
  IF TG_OP <> 'INSERT' AND OLD.client_id IS NOT NULL THEN
    PERFORM public.recompute_client_revenue(OLD.client_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM public.recompute_client_revenue(NEW.client_id);
  ELSIF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL THEN
    PERFORM public.recompute_client_revenue(NEW.client_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS invoices_client_revenue_trg ON invoices;
CREATE TRIGGER invoices_client_revenue_trg
AFTER INSERT OR UPDATE OF client_id, total_amount, amount_paid, currency, status OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_touch_client_revenue();

-- ============================================
-- Backfill: every client who has ever been invoiced
-- ============================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT client_id FROM invoices WHERE client_id IS NOT NULL LOOP
    PERFORM public.recompute_client_revenue(r.client_id);
  END LOOP;
END $$;
