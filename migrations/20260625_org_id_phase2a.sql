-- ============================================
-- M3 Phase 2A — app-layer multi-tenancy: org_id on every financial root
-- ============================================
-- Phase 1 (20260624_organizations_phase1.sql) introduced organizations +
-- organization_members + accounting_tokens.org_id. The accounting sync
-- resolver was rewired to route by org but every other financial table
-- still has zero ownership info, so a cross-tenant query was only
-- impossible because the app is single-tenant today.
--
-- Phase 2A makes every financial root entity carry org_id and backfills
-- the existing rows to the Default Organization that Phase 1 created.
-- The matching code change in this PR adds:
--   - lib/auth/current-org.ts (session user → org_id lookup)
--   - org_id filtering on every read across ~67 API routes
--   - org_id stamping on every insert
-- Child tables (invoice_payments, itinerary_days, booking_supplier_status,
-- etc.) derive their tenant via the parent FK and don't need their own
-- org_id column; the parent's filter is sufficient.
--
-- Phase 2B (separate PR, post-Phase-2A bake-in) will move routes off the
-- service-role key onto the authenticated client and add RLS by org_id
-- as defense-in-depth.
--
-- Idempotent: every step guarded by IF NOT EXISTS / column-presence check.
-- Safe to re-run. Date: 2026-06-25.
-- ============================================

do $$
declare
  v_default_org_id uuid;
  v_table text;
  v_user record;
  v_tables text[] := array[
    'invoices',
    'expenses',
    'bookings',
    'supplier_invoices',
    'commissions',
    'itineraries',
    'payments',
    'accounting_sync_log'
  ];
begin
  -- Resolve the Default Organization. If Phase 1 ran but its IF-block was
  -- skipped (the original Phase 1 migration only created Default Org when
  -- at least one accounting_tokens row existed — DBs where QB/Xero hadn't
  -- been connected yet end up with the org tables but no Default Org row),
  -- create the Default Org here and seed every user_profiles row as an
  -- owner so this migration is self-sufficient. Idempotent: re-running on
  -- a Phase-1-clean DB is a no-op.
  select id into v_default_org_id
    from public.organizations
    where name = 'Default Organization'
    order by created_at asc
    limit 1;

  if v_default_org_id is null then
    -- Phase 1 tables must exist — this is the one hard prerequisite.
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'organizations'
    ) then
      raise exception 'organizations table missing — apply 20260624_organizations_phase1.sql first';
    end if;

    insert into public.organizations (name)
    values ('Default Organization')
    returning id into v_default_org_id;

    -- Seed memberships for every existing user_profiles row as 'owner'.
    -- Without this step, getCurrentOrgId() would return null for every
    -- session and every refactored route would 403.
    for v_user in select id from public.user_profiles loop
      insert into public.organization_members (org_id, user_id, role)
      values (v_default_org_id, v_user.id, 'owner')
      on conflict (org_id, user_id) do nothing;
    end loop;
  end if;

  -- For each table: ADD column nullable, backfill, set NOT NULL, index.
  -- Each step is guarded so a partial re-run picks up where it left off.
  foreach v_table in array v_tables loop
    -- 1. ADD COLUMN if missing
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'org_id'
    ) then
      execute format(
        'alter table public.%I add column org_id uuid references public.organizations(id)',
        v_table
      );
    end if;

    -- 2. Backfill any NULLs to the default org (covers both fresh-add and
    --    a partial prior run that added the column but never backfilled).
    execute format(
      'update public.%I set org_id = $1 where org_id is null',
      v_table
    ) using v_default_org_id;

    -- 3. Enforce NOT NULL now that every existing row carries an org_id.
    --    Skipped if already NOT NULL.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'org_id'
        and is_nullable = 'YES'
    ) then
      execute format(
        'alter table public.%I alter column org_id set not null',
        v_table
      );
    end if;

    -- 4. Index org_id for the filter that every query in the route sweep
    --    is about to start using.
    execute format(
      'create index if not exists %I on public.%I(org_id)',
      'idx_' || v_table || '_org_id',
      v_table
    );
  end loop;
end$$;

-- ============================================
-- DEPLOY ORDER: apply BEFORE deploying the code. The code adds .eq('org_id', orgId)
-- to every read and { org_id: orgId } to every insert. If the column isn't there
-- yet, every financial route 500s. After this migration applies, the code change
-- is safe.
-- ============================================
