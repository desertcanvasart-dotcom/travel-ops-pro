// Migration 20261218, executed against a real Postgres.
//
// No VAT on extras or insurance (owner's decision, 2026-10-13): a document
// records the base it taxed (vat_base) when it left them out. Documents issued
// before keep the VAT they recorded — nothing is re-rated, and their base
// stays NULL ("the whole net"). Reverting a quote restores its base with its VAT.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261218_vat_base_excludes_extras.sql'
const ORG = '10000000-0000-4000-8000-000000000002'
const IT = '30000000-0000-4000-8000-000000000002'
const INV = '40000000-0000-4000-8000-000000000001'

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
    INSERT INTO organizations (id, name) VALUES ('${ORG}', 'ATS');
    INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days) VALUES
      ('${IT}', '${ORG}', 'ITN-A', 'C', 'Trip A', '2026-12-01', '2026-12-05', 5);
    -- Issued before the rule, with VAT on the whole net.
    INSERT INTO tour_quotes (org_id, itinerary_id, selling_price, currency, vat_applied, vat_rate, vat_amount)
      VALUES ('${ORG}', '${IT}', 105000, 'JPY', true, 14, 14700);
    INSERT INTO invoices (id, org_id, invoice_number, client_name, subtotal, tax_rate, tax_amount, total_amount, currency, vat_applied) VALUES
      ('${INV}', '${ORG}', 'INV-1', 'C', 130200, 14, 18228, 148428, 'JPY', true);
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('the column', () => {
  it('exists on quotes, offers and invoices, NULL by default', async () => {
    for (const t of ['tour_quotes', 'b2c_quotes', 'invoices']) {
      const c = await one(`SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t}' AND column_name = 'vat_base'`)
      expect(c, t).toEqual({ is_nullable: 'YES', data_type: 'numeric' })
    }
  })

  it('is never negative', async () => {
    await expect(db.exec(`UPDATE invoices SET vat_base = -1 WHERE id = '${INV}'`)).rejects.toThrow()
  })
})

describe('documents issued before', () => {
  it('keep the VAT they recorded, and their base stays "the whole net"', async () => {
    expect(await one(`SELECT vat_amount::float AS a, vat_base FROM tour_quotes WHERE org_id = '${ORG}'`)).toEqual({ a: 14700, vat_base: null })
    expect(await one(`SELECT tax_amount::float AS a, total_amount::float AS t, vat_base FROM invoices WHERE id = '${INV}'`)).toEqual({ a: 18228, t: 148428, vat_base: null })
  })
})

describe('reverting a quote', () => {
  it('B2B: restores the base with the VAT it belongs to', async () => {
    const { id } = await one(`INSERT INTO tour_quotes (org_id, itinerary_id, selling_price, currency, vat_applied, vat_rate, vat_amount, vat_base)
      VALUES ('${ORG}', '${IT}', 105000, 'JPY', true, 14, 14000, 100000) RETURNING id`)
    await db.exec(`SELECT create_quote_revision('${id}', NULL, 'v1')`)
    await db.exec(`UPDATE tour_quotes SET vat_applied = false, vat_rate = NULL, vat_amount = 0, vat_base = NULL WHERE id = '${id}'`)
    await db.exec(`SELECT create_quote_revision('${id}', NULL, 'v2')`)
    await db.exec(`SELECT revert_quote_to_revision('${id}', 1, NULL, 'back')`)
    expect(await one(`SELECT vat_applied, vat_amount::float AS a, vat_base::float AS b FROM tour_quotes WHERE id = '${id}'`)).toEqual({ vat_applied: true, a: 14000, b: 100000 })
  })

  it('B2C: a revision from before the rule restores NULL — the whole net, which is what it taxed', async () => {
    const { id } = await one(`INSERT INTO b2c_quotes (org_id, itinerary_id, selling_price, currency, vat_applied, vat_rate, vat_amount)
      VALUES ('${ORG}', '${IT}', 1000, 'EUR', true, 14, 140) RETURNING id`)
    await db.exec(`INSERT INTO quote_revisions (quote_type, quote_id, version_number, quote_data)
      SELECT 'b2c', id, 1, to_jsonb(b2c_quotes) - 'vat_base' FROM b2c_quotes WHERE id = '${id}'`)
    await db.exec(`UPDATE b2c_quotes SET selling_price = 1100, vat_amount = 140, vat_base = 1000 WHERE id = '${id}'`)
    await db.exec(`SELECT revert_b2c_quote_to_revision('${id}', 1, NULL, 'back')`)
    expect(await one(`SELECT selling_price::float AS s, vat_amount::float AS a, vat_base FROM b2c_quotes WHERE id = '${id}'`)).toEqual({ s: 1000, a: 140, vat_base: null })
  })
})
