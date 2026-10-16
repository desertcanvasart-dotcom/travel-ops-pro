// Migration 20261222, executed against a real Postgres with RLS enforced.
//
// client_preferences (health considerations), client_documents (passport
// numbers) and client_contacts (fellow travellers' passports and birth dates)
// each carried one policy USING (true) TO authenticated, so a signed-in user
// of either company, in any role, read and wrote every company's rows through
// PostgREST. And client codes were CLI-(COUNT of every company's clients + 1):
// one company's numbers skipped with the other's volume, one install-wide
// unique key, and two inserts at once drew the same code. This signs in as
// members of two companies (auth.uid() from a setting, as
// trip-children-org-policies does) and asks Postgres what each may touch,
// then checks the numbering. Only the files BEFORE the migration are replayed;
// the migration itself is applied twice.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261222_clients_privacy_and_codes.sql'
const ORG_T = '32000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '32000000-0000-4000-8000-000000000002' // ATS
const ORG_N = '32000000-0000-4000-8000-000000000003' // a company with only odd codes
const T_AGENT = '42000000-0000-4000-8000-000000000001'
const A_AGENT = '42000000-0000-4000-8000-000000000002'
const T_VIEWER = '42000000-0000-4000-8000-000000000003'
const C_T1 = '52000000-0000-4000-8000-000000000001'
const C_A1 = '52000000-0000-4000-8000-000000000002'
const C_T2 = '52000000-0000-4000-8000-000000000003'

const CHILDREN = ['client_preferences', 'client_documents', 'client_contacts']

let db: { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]

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
const count = async (uid: string | null, q: string) => (await as(uid, q)).rows.length

const codesOf = async (org: string) =>
  (await db.query(`SELECT client_code FROM clients WHERE org_id = '${org}'`)).rows.map(r => r.client_code as string).sort()
const newClient = async (org: string, name = 'New') =>
  (await one(`INSERT INTO clients (org_id, first_name, last_name) VALUES ('${org}', '${name}', 'X') RETURNING client_code`)).client_code as string

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
    GRANT SELECT, INSERT, UPDATE, DELETE ON clients, ${CHILDREN.join(', ')} TO authenticated, anon;
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS'), ('${ORG_N}', 'Odd');
    INSERT INTO auth.users (id, email) VALUES ('${T_AGENT}', 't@x'), ('${A_AGENT}', 'a@x'), ('${T_VIEWER}', 'v@x') ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_AGENT}', 't@x', 'agent', true), ('${A_AGENT}', 'a@x', 'agent', true), ('${T_VIEWER}', 'v@x', 'viewer', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_AGENT}', '${A_AGENT}', '${T_VIEWER}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_AGENT}', 'agent'), ('${ORG_A}', '${A_AGENT}', 'agent'), ('${ORG_T}', '${T_VIEWER}', 'viewer');
    -- Codes as the old install-wide generator left them: one counter across
    -- both companies, so they interleave (T: 0001, 0003; A: 0002).
    INSERT INTO clients (id, client_code, first_name, last_name, email, org_id) VALUES
      ('${C_T1}', 'x', 'Taro', 'T', 'taro@x.com', '${ORG_T}'),
      ('${C_A1}', 'x', 'Aiko', 'A', 'aiko@x.com', '${ORG_A}'),
      ('${C_T2}', 'x', 'Jiro', 'T', 'jiro@x.com', '${ORG_T}');
    -- Codes the generator never made: hand-typed, imported. The trigger would
    -- overwrite them, so it is paused for these inserts.
    ALTER TABLE clients DISABLE TRIGGER set_client_code;
    INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES
      ('CLI-X7', 'Odd', 'One', '${ORG_T}'),
      ('IMPORTED-9', 'Odd', 'Two', '${ORG_T}'),
      ('CLI-12345678901', 'Odd', 'Three', '${ORG_N}'),
      ('legacy', 'Odd', 'Four', '${ORG_N}');
    ALTER TABLE clients ENABLE TRIGGER set_client_code;
    INSERT INTO client_preferences (client_id, health_considerations) VALUES ('${C_T1}', 'asthma'), ('${C_A1}', 'diabetes');
    INSERT INTO client_documents (client_id, document_type, document_name, file_url, document_number) VALUES
      ('${C_T1}', 'passport', 'T passport', 'https://x/t.pdf', 'T1234567'),
      ('${C_A1}', 'passport', 'A passport', 'https://x/a.pdf', 'A7654321');
    INSERT INTO client_contacts (client_id, contact_type, first_name, last_name, passport_number) VALUES
      ('${C_T1}', 'companion', 'Hana', 'T', 'TP1'), ('${C_A1}', 'companion', 'Ken', 'A', 'AP1');
  `)
  if (includeFile) {
    await db.exec(sql)
    await db.exec(sql) // twice: idempotent
  }
}

describe('before the migration (the hole is real)', () => {
  beforeAll(async () => { await replay(false) })
  afterAll(async () => { await db?.close() })

  it("an agent of one company, and a viewer, read and change the other company's health notes and passport numbers", async () => {
    expect(await count(A_AGENT, `SELECT 1 FROM client_preferences WHERE client_id = '${C_T1}'`)).toBe(1)
    expect(await count(A_AGENT, `SELECT 1 FROM client_documents WHERE document_number = 'T1234567'`)).toBe(1)
    expect(await count(T_VIEWER, `SELECT 1 FROM client_contacts`)).toBe(2)
    expect((await as(A_AGENT, `UPDATE client_preferences SET health_considerations = 'x' WHERE client_id = '${C_T1}'`)).affected).toBe(1)
  })

  it('the codes interleave across the two companies', async () => {
    expect(await codesOf(ORG_T)).toEqual(expect.arrayContaining(['CLI-0001', 'CLI-0003']))
    expect(await codesOf(ORG_A)).toEqual(['CLI-0002'])
  })
})

describe('after the migration (applied twice)', () => {
  beforeAll(async () => { await replay(true) })
  afterAll(async () => { await db?.close() })

  describe('child tables', () => {
    it("each company's agent reads only its own client's rows, on every table", async () => {
      for (const table of CHILDREN) {
        const seen = async (uid: string) => (await as<{ c: string }>(uid, `SELECT client_id AS c FROM ${table}`)).rows.map(r => r.c)
        expect(await seen(T_AGENT), table).toEqual([C_T1])
        expect(await seen(A_AGENT), table).toEqual([C_A1])
      }
    })

    it("nobody reads, changes, deletes or adds to the other company's rows", async () => {
      expect(await count(A_AGENT, `SELECT 1 FROM client_preferences WHERE client_id = '${C_T1}'`)).toBe(0)
      expect((await as(A_AGENT, `UPDATE client_preferences SET health_considerations = 'x' WHERE client_id = '${C_T1}'`)).affected).toBe(0)
      expect((await as(A_AGENT, `UPDATE client_documents SET document_number = 'x' WHERE client_id = '${C_T1}'`)).affected).toBe(0)
      expect((await as(A_AGENT, `DELETE FROM client_contacts WHERE client_id = '${C_T1}'`)).affected).toBe(0)
      await expect(as(A_AGENT, `INSERT INTO client_preferences (client_id) VALUES ('${C_T1}')`)).rejects.toThrow()
      await expect(as(A_AGENT, `INSERT INTO client_documents (client_id, document_type, document_name, file_url) VALUES ('${C_T1}', 'passport', 'x', 'https://x')`)).rejects.toThrow()
      await expect(as(A_AGENT, `INSERT INTO client_contacts (client_id, contact_type, first_name, last_name) VALUES ('${C_T1}', 'companion', 'x', 'x')`)).rejects.toThrow()
      // Moving one's own row onto the other company's client is the same write.
      await expect(as(A_AGENT, `UPDATE client_contacts SET client_id = '${C_T1}' WHERE client_id = '${C_A1}'`)).rejects.toThrow()
    })

    it("an agent still works with their own company's rows", async () => {
      expect((await as(T_AGENT, `UPDATE client_preferences SET health_considerations = 'asthma, mild' WHERE client_id = '${C_T1}'`)).affected).toBe(1)
      expect((await as(T_AGENT, `INSERT INTO client_preferences (client_id, typical_budget_range) VALUES ('${C_T2}', 'standard')`)).affected).toBe(1)
      expect((await as(T_AGENT, `INSERT INTO client_documents (client_id, document_type, document_name, file_url) VALUES ('${C_T1}', 'visa', 'v', 'https://x/v.pdf')`)).affected).toBe(1)
      expect((await as(T_AGENT, `UPDATE client_contacts SET phone = '123' WHERE client_id = '${C_T1}'`)).affected).toBe(1)
      expect((await as(T_AGENT, `DELETE FROM client_contacts WHERE client_id = '${C_T1}'`)).affected).toBe(1)
    })

    it('a viewer of the same company sees none of it (the rule on clients carries to the children)', async () => {
      for (const table of CHILDREN) expect(await count(T_VIEWER, `SELECT 1 FROM ${table}`), table).toBe(0)
      await expect(as(T_VIEWER, `INSERT INTO client_preferences (client_id) VALUES ('${C_T2}')`)).rejects.toThrow()
    })

    it('anon is refused outright', async () => {
      for (const table of CHILDREN) await expect(as(null, `SELECT 1 FROM ${table}`), table).rejects.toThrow(/permission denied/)
    })

    it('no policy on these tables is left without an org condition, or open to anon', async () => {
      const { rows } = await db.query(`SELECT tablename, policyname, roles::text AS roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
        FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${CHILDREN.map(t => `'${t}'`).join(', ')})`)
      expect(rows.length).toBe(CHILDREN.length * 4)
      for (const r of rows) {
        expect(r.expr, `${r.tablename}.${r.policyname}`).toContain('user_is_in_org')
        expect(r.expr, `${r.tablename}.${r.policyname}`).not.toMatch(/^\s*true\s*$/)
        expect(r.roles, `${r.tablename}.${r.policyname}`).toBe('{authenticated}')
      }
    })

    it('every client_* table has no USING (true) policy left', async () => {
      const { rows } = await db.query(`SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename LIKE 'client\\_%' AND (qual = 'true' OR with_check = 'true')`)
      expect(rows).toEqual([])
    })
  })

  describe('client codes', () => {
    it('existing codes are untouched', async () => {
      expect(await codesOf(ORG_T)).toEqual(['CLI-0001', 'CLI-0003', 'CLI-X7', 'IMPORTED-9'])
      expect(await codesOf(ORG_A)).toEqual(['CLI-0002'])
    })

    it("each company carries on from its own highest well-formed code, not the other's — a malformed code is ignored", async () => {
      // T: highest well-formed is 0003 (CLI-X7 / IMPORTED-9 are not read). A: 0002.
      expect(await newClient(ORG_T)).toBe('CLI-0004')
      expect(await newClient(ORG_A)).toBe('CLI-0003')
      expect(await newClient(ORG_A)).toBe('CLI-0004')
      expect(await newClient(ORG_T)).toBe('CLI-0005')
    })

    it('a company with nothing well-formed starts at CLI-0001 (an over-long number is not cast)', async () => {
      expect(await newClient(ORG_N)).toBe('CLI-0001')
    })

    it('both companies may hold the same code; one company may not hold it twice', async () => {
      const both = (await db.query(`SELECT org_id FROM clients WHERE client_code = 'CLI-0004' ORDER BY org_id`)).rows.map(r => r.org_id)
      expect(both).toEqual([ORG_T, ORG_A])
      await db.exec('ALTER TABLE clients DISABLE TRIGGER set_client_code')
      try {
        await expect(db.exec(`INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES ('CLI-0001', 'Dup', 'X', '${ORG_T}')`)).rejects.toThrow(/duplicate key/)
        // …but the other company can hold CLI-0001 too.
        await db.exec(`INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES ('CLI-0001', 'Same', 'Code', '${ORG_A}')`)
      } finally {
        await db.exec('ALTER TABLE clients ENABLE TRIGGER set_client_code')
      }
      expect((await one(`SELECT count(*)::int AS n FROM clients WHERE client_code = 'CLI-0001'`)).n).toBe(3) // T, A and the Odd company
    })

    it('rows saved in one statement each get their own code (the old count-based generator gave them the same)', async () => {
      await db.exec(`INSERT INTO clients (org_id, first_name, last_name)
        SELECT '${ORG_A}', 'Batch' || g, 'X' FROM generate_series(1, 5) g`)
      const codes = (await db.query(`SELECT client_code FROM clients WHERE org_id = '${ORG_A}' AND first_name LIKE 'Batch%'`)).rows.map(r => r.client_code as string).sort()
      expect(new Set(codes).size).toBe(5)
      expect(codes).toEqual(['CLI-0005', 'CLI-0006', 'CLI-0007', 'CLI-0008', 'CLI-0009'])
    })

    it('skips a code already taken in the company instead of colliding with it', async () => {
      await db.exec(`UPDATE client_code_counters SET last_value = 19 WHERE org_id = '${ORG_A}'`)
      await db.exec('ALTER TABLE clients DISABLE TRIGGER set_client_code')
      await db.exec(`INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES ('CLI-0020', 'Typed', 'In', '${ORG_A}')`)
      await db.exec('ALTER TABLE clients ENABLE TRIGGER set_client_code')
      expect(await newClient(ORG_A)).toBe('CLI-0021')
    })

    it('a browser insert (an agent, RLS on) still gets its code from the trigger', async () => {
      const r = await as<{ client_code: string }>(T_AGENT, `INSERT INTO clients (org_id, first_name, last_name) VALUES ('${ORG_T}', 'Web', 'Form') RETURNING client_code`)
      expect(r.rows[0].client_code).toBe('CLI-0006')
    })

    it('a signed-in user cannot call the generator or read the counters directly', async () => {
      const can = async (role: string) =>
        (await one(`SELECT has_function_privilege('${role}', 'public.next_client_code(uuid)', 'EXECUTE') AS ok`)).ok
      expect(await can('authenticated')).toBe(false)
      expect(await can('anon')).toBe(false)
      expect(await can('service_role')).toBe(true)
      await expect(as(T_AGENT, 'SELECT * FROM client_code_counters')).rejects.toThrow(/permission denied/)
    })

    it('the trigger function stays SECURITY DEFINER with a pinned search_path', async () => {
      const f = await one(`SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'generate_client_code'`)
      expect(f.prosecdef).toBe(true)
      expect(String(f.proconfig)).toContain('search_path')
    })
  })
})
