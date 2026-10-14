// Migration 20261227, executed against a real Postgres.
//
// Expense numbers (EXP-YYYY-NNN) came from one global sequence and were UNIQUE
// across every company, so each company's numbers skipped with the other's
// volume. They are now minted per company from a locked counter, and the
// uniqueness is per company. The same migration adds commissions.service_id,
// the link that lets deleting a generated commission release its service.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261227_expense_numbers_per_company.sql'
const ORG_T = '10000000-0000-4000-8000-000000000011'
const ORG_A = '10000000-0000-4000-8000-000000000012'
const YEAR = new Date().getFullYear()

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]
const newExpense = async (org: string, number?: string) =>
  (await one(`INSERT INTO expenses (org_id, category, amount, expense_date${number ? ', expense_number' : ''})
    VALUES ('${org}', 'guide', 10, '2026-10-01'${number ? `, '${number}'` : ''}) RETURNING expense_number`)).expense_number as string

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
    -- Numbers as the global sequence left them: interleaved, plus an odd one.
    INSERT INTO expenses (org_id, category, amount, expense_date, expense_number) VALUES
      ('${ORG_T}', 'guide', 10, '2026-10-01', 'EXP-${YEAR}-001'),
      ('${ORG_A}', 'guide', 10, '2026-10-01', 'EXP-${YEAR}-002'),
      ('${ORG_T}', 'guide', 10, '2026-10-01', 'EXP-${YEAR}-003'),
      ('${ORG_T}', 'guide', 10, '2026-10-01', 'EXP-${YEAR}-X1');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('expense numbers', () => {
  it('a hand-edited number does not break the next insert, and each company carries on from its own highest', async () => {
    expect(await newExpense(ORG_T)).toBe(`EXP-${YEAR}-004`)
    expect(await newExpense(ORG_A)).toBe(`EXP-${YEAR}-003`)
    expect(await newExpense(ORG_T)).toBe(`EXP-${YEAR}-005`)
    expect(await newExpense(ORG_A)).toBe(`EXP-${YEAR}-004`)
  })

  it('existing numbers are untouched', async () => {
    const rows = (await db.query(`SELECT expense_number FROM expenses WHERE expense_number IN ('EXP-${YEAR}-001', 'EXP-${YEAR}-002', 'EXP-${YEAR}-X1')`)).rows
    expect(rows).toHaveLength(3)
  })

  it('is unique per company: two companies may hold the same number, one company may not hold it twice', async () => {
    const both = (await db.query(`SELECT org_id FROM expenses WHERE expense_number = 'EXP-${YEAR}-003' ORDER BY org_id`)).rows
    expect(both.map(r => r.org_id)).toEqual([ORG_T, ORG_A])
    await expect(newExpense(ORG_T, `EXP-${YEAR}-001`)).rejects.toThrow(/duplicate key/)
  })

  it('a number the caller supplies is kept (the app passes none now, but old callers do)', async () => {
    expect(await newExpense(ORG_A, 'EXP-9999-777')).toBe('EXP-9999-777')
  })

  it('skips a number already taken in the company instead of colliding with it', async () => {
    const next = Number((await newExpense(ORG_T, `EXP-${YEAR}-007`)).slice(-3))
    expect(next).toBe(7)
    // The counter is at 005; 006 is free, 007 is taken.
    expect(await newExpense(ORG_T)).toBe(`EXP-${YEAR}-006`)
    expect(await newExpense(ORG_T)).toBe(`EXP-${YEAR}-008`)
  })

  it('a signed-in user cannot call the number generator directly', async () => {
    const can = async (role: string) =>
      (await one(`SELECT has_function_privilege('${role}', 'public.next_expense_number(uuid, integer)', 'EXECUTE') AS ok`)).ok
    expect(await can('authenticated')).toBe(false)
    expect(await can('anon')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })

  it('the function mints a number for a new year from 001', async () => {
    expect((await one(`SELECT next_expense_number('${ORG_T}', 2099) AS n`)).n).toBe('EXP-2099-001')
    expect((await one(`SELECT next_expense_number('${ORG_T}', 2099) AS n`)).n).toBe('EXP-2099-002')
  })
})

describe('commissions.service_id', () => {
  it('exists, is nullable, and a deleted service keeps the commission', async () => {
    await db.exec(`
      INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days)
        VALUES ('30000000-0000-4000-8000-000000000011', '${ORG_T}', 'ITN-T', 'C', 'Trip', '2026-12-01', '2026-12-05', 5);
      INSERT INTO itinerary_days (id, itinerary_id, day_number, date)
        VALUES ('40000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000011', 1, '2026-12-01');
      INSERT INTO itinerary_services (id, itinerary_day_id, service_type, service_name)
        VALUES ('50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000011', 'accommodation', 'Stay');
      INSERT INTO commissions (id, org_id, commission_type, category, commission_amount, service_id)
        VALUES ('60000000-0000-4000-8000-000000000011', '${ORG_T}', 'receivable', 'hotel', 10, '50000000-0000-4000-8000-000000000011');
      INSERT INTO commissions (id, org_id, commission_type, category, commission_amount)
        VALUES ('60000000-0000-4000-8000-000000000012', '${ORG_T}', 'payable', 'hotel', 5);
    `)
    await db.exec(`DELETE FROM itinerary_services WHERE id = '50000000-0000-4000-8000-000000000011'`)
    const rows = (await db.query(`SELECT id, service_id FROM commissions ORDER BY id`)).rows
    expect(rows).toEqual([
      { id: '60000000-0000-4000-8000-000000000011', service_id: null },
      { id: '60000000-0000-4000-8000-000000000012', service_id: null },
    ])
  })
})
