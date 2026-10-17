// Migration 20261220, executed against a real Postgres.
//
// uq_guide_rates_natural_key left out guide_mode, so a Throughout rate beside
// the same Spot rate died on 23505 (the route's own check let it through) and
// the operator could not enter the rate a throughout quote needs. It also
// left out the validity period, which the create routes now key on so one
// service can hold this year's and next year's price. This replays every
// earlier migration, shows the collision is real, then applies the file twice.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261220_guide_rates_unique_mode.sql'
const ORG = '33000000-0000-4000-8000-000000000001'

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

let n = 0
const insert = (mode: string, from: string | null = null, to: string | null = null) =>
  db.exec(`INSERT INTO guide_rates (service_code, guide_language, guide_type, tour_duration, city, guide_mode,
             base_rate_eur, base_rate_non_eur, rate_valid_from, rate_valid_to, org_id)
           VALUES ('GD-T${++n}', 'japanese', 'egyptologist', 'full_day', 'Luxor', '${mode}', 100, 100,
             ${from ? `'${from}'` : 'NULL'}, ${to ? `'${to}'` : 'NULL'}, '${ORG}')`)

async function code(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null } catch (e: any) { return e?.code ?? 'error' }
}

async function replay(includeFile: boolean) {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'Travel2Egypt') ON CONFLICT DO NOTHING;`)
  await insert('spot')
  if (includeFile) {
    await db.exec(sql)
    await db.exec(sql) // twice: idempotent
  }
}

describe('before the migration (the collision is real)', () => {
  beforeAll(async () => { await replay(false) })
  afterAll(async () => { await db?.close() })

  it('a Throughout rate beside the same Spot rate is refused by the index', async () => {
    expect(await code(insert('throughout'))).toBe('23505')
  })
})

describe('after the migration, applied twice', () => {
  beforeAll(async () => { await replay(true) })
  afterAll(async () => { await db?.close() })

  it('the index carries the guide mode and the validity period', async () => {
    const { rows } = await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_guide_rates_natural_key'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toContain('guide_mode')
    expect(rows[0].indexdef).toContain('rate_valid_from')
    expect(rows[0].indexdef).toContain('rate_valid_to')
  })

  it('Spot and Throughout for the same guide are two rates', async () => {
    expect(await code(insert('throughout'))).toBeNull()
  })

  it('one service can hold two validity periods', async () => {
    expect(await code(insert('spot', '2026-01-01', '2026-12-31'))).toBeNull()
    expect(await code(insert('spot', '2027-01-01', '2027-12-31'))).toBeNull()
  })

  it('an exact duplicate is still refused', async () => {
    expect(await code(insert('spot', '2027-01-01', '2027-12-31'))).toBe('23505')
    expect(await code(insert('spot'))).toBe('23505')
  })
})
