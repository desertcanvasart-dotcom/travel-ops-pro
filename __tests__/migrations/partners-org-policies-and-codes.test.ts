// Migration 20261223, executed against a real Postgres with RLS enforced.
//
// b2b_partners kept the baseline's one policy, TO authenticated USING (true)
// WITH CHECK (true), so any signed-in user of either company read and wrote
// every company's partners through PostgREST. Its partner_code was also unique
// across the whole install. This replays every earlier migration, signs in as
// members of two companies (auth.uid() from a setting, as
// b2b-pricing-rules-org-policies does) and asks Postgres what each may touch —
// before the migration (the hole is real) and after it, applied twice.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261223_partners_org_policies_and_codes.sql'
const ORG_T = '33000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '33000000-0000-4000-8000-000000000002' // ATS
const T_MANAGER = '43000000-0000-4000-8000-000000000001'
const T_AGENT = '43000000-0000-4000-8000-000000000003'
const A_MANAGER = '43000000-0000-4000-8000-000000000002'
const P_T = '53000000-0000-4000-8000-000000000001'
const P_A = '53000000-0000-4000-8000-000000000002'

let db: { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

async function as<T>(uid: string | null, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(uid
      ? `SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`
      : `SELECT set_config('test.uid', '', true); SET LOCAL row_security = on; SET LOCAL ROLE anon;`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}
const ids = async (uid: string | null) =>
  (await as<{ id: string }>(uid, 'SELECT id FROM b2b_partners ORDER BY id')).rows.map(r => r.id)
const insertFor = (org: string, code = 'NEW-001') =>
  `INSERT INTO b2b_partners (partner_code, company_name, org_id) VALUES ('${code}', 'New', '${org}')`

async function replay(includeFile: boolean) {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    -- Table grants as Supabase gives them: RLS is the only thing in the way.
    GRANT SELECT, INSERT, UPDATE, DELETE ON b2b_partners TO authenticated, anon;
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    INSERT INTO auth.users (id, email) VALUES ('${T_MANAGER}', 'tm@x'), ('${T_AGENT}', 'ta@x'), ('${A_MANAGER}', 'am@x') ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_MANAGER}', 'tm@x', 'manager', true), ('${T_AGENT}', 'ta@x', 'agent', true), ('${A_MANAGER}', 'am@x', 'manager', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_MANAGER}', '${T_AGENT}', '${A_MANAGER}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_MANAGER}', 'manager'), ('${ORG_T}', '${T_AGENT}', 'agent'), ('${ORG_A}', '${A_MANAGER}', 'manager');
    INSERT INTO b2b_partners (id, partner_code, company_name, org_id) VALUES
      ('${P_T}', 'ABC-123', 'Partner T', '${ORG_T}'), ('${P_A}', 'ZZZ-999', 'Partner A', '${ORG_A}');
  `)
  if (includeFile) {
    await db.exec(sql)
    await db.exec(sql) // twice: idempotent
  }
}

describe('before the migration (the hole is real)', () => {
  beforeAll(async () => { await replay(false) })
  afterAll(async () => { await db?.close() })

  it("a member of one company reads, rewrites and deletes the other company's partners", async () => {
    expect(await ids(A_MANAGER)).toEqual([P_T, P_A])
    expect((await as(A_MANAGER, `UPDATE b2b_partners SET notes = 'x' WHERE id = '${P_T}'`)).affected).toBe(1)
    expect((await as(A_MANAGER, `DELETE FROM b2b_partners WHERE id = '${P_T}'`)).affected).toBe(1)
  })

  it('the code is unique across the whole install', async () => {
    await expect(db.exec(insertFor(ORG_A, 'ABC-123'))).rejects.toThrow(/duplicate key/)
  })
})

describe('after the migration (applied twice)', () => {
  beforeAll(async () => { await replay(true) })
  afterAll(async () => { await db?.close() })

  it('the open policy is gone; only the four org policies remain, for authenticated', async () => {
    const pols = (await db.query(`SELECT policyname, roles::text AS roles FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'b2b_partners' ORDER BY policyname`)).rows
    expect(pols.map((p: any) => p.policyname)).toEqual([
      'b2b_partners_org_delete', 'b2b_partners_org_insert', 'b2b_partners_org_select', 'b2b_partners_org_update',
    ])
    for (const p of pols) expect(p.roles).toBe('{authenticated}')
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'b2b_partners' AND (qual = 'true' OR with_check = 'true')`)).rows[0].n).toBe(0)
  })

  it('b2b_partner_pricing still has the 20261206 policies', async () => {
    const pols = (await db.query(`SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'b2b_partner_pricing' ORDER BY policyname`)).rows
    expect(pols.map((p: any) => p.policyname)).toEqual(['b2b_partner_pricing_org_select', 'b2b_partner_pricing_org_write'])
  })

  it("each company's members read only its own partners, agents included", async () => {
    expect(await ids(T_MANAGER)).toEqual([P_T])
    expect(await ids(T_AGENT)).toEqual([P_T])
    expect(await ids(A_MANAGER)).toEqual([P_A])
  })

  it("another company's manager can neither change, delete nor plant a partner", async () => {
    expect((await as(A_MANAGER, `UPDATE b2b_partners SET notes = 'x' WHERE id = '${P_T}'`)).affected).toBe(0)
    expect((await as(A_MANAGER, `DELETE FROM b2b_partners WHERE id = '${P_T}'`)).affected).toBe(0)
    await expect(as(A_MANAGER, insertFor(ORG_T))).rejects.toThrow(/row-level security/)
  })

  it('writes are manager-and-above in your own company; an agent only reads', async () => {
    expect((await as(T_MANAGER, `UPDATE b2b_partners SET notes = 'x' WHERE id = '${P_T}'`)).affected).toBe(1)
    expect((await as(T_MANAGER, insertFor(ORG_T))).affected).toBe(1)
    expect((await as(T_AGENT, `UPDATE b2b_partners SET notes = 'x' WHERE id = '${P_T}'`)).affected).toBe(0)
    await expect(as(T_AGENT, insertFor(ORG_T))).rejects.toThrow(/row-level security/)
  })

  it('anon has no access at all', async () => {
    await expect(as(null, 'SELECT id FROM b2b_partners')).rejects.toThrow(/permission denied/)
    await expect(as(null, insertFor(ORG_T))).rejects.toThrow(/permission denied/)
  })

  it('partner_code is unique per company: both may hold ABC-123, one company may not hold it twice', async () => {
    await db.exec(insertFor(ORG_A, 'ABC-123'))
    await expect(db.exec(insertFor(ORG_A, 'ABC-123'))).rejects.toThrow(/duplicate key/)
    await expect(db.exec(insertFor(ORG_T, 'ABC-123'))).rejects.toThrow(/duplicate key/)
    const keys = (await db.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.b2b_partners'::regclass AND contype = 'u' ORDER BY conname`)).rows.map((r: any) => r.conname)
    expect(keys).toEqual(['b2b_partners_org_code_key'])
  })

  it('existing codes and rows are unchanged', async () => {
    const r = (await db.query(`SELECT id, partner_code FROM b2b_partners WHERE id IN ('${P_T}', '${P_A}') ORDER BY id`)).rows
    expect(r).toEqual([{ id: P_T, partner_code: 'ABC-123' }, { id: P_A, partner_code: 'ZZZ-999' }])
  })
})
