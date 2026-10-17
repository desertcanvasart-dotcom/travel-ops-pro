// Migration 20261214, executed against a real Postgres.
//
// VAT is recorded on each client document (owner's decision, 2026-10-13):
// the company's rate defaults to 14, every existing quote and trip reads
// "not applied", and an invoice that already carried tax is marked applied
// with the rate and amount it recorded. Reverting a quote restores its VAT
// with its price.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261214_vat_per_document.sql'
const ORG_T = '10000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '10000000-0000-4000-8000-000000000002' // ATS
const IT_A = '30000000-0000-4000-8000-000000000002'
const INV_TAXED = '40000000-0000-4000-8000-000000000001'
const INV_PLAIN = '40000000-0000-4000-8000-000000000002'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]

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
    INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days) VALUES
      ('${IT_A}', '${ORG_A}', 'ITN-A', 'C', 'Trip A', '2026-12-01', '2026-12-05', 5);
    INSERT INTO tour_quotes (org_id, itinerary_id, selling_price, currency) VALUES ('${ORG_A}', '${IT_A}', 250000, 'JPY');
    INSERT INTO b2c_quotes (org_id, itinerary_id, selling_price, currency) VALUES ('${ORG_A}', '${IT_A}', 1200, 'EUR');
    -- One invoice issued with tax (subtotal 100,000 + tax 10,000), one without.
    INSERT INTO invoices (id, org_id, invoice_number, client_name, subtotal, tax_rate, tax_amount, total_amount, currency) VALUES
      ('${INV_TAXED}', '${ORG_A}', 'INV-1', 'C', 100000, 10, 10000, 110000, 'JPY'),
      ('${INV_PLAIN}', '${ORG_A}', 'INV-2', 'C', 50000, 0, 0, 50000, 'JPY');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('the company rate', () => {
  it('is 14 for every company, existing and new', async () => {
    const rows = (await db.query(`SELECT vat_rate::float AS r FROM organizations WHERE id IN ('${ORG_T}', '${ORG_A}')`)).rows
    expect(rows).toEqual([{ r: 14 }, { r: 14 }])
    const fresh = await one(`INSERT INTO organizations (name) VALUES ('New co') RETURNING vat_rate::float AS r`)
    expect(fresh.r).toBe(14)
  })

  it('is a percentage between 0 and 100', async () => {
    await expect(db.exec(`UPDATE organizations SET vat_rate = 140 WHERE id = '${ORG_A}'`)).rejects.toThrow()
    await expect(db.exec(`UPDATE organizations SET vat_rate = NULL WHERE id = '${ORG_A}'`)).rejects.toThrow()
  })
})

describe('existing documents', () => {
  it('quotes were issued without VAT', async () => {
    for (const t of ['tour_quotes', 'b2c_quotes']) {
      const q = await one(`SELECT vat_applied, vat_rate, vat_amount::float AS a FROM ${t} WHERE org_id = '${ORG_A}'`)
      expect(q).toEqual({ vat_applied: false, vat_rate: null, a: 0 })
    }
  })

  it('trips carry no VAT', async () => {
    expect(await one(`SELECT vat_applied, vat_rate FROM itineraries WHERE id = '${IT_A}'`)).toEqual({ vat_applied: false, vat_rate: null })
  })

  it('an invoice that carried tax is marked applied, keeping its own rate and amount', async () => {
    const taxed = await one(`SELECT vat_applied, tax_rate::float AS r, tax_amount::float AS a, total_amount::float AS t FROM invoices WHERE id = '${INV_TAXED}'`)
    expect(taxed).toEqual({ vat_applied: true, r: 10, a: 10000, t: 110000 })
    const plain = await one(`SELECT vat_applied, tax_amount::float AS a FROM invoices WHERE id = '${INV_PLAIN}'`)
    expect(plain).toEqual({ vat_applied: false, a: 0 })
  })

  it('new rows default to not applied', async () => {
    const q = await one(`INSERT INTO tour_quotes (org_id, itinerary_id) VALUES ('${ORG_A}', '${IT_A}') RETURNING vat_applied, vat_amount::float AS a`)
    expect(q).toEqual({ vat_applied: false, a: 0 })
    const inv = await one(`INSERT INTO invoices (org_id, invoice_number, client_name) VALUES ('${ORG_A}', 'INV-3', 'C') RETURNING vat_applied`)
    expect(inv.vat_applied).toBe(false)
  })
})

describe('reverting a quote', () => {
  it('B2B: restores the VAT recorded with the revision\'s price', async () => {
    const { id } = await one(`INSERT INTO tour_quotes (org_id, itinerary_id, selling_price, currency, vat_applied, vat_rate, vat_amount)
      VALUES ('${ORG_A}', '${IT_A}', 100000, 'JPY', true, 14, 14000) RETURNING id`)
    await db.exec(`SELECT create_quote_revision('${id}', NULL, 'v1')`)
    await db.exec(`UPDATE tour_quotes SET selling_price = 120000, vat_applied = false, vat_rate = NULL, vat_amount = 0 WHERE id = '${id}'`)
    await db.exec(`SELECT create_quote_revision('${id}', NULL, 'v2')`)
    await db.exec(`SELECT revert_quote_to_revision('${id}', 1, NULL, 'back')`)
    const q = await one(`SELECT selling_price::float AS s, vat_applied, vat_rate::float AS r, vat_amount::float AS a FROM tour_quotes WHERE id = '${id}'`)
    expect(q).toEqual({ s: 100000, vat_applied: true, r: 14, a: 14000 })
  })

  it('B2C: a revision from before VAT restores "not applied"', async () => {
    const { id } = await one(`INSERT INTO b2c_quotes (org_id, itinerary_id, selling_price, currency) VALUES ('${ORG_A}', '${IT_A}', 1000, 'EUR') RETURNING id`)
    // A snapshot taken before the columns existed has no vat keys.
    await db.exec(`INSERT INTO quote_revisions (quote_type, quote_id, version_number, quote_data)
      SELECT 'b2c', id, 1, to_jsonb(b2c_quotes) - 'vat_applied' - 'vat_rate' - 'vat_amount' FROM b2c_quotes WHERE id = '${id}'`)
    await db.exec(`UPDATE b2c_quotes SET selling_price = 1100, vat_applied = true, vat_rate = 14, vat_amount = 154 WHERE id = '${id}'`)
    await db.exec(`SELECT revert_b2c_quote_to_revision('${id}', 1, NULL, 'back')`)
    const q = await one(`SELECT selling_price::float AS s, vat_applied, vat_rate, vat_amount::float AS a FROM b2c_quotes WHERE id = '${id}'`)
    expect(q).toEqual({ s: 1000, vat_applied: false, vat_rate: null, a: 0 })
  })
})
