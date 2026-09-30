-- 20261103_pricing_grid_intercity_text.sql
-- The pricing grid could not save any day whose intercity option had been set.
--
-- itinerary_days.intercity is TEXT with CHECK (NULL | 'none' | 'road' |
-- 'flight'), and the grid sends exactly those strings. save_pricing_grid_days
-- cast the value to BOOLEAN, which rejects 'road', 'flight' and 'none'. So
-- choosing an intercity option on any day made the whole grid save fail,
-- and a flight day could never be recorded through the grid.
--
-- The fix is one line: insert the value as the text it is. Nothing else in
-- the function changes. The older 3-argument overload never wrote intercity,
-- so it is untouched.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb) RETURNS TABLE(days_inserted integer, services_inserted integer)
    LANGUAGE plpgsql
    AS $$
declare
  v_day jsonb;
  v_svc jsonb;
  v_day_id uuid;
  v_days_count int := 0;
  v_services_count int := 0;
begin
  -- Wipe the existing days + services for this itinerary. Services first
  -- (FK to itinerary_days). Both deletes and every insert below run in this
  -- one function-transaction, so an error anywhere rolls the whole thing
  -- back and the prior state survives.
  delete from public.itinerary_services
   where itinerary_day_id in (
     select id from public.itinerary_days where itinerary_id = p_itinerary_id
   );
  delete from public.itinerary_days where itinerary_id = p_itinerary_id;

  -- Insert the new days and, per day, its services using the new day id.
  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb))
  loop
    insert into public.itinerary_days (
      itinerary_id, day_number, title, description, city, overnight_city, date,
      day_type, overnight, has_sightseeing, airport_arrival, airport_departure,
      hotel_check_in, hotel_check_out, intercity
    ) values (
      p_itinerary_id,
      (v_day->>'day_number')::int,
      v_day->>'title',
      v_day->>'description',
      v_day->>'city',
      v_day->>'overnight_city',
      (v_day->>'date')::date,
      v_day->>'day_type',
      (v_day->>'overnight')::boolean,
      (v_day->>'has_sightseeing')::boolean,
      (v_day->>'airport_arrival')::boolean,
      (v_day->>'airport_departure')::boolean,
      (v_day->>'hotel_check_in')::boolean,
      (v_day->>'hotel_check_out')::boolean,
      -- Text, as the column is: 'none' | 'road' | 'flight' (CHECK). This was
      -- cast to boolean, which rejects every one of those values.
      nullif(v_day->>'intercity', '')
    )
    returning id into v_day_id;
    v_days_count := v_days_count + 1;

    for v_svc in select * from jsonb_array_elements(coalesce(v_day->'services', '[]'::jsonb))
    loop
      insert into public.itinerary_services (
        itinerary_day_id, service_type, service_name, quantity,
        rate_eur, rate_non_eur, total_cost, client_price, supplier_id, notes
      ) values (
        v_day_id,
        v_svc->>'service_type',
        v_svc->>'service_name',
        (v_svc->>'quantity')::numeric,
        (v_svc->>'rate_eur')::numeric,
        (v_svc->>'rate_non_eur')::numeric,
        (v_svc->>'total_cost')::numeric,
        (v_svc->>'client_price')::numeric,
        nullif(v_svc->>'supplier_id', '')::uuid,
        v_svc->>'notes'
      );
      v_services_count := v_services_count + 1;
    end loop;
  end loop;

  return query select v_days_count, v_services_count;
end$$;

COMMIT;
