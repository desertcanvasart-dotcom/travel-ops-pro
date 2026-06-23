-- ============================================
-- ATOMIC PRICING-GRID SAVE
-- Replaces a pricing-grid itinerary's days + services inside ONE transaction so
-- a partial failure can no longer leave an itinerary with its days/services
-- deleted but not re-inserted (the old route did delete -> insert as separate
-- non-transactional calls).
-- Called from app/api/pricing-grid/save/route.ts via supabase.rpc().
-- Date: 2026-06-23
-- ============================================

create or replace function public.save_pricing_grid_days(
  p_itinerary_id uuid,
  p_days jsonb,
  p_services jsonb
) returns void
language plpgsql
as $$
begin
  -- Remove the itinerary's existing days and their services. (Services also
  -- cascade via FK, but we delete explicitly so behavior is independent of it.)
  delete from public.itinerary_services
   where itinerary_day_id in (
     select id from public.itinerary_days where itinerary_id = p_itinerary_id
   );
  delete from public.itinerary_days where itinerary_id = p_itinerary_id;

  -- Insert the new days and, in the SAME statement, the services that reference
  -- them by day_number — resolved to the freshly-inserted day id via the CTE.
  -- A data-modifying CTE always runs to completion, so days are inserted even
  -- when there are no services.
  with new_days as (
    insert into public.itinerary_days
      (itinerary_id, day_number, title, description, city, overnight_city, "date")
    select
      p_itinerary_id, d.day_number, d.title, d.description, d.city, d.overnight_city, d."date"
    from jsonb_to_recordset(coalesce(p_days, '[]'::jsonb)) as d(
      day_number int, title text, description text, city text, overnight_city text, "date" date
    )
    returning id, day_number
  )
  insert into public.itinerary_services
    (itinerary_day_id, service_type, service_name, quantity, rate_eur, rate_non_eur, total_cost, notes)
  select
    nd.id, s.service_type, s.service_name, s.quantity, s.rate_eur, s.rate_non_eur, s.total_cost, s.notes
  from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as s(
    day_number int, service_type text, service_name text, quantity int,
    rate_eur numeric, rate_non_eur numeric, total_cost numeric, notes text
  )
  join new_days nd on nd.day_number = s.day_number;
end;
$$;

-- Only the server (service-role) may call this; the gated API route is the sole
-- intended caller. Prevent anonymous/authenticated PostgREST rpc calls.
revoke all on function public.save_pricing_grid_days(uuid, jsonb, jsonb) from public;
revoke all on function public.save_pricing_grid_days(uuid, jsonb, jsonb) from anon, authenticated;
grant execute on function public.save_pricing_grid_days(uuid, jsonb, jsonb) to service_role;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
