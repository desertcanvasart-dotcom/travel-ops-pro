-- ============================================
-- Booking supplier rows: the currency their cost is in
-- ============================================
-- booking_supplier_status.quoted_cost was copied from the itinerary lines'
-- total_cost, which is converted to the TRIP's currency; the expense made when
-- the row is confirmed was then recorded in the booking's currency. So a guide
-- paid EGP 3,000 on a yen trip became an expense of "¥14,xxx", and a Nile
-- cruise contracted in USD one in EUR.
--
--   cost_currency  the currency quoted_cost and confirmed_cost are in; NULL =
--                  the booking's currency (every row before this column, and
--                  rows added by hand)
--
-- The app now writes the supplier's OWN currency and amount when every line
-- of the row is in that one currency and the line's original cost still
-- agrees with its total_cost at the rate it was converted at (the voucher
-- rule, lib/supplier-own-currency); otherwise the trip's currency and
-- total_cost.
--
-- Backfill, by the same rule, ONLY for rows nobody has confirmed a cost on:
-- status pending / requested / contacted and confirmed_cost NULL. The row's
-- lines are its booking's itinerary services of the same supplier (supplier_id,
-- else name), supplier type and service date, as lib/bookings/supplier-lines
-- groups them; the row is changed only when its quoted_cost is still exactly
-- those lines' total_cost (it came from them and nothing was edited since).
-- Confirmed rows, and every expense, keep their amounts and currencies.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS behind to_regclass / column checks;
-- the backfill only touches rows whose cost_currency is still NULL.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.has_col(t text, c text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = c)
$$;

-- lib/bookings/supplier-lines supplierTypeForService: NULL = nobody confirms it.
CREATE OR REPLACE FUNCTION pg_temp.supplier_type_for_service(st text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(st, ''))
    WHEN 'hotel' THEN 'hotel' WHEN 'accommodation' THEN 'hotel'
    WHEN 'guide' THEN 'guide' WHEN 'tour_guide' THEN 'guide'
    WHEN 'transport' THEN 'transport' WHEN 'transportation' THEN 'transport' WHEN 'transfer' THEN 'transport'
    WHEN 'vehicle' THEN 'transport' WHEN 'airport_transfer' THEN 'transport' WHEN 'cruise_transport_package' THEN 'transport'
    WHEN 'train' THEN 'transport' WHEN 'sleeping_train' THEN 'transport'
    WHEN 'restaurant' THEN 'restaurant' WHEN 'meal' THEN 'restaurant' WHEN 'lunch' THEN 'restaurant'
    WHEN 'dinner' THEN 'restaurant' WHEN 'breakfast' THEN 'restaurant'
    WHEN 'activity' THEN 'activity' WHEN 'excursion' THEN 'activity' WHEN 'tour' THEN 'activity'
    WHEN 'entrance' THEN 'entrance' WHEN 'entrance_fee' THEN 'entrance' WHEN 'ticket' THEN 'entrance'
    WHEN 'cruise' THEN 'cruise' WHEN 'nile_cruise' THEN 'cruise'
    WHEN 'flight' THEN 'flight' WHEN 'domestic_flight' THEN 'flight'
    WHEN 'airport_service' THEN 'airport_service' WHEN 'meet_greet' THEN 'airport_service' WHEN 'porter' THEN 'airport_service'
    WHEN 'hotel_service' THEN 'hotel_service'
    WHEN 'tips' THEN NULL WHEN 'tip' THEN NULL WHEN 'water' THEN NULL WHEN 'supplies' THEN NULL
    WHEN 'service_fee' THEN NULL WHEN 'extra_expenses' THEN NULL
    ELSE 'other'
  END
$$;

DO $$
BEGIN
  IF to_regclass('public.booking_supplier_status') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.booking_supplier_status
    ADD COLUMN IF NOT EXISTS cost_currency text;

  COMMENT ON COLUMN public.booking_supplier_status.cost_currency IS
    'Currency of quoted_cost and confirmed_cost (the supplier''s own when its itinerary lines were priced in it); NULL = the booking''s currency.';

  IF to_regclass('public.bookings') IS NULL
     OR to_regclass('public.itineraries') IS NULL
     OR to_regclass('public.itinerary_days') IS NULL
     OR to_regclass('public.itinerary_services') IS NULL
     OR NOT pg_temp.has_col('bookings', 'itinerary_id')
     OR NOT pg_temp.has_col('bookings', 'start_date')
     OR NOT pg_temp.has_col('itineraries', 'currency')
     OR NOT pg_temp.has_col('itinerary_services', 'supplier_currency')
     OR NOT pg_temp.has_col('itinerary_services', 'supplier_cost_original')
     OR NOT pg_temp.has_col('itinerary_services', 'exchange_rate_used') THEN
    RETURN;
  END IF;

  WITH lines AS (
    SELECT b.id AS booking_id,
           upper(btrim(i.currency)) AS trip_currency,
           s.supplier_id,
           lower(btrim(coalesce(nullif(s.supplier_name, ''), nullif(s.service_name, ''), 'Unknown'))) AS name_key,
           pg_temp.supplier_type_for_service(s.service_type) AS supplier_type,
           coalesce(d.date, coalesce(b.start_date, i.start_date) + (d.day_number - 1)) AS service_date,
           upper(btrim(coalesce(s.supplier_currency, ''))) AS cur,
           s.supplier_cost_original AS original,
           s.exchange_rate_used AS rate,
           s.total_cost AS total
      FROM public.bookings b
      JOIN public.itineraries i ON i.id = b.itinerary_id
      JOIN public.itinerary_days d ON d.itinerary_id = i.id
      JOIN public.itinerary_services s ON s.itinerary_day_id = d.id
     WHERE nullif(btrim(i.currency), '') IS NOT NULL
  ),
  candidates AS (
    SELECT r.id AS row_id, r.quoted_cost,
           l.trip_currency, l.cur, l.original, l.rate, l.total
      FROM public.booking_supplier_status r
      JOIN lines l
        ON l.booking_id = r.booking_id
       AND l.supplier_type = r.supplier_type
       AND l.service_date IS NOT DISTINCT FROM r.service_date
       AND (CASE WHEN r.supplier_id IS NOT NULL
                 THEN l.supplier_id = r.supplier_id
                 ELSE l.supplier_id IS NULL AND l.name_key = lower(btrim(r.supplier_name)) END)
     WHERE r.cost_currency IS NULL
       AND r.confirmed_cost IS NULL
       AND coalesce(r.status, 'pending') IN ('pending', 'requested', 'contacted')
  ),
  derived AS (
    SELECT row_id,
           min(cur) AS cur,
           round(sum(original), 2) AS own_amount
      FROM candidates
     GROUP BY row_id, quoted_cost, trip_currency
    HAVING count(DISTINCT cur) = 1
       AND min(cur) <> ''
       AND min(cur) <> trip_currency
       -- every line's original still agrees with its total (rounding, not an edit)
       AND bool_and(original IS NOT NULL AND rate IS NOT NULL AND rate > 0 AND total IS NOT NULL
                    AND abs(original * rate - total) <= greatest(0.01, abs(total) * 0.005))
       -- the row is still exactly what these lines made it
       AND quoted_cost IS NOT NULL
       AND abs(quoted_cost - round(sum(total), 2)) <= 0.01
       AND round(sum(original), 2) > 0
  )
  UPDATE public.booking_supplier_status r
     SET cost_currency = dv.cur,
         quoted_cost = dv.own_amount
    FROM derived dv
   WHERE r.id = dv.row_id
     AND r.cost_currency IS NULL
     AND r.confirmed_cost IS NULL;
END
$$;

COMMIT;
