// Migration 20270108, executed against a real Postgres.
//
// org_backfill_default() looked for "the company that is not ATS"; with ATS
// the only company it returned NULL, so 20261203/20261205/20261209 stopped
// without assigning anything and production was left with every supplier,
// team member, task and department without a company — the rate forms
// offered no suppliers (operator, 2026-10-19). This assigns them to the one
// company, makes org_id required, and does nothing with several companies.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20270108_single_company_backfill.sql'
const ATS = '10000000-0000-4000-8000-00000000000a'
const TABLES = ['suppliers', 'supplier_properties', 'team_members', 'departments', 'tasks', 'notifications', 'user_preferences']
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

type Db = { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

async function replayed(): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as unknown as Db
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  // Production's state: the backfilled tables still nullable.
  for (const t of TABLES) await db.exec(`ALTER TABLE public.${t} ALTER COLUMN org_id DROP NOT NULL`)
  return db
}

const nullCount = async (db: Db, t: string) =>
  Number((await db.query(`SELECT count(*)::int AS n FROM public.${t} WHERE org_id IS NULL`)).rows[0].n)
const nullable = async (db: Db, t: string) =>
  (await db.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'org_id'`, [t])).rows[0].is_nullable

describe('20270108 — one company: the stranded rows are its', () => {
  let db: Db
  beforeAll(async () => {
    db = await replayed()
    await db.exec(`
      INSERT INTO organizations (id, name, slug) VALUES ('${ATS}', 'ATS Japan', 'ats');
      INSERT INTO suppliers (id, name, type, types, status, org_id) VALUES
        ('20000000-0000-4000-8000-000000000001', 'Nour El Nil', 'cruise', '{cruise}', 'active', NULL),
        ('20000000-0000-4000-8000-000000000002', 'Horse carriages Luxor', 'activity_provider', '{activity_provider}', 'active', NULL);
      INSERT INTO supplier_properties (supplier_id, name, property_type, city, org_id)
        VALUES ('20000000-0000-4000-8000-000000000001', 'MS Nour El Nil', 'ship', 'Luxor', NULL);
      INSERT INTO team_members (name, org_id) VALUES ('Adel Mohamed', NULL);
      INSERT INTO departments (name, org_id) VALUES ('Operations', NULL);
      INSERT INTO tasks (title, org_id) VALUES ('Confirm the ship', NULL);
    `)
    expect(await nullCount(db, 'suppliers')).toBe(2)
    await db.exec(sql)
  })
  afterAll(async () => { await db?.close() })

  it('the default company is ATS when ATS is the only one', async () => {
    expect((await db.query(`SELECT public.org_backfill_default() AS d`)).rows[0].d).toBe(ATS)
  })

  it('every stranded row is the one company’s, and org_id is required again', async () => {
    for (const t of ['suppliers', 'supplier_properties', 'team_members', 'departments', 'tasks']) {
      expect(await nullCount(db, t), t).toBe(0)
      expect(await nullable(db, t), t).toBe('NO')
    }
    expect((await db.query(`SELECT DISTINCT org_id FROM suppliers`)).rows).toEqual([{ org_id: ATS }])
  })

  it('each assignment is listed for the owner', async () => {
    const { rows } = await db.query(`SELECT table_name, count(*)::int AS n FROM org_backfill_review WHERE reason LIKE '%20270108%' GROUP BY table_name ORDER BY table_name`)
    expect(rows).toEqual([
      { table_name: 'departments', n: 1 }, { table_name: 'supplier_properties', n: 1 },
      { table_name: 'suppliers', n: 2 }, { table_name: 'tasks', n: 1 }, { table_name: 'team_members', n: 1 },
    ])
  })

  it('is safe to run twice', async () => {
    await db.exec(sql)
    expect(await nullCount(db, 'suppliers')).toBe(0)
  })
})

describe('20270108 — several companies: nothing assigned here', () => {
  let db: Db
  beforeAll(async () => {
    db = await replayed()
    await db.exec(`
      INSERT INTO organizations (id, name, slug) VALUES ('${ATS}', 'ATS Japan', 'ats'), ('10000000-0000-4000-8000-00000000000b', 'Other', 'other');
      INSERT INTO suppliers (name, type, types, status, org_id) VALUES ('Unclaimed', 'other', '{other}', 'active', NULL);
    `)
    await db.exec(sql)
  })
  afterAll(async () => { await db?.close() })

  it('leaves the row for the multi-company backfill', async () => {
    expect(await nullCount(db, 'suppliers')).toBe(1)
    expect(await nullable(db, 'suppliers')).toBe('YES')
  })
})
