// Migration 20261129 on a real Postgres (AUDIT M30).
//
// One expense matched to two supplier invoices: together the links may not
// exceed the expense. The route checked this by read-then-write, so two
// matches at once over-committed the expense; the table now refuses it.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const TARGET = '20261129_supplier_invoice_expense_cap.sql'
const ORG = '11111111-1111-4111-8111-111111111111'
const EXP = '22222222-2222-4222-8222-222222222222'
const INV_A = '33333333-3333-4333-8333-333333333333'
const INV_B = '44444444-4444-4444-8444-444444444444'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const link = (inv: string, amount: number) =>
  db.exec(
    `INSERT INTO supplier_invoice_expenses (supplier_invoice_id, expense_id, matched_amount)
     VALUES ('${inv}', '${EXP}', ${amount})
     ON CONFLICT (supplier_invoice_id, expense_id) DO UPDATE SET matched_amount = EXCLUDED.matched_amount`
  )
const matched = async () =>
  Number((await db.query(`SELECT COALESCE(SUM(matched_amount),0) AS s FROM supplier_invoice_expenses WHERE expense_id = '${EXP}'`)).rows[0].s)

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f <= TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'ATS');`)
  await db.exec(`INSERT INTO expenses (id, category, amount, expense_date, org_id) VALUES ('${EXP}', 'hotel', 1000, '2026-10-01', '${ORG}');`)
  for (const inv of [INV_A, INV_B]) {
    await db.exec(`INSERT INTO supplier_invoices (id, supplier_invoice_number, supplier_name, invoice_date, amount, org_id)
                   VALUES ('${inv}', 'N-${inv.slice(0, 4)}', 'Mena House', '2026-10-01', 1000, '${ORG}');`)
  }
})

afterAll(async () => { await db?.close() })

describe('an expense matched across supplier invoices', () => {
  it('may be split between invoices up to its amount', async () => {
    await link(INV_A, 600)
    await link(INV_B, 400)
    expect(await matched()).toBe(1000)
  })

  it('a link past what is left is refused with 23514', async () => {
    await expect(link(INV_B, 401)).rejects.toMatchObject({ code: '23514' })
    expect(await matched()).toBe(1000)
  })

  it('re-matching the same invoice does not count its own old link', async () => {
    await link(INV_A, 600)
    await link(INV_A, 500)
    expect(await matched()).toBe(900)
  })

  it('a cent of rounding is allowed', async () => {
    await link(INV_B, 500.01)
    expect(await matched()).toBe(1000.01)
  })
})
