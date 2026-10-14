// Migration 20261225, executed against a real Postgres.
//
// Invoice numbers were one install-wide series under UNIQUE (invoice_number);
// receipts had no number of their own (the transaction reference stood in, so
// two payments with the same reference had the same receipt number). Both are
// now per company, drawn under a row lock, and existing numbers are kept.
// Also pinned: VAT is recorded on a trip payment, and an invoice payment
// cannot overdraw its invoice.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261225_invoice_receipt_numbers_per_company.sql'
const ORG_T = '33000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '33000000-0000-4000-8000-000000000002' // ATS
const IT_T = '34000000-0000-4000-8000-000000000001'
const IT_A = '34000000-0000-4000-8000-000000000002'
const INV_T = '35000000-0000-4000-8000-000000000001'
const INV_BAL = '35000000-0000-4000-8000-000000000002'
const INV_A = '35000000-0000-4000-8000-000000000003'
const P = (n: number) => `36000000-0000-4000-8000-00000000000${n}`
const IP = (n: number) => `37000000-0000-4000-8000-00000000000${n}`

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const q = async (s: string) => (await db.query(s)).rows
const one = async (s: string) => (await db.query(s)).rows[0]
// The seeded rows are dated 2026: in 2026 the counter carries on from them, in
// any other year the series starts again at 1 (the n-th draw of the year).
const seq = (n2026: number) => String(new Date().getFullYear() === 2026 ? n2026 : n2026 - (n2026 > 2 ? 4 : 1)).padStart(4, '0')
const pay = (id: string, org: string, it: string, status: string, type: string, ref: string | null, day: number) =>
  `INSERT INTO payments (id, org_id, itinerary_id, payment_type, amount, currency, payment_status, transaction_reference, created_at)
   VALUES ('${id}', '${org}', '${it}', '${type}', 100, 'JPY', '${status}', ${ref ? `'${ref}'` : 'NULL'}, '2026-01-0${day}T10:00:00Z');`

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
    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id) VALUES
      ('${IT_T}', 'T-1', 'C', 'Trip', '2026-05-01', '2026-05-05', 5, '${ORG_T}'),
      ('${IT_A}', 'A-1', 'C', 'Trip', '2026-05-01', '2026-05-05', 5, '${ORG_A}');
    INSERT INTO invoices (id, org_id, invoice_number, total_amount, balance_due, status) VALUES
      ('${INV_T}', '${ORG_T}', 'INV-2026-001', 1000, 1000, 'sent'),
      ('${INV_BAL}', '${ORG_T}', 'INV-2026-999', 100, 100, 'sent'),
      ('${INV_A}', '${ORG_A}', 'INV-2026-002', 1000, 1000, 'sent');
    INSERT INTO invoices (org_id, invoice_number, total_amount, balance_due) VALUES ('${ORG_T}', 'INV-2026-050-DEP', 10, 10);
    ${pay(P(1), ORG_T, IT_T, 'completed', 'deposit', 'dup', 1)}
    ${pay(P(2), ORG_T, IT_T, 'completed', 'deposit', 'WIRE-1', 2)}
    ${pay(P(3), ORG_T, IT_T, 'completed', 'installment', 'dup', 3)}
    ${pay(P(4), ORG_T, IT_T, 'pending', 'installment', null, 4)}
    ${pay(P(5), ORG_T, IT_T, 'completed', 'refund', null, 5)}
    ${pay(P(6), ORG_T, IT_T, 'completed', 'final', null, 6)}
    ${pay(P(7), ORG_A, IT_A, 'completed', 'deposit', 'WIRE-1', 1)}
    INSERT INTO invoice_payments (id, invoice_id, amount, currency, transaction_reference, created_at) VALUES
      ('${IP(1)}', '${INV_T}', 100, 'JPY', 'dup', '2026-01-04T10:00:00Z'),
      ('${IP(2)}', '${INV_A}', 100, 'JPY', NULL, '2026-01-02T10:00:00Z');
  `)
})
afterAll(async () => { await db?.close() })

describe('before the migration', () => {
  it('one company cannot reuse the other’s invoice number', async () => {
    await expect(db.exec(`INSERT INTO invoices (org_id, invoice_number) VALUES ('${ORG_A}', 'INV-2026-001')`)).rejects.toThrow(/duplicate/)
  })
})

describe('after the migration (applied twice)', () => {
  let afterFirst: any[]
  beforeAll(async () => {
    await db.exec(sql)
    afterFirst = await q(`SELECT id, receipt_number FROM payments UNION ALL SELECT id, receipt_number FROM invoice_payments ORDER BY id`)
    await db.exec(sql) // idempotent
  })

  it('existing invoice numbers are unchanged; both companies may hold the same number, one may not hold it twice', async () => {
    expect((await q(`SELECT invoice_number FROM invoices WHERE org_id = '${ORG_T}' ORDER BY invoice_number`)).map(r => r.invoice_number))
      .toEqual(['INV-2026-001', 'INV-2026-050-DEP', 'INV-2026-999'])
    await db.exec(`INSERT INTO invoices (org_id, invoice_number) VALUES ('${ORG_A}', 'INV-2026-001')`)
    await expect(db.exec(`INSERT INTO invoices (org_id, invoice_number) VALUES ('${ORG_A}', 'INV-2026-001')`)).rejects.toThrow(/duplicate/)
  })

  it('numbers each company on from its own highest, as a number: 1000 follows 999', async () => {
    expect((await one(`SELECT next_invoice_number('${ORG_T}', 2026) AS n`)).n).toBe('INV-2026-1000')
    // ATS holds 001 and 002 (the company the numbers were shared with is not counted).
    expect((await one(`SELECT next_invoice_number('${ORG_A}', 2026) AS n`)).n).toBe('INV-2026-003')
    expect((await one(`SELECT next_invoice_number('${ORG_A}', 2026) AS n`)).n).toBe('INV-2026-004')
    expect((await one(`SELECT next_invoice_number('${ORG_A}', 2027) AS n`)).n).toBe('INV-2027-001')
  })

  it('skips a number the company holds in any of its forms (-DEP / -FIN)', async () => {
    await db.exec(`INSERT INTO invoices (org_id, invoice_number) VALUES ('${ORG_A}', 'INV-2026-005-FIN')`)
    expect((await one(`SELECT next_invoice_number('${ORG_A}', 2026) AS n`)).n).toBe('INV-2026-006')
  })

  it('backfills receipt numbers per company, oldest first; a unique reference is kept, the rest numbered', async () => {
    const t = Object.fromEntries((await q(`SELECT id, receipt_number FROM payments WHERE org_id = '${ORG_T}'`)).map(r => [r.id, r.receipt_number]))
    // 'WIRE-1' was unique in this company: kept. 'dup' (3 rows) is not unique: numbered.
    expect(t[P(2)]).toBe('WIRE-1')
    expect(t[P(1)]).toBe('RCP-2026-0001')
    expect(t[P(3)]).toBe('RCP-2026-0002')
    expect(t[P(6)]).toBe('RCP-2026-0004')
    // The invoice payment sits in the same series, between them by date.
    expect(await one(`SELECT receipt_number, org_id FROM invoice_payments WHERE id = '${IP(1)}'`)).toEqual({ receipt_number: 'RCP-2026-0003', org_id: ORG_T })
    // No receipt for a pending payment or a refund.
    expect(t[P(4)]).toBeNull()
    expect(t[P(5)]).toBeNull()
  })

  it('the other company has its own series; the same reference there is its own', async () => {
    expect((await one(`SELECT receipt_number FROM payments WHERE id = '${P(7)}'`)).receipt_number).toBe('WIRE-1')
    expect((await one(`SELECT receipt_number FROM invoice_payments WHERE id = '${IP(2)}'`)).receipt_number).toBe('RCP-2026-0001')
  })

  it('a second run changes no receipt number', async () => {
    const again = await q(`SELECT id, receipt_number FROM payments UNION ALL SELECT id, receipt_number FROM invoice_payments ORDER BY id`)
    expect(again).toEqual(afterFirst)
  })

  it('a new completed trip payment is numbered; a pending one only when completed; a refund never', async () => {
    await db.exec(`INSERT INTO payments (id, org_id, itinerary_id, payment_type, amount, payment_status, transaction_reference)
      VALUES ('${P(8)}', '${ORG_T}', '${IT_T}', 'deposit', 50, 'completed', 'dup')`)
    const year = new Date().getFullYear()
    // Same reference as another payment: still its own number.
    expect((await one(`SELECT receipt_number FROM payments WHERE id = '${P(8)}'`)).receipt_number).toBe(`RCP-${year}-${seq(5)}`)
    await db.exec(`INSERT INTO payments (id, org_id, itinerary_id, payment_type, amount, payment_status)
      VALUES ('${P(9)}', '${ORG_T}', '${IT_T}', 'deposit', 50, 'pending')`)
    expect((await one(`SELECT receipt_number FROM payments WHERE id = '${P(9)}'`)).receipt_number).toBeNull()
    await db.exec(`UPDATE payments SET payment_status = 'completed' WHERE id = '${P(9)}'`)
    expect((await one(`SELECT receipt_number FROM payments WHERE id = '${P(9)}'`)).receipt_number).toBe(`RCP-${year}-${seq(6)}`)
    await db.exec(`INSERT INTO payments (id, org_id, itinerary_id, payment_type, amount, payment_status)
      VALUES ('${P(0)}', '${ORG_T}', '${IT_T}', 'refund', 50, 'completed')`)
    expect((await one(`SELECT receipt_number FROM payments WHERE id = '${P(0)}'`)).receipt_number).toBeNull()
  })

  it('a new invoice payment is numbered in its invoice’s company', async () => {
    await db.exec(`INSERT INTO invoice_payments (id, invoice_id, amount) VALUES ('${IP(3)}', '${INV_A}', 10)`)
    const row = await one(`SELECT receipt_number, org_id FROM invoice_payments WHERE id = '${IP(3)}'`)
    expect(row.org_id).toBe(ORG_A)
    expect(row.receipt_number).toBe(`RCP-${new Date().getFullYear()}-${seq(2)}`)
  })

  it('a receipt number is unique within a company', async () => {
    await expect(db.exec(`UPDATE payments SET receipt_number = 'WIRE-1' WHERE id = '${P(6)}'`)).rejects.toThrow(/duplicate/)
  })

  it('records VAT on a trip payment; old rows read "not recorded"', async () => {
    expect((await one(`SELECT vat_applied FROM payments WHERE id = '${P(1)}'`)).vat_applied).toBeNull()
    await db.exec(`UPDATE payments SET vat_applied = true, vat_rate = 14, vat_amount = 12, vat_base = NULL WHERE id = '${P(1)}'`)
    expect(await one(`SELECT vat_applied, vat_rate::int AS vat_rate, vat_amount::int AS vat_amount FROM payments WHERE id = '${P(1)}'`))
      .toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 12 })
  })

  it('an invoice payment above the balance is refused; the balance itself is allowed', async () => {
    await expect(db.exec(`INSERT INTO invoice_payments (invoice_id, amount) VALUES ('${INV_BAL}', 101)`)).rejects.toThrow(/exceeds balance due/)
    await db.exec(`INSERT INTO invoice_payments (invoice_id, amount) VALUES ('${INV_BAL}', 100)`)
    expect(await one(`SELECT balance_due::int AS b, status FROM invoices WHERE id = '${INV_BAL}'`)).toEqual({ b: 0, status: 'paid' })
    await expect(db.exec(`INSERT INTO invoice_payments (invoice_id, amount) VALUES ('${INV_BAL}', 1)`)).rejects.toThrow(/exceeds balance due/)
  })

  it('only the service role may draw a number or read the counters', async () => {
    const r = await one(`SELECT
      has_function_privilege('authenticated', 'public.next_invoice_number(uuid, integer)', 'EXECUTE') AS auth_inv,
      has_function_privilege('anon', 'public.next_receipt_number(uuid, integer)', 'EXECUTE') AS anon_rcp,
      has_function_privilege('service_role', 'public.next_invoice_number(uuid, integer)', 'EXECUTE') AS svc_inv,
      has_function_privilege('service_role', 'public.next_receipt_number(uuid, integer)', 'EXECUTE') AS svc_rcp,
      has_table_privilege('authenticated', 'public.invoice_number_counters', 'SELECT') AS auth_tbl`)
    expect(r).toEqual({ auth_inv: false, anon_rcp: false, svc_inv: true, svc_rcp: true, auth_tbl: false })
  })
})
