// Migration 20270109, executed against a real Postgres: itinerary_services
// gains paid_currency / paid_amount / paid_rate (lib/paid-currency). Nullable,
// no backfill, safe to run twice. Also runs the read-only count handed to the
// operator (handover/count-rate-currencies.sql) against the same schema.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20270109_itinerary_services_paid_currency.sql'
const ORG = '10000000-0000-4000-8000-000000000091'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const read = (f: string) => readFileSync(path.join(MIGRATIONS, f), 'utf8')

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(read(f))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
})

afterAll(async () => { await db?.close() })

describe('20270109 itinerary_services paid currency', () => {
  it('adds three nullable columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itinerary_services'
         AND column_name IN ('paid_currency', 'paid_amount', 'paid_rate')
       ORDER BY column_name`)
    expect(rows).toEqual([
      { column_name: 'paid_amount', data_type: 'numeric', is_nullable: 'YES' },
      { column_name: 'paid_currency', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'paid_rate', data_type: 'numeric', is_nullable: 'YES' },
    ])
  })

  it('accepts the supported currencies and a positive rate only', async () => {
    const { rows } = await db.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'public.itinerary_services'::regclass AND conname LIKE 'itinerary_services_paid_%'
       ORDER BY conname`)
    expect(rows.map((r: { conname: string }) => r.conname)).toEqual(['itinerary_services_paid_currency_check', 'itinerary_services_paid_rate_check'])
    expect(rows[0].def).toContain('EGP')
    expect(rows[1].def).toContain('paid_rate > ')
  })

  it('runs twice without error (re-applied on a database that has it)', async () => {
    await expect(db.exec(read(FILE))).resolves.toBeDefined()
  })

  it('the operator count runs on this schema and lists a rate entered in EGP above the default ones', async () => {
    await db.exec(`
      INSERT INTO organizations (id, name, slug, rate_currency) VALUES ('${ORG}', 'ATS', 'ats', 'USD')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO fixed_daily_costs (org_id, cost_type, cost_per_person_per_day, rate_currency) VALUES
        ('${ORG}', 'water', 50, 'EGP'), ('${ORG}', 'tissues', 1, NULL);`)
    const sql = readFileSync(path.join(process.cwd(), 'handover/count-rate-currencies.sql'), 'utf8')
    const { rows } = await db.query(sql)
    const fixed = rows.filter((r: { rate_table: string }) => r.rate_table === 'fixed_daily_costs')
    expect(rows[0]).toMatchObject({ rate_table: 'fixed_daily_costs', entered_in: 'EGP', affected: true })
    expect(fixed.map((r: { entered_in: string; affected: boolean }) => [r.entered_in, r.affected])).toEqual([['EGP', true], ['USD', false]])
  })
})
