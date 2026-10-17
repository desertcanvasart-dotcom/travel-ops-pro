// Migration 20261228, executed against a real Postgres.
//
// An invoice records where its amount came from (the trip, the deposit it
// settles, a manager's typed amount or a manual override) and, for an
// override, what the server worked out, what was billed instead, why and by
// whom. Invoices issued before keep every figure and read NULL.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261228_invoice_server_amounts.sql'
const ORG = '10000000-0000-4000-8000-000000000028'
const OLD = '40000000-0000-4000-8000-000000000028'
const USER = '50000000-0000-4000-8000-000000000028'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]
const insert = (id: string, extra: string, values: string) =>
  db.exec(`INSERT INTO invoices (id, org_id, invoice_number, client_name, subtotal, total_amount, currency${extra}) VALUES ('${id}', '${ORG}', 'INV-${id.slice(-4)}', 'C', 100, 100, 'JPY'${values})`)

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'ATS');`)
  // Issued before the migration.
  await insert(OLD, '', '')
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('the columns', () => {
  it('exist on invoices and are NULL for an invoice issued before', async () => {
    const cols = (await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name IN ('amount_source','computed_amount','override_amount','override_reason','override_by') ORDER BY column_name`)).rows
    expect(cols).toEqual([
      { column_name: 'amount_source', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'computed_amount', data_type: 'numeric', is_nullable: 'YES' },
      { column_name: 'override_amount', data_type: 'numeric', is_nullable: 'YES' },
      { column_name: 'override_by', data_type: 'uuid', is_nullable: 'YES' },
      { column_name: 'override_reason', data_type: 'text', is_nullable: 'YES' },
    ])
    expect(await one(`SELECT total_amount::float AS t, amount_source, computed_amount, override_amount, override_reason, override_by FROM invoices WHERE id = '${OLD}'`))
      .toEqual({ t: 100, amount_source: null, computed_amount: null, override_amount: null, override_reason: null, override_by: null })
  })
})

describe('what an invoice may record', () => {
  it.each(['trip', 'parent', 'manual_entry'])('%s needs no reason', async source => {
    await insert(crypto.randomUUID(), ', amount_source, computed_amount', `, '${source}', 100`)
  })

  it('an override records the amount, the reason and who', async () => {
    const id = crypto.randomUUID()
    await insert(id, ', amount_source, computed_amount, override_amount, override_reason, override_by', `, 'manual_override', 120, 100, 'Loyal client', '${USER}'`)
    expect(await one(`SELECT amount_source, computed_amount::float AS c, override_amount::float AS o, override_reason AS r FROM invoices WHERE id = '${id}'`))
      .toEqual({ amount_source: 'manual_override', c: 120, o: 100, r: 'Loyal client' })
  })

  it('an override with no reason, a blank reason or no amount is refused', async () => {
    const bad = [
      ", amount_source, override_amount, override_reason, override_by|, 'manual_override', 100, NULL, NULL",
      ", amount_source, override_amount, override_reason, override_by|, 'manual_override', 100, '   ', NULL",
      ", amount_source, override_reason|, 'manual_override', 'why'",
    ]
    for (const b of bad) {
      const [cols, vals] = b.split('|')
      await expect(insert(crypto.randomUUID(), cols, vals)).rejects.toThrow()
    }
  })

  it('an unknown source and a negative amount are refused', async () => {
    await expect(insert(crypto.randomUUID(), ', amount_source', ", 'guess'")).rejects.toThrow()
    await expect(insert(crypto.randomUUID(), ', computed_amount', ', -1')).rejects.toThrow()
    await expect(insert(crypto.randomUUID(), ', override_amount, override_reason', ", -1, 'x'")).rejects.toThrow()
  })
})

// The read-only check an owner can run before the one-ledger rule bites: the
// trips that already have BOTH a non-cancelled invoice and trip payments. The
// totals count the invoice side and skip the trip side for these.
const TRIPS_WITH_BOTH_LEDGERS = `
SELECT i.org_id, i.id AS itinerary_id, i.itinerary_code,
       (SELECT string_agg(v.invoice_number, ', ' ORDER BY v.invoice_number)
          FROM invoices v
         WHERE v.itinerary_id = i.id AND v.org_id = i.org_id AND v.status IS DISTINCT FROM 'cancelled') AS live_invoices,
       tp.n AS trip_payments, tp.total AS trip_payments_total,
       ip.n AS invoice_payments, ip.total AS invoice_payments_total
  FROM itineraries i
 CROSS JOIN LATERAL (
       SELECT count(*) AS n,
              COALESCE(sum(p.amount) FILTER (WHERE p.payment_status = 'completed' AND COALESCE(p.payment_type, '') <> 'refund'), 0) AS total
         FROM payments p
        WHERE p.itinerary_id = i.id AND p.org_id = i.org_id) tp
 CROSS JOIN LATERAL (
       SELECT count(*) AS n, COALESCE(sum(x.amount), 0) AS total
         FROM invoice_payments x
         JOIN invoices v ON v.id = x.invoice_id
        WHERE v.itinerary_id = i.id AND v.org_id = i.org_id AND v.status IS DISTINCT FROM 'cancelled') ip
 WHERE tp.n > 0
   AND EXISTS (SELECT 1 FROM invoices v WHERE v.itinerary_id = i.id AND v.org_id = i.org_id AND v.status IS DISTINCT FROM 'cancelled')
 ORDER BY i.org_id, i.itinerary_code`

describe('the check query: trips that have both ledgers', () => {
  it('lists a trip with a live invoice and trip payments, and nothing else', async () => {
    const trip = (id: string, code: string) =>
      db.exec(`INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days) VALUES ('${id}', '${ORG}', '${code}', 'C', 'T', '2026-12-01', '2026-12-05', 5)`)
    const both = '60000000-0000-4000-8000-000000000001'
    const onlyTrip = '60000000-0000-4000-8000-000000000002'
    const cancelledOnly = '60000000-0000-4000-8000-000000000003'
    const onlyInvoice = '60000000-0000-4000-8000-000000000004'
    await trip(both, 'ITN-BOTH'); await trip(onlyTrip, 'ITN-TRIP'); await trip(cancelledOnly, 'ITN-CX'); await trip(onlyInvoice, 'ITN-INV')
    const invoice = (id: string, tripId: string, status: string, n: string) =>
      db.exec(`INSERT INTO invoices (id, org_id, invoice_number, client_name, subtotal, total_amount, balance_due, currency, itinerary_id, status) VALUES ('${id}', '${ORG}', '${n}', 'C', 100, 100, 100, 'JPY', '${tripId}', '${status}')`)
    const iBoth = '70000000-0000-4000-8000-000000000001'
    await invoice(iBoth, both, 'sent', 'Q-1')
    await invoice('70000000-0000-4000-8000-000000000003', cancelledOnly, 'cancelled', 'Q-3')
    await invoice('70000000-0000-4000-8000-000000000004', onlyInvoice, 'sent', 'Q-4')
    await db.exec(`INSERT INTO invoice_payments (invoice_id, amount, currency) VALUES ('${iBoth}', 30, 'JPY')`)
    const pay = (tripId: string, amount: number, status = 'completed', type = 'deposit') =>
      db.exec(`INSERT INTO payments (org_id, itinerary_id, amount, currency, payment_status, payment_type) VALUES ('${ORG}', '${tripId}', ${amount}, 'JPY', '${status}', '${type}')`)
    await pay(both, 30); await pay(both, 5, 'pending'); await pay(both, 9, 'completed', 'refund')
    await pay(onlyTrip, 50); await pay(cancelledOnly, 50)

    const { rows } = await db.query(TRIPS_WITH_BOTH_LEDGERS)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ itinerary_code: 'ITN-BOTH', live_invoices: 'Q-1', trip_payments: 3, invoice_payments: 1 })
    expect(Number(rows[0].trip_payments_total)).toBe(30)
    expect(Number(rows[0].invoice_payments_total)).toBe(30)
  })
})
