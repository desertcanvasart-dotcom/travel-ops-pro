-- ============================================
-- Phase 1 of the per-org tenancy model (M3 scaffolding)
-- ============================================
-- The accounting sync resolver currently returns whichever active
-- accounting_tokens row comes back first regardless of which entity is
-- being synced. In a multi-user deployment this is a cross-tenant leak.
-- This migration introduces the org model so the resolver has a real
-- entity → org → token chain to follow. Phase 2 (separate PR, post-
-- delivery) adds per-entity org_id columns + RLS + session-aware current
-- org wiring across the 67 API routes that read/write financial data.
--
-- Phase 1 alone is enough to close the audit finding for THIS deployment
-- (single connected accounting account) because:
--   - the existing singleton token is bound to the default org by backfill,
--   - the resolver returns that token deterministically,
--   - the next connected account (whenever it arrives) will land in its
--     own org and the resolver will route correctly.
--
-- Idempotent: re-runnable. Uses CREATE/ADD IF NOT EXISTS throughout.
-- Date: 2026-06-24
-- ============================================

-- 1. organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. organization_members (composite PK so a user can be in multiple orgs
--    in Phase 2 without schema changes here)
create table if not exists public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists idx_organization_members_user_id
  on public.organization_members(user_id);

-- 3. accounting_tokens.org_id — the column the new resolver keys on.
--    Nullable for the duration of the backfill block below, then enforced
--    NOT NULL once every existing row has an org assigned.
alter table public.accounting_tokens
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_accounting_tokens_org_id
  on public.accounting_tokens(org_id);

-- 4. Backfill — runs once. Guarded so a re-run on a fully-migrated DB is
--    a no-op (the WHERE checks for unassigned tokens).
do $$
declare
  v_default_org_id uuid;
  v_user record;
begin
  -- Only act if there are tokens that haven't been bound to an org yet.
  if exists (select 1 from public.accounting_tokens where org_id is null) then
    -- Reuse an existing 'Default Organization' if a previous partial run
    -- created it, otherwise mint one.
    select id into v_default_org_id
      from public.organizations
      where name = 'Default Organization'
      order by created_at asc
      limit 1;

    if v_default_org_id is null then
      insert into public.organizations (name)
      values ('Default Organization')
      returning id into v_default_org_id;
    end if;

    -- Bind every existing token to the default org.
    update public.accounting_tokens
      set org_id = v_default_org_id
      where org_id is null;

    -- Add every existing user_profiles row as an owner of the default org.
    -- Phase 2 will add a UI to manage orgs/roles; for now the single user is
    -- the org owner so they can connect accounting for the org.
    for v_user in select id from public.user_profiles loop
      insert into public.organization_members (org_id, user_id, role)
      values (v_default_org_id, v_user.id, 'owner')
      on conflict (org_id, user_id) do nothing;
    end loop;
  end if;
end$$;

-- 5. Enforce NOT NULL now that every existing row has an org_id. New
--    accounting_tokens insertions (via /api/auth/accounting/callback) MUST
--    assign an org_id explicitly — the matching code change in this PR
--    looks up the connecting user's first org membership and sets it.
alter table public.accounting_tokens
  alter column org_id set not null;

-- ============================================
-- MIGRATION COMPLETE
-- Phase 2 (separate PR): add org_id to every financial entity table, wire
-- session.current_org through middleware, add RLS by org_id, fan the
-- ~67-route refactor across all CRUD routes, build the org switcher UI.
-- ============================================
