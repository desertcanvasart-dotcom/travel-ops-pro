// Migration 20270123 on a real Postgres: one company's zones never clash with
// another's, a zone key is unique within its city (capitals and spaces
// aside), a city has at most one default, and the table is server-only.
// Applied twice.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MIGRATIONS } from '@/scripts/replay-core.mjs'

const sql = readFileSync(path.join(MIGRATIONS, '20270123_city_zones.sql'), 'utf8')
type Db = { query(s: string): Promise<{ rows: Array<Record<string, unknown>> }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const zone = (org: string, city: string, key: string, isDefault = false) =>
  `INSERT INTO city_zones (org_id, city, key, label, is_default) VALUES ('${org}', '${city}', '${key}', '${key}', ${isDefault});`

let db: Db
beforeAll(async () => {
  db = new PGlite() as unknown as Db
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations (id uuid PRIMARY KEY);
    INSERT INTO organizations VALUES ('${A}'), ('${B}');
  `)
  await db.exec(sql)
  await db.exec(sql)
}, 60_000)
afterAll(async () => { await db?.close() })

describe('20270123_city_zones', () => {
  it('a key is unique within a city, ignoring capitals and spaces at the ends', async () => {
    await db.exec(zone(A, 'Luxor', 'west_bank', true))
    await expect(db.exec(zone(A, ' luxor ', 'west_bank'))).rejects.toThrow()
    await db.exec(zone(A, 'Aswan', 'west_bank', true)) // another city
    await db.exec(zone(B, 'Luxor', 'west_bank', true)) // another company
  })

  it('one default per city', async () => {
    await expect(db.exec(zone(A, 'LUXOR', 'east_bank', true))).rejects.toThrow()
    await db.exec(zone(A, 'Luxor', 'east_bank', false))
  })

  it('refuses a key that is not a key', async () => {
    await expect(db.exec(zone(A, 'Cairo', 'New Cairo'))).rejects.toThrow()
  })

  it('goes with its company', async () => {
    await db.exec(`DELETE FROM organizations WHERE id = '${B}'`)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM city_zones WHERE org_id = '${B}'`)
    expect(rows[0].n).toBe(0)
  })

  it('is server-only: RLS on, nothing granted to signed-in users', async () => {
    const { rows } = await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'city_zones'`)
    expect(rows[0].relrowsecurity).toBe(true)
    const grants = await db.query(`SELECT grantee FROM information_schema.role_table_grants WHERE table_name = 'city_zones'`)
    const who = new Set(grants.rows.map(r => r.grantee))
    expect(who.has('authenticated')).toBe(false)
    expect(who.has('anon')).toBe(false)
    expect(who.has('service_role')).toBe(true)
  })
})
