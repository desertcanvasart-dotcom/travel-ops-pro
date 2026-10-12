// Migration 20261130, executed against a real Postgres with RLS enforced.
//
// user_settings was readable and writable by PUBLIC (anon key included),
// user_preferences by any signed-in user, and an admin of one company could
// update or delete any other company's user_profiles row. This replays the
// schema, signs in as people of two companies (auth.uid() from a setting)
// and asks Postgres what each may see and change.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261130_user_table_policies.sql'
const ORG_T = '10000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '10000000-0000-4000-8000-000000000002' // ATS
const T_ADMIN = '20000000-0000-4000-8000-000000000001'
const T_AGENT = '20000000-0000-4000-8000-000000000002'
const A_ADMIN = '20000000-0000-4000-8000-000000000003'
const A_AGENT = '20000000-0000-4000-8000-000000000004'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

/** Run `q` as `role`, signed in as `uid` (null = anonymous), and roll back. */
async function as<T>(role: 'anon' | 'authenticated', uid: string | null, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SELECT set_config('test.uid', '${uid ?? ''}', true); SET LOCAL row_security = on; SET LOCAL ROLE ${role};`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  // Applied twice: idempotent.
  await db.exec(sql)
  // auth.uid() from a per-transaction setting, so the tests can sign in.
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings, public.user_preferences, public.user_profiles TO anon, authenticated;`)
  await db.exec(`
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ADMIN}', 't-admin@x'), ('${T_AGENT}', 't-agent@x'), ('${A_ADMIN}', 'a-admin@x'), ('${A_AGENT}', 'a-agent@x')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_ADMIN}', 't-admin@x', 'admin', true), ('${T_AGENT}', 't-agent@x', 'agent', true),
      ('${A_ADMIN}', 'a-admin@x', 'admin', true), ('${A_AGENT}', 'a-agent@x', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_ADMIN}', '${T_AGENT}', '${A_ADMIN}', '${A_AGENT}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ADMIN}', 'admin'), ('${ORG_T}', '${T_AGENT}', 'agent'),
      ('${ORG_A}', '${A_ADMIN}', 'admin'), ('${ORG_A}', '${A_AGENT}', 'agent');
    INSERT INTO user_settings (user_id) VALUES ('${T_AGENT}'), ('${A_AGENT}');
    INSERT INTO user_preferences (user_id) VALUES ('${T_AGENT}'), ('${A_AGENT}');
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('user_settings: only your own row, and never anon', () => {
  it('anon reads and writes nothing', async () => {
    expect((await as('anon', null, 'SELECT id FROM user_settings')).rows).toHaveLength(0)
    expect((await as('anon', null, `UPDATE user_settings SET email_settings = '{}'`)).affected).toBe(0)
    await expect(as('anon', null, `INSERT INTO user_settings (user_id) VALUES ('${T_AGENT}')`)).rejects.toThrow()
  })

  it('a signed-in user sees and changes only their own', async () => {
    const seen = await as<{ user_id: string }>('authenticated', A_AGENT, 'SELECT user_id FROM user_settings')
    expect(seen.rows.map(r => r.user_id)).toEqual([A_AGENT])
    expect((await as('authenticated', A_AGENT, `UPDATE user_settings SET email_settings = '{}' WHERE user_id = '${T_AGENT}'`)).affected).toBe(0)
    expect((await as('authenticated', A_AGENT, `UPDATE user_settings SET email_settings = '{}' WHERE user_id = '${A_AGENT}'`)).affected).toBe(1)
    await expect(as('authenticated', A_AGENT, `INSERT INTO user_settings (user_id) VALUES ('${T_AGENT}')`)).rejects.toThrow()
  })
})

describe('user_preferences: the catch-all policy is gone', () => {
  it('a signed-in user reads and overwrites only their own', async () => {
    const seen = await as<{ user_id: string }>('authenticated', A_AGENT, 'SELECT user_id FROM user_preferences')
    expect(seen.rows.map(r => r.user_id)).toEqual([A_AGENT])
    expect((await as('authenticated', A_AGENT, `UPDATE user_preferences SET default_tier = 'luxury' WHERE user_id = '${T_AGENT}'`)).affected).toBe(0)
    expect((await as('authenticated', A_AGENT, `UPDATE user_preferences SET default_tier = 'luxury' WHERE user_id = '${A_AGENT}'`)).affected).toBe(1)
  })
})

describe('user_profiles: managing people needs a shared organisation', () => {
  it("one company's admin cannot see, update or delete the other company's people", async () => {
    const seen = await as<{ id: string }>('authenticated', A_ADMIN, 'SELECT id FROM user_profiles ORDER BY id')
    expect(seen.rows.map(r => r.id).sort()).toEqual([A_ADMIN, A_AGENT].sort())
    expect((await as('authenticated', A_ADMIN, `UPDATE user_profiles SET is_active = false WHERE id = '${T_AGENT}'`)).affected).toBe(0)
    expect((await as('authenticated', A_ADMIN, `DELETE FROM user_profiles WHERE id = '${T_ADMIN}'`)).affected).toBe(0)
  })

  it('an admin still manages their own company', async () => {
    expect((await as('authenticated', T_ADMIN, `UPDATE user_profiles SET full_name = 'x' WHERE id = '${T_AGENT}'`)).affected).toBe(1)
  })

  it("an agent sees only their own profile and changes no colleague's", async () => {
    const seen = await as<{ id: string }>('authenticated', T_AGENT, 'SELECT id FROM user_profiles')
    expect(seen.rows.map(r => r.id)).toEqual([T_AGENT])
    expect((await as('authenticated', T_AGENT, `UPDATE user_profiles SET full_name = 'x' WHERE id = '${T_ADMIN}'`)).affected).toBe(0)
  })

  it('the membership helper is not callable by anon', async () => {
    const { rows } = await db.query(`SELECT has_function_privilege('anon', 'public.user_shares_org_as(uuid, text[])', 'EXECUTE') AS ok`)
    expect(rows[0].ok).toBe(false)
  })
})
