// Migration 20270110 on a real Postgres: save_pricing_grid_days writes what
// each line's supplier is paid in (paid_currency / paid_amount / paid_rate,
// 20270109) when the service carries the keys — nulls included — and leaves
// a line that does not carry them as it is.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const TARGET = '20270110_pricing_grid_save_paid_currency.sql'
const ITIN = '11111111-1111-1111-1111-111111111110'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const svc = (name: string, extra: Record<string, unknown> = {}) => ({
  service_type: 'guide', service_name: name, quantity: 1, rate_eur: 30, rate_non_eur: 30, total_cost: 30, client_price: 39, ...extra,
})
const day = (services: unknown[]) => ({
  day_number: 1, title: 'Day 1', description: '', city: 'Luxor', overnight_city: 'Luxor', date: '2026-12-01', day_type: 'tour', intercity: 'road', services,
})
const save = (services: unknown[]) =>
  db.query(`SELECT * FROM save_pricing_grid_days('${ITIN}', '${JSON.stringify([day(services)])}'::jsonb)`)
const lines = async () =>
  (await db.query(`SELECT s.service_name, s.total_cost::float AS total, s.paid_currency, s.paid_amount::float AS paid_amount, s.paid_rate::float AS paid_rate
                     FROM itinerary_services s JOIN itinerary_days d ON d.id = s.itinerary_day_id
                    WHERE d.itinerary_id = '${ITIN}' ORDER BY s.service_name`)).rows
const EGP = { paid_currency: 'EGP', paid_amount: 1500, paid_rate: 0.02 }

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  const org = (await db.query(`INSERT INTO organizations (name) VALUES ('Test org') RETURNING id`)).rows[0].id
  await db.exec(`INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id)
    VALUES ('${ITIN}', 'ITN-P', 'Test', 'Test', '2026-12-01', '2026-12-01', 1, '${org}')`)
})

afterAll(async () => { await db?.close() })

describe('pricing grid save — paid currency', () => {
  it('a new line is stored with what its supplier is paid in; one without the keys has none', async () => {
    await save([svc('Ahmed', EGP), svc('Water')])
    expect(await lines()).toEqual([
      { service_name: 'Ahmed', total: 30, ...EGP },
      { service_name: 'Water', total: 30, paid_currency: null, paid_amount: null, paid_rate: null },
    ])
  })

  it('updated in place: new paid values are written, and a line without the keys (kept at its saved price) keeps its own', async () => {
    await save([svc('Ahmed', { ...EGP, total_cost: 60, paid_amount: 3000 }), svc('Water')])
    expect((await lines())[0]).toEqual({ service_name: 'Ahmed', total: 60, paid_currency: 'EGP', paid_amount: 3000, paid_rate: 0.02 })
    await save([svc('Ahmed', { total_cost: 60 }), svc('Water')])
    expect((await lines())[0]).toMatchObject({ paid_currency: 'EGP', paid_amount: 3000 })
  })

  it('re-picked at a rate in the rate currency (keys sent as null): the line stops saying EGP', async () => {
    await save([svc('Ahmed', { total_cost: 60, paid_currency: null, paid_amount: null, paid_rate: null }), svc('Water')])
    expect((await lines())[0]).toMatchObject({ paid_currency: null, paid_amount: null, paid_rate: null })
  })

  it('the day is still saved as before (intercity text kept)', async () => {
    const { rows } = await db.query(`SELECT intercity FROM itinerary_days WHERE itinerary_id = '${ITIN}'`)
    expect(rows).toEqual([{ intercity: 'road' }])
  })

  it('is the function the grid calls, re-applied safely', async () => {
    await expect(db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))).resolves.toBeDefined()
  })
})
