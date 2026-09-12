// 20261005_transportation_vehicles.sql, executed against a real Postgres
// (PGlite) on a production-shaped table: the backfill copies each row's OWN
// rates and bands into the list, only vehicles with a rate, ordered by band —
// and never rewrites a band. Run twice, unchanged.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import type { VehicleBandRate } from '@/lib/rates/vehicle-bands'

const MIGRATION = path.join(process.cwd(), 'migrations', '20261005_transportation_vehicles.sql')

// PGlite runs the file's statements inside its own transaction handling;
// the BEGIN/COMMIT the runner expects are stripped here, as the other
// PGlite-backed migration tests do.
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')

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
    bus_rate_eur numeric, bus_rate_non_eur numeric, bus_capacity_min int DEFAULT 21, bus_capacity_max int DEFAULT 45
  );
  -- the production shape: four vehicles, no van, default bands
  INSERT INTO public.transportation_rates (service_code, sedan_rate_eur, minivan_rate_eur, minibus_rate_eur, bus_rate_eur, bus_rate_non_eur)
    VALUES ('PROD-SHAPE', 45, 60, 95, 140, 155);
  -- an agency band: minivan from 1 pax, no sedan
  INSERT INTO public.transportation_rates (service_code, minivan_rate_eur, minivan_capacity_min, bus_rate_eur)
    VALUES ('AGENCY-BAND', 60, 1, 140);
  -- the oldest shape: no tiered rate at all
  INSERT INTO public.transportation_rates (service_code, base_rate_eur, vehicle_type) VALUES ('BASE-ONLY', 80, 'Minibus');
`

describe('20261005 — vehicles backfill', () => {
  const db = new PGlite()
  beforeAll(async () => { await db.exec(TABLE); await db.exec(sql) })
  afterAll(async () => { await db.close() })

  const rows = async () => (await db.query<{ service_code: string; vehicles: VehicleBandRate[] | null }>(`SELECT service_code, vehicles FROM public.transportation_rates ORDER BY id`)).rows

  it('copies only priced vehicles, with the row\'s own bands, ordered by band', async () => {
    const [prod] = await rows()
    expect(prod.vehicles).toEqual([
      { key: 'sedan', rate_eur: 45, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
      { key: 'minivan', rate_eur: 60, rate_non_eur: null, capacity_min: 3, capacity_max: 7 },
      { key: 'minibus', rate_eur: 95, rate_non_eur: null, capacity_min: 13, capacity_max: 20 },
      { key: 'bus', rate_eur: 140, rate_non_eur: 155, capacity_min: 21, capacity_max: 45 },
    ])
  })

  it('keeps an agency band exactly (minivan from 1) — never aligns it with the vocabulary', async () => {
    const [, agency] = await rows()
    expect(agency.vehicles?.map(v => [v.key, v.capacity_min, v.capacity_max])).toEqual([['minivan', 1, 7], ['bus', 21, 45]])
  })

  it('a row with no tiered rate gets NULL, so the reader falls through to base_rate_eur', async () => {
    const [, , base] = await rows()
    expect(base.vehicles).toBeNull()
  })

  it('is idempotent: a second run changes nothing, and a row edited since is left alone', async () => {
    await db.exec(`UPDATE public.transportation_rates SET vehicles = '[{"key":"4x4","rate_eur":85,"rate_non_eur":null,"capacity_min":1,"capacity_max":6}]'::jsonb WHERE service_code = 'PROD-SHAPE'`)
    await db.exec(sql)
    const [prod, agency] = await rows()
    expect(prod.vehicles).toEqual([{ key: '4x4', rate_eur: 85, rate_non_eur: null, capacity_min: 1, capacity_max: 6 }])
    expect(agency.vehicles).toHaveLength(2)
  })
})
