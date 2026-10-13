// Migration 20261211, executed against a real Postgres.
//
// B2B quote numbers were MAX+1 over every company's quotes, so one company's
// numbers skipped with the other's volume, two saves at once collided, and
// one hand-edited number ("QT-2026-X1") made every later B2B insert fail for
// both companies. B2C numbers had no unique constraint. And reverting a B2C
// offer kept the season premium of the version it replaced. These pin the
// repaired behaviour on an install with two companies.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261211_quote_numbers_per_company.sql'
const ORG_T = '10000000-0000-4000-8000-000000000001'
const ORG_A = '10000000-0000-4000-8000-000000000002'
const IT_T = '30000000-0000-4000-8000-000000000001'
const IT_A = '30000000-0000-4000-8000-000000000002'
const YEAR = new Date().getFullYear()

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]
const newB2b = async (org: string, it: string) =>
  (await one(`INSERT INTO tour_quotes (org_id, itinerary_id) VALUES ('${org}', '${it}') RETURNING quote_number`)).quote_number as string
const newB2c = async (org: string, it: string) =>
  (await one(`INSERT INTO b2c_quotes (org_id, itinerary_id) VALUES ('${org}', '${it}') RETURNING quote_number`)).quote_number as string

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
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days) VALUES
      ('${IT_T}', '${ORG_T}', 'ITN-T', 'C', 'Trip T', '2026-12-01', '2026-12-05', 5),
      ('${IT_A}', '${ORG_A}', 'ITN-A', 'C', 'Trip A', '2026-12-01', '2026-12-05', 5);
    -- Numbers as the old install-wide generator left them: interleaved, plus
    -- one hand-edited number and two legacy B2C numbers.
    INSERT INTO tour_quotes (org_id, itinerary_id, quote_number) VALUES
      ('${ORG_T}', '${IT_T}', 'QT-${YEAR}-00001'),
      ('${ORG_A}', '${IT_A}', 'QT-${YEAR}-00002'),
      ('${ORG_T}', '${IT_T}', 'QT-${YEAR}-00003'),
      ('${ORG_T}', '${IT_T}', 'QT-${YEAR}-X1');
    INSERT INTO b2c_quotes (org_id, itinerary_id, quote_number) VALUES
      ('${ORG_T}', '${IT_T}', 'B2C-MFX1A2B3'), ('${ORG_A}', '${IT_A}', 'B2C-MFX1A2B4');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('B2B quote numbers', () => {
  it('a hand-edited number no longer breaks the next insert', async () => {
    // Before this migration the "X1" row made this INSERT fail outright.
    expect(await newB2b(ORG_T, IT_T)).toBe(`QT-${YEAR}-00004`)
  })

  it('each company carries on from its own highest number, not the other\'s', async () => {
    expect(await newB2b(ORG_A, IT_A)).toBe(`QT-${YEAR}-00003`)
    expect(await newB2b(ORG_T, IT_T)).toBe(`QT-${YEAR}-00005`)
    expect(await newB2b(ORG_A, IT_A)).toBe(`QT-${YEAR}-00004`)
  })

  it('existing numbers are untouched', async () => {
    const rows = (await db.query(`SELECT quote_number FROM tour_quotes WHERE quote_number IN ('QT-${YEAR}-00001', 'QT-${YEAR}-00002', 'QT-${YEAR}-X1')`)).rows
    expect(rows).toHaveLength(3)
  })

  it('is unique per company: two companies may hold the same number, one company may not hold it twice', async () => {
    const both = (await db.query(`SELECT org_id FROM tour_quotes WHERE quote_number = 'QT-${YEAR}-00003' ORDER BY org_id`)).rows
    expect(both.map(r => r.org_id)).toEqual([ORG_T, ORG_A])
    await expect(db.exec(`INSERT INTO tour_quotes (org_id, itinerary_id, quote_number) VALUES ('${ORG_T}', '${IT_T}', 'QT-${YEAR}-00001')`)).rejects.toThrow(/duplicate key/)
  })

  it('skips a number already taken in the company instead of colliding with it', async () => {
    await db.exec(`INSERT INTO tour_quotes (org_id, itinerary_id, quote_number) VALUES ('${ORG_T}', '${IT_T}', 'QT-${YEAR}-00006')`)
    expect(await newB2b(ORG_T, IT_T)).toBe(`QT-${YEAR}-00007`)
  })

  it('a signed-in user cannot call the number generator directly', async () => {
    const can = async (role: string) =>
      (await one(`SELECT has_function_privilege('${role}', 'public.next_quote_number(uuid, text, integer)', 'EXECUTE') AS ok`)).ok
    expect(await can('authenticated')).toBe(false)
    expect(await can('anon')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })
})

describe('B2C quote numbers', () => {
  it('are minted per company as B2C-YYYY-NNNNN, and the legacy numbers are kept', async () => {
    expect(await newB2c(ORG_T, IT_T)).toBe(`B2C-${YEAR}-00001`)
    expect(await newB2c(ORG_T, IT_T)).toBe(`B2C-${YEAR}-00002`)
    expect(await newB2c(ORG_A, IT_A)).toBe(`B2C-${YEAR}-00001`)
    expect((await one(`SELECT count(*)::int AS n FROM b2c_quotes WHERE quote_number LIKE 'B2C-MFX%'`)).n).toBe(2)
  })

  it('are unique per company', async () => {
    await expect(db.exec(`INSERT INTO b2c_quotes (org_id, itinerary_id, quote_number) VALUES ('${ORG_T}', '${IT_T}', 'B2C-${YEAR}-00001')`)).rejects.toThrow(/duplicate key/)
  })
})

describe('reverting a B2C offer', () => {
  it('restores the season premium of the revision, not the current one', async () => {
    const { id } = await one(`INSERT INTO b2c_quotes (org_id, itinerary_id, total_cost, margin_percent, margin_amount, selling_price, price_per_person, season_name, season_uplift_percent, season_uplift_amount)
      VALUES ('${ORG_T}', '${IT_T}', 1000, 20, 200, 1200, 600, NULL, 0, 0) RETURNING id`)
    await db.exec(`SELECT create_b2c_quote_revision('${id}', NULL, 'v1')`)
    await db.exec(`UPDATE b2c_quotes SET selling_price = 1380, price_per_person = 690, season_name = 'Peak', season_uplift_percent = 15, season_uplift_amount = 180 WHERE id = '${id}'`)
    await db.exec(`SELECT create_b2c_quote_revision('${id}', NULL, 'v2')`)
    await db.exec(`SELECT revert_b2c_quote_to_revision('${id}', 1, NULL, 'back')`)
    const q = await one(`SELECT selling_price::float AS s, season_name, season_uplift_percent::float AS p, season_uplift_amount::float AS a FROM b2c_quotes WHERE id = '${id}'`)
    expect(q).toEqual({ s: 1200, season_name: null, p: 0, a: 0 })
  })
})
