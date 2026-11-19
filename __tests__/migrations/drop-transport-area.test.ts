// Migration 20270126 on a real Postgres: transportation_rates.area is dropped
// only when no row holds a value; otherwise it is kept, with a notice, so no
// rate's data is lost before it is re-entered as a pickup area / sights.
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MIGRATIONS } from '@/scripts/replay-core.mjs'

const sql = readFileSync(path.join(MIGRATIONS, '20270126_drop_transport_area.sql'), 'utf8')
type Db = { query(s: string): Promise<{ rows: Array<Record<string, unknown>> }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

async function fresh(rows: Array<string | null>): Promise<Db> {
  const db = new PGlite() as unknown as Db
  await db.exec('CREATE TABLE transportation_rates (id serial PRIMARY KEY, city text, area varchar(50));')
  for (const a of rows) await db.exec(`INSERT INTO transportation_rates (city, area) VALUES ('Luxor', ${a === null ? 'NULL' : `'${a}'`});`)
  return db
}
const hasArea = async (db: Db) =>
  (await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'transportation_rates' AND column_name = 'area'`)).rows[0].n === 1

describe('20270126_drop_transport_area', () => {
  it('no row holds a value: the column is dropped, and a re-run is a no-op', async () => {
    const db = await fresh([null, '', '  '])
    await db.exec(sql)
    expect(await hasArea(db)).toBe(false)
    await db.exec(sql)
    expect(await hasArea(db)).toBe(false)
    await db.close()
  }, 60_000)

  it('a row holds a value: the column and its values are kept', async () => {
    const db = await fresh([null, 'west_bank'])
    await db.exec(sql)
    expect(await hasArea(db)).toBe(true)
    expect((await db.query(`SELECT area FROM transportation_rates WHERE area IS NOT NULL`)).rows).toEqual([{ area: 'west_bank' }])
    await db.close()
  }, 60_000)
})
