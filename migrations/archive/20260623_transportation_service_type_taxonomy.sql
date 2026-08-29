-- ============================================
-- TRANSPORTATION service_type CANONICAL TAXONOMY
-- Normalize legacy values + swap the CHECK constraint to the locked-in
-- 11-value canonical list (decided 2026-06-23 with the user, see
-- ~/.claude/.../memory/transportation-types.md for the full spec).
--
-- Run BEFORE re-importing the normalized rate sheet. The CSV upsert otherwise
-- fails because some new rows carry types (intercity_with_sightseeing,
-- airport_with_sightseeing, city_transfer, extended_day_tour) that the
-- existing CHECK constraint did not allow.
--
-- Idempotent: re-running is safe (UPDATEs become no-ops; DROP IF EXISTS).
-- Date: 2026-06-23
-- ============================================

begin;

-- 1. Normalize known legacy values to canonical ones. These were the merges
--    agreed during the taxonomy lock-in: longer-named legacy variants fold
--    into their short canonical form.
update public.transportation_rates set service_type = 'intercity'
  where service_type = 'intercity_transfer';

update public.transportation_rates set service_type = 'sound_light'
  where service_type = 'sound_light_transfer';

update public.transportation_rates set service_type = 'half_day'
  where service_type = 'half_day_tour';

-- 2. Swap the CHECK constraint to the canonical 11-value list.
alter table public.transportation_rates
  drop constraint if exists transportation_rates_service_type_check;

alter table public.transportation_rates
  add constraint transportation_rates_service_type_check
  check (service_type in (
    'airport_transfer',
    'airport_with_sightseeing',
    'city_transfer',
    'city_tour',
    'intercity',
    'intercity_with_sightseeing',
    'half_day',
    'day_tour',
    'extended_day_tour',
    'sound_light',
    'dinner_transfer'
  ));

commit;

-- ============================================
-- MIGRATION COMPLETE
-- After running this, re-upload transportation_rates_export.csv from the UI.
-- ============================================
