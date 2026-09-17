// Migration 20261018, executed against a real Postgres on an install shaped
// like production (operator, 2026-09-17):
//   - transport packages get the transportation rates' `vehicles` list, their
//     five columns carried over, with the VOCABULARY's passenger sizes on
//     every vehicle the vocabulary lists ("transportation rates always follow
//     the Vocabulary vehicle sizes"); a vehicle it does not list keeps its own
//   - guide rates carry a mode; every existing one is spot
//   - a guide_mode vocabulary kind with the two presets, for existing and new
//     organisations
// Run twice, unchanged.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const ORG = '11111111-1111-4111-8111-111111111111'
const TARGET = '20261018_package_vehicles_guide_modes.sql'

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows
const target = readFileSync(path.join(MIGRATIONS, TARGET), 'utf8')

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }

  // The production install: its own vehicles (HIACE 1–5, Coaster 6–12, Bus 13–45)
  // and the two cruise packages as they were entered in the five columns.
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}','ATS');`)
  await db.exec(`DELETE FROM org_vocabularies WHERE org_id = '${ORG}' AND kind = 'vehicle_type';`)
  await db.exec(`INSERT INTO org_vocabularies (org_id, kind, key, label, meta, rank) VALUES
    ('${ORG}','vehicle_type','hiace','HIACE','{"min_pax":1,"max_pax":5}',1),
    ('${ORG}','vehicle_type','coaster','Coaster','{"min_pax":6,"max_pax":12}',2),
    ('${ORG}','vehicle_type','bus','Bus','{"min_pax":13,"max_pax":45}',3);`)
  await db.exec(`INSERT INTO b2b_transport_packages
      (org_id, package_code, package_name, package_type, duration_days, rate_currency,
       sedan_rate, sedan_capacity, minivan_rate, minivan_capacity, van_rate, van_capacity, minibus_rate, minibus_capacity, bus_rate, bus_capacity)
    VALUES
      ('${ORG}','P4','4D Cruise Sightseeing Transport','cruise_sightseeing',4,'EGP', 0,3, 3500,5, 5000,12, 7000,20, 8000,50),
      ('${ORG}','P5','5D Cruise Sightseeing Transport','cruise_sightseeing',5,'EGP', 3000,2, 4500,5, 6500,11, 8500,20, 10000,50);`)
  await db.exec(`INSERT INTO guide_rates (service_code, guide_language, guide_type, tour_duration, base_rate_eur, base_rate_non_eur)
    VALUES ('G1','japanese','egyptologist','full_day',100,100);`)
  await db.exec(target)
})

afterAll(async () => {
  await db?.close()
})

const vehiclesOf = async (code: string) =>
  (await rows(`SELECT vehicles FROM b2b_transport_packages WHERE package_code = '${code}'`))[0].vehicles as Array<Record<string, unknown>>

describe('transport packages', () => {
  it('carry their priced vehicles over; a vehicle the vocabulary lists takes its size', async () => {
    expect(await vehiclesOf('P5')).toEqual([
      { key: 'sedan', rate_eur: 3000, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
      { key: 'minivan', rate_eur: 4500, rate_non_eur: null, capacity_min: 3, capacity_max: 5 },
      { key: 'van', rate_eur: 6500, rate_non_eur: null, capacity_min: 6, capacity_max: 11 },
      { key: 'minibus', rate_eur: 8500, rate_non_eur: null, capacity_min: 12, capacity_max: 20 },
      // Bus is in the vocabulary: 13–45, not the package's 21–50.
      { key: 'bus', rate_eur: 10000, rate_non_eur: null, capacity_min: 13, capacity_max: 45 },
    ])
  })

  it('a vehicle with no rate is not offered, and the next one starts above its capacity', async () => {
    const p4 = await vehiclesOf('P4')
    expect(p4.map(v => v.key)).toEqual(['minivan', 'van', 'minibus', 'bus'])
    expect(p4[0]).toMatchObject({ key: 'minivan', capacity_min: 4, capacity_max: 5 })
  })

  it('running it again changes nothing', async () => {
    const before = [await vehiclesOf('P4'), await vehiclesOf('P5')]
    await db.exec(target)
    expect([await vehiclesOf('P4'), await vehiclesOf('P5')]).toEqual(before)
  })
})

describe('guide modes', () => {
  it('every existing guide rate is a spot rate, and a mode must be a key', async () => {
    expect((await rows(`SELECT guide_mode FROM guide_rates`)).map(r => r.guide_mode)).toEqual(['spot'])
    await expect(db.exec(`UPDATE guide_rates SET guide_mode = 'Not A Key'`)).rejects.toThrow()
  })

  it('existing and new organisations get Spot and Throughout in Settings → Vocabulary', async () => {
    const keys = async (org: string) =>
      (await rows(`SELECT key FROM org_vocabularies WHERE org_id = '${org}' AND kind = 'guide_mode' ORDER BY rank`)).map(r => r.key)
    expect(await keys(ORG)).toEqual(['spot', 'throughout'])
    const NEW = '22222222-2222-4222-8222-222222222222'
    await db.exec(`INSERT INTO organizations (id, name) VALUES ('${NEW}','New agency');`)
    expect(await keys(NEW)).toEqual(['spot', 'throughout'])
  })

  it('only the service role may run the seeder', async () => {
    const can = async (role: string) =>
      (await rows(`SELECT has_function_privilege('${role}', 'public.seed_guide_modes(uuid)', 'EXECUTE') AS ok`))[0].ok
    expect(await can('authenticated')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })
})
