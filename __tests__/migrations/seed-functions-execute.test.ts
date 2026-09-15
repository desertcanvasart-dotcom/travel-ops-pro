// Migration 20261012, executed against a real Postgres.
//
// The four vocabulary seeders are SECURITY DEFINER and take the organisation
// id as an argument, with no membership check. Postgres grants PUBLIC execute
// on every new function, and the baseline's default privileges add an
// explicit grant to `authenticated` — so any signed-in user could call one via
// rpc with another organisation's id and restore preset entries that
// organisation's admin had deleted. This pins that only service_role can.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const SEEDERS = [
  'public.seed_org_vocabulary(uuid, text)',
  'public.seed_cruise_supplements(uuid)',
  'public.seed_tour_template_vocabulary(uuid)',
  'public.seed_tour_themes(uuid)',
]

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const can = async (role: string, fn: string) =>
  (await db.query(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE') AS ok`)).rows[0].ok as boolean

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
})

afterAll(async () => {
  await db?.close()
})

describe('after the full replay', () => {
  for (const fn of SEEDERS) {
    it(`${fn}: a signed-in user cannot call it`, async () => {
      expect(await can('authenticated', fn)).toBe(false)
      expect(await can('anon', fn)).toBe(false)
    })
    it(`${fn}: the service role still can (the reset route and the org trigger need it)`, async () => {
      expect(await can('service_role', fn)).toBe(true)
    })
  }

  it('the organisations INSERT trigger still seeds a new org — it runs as its definer, not the caller', async () => {
    await db.exec(`INSERT INTO organizations (id, name) VALUES ('22222222-2222-4222-8222-222222222222','New Agency');`)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM org_vocabularies WHERE org_id = '22222222-2222-4222-8222-222222222222' AND kind = 'tour_theme'`)
    expect(rows[0].n).toBeGreaterThan(0)
  })
})
