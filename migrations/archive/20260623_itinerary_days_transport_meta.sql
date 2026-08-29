-- ============================================
-- Per-day transport metadata for itinerary_days
-- Surfaces the B3 transport-rule flags on every itinerary day so the
-- calculate-pricing route (B4) sees them when calling
-- determineTransportNeeds. Without these columns the edit page can only
-- infer airport_arrival/departure from day position — multi-leg flight
-- days, cruise days, and additive evening transfers stay un-priced.
--
-- Defaults are chosen so existing rows behave EXACTLY as before:
--   is_cruise_day = false        → no cruise package suppression
--   transport_type = NULL        → engine treats as 'ground'
--   skip_arrival_checkin = false → arrival day = 2 line items (default)
--   extras = '{}'                → no additive transfers
--
-- Date: 2026-06-23
-- ============================================

alter table public.itinerary_days
  add column if not exists is_cruise_day boolean not null default false,
  add column if not exists transport_type text,
  add column if not exists skip_arrival_checkin boolean not null default false,
  add column if not exists extras text[] not null default '{}';

-- Enum guard for transport_type (NULL == 'ground' is fine, but if a value
-- is provided, restrict it to the two known options).
alter table public.itinerary_days
  drop constraint if exists itinerary_days_transport_type_check;

alter table public.itinerary_days
  add constraint itinerary_days_transport_type_check
  check (transport_type is null or transport_type in ('flight', 'ground'));

-- ============================================
-- MIGRATION COMPLETE
-- After running this, the edit page can persist per-day transport-meta and
-- the calculate-pricing route picks it up automatically.
-- ============================================
