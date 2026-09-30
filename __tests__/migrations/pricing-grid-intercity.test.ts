// Migration 20261103 on a real Postgres.
//
// The pricing grid sends each day's intercity option as text ('none' | 'road'
// | 'flight'), the column is text with a CHECK on exactly those values, and
// save_pricing_grid_days cast it to BOOLEAN — so setting the option on any
// day made the whole grid save fail. This proves the failure on the schema
// as it stood, then that the fixed function stores the value.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const TARGET = '20261103_pricing_grid_intercity_text.sql'
const ITIN = '11111111-1111-1111-1111-111111111111'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const day = (n: number, intercity: string | null) => ({
  day_number: n, title: `Day ${n}`, description: '', city: 'Cairo', overnight_city: 'Cairo',
  date: `2026-12-0${n}`, day_type: 'tour', intercity,
  services: [{ service_type: 'transportation', service_name: 'Van', quantity: 1, rate_eur: 10, rate_non_eur: 10, total_cost: 10, client_price: 12 }],
})

const save = (days: unknown[]) =>
  db.query(`SELECT * FROM save_pricing_grid_days('${ITIN}', '${JSON.stringify(days)}'::jsonb)`)

const stored = async () =>
  (await db.query(`SELECT day_number, intercity FROM itinerary_days WHERE itinerary_id = '${ITIN}' ORDER BY day_number`)).rows

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  const org = (await db.query(`INSERT INTO organizations (name) VALUES ('Test org') RETURNING id`)).rows[0].id
  await db.exec(`INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id)
    VALUES ('${ITIN}', 'ITN-T', 'Test', 'Test', '2026-12-01', '2026-12-03', 3, '${org}')`)
})

afterAll(async () => { await db?.close() })

describe('pricing grid save — intercity', () => {
  it('BEFORE the fix: any intercity option fails the whole save', async () => {
    await expect(save([day(1, 'road')])).rejects.toThrow(/boolean/i)
    await expect(save([day(1, 'flight')])).rejects.toThrow(/boolean/i)
  })

  it('AFTER the fix: the option is stored as the text it is, and unset stays null', async () => {
    await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")

    const res = await save([day(1, 'flight'), day(2, 'road'), day(3, null)])
    expect(res.rows[0]).toMatchObject({ days_inserted: 3, services_inserted: 3 })
    expect(await stored()).toEqual([
      { day_number: 1, intercity: 'flight' },
      { day_number: 2, intercity: 'road' },
      { day_number: 3, intercity: null },
    ])
  })

  it('a value outside the vocabulary is still refused by the column CHECK', async () => {
    await expect(save([day(1, 'teleport')])).rejects.toThrow(/intercity/i)
  })
})
