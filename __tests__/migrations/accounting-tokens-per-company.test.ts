// Migration 20270104, executed against a real Postgres with RLS enforced.
//
// accounting_tokens was one row per PERSON per provider, so a person in both
// companies moved one company's books to the other by connecting there, and a
// company could have two providers (or two admins' Xero files) live at once.
// email_signatures had no org_id at all. Every row is seeded BEFORE the
// migration (all earlier ones replayed first), the migration is applied
// twice, and then: who owns each row, what was removed or deactivated and
// listed, the new keys, and what a signed-in user may read.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20270104_accounting_tokens_per_company.sql'
const ORG_T = '80000000-0000-4000-8000-000000000001'
const ORG_A = '80000000-0000-4000-8000-000000000002'
const T_ONLY = '81000000-0000-4000-8000-000000000001'
const A_ONLY = '81000000-0000-4000-8000-000000000002'
const BOTH = '81000000-0000-4000-8000-000000000003'
const tok = (n: number) => `82000000-0000-4000-8000-00000000000${n}`
const sig = (n: number) => `83000000-0000-4000-8000-00000000000${n}`

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]
const reviewed = async (table: string) =>
  (await db.query(`SELECT row_id, assigned_org, reason FROM org_backfill_review WHERE table_name = '${table}' ORDER BY row_id, reason`)).rows
const snapshot = async () => JSON.stringify([
  (await db.query('SELECT id, org_id, provider, is_active FROM accounting_tokens ORDER BY id')).rows,
  (await db.query('SELECT id, org_id FROM email_signatures ORDER BY id')).rows,
  (await db.query("SELECT count(*)::int AS n FROM org_backfill_review WHERE table_name IN ('accounting_tokens', 'email_signatures')")).rows,
])

async function as<T>(uid: string, q: string): Promise<T[]> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`)
    return (await db.query(q)).rows as T[]
  } finally {
    await db.exec('ROLLBACK')
  }
}

let afterFirst = ''
let afterSecond = ''

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01'), ('${ORG_A}', 'ATS', '2026-06-01');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@t.example'), ('${A_ONLY}', 'staff@a.example'), ('${BOTH}', 'owner@t.example')
      ON CONFLICT DO NOTHING;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${BOTH}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'admin'), ('${ORG_A}', '${A_ONLY}', 'admin'),
      ('${ORG_T}', '${BOTH}', 'owner'), ('${ORG_A}', '${BOTH}', 'admin');

    -- A database from before org_id was required: two rows have none.
    ALTER TABLE accounting_tokens ALTER COLUMN org_id DROP NOT NULL;
    INSERT INTO accounting_tokens (id, user_id, org_id, provider, access_token, refresh_token, token_expiry, is_active, created_at) VALUES
      ('${tok(1)}', '${T_ONLY}', '${ORG_T}', 'xero',       'a', 'r', now(), true,  '2026-01-01'), -- older Xero in T
      ('${tok(2)}', '${BOTH}',   '${ORG_T}', 'xero',       'a', 'r', now(), true,  '2026-02-01'), -- newer Xero in T: kept
      ('${tok(3)}', '${A_ONLY}', '${ORG_A}', 'xero',       'a', 'r', now(), true,  '2026-01-01'), -- A: Xero AND
      ('${tok(4)}', '${A_ONLY}', '${ORG_A}', 'quickbooks', 'a', 'r', now(), true,  '2026-03-01'), --    QuickBooks live
      ('${tok(5)}', '${T_ONLY}', NULL,       'quickbooks', 'a', 'r', now(), false, '2025-06-01'), -- no org, one company → T
      ('${tok(6)}', '${BOTH}',   NULL,       'quickbooks', 'a', 'r', now(), true,  '2025-07-01'); -- no org, both → removed

    INSERT INTO email_signatures (id, user_id, name, content, is_default) VALUES
      ('${sig(1)}', '${T_ONLY}', 'T', '<p>T</p>', true),
      ('${sig(2)}', '${A_ONLY}', 'A', '<p>A</p>', true),
      ('${sig(3)}', '${BOTH}', 'Both', '<p>Both</p>', true);
  `)
  await db.exec(sql)
  afterFirst = await snapshot()
  await db.exec(sql) // twice: idempotent
  afterSecond = await snapshot()
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_tokens, email_signatures TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('applying it twice', () => {
  it('changes nothing the second time', () => {
    expect(afterSecond).toBe(afterFirst)
  })
})

describe('accounting connections belong to the company', () => {
  it('a row with no company goes to its person\'s one company; a person in both is not guessed', async () => {
    expect((await one(`SELECT org_id FROM accounting_tokens WHERE id = '${tok(5)}'`))?.org_id).toBe(ORG_T)
    expect(await one(`SELECT id FROM accounting_tokens WHERE id = '${tok(6)}'`)).toBeUndefined()
    const rows = await reviewed('accounting_tokens')
    expect(rows.find((r: any) => r.row_id === tok(6))?.reason).toMatch(/^connected by a person in both companies \(user .*quickbooks\) — removed/)
  })

  it('one row per company and provider: the one the sync was using is kept', async () => {
    expect(await one(`SELECT id FROM accounting_tokens WHERE id = '${tok(1)}'`)).toBeUndefined()
    expect((await one(`SELECT is_active FROM accounting_tokens WHERE id = '${tok(2)}'`)).is_active).toBe(true)
    expect((await reviewed('accounting_tokens')).find((r: any) => r.row_id === tok(1))).toMatchObject({
      assigned_org: ORG_T, reason: 'second xero connection in the same company — removed; the one the sync was using is kept',
    })
  })

  it('one active provider per company: the newest stays active, the other is deactivated and listed', async () => {
    expect((await one(`SELECT is_active FROM accounting_tokens WHERE id = '${tok(3)}'`)).is_active).toBe(false)
    expect((await one(`SELECT is_active FROM accounting_tokens WHERE id = '${tok(4)}'`)).is_active).toBe(true)
    expect((await reviewed('accounting_tokens')).find((r: any) => r.row_id === tok(3))?.reason)
      .toBe('company had two accounting providers active — xero deactivated; the sync keeps the newest')
  })

  it('a connection stamped by a person in both companies is listed for checking', async () => {
    expect((await reviewed('accounting_tokens')).find((r: any) => r.row_id === tok(2))).toMatchObject({
      assigned_org: ORG_T, reason: "connected by a person in both companies — check it is this company's books",
    })
  })

  it('org_id is required; the keys are (company, provider) and one active row per company', async () => {
    expect((await one(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'accounting_tokens' AND column_name = 'org_id'`)).is_nullable).toBe('NO')
    const cons = (await db.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.accounting_tokens'::regclass`)).rows.map((r: any) => r.conname)
    expect(cons).toContain('accounting_tokens_org_id_provider_key')
    expect(cons).not.toContain('accounting_tokens_user_id_provider_key')
    // A second Xero row for T is refused…
    await expect(db.exec(`INSERT INTO accounting_tokens (user_id, org_id, provider, access_token, refresh_token, token_expiry, is_active)
      VALUES ('${T_ONLY}', '${ORG_T}', 'xero', 'a', 'r', now(), false)`)).rejects.toThrow()
    // …and so is a second ACTIVE provider.
    await expect(db.exec(`UPDATE accounting_tokens SET is_active = true WHERE id = '${tok(5)}'`)).rejects.toThrow()
    // The same person may now connect each company's books (A had no inactive conflict for this row).
    await db.exec(`DELETE FROM accounting_tokens WHERE id = '${tok(3)}'`)
    await db.exec(`INSERT INTO accounting_tokens (user_id, org_id, provider, access_token, refresh_token, token_expiry, is_active)
      VALUES ('${BOTH}', '${ORG_A}', 'xero', 'a', 'r', now(), false)`)
  })

  it('no member reads or writes the tokens through PostgREST — only the service role', async () => {
    expect(await as(T_ONLY, 'SELECT id FROM accounting_tokens')).toHaveLength(0)
    expect(await as(BOTH, 'SELECT id FROM accounting_tokens')).toHaveLength(0)
    await expect(as(T_ONLY, `INSERT INTO accounting_tokens (user_id, org_id, provider, access_token, refresh_token, token_expiry)
      VALUES ('${T_ONLY}', '${ORG_A}', 'quickbooks', 'a', 'r', now())`)).rejects.toThrow()
  })
})

describe('email signatures belong to one company', () => {
  it('a person in one company: theirs; a person in both: one copy per company, once', async () => {
    expect((await one(`SELECT org_id FROM email_signatures WHERE id = '${sig(1)}'`)).org_id).toBe(ORG_T)
    expect((await one(`SELECT org_id FROM email_signatures WHERE id = '${sig(2)}'`)).org_id).toBe(ORG_A)
    const both = (await db.query(`SELECT org_id FROM email_signatures WHERE user_id = '${BOTH}' ORDER BY org_id`)).rows.map((r: any) => r.org_id)
    expect(both.sort()).toEqual([ORG_T, ORG_A].sort())
    expect(await reviewed('email_signatures')).toEqual([])
  })

  it('a signed-in user reads their own signatures of a company they are in, never an unassigned one', async () => {
    expect((await as<{ id: string }>(T_ONLY, 'SELECT id FROM email_signatures')).map(r => r.id)).toEqual([sig(1)])
    expect(await as(BOTH, 'SELECT id FROM email_signatures')).toHaveLength(2)
    await expect(as(T_ONLY, `INSERT INTO email_signatures (user_id, org_id, name, content) VALUES ('${T_ONLY}', '${ORG_A}', 'x', 'y')`)).rejects.toThrow()
  })
})
