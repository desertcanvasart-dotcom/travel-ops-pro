-- ============================================
-- Atomic pricing-grid save: days + services (H31)
-- ============================================
-- POST /api/pricing-grid/save used to, on UPDATE, run four separate,
-- non-transactional PostgREST round-trips:
--   1. UPDATE the itineraries header,
--   2. DELETE itinerary_services for the itinerary's days,
--   3. DELETE itinerary_days,
--   4. INSERT new itinerary_days, then INSERT new itinerary_services.
-- Because (2)/(3) committed before (4) ran, a failure during either INSERT
-- (a bad supplier_id FK, a constraint trip, a transient network error) left
-- the itinerary with its header updated but ZERO days/services — the
-- previously-saved itinerary was destroyed and not restored. There was no
-- rollback.
--
-- This function moves the destructive delete + the re-insert into a single
-- PL/pgSQL transaction. If any insert fails, the whole function rolls back
-- and the prior days/services are preserved intact. It accepts the new days
-- (each carrying its own nested `services` array) as one jsonb payload, so
-- the day→service id mapping is resolved inside the transaction using the
-- freshly-inserted day id — no client-side id round-trip.
--
-- The route builds the exact same day/service rows it always did (all
-- pricing math, supplier_id resolution, gross-up and sanitization stay in
-- the route, unchanged) and hands the finished rows to this function for the
-- atomic write. Create and update both call it: for a brand-new itinerary
-- the delete simply matches no rows.
--
-- Date: 2026-06-27
-- ============================================

create or replace function public.save_pricing_grid_days(
  p_itinerary_id uuid,
  p_days jsonb
) returns table (days_inserted int, services_inserted int)
language plpgsql
as $$
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
      (v_day->>'intercity')::boolean
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

-- PostgREST routes already require an authenticated session (or the
-- service-role key); this just makes the function callable via supabase.rpc().
revoke all on function public.save_pricing_grid_days(uuid, jsonb) from public;
grant execute on function public.save_pricing_grid_days(uuid, jsonb) to service_role, authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- After this lands, app/api/pricing-grid/save/route.ts replaces its
-- delete-then-insert block with a single supabase.rpc('save_pricing_grid_days')
-- call passing the days (with nested services) as one jsonb payload.
-- ============================================
