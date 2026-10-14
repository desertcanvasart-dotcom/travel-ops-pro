// Migrations 20261229 and 20261230, executed against a real Postgres.
//
// 20261229: commissions generated before commissions.service_id existed carry
// no link, so deleting one never released its service. The migration links a
// generated commission to its service only when exactly one service of the
// trip matches (supplier, amount, still marked generated) and lists the rest
// in org_backfill_review.
// 20261230: expenses gain created_by, approved_by and approved_at.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const BACKFILL = '20261229_commission_service_backfill.sql'
const APPROVER = '20261230_expense_approver.sql'
const ORG = '10000000-0000-4000-8000-000000000021'
const ORG_B = '10000000-0000-4000-8000-000000000022'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HOTEL = id(101), GUIDE = id(102), SHOP = id(103), SHOP2 = id(104)
const TRIP = id(201), TRIP_B = id(202)
const DAY = id(301), DAY_B = id(302)
const S_HOTEL = id(401), S_LUNCH_1 = id(402), S_LUNCH_2 = id(403), S_TOUR = id(404), S_PENDING = id(405), S_B = id(406)
const C = (n: number) => id(500 + n)

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const read = (f: string) => readFileSync(path.join(MIGRATIONS, f), 'utf8')
const serviceOf = async (n: number) => (await db.query(`SELECT service_id FROM commissions WHERE id = '${C(n)}'`)).rows[0].service_id as string | null
const review = async () =>
  (await db.query(`SELECT row_id, reason FROM org_backfill_review WHERE table_name = 'commissions' ORDER BY row_id`)).rows as { row_id: string; reason: string }[]

const AUTO = "'Auto-generated from itinerary ITN-1 — 10% of supplier price'"

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= BACKFILL) continue
    await db.exec(read(f))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name) VALUES ('${ORG}', 'Travel2Egypt'), ('${ORG_B}', 'ATS');
    INSERT INTO suppliers (id, org_id, name, type, types) VALUES
      ('${HOTEL}', '${ORG}', 'Nile Palace', 'hotel', ARRAY['hotel']),
      ('${GUIDE}', '${ORG}', 'Ahmed', 'guide', ARRAY['guide']),
      ('${SHOP}', '${ORG}', 'Papyrus Shop', 'shop', ARRAY['shop']),
      ('${SHOP2}', '${ORG}', 'Perfume Shop', 'shop', ARRAY['shop']);
    INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days)
      VALUES ('${TRIP}', '${ORG}', 'ITN-1', 'C', 'Trip', '2026-12-01', '2026-12-05', 5),
             ('${TRIP_B}', '${ORG_B}', 'ITN-B', 'C', 'Trip', '2026-12-01', '2026-12-05', 5);
    INSERT INTO itinerary_days (id, itinerary_id, day_number, date) VALUES
      ('${DAY}', '${TRIP}', 1, '2026-12-01'), ('${DAY_B}', '${TRIP_B}', 1, '2026-12-01');
    INSERT INTO itinerary_services (id, itinerary_day_id, service_type, service_name, supplier_id, sold_by_supplier_id, supplier_name, total_cost, client_price, commission_status) VALUES
      ('${S_HOTEL}',   '${DAY}', 'accommodation', 'Stay',    '${HOTEL}', NULL,       'Nile Palace', 100, 150, 'generated'),
      ('${S_LUNCH_1}', '${DAY}', 'meal',          'Lunch',   '${SHOP}',  NULL,       'Papyrus Shop', 40,  60, 'generated'),
      ('${S_LUNCH_2}', '${DAY}', 'meal',          'Lunch 2', '${SHOP}',  NULL,       'Papyrus Shop', 40,  60, 'generated'),
      ('${S_TOUR}',    '${DAY}', 'activity',      'Felucca', NULL,       '${GUIDE}', NULL,          100, 160, 'generated'),
      ('${S_PENDING}', '${DAY}', 'meal',          'Dinner',  '${SHOP2}', NULL,       'Perfume Shop', 70, 100, 'pending'),
      ('${S_B}',       '${DAY_B}', 'accommodation', 'Stay',  '${HOTEL}', NULL,       'Nile Palace', 100, 150, 'generated');
    INSERT INTO commissions (id, org_id, itinerary_id, supplier_id, commission_type, category, base_amount, commission_amount, notes) VALUES
      -- the one service of the trip that matches: linked
      ('${C(1)}', '${ORG}', '${TRIP}', '${HOTEL}', 'receivable', 'hotel', 100, 10, ${AUTO}),
      -- two identical services match: not guessed
      ('${C(2)}', '${ORG}', '${TRIP}', '${SHOP}',  'receivable', 'restaurant', 40, 4, ${AUTO}),
      -- a seller's commission on the profit (160 - 100): matched on sold_by_supplier_id
      ('${C(3)}', '${ORG}', '${TRIP}', '${GUIDE}', 'payable', 'optional_tour', 60, 6, ${AUTO}),
      -- its service is no longer marked generated: nothing to release, to review
      ('${C(4)}', '${ORG}', '${TRIP}', '${SHOP2}', 'receivable', 'restaurant', 70, 7, ${AUTO}),
      -- amount matches no service
      ('${C(5)}', '${ORG}', '${TRIP}', '${HOTEL}', 'receivable', 'hotel', 99, 9.9, ${AUTO}),
      -- a manual commission that happens to look the same: never touched
      ('${C(6)}', '${ORG}', '${TRIP}', '${HOTEL}', 'receivable', 'hotel', 100, 10, NULL),
      -- already linked: kept
      ('${C(7)}', '${ORG}', '${TRIP}', '${HOTEL}', 'receivable', 'hotel', 100, 10, ${AUTO}),
      -- the other company's commission is matched against the other company's trip only
      ('${C(8)}', '${ORG_B}', '${TRIP_B}', '${HOTEL}', 'receivable', 'hotel', 100, 10, 'Auto-generated from itinerary ITN-B — 10% of supplier price');
    UPDATE commissions SET service_id = '${S_PENDING}' WHERE id = '${C(7)}';
  `)
  await db.exec(read(BACKFILL))
  // Applied twice: idempotent.
  await db.exec(read(BACKFILL))
  await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
})

afterAll(async () => {
  await db?.close()
})

describe('20261229 commission -> service backfill', () => {
  it('links a generated commission when exactly one service of its trip matches', async () => {
    expect(await serviceOf(1)).toBe(S_HOTEL)
    expect(await serviceOf(8)).toBe(S_B)
  })

  it("links a seller's payable commission to the service by its profit", async () => {
    expect(await serviceOf(3)).toBe(S_TOUR)
  })

  it('does not guess between two services that both match', async () => {
    expect(await serviceOf(2)).toBeNull()
  })

  it('leaves unmatched, released-service and manual commissions unlinked', async () => {
    expect(await serviceOf(4)).toBeNull()
    expect(await serviceOf(5)).toBeNull()
    expect(await serviceOf(6)).toBeNull()
  })

  it('keeps a link that was already there', async () => {
    expect(await serviceOf(7)).toBe(S_PENDING)
  })

  it('lists every generated commission it could not link, once, with why; never a manual one or a linked one', async () => {
    const rows = await review()
    expect(rows.map(r => r.row_id)).toEqual([C(2), C(4), C(5)])
    expect(rows.find(r => r.row_id === C(2))!.reason).toMatch(/more than one/)
    expect(rows.find(r => r.row_id === C(4))!.reason).toMatch(/no service/)
    expect(rows.find(r => r.row_id === C(5))!.reason).toMatch(/no service/)
  })
})

describe('20261230 expense approver', () => {
  it('adds created_by, approved_by and approved_at, nullable, and changes no existing row', async () => {
    await db.exec(`INSERT INTO expenses (org_id, category, amount, expense_date, status) VALUES ('${ORG}', 'guide', 10, '2026-10-01', 'approved')`)
    await db.exec(read(APPROVER))
    // Applied twice: idempotent.
    await db.exec(read(APPROVER))
    const cols = (await db.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'expenses'
         AND column_name IN ('created_by', 'approved_by', 'approved_at') ORDER BY column_name`)).rows
    expect(cols).toEqual([
      { column_name: 'approved_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { column_name: 'approved_by', data_type: 'uuid', is_nullable: 'YES' },
      { column_name: 'created_by', data_type: 'uuid', is_nullable: 'YES' },
    ])
    const old = (await db.query(`SELECT created_by, approved_by, approved_at, status FROM expenses`)).rows[0]
    expect(old).toEqual({ created_by: null, approved_by: null, approved_at: null, status: 'approved' })
  })

  it('stores an approver and the time', async () => {
    const who = id(900)
    await db.exec(`INSERT INTO expenses (org_id, category, amount, expense_date, status, created_by, approved_by, approved_at)
      VALUES ('${ORG}', 'guide', 20, '2026-10-02', 'approved', '${id(901)}', '${who}', now())`)
    const row = (await db.query(`SELECT approved_by, created_by FROM expenses WHERE amount = 20`)).rows[0]
    expect(row).toEqual({ approved_by: who, created_by: id(901) })
  })
})
