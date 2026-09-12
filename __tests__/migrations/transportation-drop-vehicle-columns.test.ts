// 20261006_transportation_drop_vehicle_columns.sql, executed against a real
// Postgres (PGlite) on a production-shaped table: the twenty per-vehicle
// columns go, the list and everything else stays, a second run is a no-op —
// and it REFUSES to run while a row still prices a vehicle only in the
// columns, so a priced vehicle can never be dropped silently.
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = path.join(process.cwd(), 'migrations', '20261006_transportation_drop_vehicle_columns.sql')
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')

const LEGACY = ['sedan', 'minivan', 'van', 'minibus', 'bus'].flatMap(k => [`${k}_rate_eur`, `${k}_rate_non_eur`, `${k}_capacity_min`, `${k}_capacity_max`])

const TABLE = `
  CREATE SCHEMA IF NOT EXISTS public;
  CREATE TABLE public.transportation_rates (
    id serial PRIMARY KEY,
    service_code text,
    vehicle_type text, capacity_min int, capacity_max int, base_rate_eur numeric, base_rate_non_eur numeric,
    sedan_rate_eur numeric, sedan_rate_non_eur numeric, sedan_capacity_min int DEFAULT 1, sedan_capacity_max int DEFAULT 2,
    minivan_rate_eur numeric, minivan_rate_non_eur numeric, minivan_capacity_min int DEFAULT 3, minivan_capacity_max int DEFAULT 7,
    van_rate_eur numeric, van_rate_non_eur numeric, van_capacity_min int DEFAULT 8, van_capacity_max int DEFAULT 12,
    minibus_rate_eur numeric, minibus_rate_non_eur numeric, minibus_capacity_min int DEFAULT 13, minibus_capacity_max int DEFAULT 20,
    bus_rate_eur numeric, bus_rate_non_eur numeric, bus_capacity_min int DEFAULT 21, bus_capacity_max int DEFAULT 45,
    vehicles jsonb,
    rate_currency text
  );
`

const columns = async (db: PGlite) =>
  (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transportation_rates'`)).rows.map(r => r.column_name)

// One PGlite instance for the file: booting a second alongside the other
// migration suites pushed the whole run past vitest's timeouts.
describe('20261006 — the per-vehicle columns are dropped', () => {
  const db = new PGlite()
  afterAll(async () => { await db.close() })

  it('drops all twenty, keeps the list and the rest of the row, and runs twice', { timeout: 60_000 }, async () => {
    await db.exec(TABLE)
    // The production shape after 20261005: the list carries the vehicles, the columns mirror them.
    await db.exec(`INSERT INTO public.transportation_rates (service_code, sedan_rate_eur, bus_rate_eur, vehicles, rate_currency)
      VALUES ('PROD', 45, 140, '[{"key":"sedan","rate_eur":45,"rate_non_eur":null,"capacity_min":1,"capacity_max":2},{"key":"bus","rate_eur":140,"rate_non_eur":null,"capacity_min":21,"capacity_max":45}]'::jsonb, 'EGP')`)
    // The oldest shape: nothing in the columns, nothing in the list — allowed.
    await db.exec(`INSERT INTO public.transportation_rates (service_code, base_rate_eur, vehicle_type) VALUES ('BASE-ONLY', 80, 'Minibus')`)

    await db.exec(sql)
    const after = await columns(db)
    for (const c of LEGACY) expect(after, c).not.toContain(c)
    for (const c of ['vehicles', 'base_rate_eur', 'base_rate_non_eur', 'vehicle_type', 'capacity_min', 'capacity_max', 'rate_currency']) expect(after).toContain(c)

    const { rows } = await db.query<{ service_code: string; vehicles: unknown; rate_currency: string | null }>(`SELECT service_code, vehicles, rate_currency FROM public.transportation_rates ORDER BY id`)
    expect(rows[0].rate_currency).toBe('EGP')
    expect((rows[0].vehicles as { key: string }[]).map(v => v.key)).toEqual(['sedan', 'bus'])
    expect(rows[1].vehicles).toBeNull()

    await db.exec(sql) // idempotent
    expect(await columns(db)).toEqual(after)
  })

  it('refuses while a row prices a vehicle only in the columns — nothing is dropped', { timeout: 60_000 }, async () => {
    // Back to the pre-migration shape, with one row the backfill never saw.
    await db.exec(`DROP TABLE public.transportation_rates`)
    await db.exec(TABLE)
    await db.exec(`INSERT INTO public.transportation_rates (service_code, minivan_rate_eur) VALUES ('UNLISTED', 60)`)
    await expect(db.exec(sql)).rejects.toThrow(/1 transportation_rates row\(s\) price a vehicle only in the legacy columns/)
    expect(await columns(db)).toContain('minivan_rate_eur')
  })
})
