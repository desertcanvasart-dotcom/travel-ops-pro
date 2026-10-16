// Migration 20270102, executed against a real Postgres: no policy and no
// browser-role access left on user_invitations and activity_log.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20270102_invitations_activity_log_lockdown.sql'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
})

afterAll(async () => { await db?.close() })

describe('invitations and activity log are server-only', () => {
  it('had open policies before', async () => {
    const r = await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN ('user_invitations','activity_log')`)
    expect(r.rows[0].n).toBeGreaterThan(0)
  })

  it('leaves no policy and no anon/authenticated privilege, RLS on, applied twice', async () => {
    await db.exec(sql)
    await db.exec(sql)
    const pol = await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN ('user_invitations','activity_log')`)
    expect(pol.rows[0].n).toBe(0)
    const rls = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('user_invitations','activity_log') ORDER BY relname`)
    expect(rls.rows.map((r: { relrowsecurity: boolean }) => r.relrowsecurity)).toEqual([true, true])
    const grants = await db.query(`SELECT count(*)::int AS n FROM information_schema.role_table_grants
      WHERE table_name IN ('user_invitations','activity_log') AND grantee IN ('anon','authenticated')`)
    expect(grants.rows[0].n).toBe(0)
  })
})
