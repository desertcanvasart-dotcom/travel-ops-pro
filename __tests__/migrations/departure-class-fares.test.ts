// Migration 20261105 on a real Postgres: three class fares and three website
// rates per departure, nullable, and the migration replays cleanly.
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let db: PGlite
const mig = readFileSync(path.join(process.cwd(), 'migrations/20261105_departure_class_fares.sql'), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table tour_departures(id serial primary key, start_date date, air_pp numeric(10,2));
    insert into tour_departures(start_date, air_pp) values ('2026-10-05', 120000);`)
  await db.exec(mig)
  await db.exec(mig)
}, 60_000)

describe('20261105_departure_class_fares', () => {
  it('adds the class fares and website rates, empty on existing rows', async () => {
    const { rows } = await db.query(`select air_pp, air_business_pp, air_oneway_business_pp, web_price_economy, web_price_business, web_price_oneway_business from tour_departures`)
    expect(rows).toEqual([{ air_pp: '120000.00', air_business_pp: null, air_oneway_business_pp: null, web_price_economy: null, web_price_business: null, web_price_oneway_business: null }])
  })

  it('holds a yen total in the millions', async () => {
    await db.exec(`update tour_departures set air_business_pp = 1250000, web_price_business = 1638999`)
    const { rows } = await db.query<{ web_price_business: string }>(`select web_price_business from tour_departures`)
    expect(rows[0].web_price_business).toBe('1638999.00')
  })
})
