// Migration 20270105, executed against a real Postgres (PGlite) on the
// replayed schema, as the `authenticated` role with auth.uid() set:
//   - the audit query (every policy on an org table, or a child of one, or
//     calling a role function, with no company check) lists the leaks before
//     and only deliberate exceptions after
//   - no policy calls is_admin() / is_manager_or_above() / is_agent_or_above()
//     afterwards; the rewritten expressions read as expected
//   - an admin of company A who is a viewer in company B writes rates in A,
//     not in B; an owner passes the manager checks
//   - a manager in A no longer reads B's invoices; an agent no longer reads
//     the other company's WhatsApp; same-company access still works
//   - applying it twice changes nothing
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20270105_rls_company_roles.sql'
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const DUAL = '00000000-0000-4000-8000-0000000000d1' // admin in A (earliest), viewer in B
const MGR_A = '00000000-0000-4000-8000-0000000000d2'
const AGENT_A = '00000000-0000-4000-8000-0000000000d3'
const OWNER_A = '00000000-0000-4000-8000-0000000000d4'
const AGENT_B = '00000000-0000-4000-8000-0000000000d5'
const RATE_A = 'cccccccc-0000-4000-8000-00000000000a'
const RATE_B = 'cccccccc-0000-4000-8000-00000000000b'
const INV_A = 'dddddddd-0000-4000-8000-00000000000a'
const INV_B = 'dddddddd-0000-4000-8000-00000000000b'
const CONV_A = 'eeeeeeee-0000-4000-8000-00000000000a'
const CONV_B = 'eeeeeeee-0000-4000-8000-00000000000b'

const ROLE_FN = String.raw`\m(is_admin|is_manager_or_above|is_agent_or_above)\(\)`

// The audit query: every policy on a table that has org_id, or that has a
// foreign key to one that does, or that calls a profile-wide role function,
// or that is open to every browser caller (USING / WITH CHECK true), whose
// USING / WITH CHECK names no company (user_is_in_org, user_has_org_role, an
// org_id column, or a join to a parent's org_id).
const AUDIT = `
  WITH org_tables AS (
    SELECT table_name::text AS t FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'org_id'
  ), child_tables AS (
    SELECT DISTINCT c.relname::text AS t
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class p ON p.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE k.contype = 'f' AND n.nspname = 'public' AND p.relname::text IN (SELECT t FROM org_tables)
  )
  SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (tablename IN (SELECT t FROM org_tables) OR tablename IN (SELECT t FROM child_tables)
         OR coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '${ROLE_FN}'
         OR (roles <> '{service_role}' AND 'true' IN (qual, with_check)))
    AND coalesce(qual, '') || ' ' || coalesce(with_check, '') !~ '(user_is_in_org|user_has_org_role|org_id)'
  ORDER BY 1, 2`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any

/** Run a statement as a signed-in browser session for `uid` (PostgREST's role). */
async function asUser(uid: string, statement: string) {
  await db.exec(`SELECT set_config('test.uid', '${uid}', false); SET ROLE authenticated; SET row_security = on;`)
  try {
    return await db.query(statement)
  } finally {
    await db.exec('RESET ROLE;')
  }
}

type AuditRow = { tablename: string; policyname: string; cmd: string; roles: string; qual: string | null; with_check: string | null }

// What the audit query may still list, and why none of it crosses companies:
// the service role bypasses RLS anyway; rate_audit_log's insert is WITH CHECK
// (false); a person's own rows (auth.uid() = user_id); the global exchange
// rate tables, which belong to no company.
const deliberate = (r: AuditRow) =>
  r.roles === '{service_role}' ||
  (r.tablename === 'rate_audit_log' && r.cmd === 'INSERT' && r.with_check === 'false') ||
  [r.qual, r.with_check].every(e => e === null || e === '(auth.uid() = user_id)') ||
  (['exchange_rates', 'exchange_rate_snapshots'].includes(r.tablename) && r.cmd === 'SELECT')

const count = async (q: string) => (await db.query(q)).rows[0].c as number
/** The audit query's rows that are not deliberate exceptions. */
const leaks = async () =>
  ((await db.query(AUDIT)).rows as AuditRow[]).filter(r => !deliberate(r)).map(r => `${r.tablename}: ${r.policyname}`)
const policySnapshot = async () =>
  (await db.query(`SELECT tablename, policyname, cmd, permissive, roles::text AS roles, qual, with_check
                   FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`)).rows
const policy = async (table: string, name: string) =>
  (await db.query(`SELECT cmd, permissive, roles::text AS roles, qual, with_check FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = '${table}' AND policyname = '${name}'`)).rows[0]

const insertRate = (id: string, org: string) =>
  `INSERT INTO public.meal_rates (id, org_id, service_code, restaurant_name) VALUES ('${id}', '${org}', 'T-${id.slice(-4)}', 'Test')`

let before: {
  total: number
  roleFn: number
  audit: string[]
  snapshot: Record<string, unknown>[]
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  // The prelude's auth.uid() is always NULL; RLS needs a caller. Supabase's
  // service_role bypasses RLS; the prelude's is a plain role.
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $fn$ SELECT nullif(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    ALTER ROLE service_role BYPASSRLS;`)
  const people: [string, string][] = [[DUAL, 'dual'], [MGR_A, 'mgr'], [AGENT_A, 'agent'], [OWNER_A, 'owner'], [AGENT_B, 'agentb']]
  await db.exec(`
    INSERT INTO public.organizations (id, name) VALUES ('${ORG_A}', 'A'), ('${ORG_B}', 'B') ON CONFLICT DO NOTHING;
    INSERT INTO auth.users (id, email) VALUES ${people.map(([id, n]) => `('${id}', '${n}@x.test')`).join(', ')} ON CONFLICT DO NOTHING;
    INSERT INTO public.user_profiles (id, email, full_name, role, is_active) VALUES
      ${people.map(([id, n]) => `('${id}', '${n}@x.test', '${n}', 'viewer', true)`).join(', ')}
    ON CONFLICT (id) DO UPDATE SET is_active = true;
    DELETE FROM public.organization_members WHERE user_id IN (${people.map(([id]) => `'${id}'`).join(', ')});
    INSERT INTO public.organization_members (org_id, user_id, role, created_at) VALUES
      ('${ORG_A}', '${DUAL}', 'admin', now() - interval '2 days'),
      ('${ORG_B}', '${DUAL}', 'viewer', now() - interval '1 day'),
      ('${ORG_A}', '${MGR_A}', 'manager', now()),
      ('${ORG_A}', '${AGENT_A}', 'agent', now()),
      ('${ORG_A}', '${OWNER_A}', 'owner', now()),
      ('${ORG_B}', '${AGENT_B}', 'agent', now());
    ${insertRate(RATE_A, ORG_A)}; ${insertRate(RATE_B, ORG_B)};
    INSERT INTO public.invoices (id, org_id, invoice_number) VALUES ('${INV_A}', '${ORG_A}', 'A-1'), ('${INV_B}', '${ORG_B}', 'B-1');
    INSERT INTO public.whatsapp_conversations (id, org_id, phone_number) VALUES ('${CONV_A}', '${ORG_A}', '+1'), ('${CONV_B}', '${ORG_B}', '+2');
    INSERT INTO public.whatsapp_messages (conversation_id, direction, message_body) VALUES
      ('${CONV_A}', 'inbound', 'hello A'), ('${CONV_B}', 'inbound', 'hello B');
  `)
  before = {
    total: await count(`SELECT count(*)::int c FROM pg_policies WHERE schemaname = 'public'`),
    roleFn: await count(`SELECT count(*)::int c FROM pg_policies WHERE schemaname = 'public'
                         AND coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '${ROLE_FN}'`),
    audit: await leaks(),
    snapshot: [],
  }
})

afterAll(async () => { await db?.close() })

describe('before 20270105', () => {
  it('the mirror says admin, so the viewer-in-B wrote a B rate', async () => {
    expect((await db.query(`SELECT role FROM public.user_profiles WHERE id = '${DUAL}'`)).rows[0].role).toBe('admin')
    await db.exec('BEGIN;')
    await asUser(DUAL, insertRate('cccccccc-0000-4000-8000-0000000000bb', ORG_B))
    const upd = await asUser(DUAL, `UPDATE public.meal_rates SET restaurant_name = 'x' WHERE id = '${RATE_B}'`)
    expect(upd.affectedRows).toBe(1)
    await db.exec('ROLLBACK;')
  })

  it('a manager in A read B\'s invoices; an agent in A read B\'s WhatsApp', async () => {
    expect((await asUser(MGR_A, `SELECT id FROM public.invoices WHERE org_id = '${ORG_B}'`)).rows).toHaveLength(1)
    expect((await asUser(AGENT_A, `SELECT message_body FROM public.whatsapp_messages`)).rows).toHaveLength(2)
    expect((await asUser(AGENT_A, `SELECT id FROM public.whatsapp_conversations WHERE id = '${CONV_B}'`)).rows).toHaveLength(1)
  })

  it('the audit query lists the policies with no company check', () => {
    expect(before.roleFn).toBe(150)
    expect(before.audit).toEqual([
      'audit_logs: Admins can view audit logs',
      'audit_logs: System can insert audit logs',
      'b2c_quotes: b2c_quotes_authenticated',
      'expenses: Admins can delete expenses',
      'expenses: Agents can create expenses',
      'expenses: Managers can update expenses',
      'expenses: Managers can view expenses',
      'invoice_payments: invoice_payments_authenticated',
      'invoice_reminders: invoice_reminders_authenticated',
      'invoices: Admins can delete invoices',
      'invoices: Managers can create invoices',
      'invoices: Managers can update invoices',
      'invoices: Managers can view invoices',
      'message_templates: Active users can view templates',
      'message_templates: Managers can manage templates',
      'quote_revisions: quote_revisions_authenticated',
      'quote_versions: quote_versions_authenticated',
      'supplier_invoice_expenses: supplier_invoice_expenses_authenticated',
      'template_placeholders: template_placeholders_authenticated',
      'template_send_log: Agents can insert send log',
      'template_send_log: Agents can view send log',
      'whatsapp_conversations: Agents can access whatsapp conversations',
      'whatsapp_messages: Agents can access whatsapp messages',
    ])
  })
})

describe('20270105 applied twice', () => {
  beforeAll(async () => {
    await db.exec(sql)
    before.snapshot = await policySnapshot()
    await db.exec(sql)
  })

  it('the second run changes no policy', async () => {
    expect(await policySnapshot()).toEqual(before.snapshot)
  })

  it('no policy calls a profile-wide role function; 16 browser policies are gone', async () => {
    expect(await count(`SELECT count(*)::int c FROM pg_policies WHERE schemaname = 'public'
                        AND coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '${ROLE_FN}'`)).toBe(0)
    expect(await count(`SELECT count(*)::int c FROM pg_policies WHERE schemaname = 'public'`)).toBe(before.total - 16)
  })

  it('the audit query is left with deliberate exceptions only', async () => {
    expect(await leaks()).toEqual([])
    expect((await policy('rate_audit_log', 'Only system can insert audit log')).with_check).toBe('false')
  })

  it('rewrites only the role calls and keeps command, roles and permissive', async () => {
    const MGR = "ARRAY['owner'::text, 'admin'::text, 'manager'::text]"
    const AGT = "ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text]"
    expect(await policy('meal_rates', 'meal_rates_org_update')).toEqual({
      cmd: 'UPDATE', permissive: 'PERMISSIVE', roles: '{authenticated}',
      qual: `user_has_org_role(org_id, ${MGR})`, with_check: `user_has_org_role(org_id, ${MGR})`,
    })
    expect(await policy('meal_rates', 'meal_rates_org_insert')).toMatchObject({ cmd: 'INSERT', qual: null, with_check: `user_has_org_role(org_id, ${MGR})` })
    expect(await policy('meal_rates', 'meal_rates_org_select')).toMatchObject({ qual: 'user_is_in_org(org_id)' })
    expect(await policy('tasks', 'tasks_org_select')).toMatchObject({
      cmd: 'SELECT',
      qual: `(user_is_in_org(org_id) AND (user_has_org_role(org_id, ${MGR}) OR (user_has_org_role(org_id, ${AGT}) AND ((assigned_to)::text = (auth.uid())::text))))`,
    })
    expect(await policy('tasks', 'tasks_org_update')).toMatchObject({
      qual: `(user_is_in_org(org_id) AND (user_has_org_role(org_id, ${MGR}) OR ((assigned_to)::text = (auth.uid())::text)))`,
      with_check: 'user_is_in_org(org_id)',
    })
    expect(await policy('email_templates', 'email_templates_org_update')).toMatchObject({
      qual: `(user_is_in_org(org_id) AND ((auth.uid() = user_id) OR user_has_org_role(org_id, ${MGR})))`,
    })
    const efv = await policy('entrance_fee_versions', 'entrance_fee_versions_org_write')
    expect(efv).toMatchObject({ cmd: 'ALL', roles: '{authenticated}' })
    expect(efv.qual.replace(/\s+/g, ' ')).toBe(
      `(EXISTS ( SELECT 1 FROM entrance_fees f WHERE ((f.id = entrance_fee_versions.entrance_fee_id) AND user_has_org_role(f.org_id, ${MGR}))))`,
    )
    expect(efv.with_check).toBe(efv.qual)
    expect(await policy('whatsapp_conversations', 'Agents can access whatsapp conversations')).toMatchObject({
      cmd: 'ALL', roles: '{public}', qual: `user_has_org_role(org_id, ${AGT})`, with_check: `user_has_org_role(org_id, ${AGT})`,
    })
  })

  it('admin in A, viewer in B: writes rates in A, not in B', async () => {
    await asUser(DUAL, insertRate('cccccccc-0000-4000-8000-0000000000aa', ORG_A))
    expect((await asUser(DUAL, `UPDATE public.meal_rates SET restaurant_name = 'ok' WHERE id = '${RATE_A}'`)).affectedRows).toBe(1)
    await expect(asUser(DUAL, insertRate('cccccccc-0000-4000-8000-0000000000bc', ORG_B))).rejects.toThrow(/row-level security/)
    expect((await asUser(DUAL, `UPDATE public.meal_rates SET restaurant_name = 'x' WHERE id = '${RATE_B}'`)).affectedRows ?? 0).toBe(0)
    // still reads B's rates as a member of B
    expect((await asUser(DUAL, `SELECT id FROM public.meal_rates WHERE id = '${RATE_B}'`)).rows).toHaveLength(1)
    // and cannot move an A rate into B
    await expect(asUser(DUAL, `UPDATE public.meal_rates SET org_id = '${ORG_B}' WHERE id = '${RATE_A}'`)).rejects.toThrow(/row-level security/)
  })

  it('an owner passes the manager checks (the profile mirror said owner, which failed them)', async () => {
    expect((await asUser(OWNER_A, `UPDATE public.meal_rates SET restaurant_name = 'own' WHERE id = '${RATE_A}'`)).affectedRows).toBe(1)
  })

  it('a deactivated admin no longer passes', async () => {
    await db.exec(`UPDATE public.user_profiles SET is_active = false WHERE id = '${DUAL}'`)
    expect((await asUser(DUAL, `UPDATE public.meal_rates SET restaurant_name = 'x' WHERE id = '${RATE_A}'`)).affectedRows ?? 0).toBe(0)
    await db.exec(`UPDATE public.user_profiles SET is_active = true WHERE id = '${DUAL}'`)
  })

  it('a manager in A reads A\'s invoices, not B\'s', async () => {
    const rows = (await asUser(MGR_A, `SELECT id FROM public.invoices ORDER BY invoice_number`)).rows
    expect(rows).toEqual([{ id: INV_A }])
  })

  it('WhatsApp: an agent sees only their company\'s conversations; messages are server-only', async () => {
    expect((await asUser(AGENT_A, `SELECT id FROM public.whatsapp_conversations`)).rows).toEqual([{ id: CONV_A }])
    expect((await asUser(AGENT_B, `SELECT id FROM public.whatsapp_conversations`)).rows).toEqual([{ id: CONV_B }])
    expect((await asUser(AGENT_A, `UPDATE public.whatsapp_conversations SET last_message = 'x' WHERE id = '${CONV_B}'`)).affectedRows ?? 0).toBe(0)
    await expect(asUser(AGENT_A, `SELECT message_body FROM public.whatsapp_messages`)).rejects.toThrow(/permission denied/)
    await expect(asUser(AGENT_B, `SELECT message_body FROM public.whatsapp_messages`)).rejects.toThrow(/permission denied/)
    // the server still reads every message
    await db.exec('SET ROLE service_role;')
    try {
      expect((await db.query(`SELECT count(*)::int c FROM public.whatsapp_messages`)).rows[0].c).toBe(2)
    } finally {
      await db.exec('RESET ROLE;')
    }
  })

  it('service-role-only tables refuse the browser', async () => {
    for (const t of ['audit_logs', 'invoice_reminders', 'quote_revisions', 'quote_versions', 'supplier_invoice_expenses', 'template_placeholders']) {
      await expect(asUser(AGENT_A, `SELECT 1 FROM public.${t} LIMIT 1`), t).rejects.toThrow(/permission denied/)
      expect(await count(`SELECT count(*)::int c FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}'`)).toBe(0)
    }
  })

  it('user_has_org_role is executable by signed-in users only', async () => {
    const g = await db.query(`SELECT has_function_privilege('authenticated', 'public.user_has_org_role(uuid, text[])', 'EXECUTE') a,
                                     has_function_privilege('anon', 'public.user_has_org_role(uuid, text[])', 'EXECUTE') n`)
    expect(g.rows[0]).toEqual({ a: true, n: false })
    const fn = await db.query(`SELECT prosecdef, provolatile, proconfig FROM pg_proc WHERE proname = 'user_has_org_role'`)
    expect(fn.rows[0]).toMatchObject({ prosecdef: true, provolatile: 's' })
    expect(fn.rows[0].proconfig.join(',')).toMatch(/search_path/)
  })
})

describe('money tables: browser roles read, never write', () => {
  it('authenticated has no INSERT/UPDATE/DELETE on invoices, expenses, b2c_quotes, invoice_payments', async () => {
    const r = await db.query(`SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND grantee IN ('anon','authenticated')
        AND table_name IN ('invoices','expenses','b2c_quotes','invoice_payments')
        AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')`)
    expect(r.rows).toEqual([])
  })
})
