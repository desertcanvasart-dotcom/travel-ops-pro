-- ============================================
-- M3 Phase 2B — Row Level Security as defense-in-depth on top of Phase 2A
-- ============================================
-- Phase 2A scoped every read/write in 47 API routes by org_id at the
-- application layer. Those routes use the service-role key which BYPASSES
-- RLS — so adding RLS policies here doesn't change anything for them.
-- Where RLS DOES matter is the ~12 routes (plus any direct-from-frontend
-- supabase-js call) that use the authenticated anon client. For those,
-- RLS becomes the primary tenant boundary. For service-role routes, RLS
-- is belt-and-braces: if a future route forgets to add .eq('org_id', ...)
-- AND someone moves it onto the authenticated client, the DB refuses
-- cross-tenant rows even if the application code doesn't filter.
--
-- This migration is idempotent: drop-and-recreate each policy.
-- Date: 2026-06-25. Prereq: 20260625_org_id_phase2a.sql.
-- ============================================

-- Single shared predicate: "the row's org is one of mine". Inlined into
-- every policy below as a SELECT subquery against organization_members.
-- The (user_id = auth.uid()) check is what makes RLS tenant-aware:
-- auth.uid() comes from the JWT, organization_members is the membership
-- table seeded in Phase 1.

-- Helper macro implemented as an immutable SQL function so PostgREST
-- can inline it and the policy doesn't repeat the subquery 8 times.
create or replace function public.user_is_in_org(p_org_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id
      and user_id = auth.uid()
  )
$$;

-- ============================================
-- ENABLE RLS + policies on the 8 financial root tables
-- ============================================

do $$
declare
  v_table text;
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
  foreach v_table in array v_tables loop
    -- ENABLE RLS (no-op if already enabled). Service-role queries still
    -- bypass; this only affects authenticated-client queries.
    execute format('alter table public.%I enable row level security', v_table);

    -- Drop any prior version of our policies so this migration is
    -- safely re-runnable.
    execute format('drop policy if exists %I_org_select on public.%I',
                   v_table, v_table);
    execute format('drop policy if exists %I_org_insert on public.%I',
                   v_table, v_table);
    execute format('drop policy if exists %I_org_update on public.%I',
                   v_table, v_table);
    execute format('drop policy if exists %I_org_delete on public.%I',
                   v_table, v_table);

    -- SELECT: only rows belonging to one of my orgs.
    execute format(
      'create policy %I_org_select on public.%I for select using (public.user_is_in_org(org_id))',
      v_table, v_table
    );

    -- INSERT: row's org_id must be one of mine. WITH CHECK runs on new
    -- rows; without it an authenticated user could insert with someone
    -- else's org_id (RLS by default doesn't block inserts).
    execute format(
      'create policy %I_org_insert on public.%I for insert with check (public.user_is_in_org(org_id))',
      v_table, v_table
    );

    -- UPDATE: USING gates which rows are visible to update; WITH CHECK
    -- gates what the new column values may be. Both clauses use the same
    -- predicate so org_id can't be re-homed to another org via UPDATE.
    execute format(
      'create policy %I_org_update on public.%I for update using (public.user_is_in_org(org_id)) with check (public.user_is_in_org(org_id))',
      v_table, v_table
    );

    -- DELETE: only rows in one of my orgs.
    execute format(
      'create policy %I_org_delete on public.%I for delete using (public.user_is_in_org(org_id))',
      v_table, v_table
    );
  end loop;
end$$;

-- ============================================
-- user_invitations — add org_id column + RLS so invites land in the
-- right org and only org owners can see/cancel them.
-- ============================================
do $$
declare
  v_default_org_id uuid;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_invitations'
      and column_name = 'org_id'
  ) then
    alter table public.user_invitations
      add column org_id uuid references public.organizations(id);
  end if;

  -- Backfill any unbound rows to Default Org (Phase 2A already created it).
  if exists (select 1 from public.user_invitations where org_id is null) then
    select id into v_default_org_id
      from public.organizations
      where name = 'Default Organization'
      order by created_at asc
      limit 1;

    if v_default_org_id is not null then
      update public.user_invitations set org_id = v_default_org_id where org_id is null;
    end if;
  end if;

  -- Enforce NOT NULL after backfill so new inserts must stamp it.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_invitations'
      and column_name = 'org_id'
      and is_nullable = 'YES'
  ) then
    alter table public.user_invitations alter column org_id set not null;
  end if;
end$$;

create index if not exists idx_user_invitations_org_id
  on public.user_invitations(org_id);

alter table public.user_invitations enable row level security;
drop policy if exists user_invitations_org_select on public.user_invitations;
drop policy if exists user_invitations_org_insert on public.user_invitations;
drop policy if exists user_invitations_org_update on public.user_invitations;
drop policy if exists user_invitations_org_delete on public.user_invitations;
create policy user_invitations_org_select on public.user_invitations
  for select using (public.user_is_in_org(org_id));
create policy user_invitations_org_insert on public.user_invitations
  for insert with check (public.user_is_in_org(org_id));
create policy user_invitations_org_update on public.user_invitations
  for update using (public.user_is_in_org(org_id)) with check (public.user_is_in_org(org_id));
create policy user_invitations_org_delete on public.user_invitations
  for delete using (public.user_is_in_org(org_id));

-- ============================================
-- accounting_tokens — same shape (Phase 1 added the org_id column)
-- ============================================
alter table public.accounting_tokens enable row level security;
drop policy if exists accounting_tokens_org_select on public.accounting_tokens;
drop policy if exists accounting_tokens_org_insert on public.accounting_tokens;
drop policy if exists accounting_tokens_org_update on public.accounting_tokens;
drop policy if exists accounting_tokens_org_delete on public.accounting_tokens;
create policy accounting_tokens_org_select on public.accounting_tokens
  for select using (public.user_is_in_org(org_id));
create policy accounting_tokens_org_insert on public.accounting_tokens
  for insert with check (public.user_is_in_org(org_id));
create policy accounting_tokens_org_update on public.accounting_tokens
  for update using (public.user_is_in_org(org_id)) with check (public.user_is_in_org(org_id));
create policy accounting_tokens_org_delete on public.accounting_tokens
  for delete using (public.user_is_in_org(org_id));

-- ============================================
-- organizations + organization_members — each user can see their own
-- ============================================
alter table public.organizations enable row level security;
drop policy if exists organizations_self_select on public.organizations;
drop policy if exists organizations_owner_update on public.organizations;
-- SELECT: any org I belong to
create policy organizations_self_select on public.organizations
  for select using (public.user_is_in_org(id));
-- UPDATE: only if I'm an owner of that org (controls rename, etc.)
create policy organizations_owner_update on public.organizations
  for update using (
    exists (
      select 1 from public.organization_members
      where org_id = organizations.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

alter table public.organization_members enable row level security;
drop policy if exists organization_members_self_select on public.organization_members;
drop policy if exists organization_members_owner_write on public.organization_members;
-- SELECT: members of my orgs (including myself)
create policy organization_members_self_select on public.organization_members
  for select using (public.user_is_in_org(org_id));
-- INSERT/UPDATE/DELETE on memberships: only owners of the same org can
-- mutate (used by the invite-accept and member-remove flows).
create policy organization_members_owner_write on public.organization_members
  for all using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- ============================================
-- MIGRATION COMPLETE
-- Service-role queries (the 162 routes using SUPABASE_SERVICE_ROLE_KEY)
-- still bypass these policies; the Phase 2A .eq('org_id', orgId) filter
-- remains the primary boundary for them. Authenticated-client queries
-- (the 12 routes using @supabase/ssr + session, plus any direct frontend
-- supabase-js reads) are now gated by RLS.
-- ============================================
