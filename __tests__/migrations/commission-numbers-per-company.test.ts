// Migration 20261231, executed against a real Postgres.
//
// Commissions had no number of their own. They now carry COM-YYYY-NNN, minted
// per company from a locked counter, backfilled oldest first, unique per company.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261231_commission_numbers_per_company.sql'
const ORG_T = '10000000-0000-4000-8000-000000000021'
const ORG_A = '10000000-0000-4000-8000-000000000022'
const YEAR = new Date().getFullYear()

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]
const newCommission = async (org: string, number?: string) =>
  (await one(`INSERT INTO commissions (org_id, commission_type, category, commission_amount${number ? ', commission_number' : ''})
    VALUES ('${org}', 'receivable', 'hotel', 10${number ? `, '${number}'` : ''}) RETURNING commission_number`)).commission_number as string

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    -- Existing commissions, interleaved across companies, with no number.
    INSERT INTO commissions (id, org_id, commission_type, category, commission_amount, created_at) VALUES
      ('70000000-0000-4000-8000-000000000001', '${ORG_T}', 'receivable', 'hotel', 10, '${YEAR}-02-01'),
      ('70000000-0000-4000-8000-000000000002', '${ORG_A}', 'receivable', 'hotel', 10, '${YEAR}-02-02'),
      ('70000000-0000-4000-8000-000000000003', '${ORG_T}', 'payable', 'hotel', 5, '${YEAR}-03-01'),
      ('70000000-0000-4000-8000-000000000004', '${ORG_T}', 'payable', 'hotel', 5, '${YEAR - 1}-12-01');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('commission numbers', () => {
  it('backfills per company, oldest first, per year of creation', async () => {
    const rows = (await db.query(`SELECT id, commission_number FROM commissions ORDER BY id`)).rows
    expect(rows.map(r => r.commission_number)).toEqual([
      `COM-${YEAR}-001`, // T, oldest of the year
      `COM-${YEAR}-001`, // A has its own count
      `COM-${YEAR}-002`, // T, second
      `COM-${YEAR - 1}-001`, // T, previous year
    ])
  })

  it('applying twice renumbers nothing', async () => {
    const before = (await db.query(`SELECT id, commission_number FROM commissions ORDER BY id`)).rows
    await db.exec(sql)
    expect((await db.query(`SELECT id, commission_number FROM commissions ORDER BY id`)).rows).toEqual(before)
  })

  it('a new commission carries on from its own company\'s highest', async () => {
    expect(await newCommission(ORG_T)).toBe(`COM-${YEAR}-003`)
    expect(await newCommission(ORG_A)).toBe(`COM-${YEAR}-002`)
    expect(await newCommission(ORG_T)).toBe(`COM-${YEAR}-004`)
  })

  it('is unique per company: two companies may hold one number, one company may not hold it twice', async () => {
    const both = (await db.query(`SELECT org_id FROM commissions WHERE commission_number = 'COM-${YEAR}-001' ORDER BY org_id`)).rows
    expect(both.map(r => r.org_id)).toEqual([ORG_T, ORG_A])
    await expect(newCommission(ORG_T, `COM-${YEAR}-001`)).rejects.toThrow(/duplicate key/)
  })

  it('a number the caller supplies is kept, and a taken number is skipped, never collided with', async () => {
    expect(await newCommission(ORG_A, `COM-${YEAR}-003`)).toBe(`COM-${YEAR}-003`)
    // A's counter is at 002; 003 is taken, so the next free one is 004.
    expect(await newCommission(ORG_A)).toBe(`COM-${YEAR}-004`)
  })

  it('a signed-in user cannot call the number generator directly', async () => {
    const can = async (role: string) =>
      (await one(`SELECT has_function_privilege('${role}', 'public.next_commission_number(uuid, integer)', 'EXECUTE') AS ok`)).ok
    expect(await can('authenticated')).toBe(false)
    expect(await can('anon')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })

  it('a new year starts from 001', async () => {
    expect((await one(`SELECT next_commission_number('${ORG_T}', 2099) AS n`)).n).toBe('COM-2099-001')
    expect((await one(`SELECT next_commission_number('${ORG_T}', 2099) AS n`)).n).toBe('COM-2099-002')
  })
})
