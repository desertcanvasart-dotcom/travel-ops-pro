// Migration 20261202, executed against a real Postgres.
//
// Every per-company backfill asks the same questions — which organisation is
// ATS, where does an untraceable row go, which company is a person in — and
// writes what it could not trace to org_backfill_review. These pin the
// answers on an install with ATS and Travel2Egypt, and that a signed-in user
// can call none of the helpers.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261202_org_backfill_support.sql'
const ORG_T = '10000000-0000-4000-8000-000000000001' // Travel2Egypt (older)
const ORG_A = '10000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '20000000-0000-4000-8000-000000000001'
const A_ONLY = '20000000-0000-4000-8000-000000000002'
const BOTH = '20000000-0000-4000-8000-000000000003'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  // The migrations before this one: later ones (the per-table backfills)
  // call these helpers and cannot run without them.
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01'), ('${ORG_A}', 'ATS', '2026-06-01');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'staff@ats-hj.com'), ('${BOTH}', 'owner@travel2egypt.org')
      ON CONFLICT DO NOTHING;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${BOTH}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'manager'), ('${ORG_A}', '${A_ONLY}', 'agent'),
      ('${ORG_T}', '${BOTH}', 'owner'), ('${ORG_A}', '${BOTH}', 'admin');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('who is who', () => {
  it('slugs the ATS organisation and the one other', async () => {
    const rows = (await db.query(`SELECT id, slug FROM organizations WHERE id IN ('${ORG_T}', '${ORG_A}') ORDER BY id`)).rows
    expect(rows).toEqual([{ id: ORG_T, slug: 'travel2egypt' }, { id: ORG_A, slug: 'ats' }])
  })

  it('finds ATS, sends untraceable operational rows to Travel2Egypt and catalogue rows to ATS', async () => {
    expect((await one('SELECT org_backfill_ats() AS v')).v).toBe(ORG_A)
    expect((await one('SELECT org_backfill_default() AS v')).v).toBe(ORG_T)
    expect((await one('SELECT org_backfill_catalogue_default() AS v')).v).toBe(ORG_A)
  })

  it('traces a person to their company only when they belong to exactly one', async () => {
    expect((await one(`SELECT org_backfill_user_org('${T_ONLY}') AS v`)).v).toBe(ORG_T)
    expect((await one(`SELECT org_backfill_user_org('${A_ONLY}') AS v`)).v).toBe(ORG_A)
    expect((await one(`SELECT org_backfill_user_org('${BOTH}') AS v`)).v).toBeNull()
    expect((await one(`SELECT org_backfill_user_org(gen_random_uuid()) AS v`)).v).toBeNull()
  })
})

describe('only migrations may use it', () => {
  it('a signed-in user can call none of the helpers', async () => {
    const rows = (await db.query(`
      SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'org_backfill_%'`)).rows
    expect(rows.length).toBe(4)
    expect(rows.every((r: any) => r.can === false)).toBe(true)
  })

  it('the review list is closed to signed-in users', async () => {
    const r = await one(`SELECT has_table_privilege('authenticated', 'public.org_backfill_review', 'SELECT') AS can,
                               relrowsecurity AS rls FROM pg_class WHERE oid = 'public.org_backfill_review'::regclass`)
    expect(r).toEqual({ can: false, rls: true })
  })
})
