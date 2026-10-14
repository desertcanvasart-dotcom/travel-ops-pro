// Migration 20261226, executed against a real Postgres.
//
// The same supplier's invoice number could be recorded twice and both copies
// paid. The migration adds a partial unique index (org, supplier name, number,
// not cancelled) when it can, and when duplicates already exist it builds
// nothing and lists them in org_backfill_review instead of choosing one.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261226_supplier_invoice_numbers_unique.sql'
const ORG_A = '10000000-0000-4000-8000-000000000001'
const ORG_B = '10000000-0000-4000-8000-000000000002'
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

type Db = { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

async function freshDb(): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as unknown as Db
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG_A}', 'ATS'), ('${ORG_B}', 'Travel2Egypt');`)
  return db
}

const bill = (org: string, name: string, number: string, status = 'received') =>
  `INSERT INTO supplier_invoices (org_id, supplier_invoice_number, supplier_name, invoice_date, amount, status)
   VALUES ('${org}', '${number}', '${name}', '2026-09-01', 100, '${status}');`
const indexExists = async (db: Db) =>
  (await db.query("SELECT 1 FROM pg_indexes WHERE indexname = 'supplier_invoices_org_supplier_number_key'")).rows.length === 1

describe('no duplicates yet', () => {
  let db: Db
  beforeAll(async () => {
    db = await freshDb()
    await db.exec(bill(ORG_A, 'Nile Hotels', 'INV-1') + bill(ORG_A, 'Nile Hotels', 'INV-2') + bill(ORG_B, 'Nile Hotels', 'INV-1'))
    await db.exec(sql)
    await db.exec(sql) // idempotent
  })
  afterAll(async () => { await db?.close() })

  it('builds the index', async () => expect(await indexExists(db)).toBe(true))
  it('rejects the same supplier and number in one company, whatever the case or spacing', async () => {
    await expect(db.exec(bill(ORG_A, ' nile hotels ', 'inv-1'))).rejects.toThrow(/duplicate key/)
  })
  it('allows another supplier, another number, another company', async () => {
    await db.exec(bill(ORG_A, 'Cairo Cars', 'INV-1'))
    await db.exec(bill(ORG_A, 'Nile Hotels', 'INV-3'))
    await db.exec(bill(ORG_B, 'Cairo Cars', 'INV-1'))
  })
  it('a cancelled bill frees its number, and cancelled duplicates are allowed', async () => {
    await db.exec("UPDATE supplier_invoices SET status = 'cancelled' WHERE org_id = '" + ORG_A + "' AND supplier_invoice_number = 'INV-3'")
    await db.exec(bill(ORG_A, 'Nile Hotels', 'INV-3'))
    await db.exec(bill(ORG_A, 'Nile Hotels', 'INV-3', 'cancelled'))
  })
})

describe('duplicates already exist', () => {
  let db: Db
  beforeAll(async () => {
    db = await freshDb()
    await db.exec(
      bill(ORG_A, 'Nile Hotels', 'INV-1') + bill(ORG_A, 'NILE HOTELS ', 'inv-1') +
      bill(ORG_A, 'Cairo Cars', 'C-9') + bill(ORG_B, 'Cairo Cars', 'C-9') +
      bill(ORG_A, 'Old Co', 'X-1') + bill(ORG_A, 'Old Co', 'X-1', 'cancelled'),
    )
    await db.exec(sql)
    await db.exec(sql)
  })
  afterAll(async () => { await db?.close() })

  it('does not fail, and builds no index', async () => expect(await indexExists(db)).toBe(false))
  it('lists exactly the rows of the duplicate group, once', async () => {
    const rows = (await db.query(
      `SELECT r.reason, s.supplier_invoice_number FROM org_backfill_review r JOIN supplier_invoices s ON s.id::text = r.row_id
        WHERE r.table_name = 'supplier_invoices' ORDER BY s.supplier_invoice_number`)).rows
    expect(rows.map(r => r.supplier_invoice_number)).toEqual(['INV-1', 'inv-1'])
    expect(rows.every(r => r.reason === 'duplicate supplier invoice number')).toBe(true)
  })
  it('changes no bill', async () => {
    expect((await db.query('SELECT count(*)::int AS n FROM supplier_invoices')).rows[0].n).toBe(6)
    expect((await db.query("SELECT count(*)::int AS n FROM supplier_invoices WHERE status = 'cancelled'")).rows[0].n).toBe(1)
  })
  it('builds the index once the extra is cancelled', async () => {
    await db.exec("UPDATE supplier_invoices SET status = 'cancelled' WHERE supplier_invoice_number = 'inv-1'")
    await db.exec(sql)
    expect(await indexExists(db)).toBe(true)
  })
})
