// Migration 20261201, executed against a real Postgres with RLS enforced.
//
// Permissive policies with no organisation condition sat beside (or instead
// of) the org-scoped ones on itineraries, clients, bookings and tour_quotes,
// and USING (true) on client_followups / client_notes / communication_history
// — so any signed-in user of either company read and wrote every company's
// rows through PostgREST. This signs in as an agent of each of two companies
// (auth.uid() from a setting) and asks Postgres what each may touch.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261201_org_scoped_parent_policies.sql'
const ORG_T = '30000000-0000-4000-8000-000000000001'
const ORG_A = '30000000-0000-4000-8000-000000000002'
const T_AGENT = '40000000-0000-4000-8000-000000000001'
const A_AGENT = '40000000-0000-4000-8000-000000000002'
const T_VIEWER = '40000000-0000-4000-8000-000000000003'
const BOTH = '40000000-0000-4000-8000-000000000004'
const C_T = '50000000-0000-4000-8000-000000000001'
const C_A = '50000000-0000-4000-8000-000000000002'
const I_T = '60000000-0000-4000-8000-000000000001'
const I_A = '60000000-0000-4000-8000-000000000002'

const TABLES = ['itineraries', 'clients', 'bookings', 'tour_quotes', 'client_followups', 'client_notes', 'communication_history']

let db: { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

async function as<T>(uid: string, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}
const orgsSeen = async (uid: string, table: string, col = 'org_id') =>
  [...new Set((await as<{ o: string }>(uid, `SELECT ${col} AS o FROM ${table}`)).rows.map(r => r.o))].sort()

async function replay(includeFile: boolean) {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && (includeFile || f !== FILE)).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  if (includeFile) await db.exec(sql) // twice: idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ${TABLES.join(', ')} TO authenticated;
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    INSERT INTO auth.users (id, email) VALUES ('${T_AGENT}', 't@x'), ('${A_AGENT}', 'a@x'), ('${T_VIEWER}', 'v@x'), ('${BOTH}', 'b@x') ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_AGENT}', 't@x', 'agent', true), ('${A_AGENT}', 'a@x', 'agent', true),
      ('${T_VIEWER}', 'v@x', 'viewer', true), ('${BOTH}', 'b@x', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_AGENT}', '${A_AGENT}', '${T_VIEWER}', '${BOTH}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_AGENT}', 'agent'), ('${ORG_A}', '${A_AGENT}', 'agent'), ('${ORG_T}', '${T_VIEWER}', 'viewer'),
      ('${ORG_T}', '${BOTH}', 'agent'), ('${ORG_A}', '${BOTH}', 'agent');
    INSERT INTO clients (id, client_code, first_name, last_name, org_id) VALUES
      ('${C_T}', 'C-T', 'Taro', 'T', '${ORG_T}'), ('${C_A}', 'C-A', 'Aiko', 'A', '${ORG_A}');
    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id) VALUES
      ('${I_T}', 'I-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}'),
      ('${I_A}', 'I-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}');
    INSERT INTO bookings (booking_code, itinerary_id, client_name, trip_name, start_date, end_date, org_id) VALUES
      ('B-T', '${I_T}', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', '${ORG_T}'),
      ('B-A', '${I_A}', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', '${ORG_A}');
    INSERT INTO tour_quotes (quote_number, org_id, itinerary_id) VALUES ('Q-T', '${ORG_T}', '${I_T}'), ('Q-A', '${ORG_A}', '${I_A}');
    INSERT INTO client_followups (client_id, followup_type, title, due_date) VALUES
      ('${C_T}', 'call', 'T', '2026-01-01'), ('${C_A}', 'call', 'A', '2026-01-01');
    INSERT INTO client_notes (client_id, note_type, content) VALUES ('${C_T}', 'general', 'T'), ('${C_A}', 'general', 'A');
    INSERT INTO communication_history (client_id, communication_type, direction) VALUES
      ('${C_T}', 'email', 'outbound'), ('${C_A}', 'email', 'outbound');
  `)
}

describe('before the migration (the hole is real)', () => {
  beforeAll(async () => { await replay(false) })
  afterAll(async () => { await db?.close() })

  it("an agent of one company reads the other company's rows", async () => {
    expect(await orgsSeen(A_AGENT, 'itineraries')).toEqual([ORG_T, ORG_A].sort())
    expect(await orgsSeen(A_AGENT, 'clients')).toEqual([ORG_T, ORG_A].sort())
    expect(await orgsSeen(A_AGENT, 'bookings')).toEqual([ORG_T, ORG_A].sort())
    expect(await orgsSeen(A_AGENT, 'tour_quotes')).toEqual([ORG_T, ORG_A].sort())
    expect(await orgsSeen(A_AGENT, 'client_notes', 'client_id')).toEqual([C_T, C_A].sort())
  })
})

describe('after the migration', () => {
  beforeAll(async () => { await replay(true) })
  afterAll(async () => { await db?.close() })

  it("each company's agent reads only its own rows, on every table", async () => {
    for (const t of ['itineraries', 'clients', 'bookings', 'tour_quotes']) {
      expect(await orgsSeen(A_AGENT, t), t).toEqual([ORG_A])
      expect(await orgsSeen(T_AGENT, t), t).toEqual([ORG_T])
    }
    for (const t of ['client_followups', 'client_notes', 'communication_history']) {
      expect(await orgsSeen(A_AGENT, t, 'client_id'), t).toEqual([C_A])
      expect(await orgsSeen(T_AGENT, t, 'client_id'), t).toEqual([C_T])
    }
  })

  it("nobody updates, deletes or inserts into the other company's rows", async () => {
    expect((await as(A_AGENT, `UPDATE itineraries SET trip_name = 'x' WHERE id = '${I_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE clients SET first_name = 'x' WHERE id = '${C_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE bookings SET trip_name = 'x' WHERE org_id = '${ORG_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `DELETE FROM tour_quotes WHERE org_id = '${ORG_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `DELETE FROM client_notes WHERE client_id = '${C_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE client_followups SET title = 'x' WHERE client_id = '${C_T}'`)).affected).toBe(0)
    await expect(as(A_AGENT, `INSERT INTO client_notes (client_id, note_type, content) VALUES ('${C_T}', 'general', 'x')`)).rejects.toThrow()
    await expect(as(A_AGENT, `INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES ('X', 'x', 'x', '${ORG_T}')`)).rejects.toThrow()
  })

  it('the screens still work on your own organisation (browser reads and writes)', async () => {
    expect((await as(T_AGENT, `UPDATE itineraries SET trip_name = 'x' WHERE id = '${I_T}'`)).affected).toBe(1)
    expect((await as(T_AGENT, `UPDATE clients SET first_name = 'x' WHERE id = '${C_T}'`)).affected).toBe(1)
    // The client code is numbered across every company's clients (the
    // trigger runs as its definer): the other company already holds the code
    // this company's own count would give.
    expect((await as(A_AGENT, `INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES ('X', 'x', 'x', '${ORG_A}')`)).affected).toBe(1)
    expect((await as(T_AGENT, `INSERT INTO clients (client_code, first_name, last_name, org_id) VALUES ('X', 'x', 'x', '${ORG_T}')`)).affected).toBe(1)
    expect((await as(T_AGENT, `INSERT INTO client_notes (client_id, note_type, content) VALUES ('${C_T}', 'general', 'x')`)).affected).toBe(1)
    expect((await as(T_AGENT, `UPDATE client_followups SET title = 'x' WHERE client_id = '${C_T}'`)).affected).toBe(1)
    // The followups page embeds the client; the client list reads the security_invoker view.
    expect((await as(T_AGENT, 'SELECT id FROM client_summary')).rows).toHaveLength(1)
  })

  it('a viewer still reads no clients (the role rule is kept, not widened)', async () => {
    expect((await as(T_VIEWER, 'SELECT id FROM clients')).rows).toHaveLength(0)
  })

  it('a member of both companies sees both — they belong to both', async () => {
    expect(await orgsSeen(BOTH, 'itineraries')).toEqual([ORG_T, ORG_A].sort())
  })

  it('no policy on these tables is left without an org condition', async () => {
    const { rows } = await db.query(`SELECT tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${TABLES.map(t => `'${t}'`).join(', ')})`)
    for (const r of rows) expect(r.expr, `${r.tablename}.${r.policyname}`).toContain('user_is_in_org')
  })
})
