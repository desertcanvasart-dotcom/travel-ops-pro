// Migration 20270118, executed against a real Postgres: the cities a guide
// works in move from each guide_rates row to supplier_cities (one row per
// guide × city), and the guide-rate natural key loses city. Applied twice.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MIGRATIONS } from '@/scripts/replay-core.mjs'

const sql = readFileSync(path.join(MIGRATIONS, '20270118_guide_cities.sql'), 'utf8')
type Db = { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE organizations (id uuid PRIMARY KEY);
  CREATE TABLE suppliers (id uuid PRIMARY KEY, org_id uuid);
  CREATE TABLE guide_rates (
    id serial PRIMARY KEY, org_id uuid, supplier_id uuid, guide_language text, guide_type text,
    tour_duration text, guide_mode text DEFAULT 'spot', city varchar, cities text[] NOT NULL DEFAULT '{}',
    rate_valid_from date, rate_valid_to date
  );
  CREATE UNIQUE INDEX uq_guide_rates_natural_key ON guide_rates (org_id,
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language, guide_type, tour_duration,
    COALESCE(city, ''::varchar), guide_mode, COALESCE(rate_valid_from, '-infinity'::date), COALESCE(rate_valid_to, 'infinity'::date));
  INSERT INTO organizations VALUES ('00000000-0000-0000-0000-00000000000a');
  INSERT INTO suppliers VALUES
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a'),
    ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a');
`
const ORG = '00000000-0000-0000-0000-00000000000a'
const A = '00000000-0000-0000-0000-0000000000a1'
const B = '00000000-0000-0000-0000-0000000000b1'
const C = '00000000-0000-0000-0000-0000000000c1'
const rate = (sup: string, dur: string, city: string | null, cities: string) =>
  `INSERT INTO guide_rates (org_id, supplier_id, guide_language, guide_type, tour_duration, city, cities)
   VALUES ('${ORG}', '${sup}', 'japanese', 'egyptologist', '${dur}', ${city ? `'${city}'` : 'NULL'}, '${cities}');`

let db: Db
beforeAll(async () => {
  db = new PGlite() as any
  await db.exec(SCHEMA)
  await db.exec([
    rate(A, 'full_day', 'Cairo', '{Cairo,Alexandria}'),
    rate(A, 'half_day', 'Cairo', '{Cairo}'),      // the same city again: one row
    rate(B, 'full_day', 'Luxor', '{}'),            // a row from before the list
    rate(C, 'full_day', 'Aswan', '{Aswan}'),
    rate(C, 'half_day', null, '{}'),               // an all-cities rate: C works everywhere
  ].join('\n'))
  await db.exec(sql)
  await db.exec(sql)
})
afterAll(async () => { await db?.close() })

describe('20270118_guide_cities', () => {
  it("each guide gets the cities its rates named; a guide with an all-cities rate gets none", async () => {
    const rows = (await db.query(`SELECT supplier_id, city FROM supplier_cities ORDER BY supplier_id, city`)).rows
    expect(rows).toEqual([
      { supplier_id: A, city: 'Alexandria' },
      { supplier_id: A, city: 'Cairo' },
      { supplier_id: B, city: 'Luxor' },
    ])
  })

  it('touches no guide_rates row (the audit trigger would mail a digest)', async () => {
    const rows = (await db.query(`SELECT city, cities FROM guide_rates ORDER BY id`)).rows
    expect(rows[0]).toEqual({ city: 'Cairo', cities: ['Cairo', 'Alexandria'] })
  })

  it('one row per guide × city, whatever the spelling', async () => {
    await expect(db.exec(`INSERT INTO supplier_cities (org_id, supplier_id, city) VALUES ('${ORG}', '${A}', ' cairo ')`)).rejects.toThrow(/unique/)
    await expect(db.exec(`INSERT INTO supplier_cities (org_id, supplier_id, city) VALUES ('${ORG}', '${A}', '  ')`)).rejects.toThrow(/check/)
  })

  it('the natural key no longer has city: a per-city copy of a rate is refused', async () => {
    await expect(db.exec(rate(B, 'full_day', 'Aswan', '{Aswan}'))).rejects.toThrow(/uq_guide_rates_natural_key/)
  })

  it('deleting a guide deletes their cities', async () => {
    await db.exec(`DELETE FROM guide_rates WHERE supplier_id = '${B}'; DELETE FROM suppliers WHERE id = '${B}'`)
    expect((await db.query(`SELECT count(*)::int AS n FROM supplier_cities WHERE supplier_id = '${B}'`)).rows[0].n).toBe(0)
  })

  it('an install still holding per-city copies keeps the old key and is told why', async () => {
    const old = new PGlite() as any as Db
    await old.exec(SCHEMA)
    await old.exec(rate(A, 'full_day', 'Cairo', '{Cairo}') + rate(A, 'full_day', 'Luxor', '{Luxor}'))
    await old.exec(sql)
    const def = (await old.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_guide_rates_natural_key'`)).rows[0].indexdef
    expect(def).toContain('city')
    expect((await old.query(`SELECT city FROM supplier_cities ORDER BY city`)).rows.map(r => r.city)).toEqual(['Cairo', 'Luxor'])
    await old.close()
  })
})
