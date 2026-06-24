-- ============================================
-- Consolidation Phase B (rich) — day-type preset + component flags on itinerary_days
-- ============================================
-- Implements the foundational data model the rich grid-completeness gate
-- reads (PRICING-CONSOLIDATION-PLAN.md Phase B). The lite gate that landed
-- in PR #5 only flagged "nothing priced anywhere" and "guide enabled but
-- not selected." The rich gate (ported from the sibling app in this PR)
-- knows each day's components (overnight / sightseeing / airport arrival
-- / etc.) and blocks save when a required component isn't priced.
--
-- Each day carries:
--   - day_type: a one-click preset (arrival / tour / transfer / cruise /
--     free / departure) that fills the component flags via
--     DAY_TYPE_DEFAULTS in app/pricing-grid/types.ts.
--   - 6 boolean overrides + 1 text override for intercity, all nullable.
--     A NULL override means "use the preset's default for this component";
--     a non-NULL value overrides the preset. Combined days (e.g. a
--     transfer day that also sightsees) work via explicit overrides.
--
-- Backwards compatibility:
--   - day_type defaults to 'tour' (DEFAULT_DAY_TYPE in types.ts) so every
--     existing itinerary_days row works correctly out of the box.
--   - All override columns are nullable; resolveComponents() in
--     grid-completeness.ts falls back to the preset's defaults when null.
--   - The lite gate that existed before this PR keyed only on .slots, so
--     no existing field is affected.
--
-- Idempotent: every step guarded by IF NOT EXISTS / column-presence check.
-- Date: 2026-06-27
-- ============================================

do $$
declare
  v_col text;
  v_bool_cols text[] := array[
    'overnight',
    'has_sightseeing',
    'airport_arrival',
    'airport_departure',
    'hotel_check_in',
    'hotel_check_out'
  ];
begin
  -- 1. day_type column. Default 'tour' = DEFAULT_DAY_TYPE in
  --    app/pricing-grid/types.ts. CHECK constraint restricts the value to
  --    the 6 presets the rich gate knows about.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itinerary_days'
      and column_name = 'day_type'
  ) then
    alter table public.itinerary_days
      add column day_type text not null default 'tour';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'itinerary_days_day_type_check'
  ) then
    alter table public.itinerary_days
      add constraint itinerary_days_day_type_check
      check (day_type in ('arrival', 'tour', 'transfer', 'cruise', 'free', 'departure'));
  end if;

  -- 2. Boolean override flags. All nullable so resolveComponents() can
  --    fall back to the preset's default.
  foreach v_col in array v_bool_cols loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_days'
        and column_name = v_col
    ) then
      execute format(
        'alter table public.itinerary_days add column %I boolean',
        v_col
      );
    end if;
  end loop;

  -- 3. intercity override (text — 'none' | 'road' | 'flight' | NULL).
  --    NULL means "use the preset's default." A CHECK constraint ensures
  --    we never land an unknown value.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itinerary_days'
      and column_name = 'intercity'
  ) then
    alter table public.itinerary_days
      add column intercity text;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'itinerary_days_intercity_check'
  ) then
    alter table public.itinerary_days
      add constraint itinerary_days_intercity_check
      check (intercity is null or intercity in ('none', 'road', 'flight'));
  end if;
end$$;

-- ============================================
-- MIGRATION COMPLETE
-- Apply BEFORE deploying the matching code change. The save route in
-- /api/pricing-grid/save reads/writes day_type + the override columns; the
-- load path reads them; the day-editor UI sets them; the new
-- grid-completeness gate uses resolveComponents() to derive the day's
-- required components from them.
-- ============================================
