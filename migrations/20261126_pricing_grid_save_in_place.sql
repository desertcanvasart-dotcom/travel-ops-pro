-- ============================================================================
-- 20261126 — a pricing-grid save updates the trip's days in place
-- ============================================================================
--
-- save_pricing_grid_days deleted every day and service of the trip and
-- inserted them again. Everything hanging off those rows by ON DELETE
-- CASCADE went with them on every save:
--   * itinerary_day_versions and itinerary_service_versions — every
--     translation, reviewed ones included;
--   * itinerary_resources — guides, vehicles and staff assigned to a day.
--
-- Now a day is matched by its day_number and UPDATEd (its id, and so its
-- translations and assignments, stay); a service is matched within its day by
-- service_type + service_name, in order, and UPDATEd. Only what the grid no
-- longer has is deleted, and only what is new is inserted. A day whose text
-- changed keeps its translation, which the day-translation status then shows
-- as outdated (its source hash no longer matches) instead of silently losing
-- it. Still one function-transaction: an error anywhere rolls the whole save
-- back.
--
-- Same signature and return as 20261103. Replay-safe (CREATE OR REPLACE).

BEGIN;

CREATE OR REPLACE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb) RETURNS TABLE(days_inserted integer, services_inserted integer)
    LANGUAGE plpgsql
    AS $$
declare
  v_day jsonb;
  v_svc jsonb;
  v_day_id uuid;
  v_svc_id uuid;
  v_keep_days uuid[] := '{}';
  v_keep_svcs uuid[];
  v_days_count int := 0;
  v_services_count int := 0;
begin
  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb))
  loop
    -- The existing day with this number (the oldest, if a trip ever ended up
    -- with two), not one already matched in this save.
    select id into v_day_id
      from public.itinerary_days
     where itinerary_id = p_itinerary_id
       and day_number = (v_day->>'day_number')::int
       and not (id = any(v_keep_days))
     order by created_at nulls last, id
     limit 1;

    if found then
      update public.itinerary_days set
        title = v_day->>'title',
        description = v_day->>'description',
        city = v_day->>'city',
        overnight_city = v_day->>'overnight_city',
        date = (v_day->>'date')::date,
        day_type = v_day->>'day_type',
        overnight = (v_day->>'overnight')::boolean,
        has_sightseeing = (v_day->>'has_sightseeing')::boolean,
        airport_arrival = (v_day->>'airport_arrival')::boolean,
        airport_departure = (v_day->>'airport_departure')::boolean,
        hotel_check_in = (v_day->>'hotel_check_in')::boolean,
        hotel_check_out = (v_day->>'hotel_check_out')::boolean,
        -- Text, as the column is: 'none' | 'road' | 'flight' (CHECK).
        intercity = nullif(v_day->>'intercity', '')
      where id = v_day_id;
    else
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
        nullif(v_day->>'intercity', '')
      )
      returning id into v_day_id;
    end if;
    v_keep_days := v_keep_days || v_day_id;
    v_days_count := v_days_count + 1;

    v_keep_svcs := '{}';
    for v_svc in select * from jsonb_array_elements(coalesce(v_day->'services', '[]'::jsonb))
    loop
      select id into v_svc_id
        from public.itinerary_services
       where itinerary_day_id = v_day_id
         and service_type = v_svc->>'service_type'
         and service_name is not distinct from v_svc->>'service_name'
         and not (id = any(v_keep_svcs))
       order by created_at nulls last, id
       limit 1;

      if found then
        update public.itinerary_services set
          quantity = (v_svc->>'quantity')::numeric,
          rate_eur = (v_svc->>'rate_eur')::numeric,
          rate_non_eur = (v_svc->>'rate_non_eur')::numeric,
          total_cost = (v_svc->>'total_cost')::numeric,
          client_price = (v_svc->>'client_price')::numeric,
          supplier_id = nullif(v_svc->>'supplier_id', '')::uuid,
          notes = v_svc->>'notes'
        where id = v_svc_id;
      else
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
        )
        returning id into v_svc_id;
      end if;
      v_keep_svcs := v_keep_svcs || v_svc_id;
      v_services_count := v_services_count + 1;
    end loop;

    -- What the grid no longer has on this day.
    delete from public.itinerary_services
     where itinerary_day_id = v_day_id
       and not (id = any(v_keep_svcs));
  end loop;

  -- Days the grid no longer has (their services and versions cascade).
  delete from public.itinerary_days
   where itinerary_id = p_itinerary_id
     and not (id = any(v_keep_days));

  return query select v_days_count, v_services_count;
end$$;

COMMIT;
