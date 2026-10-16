// Migration 20270101, executed against a real Postgres.
//
// booking_supplier_status gains cost_currency. Rows nobody has confirmed a
// cost on are moved to their supplier's own currency and amount when the
// voucher rule (lib/supplier-own-currency) says it is safe for the same
// supplier + type + day lines, and the row's quoted_cost is still exactly
// those lines' total_cost. Confirmed rows and expenses are never changed.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20270101_booking_supplier_currency.sql'
const ORG = '10000000-0000-4000-8000-000000000031'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const G1 = id(101), C1 = id(102), H1 = id(103), G2 = id(104), T1 = id(105), G3 = id(106), G4 = id(107)
const TRIP = id(201), BK = id(202)
const DAY1 = id(301), DAY2 = id(302)
const R = (n: number) => id(500 + n)
const EXP = id(601)

// The read-only audit handed over with this migration: approved / paid
// expenses linked to a supplier row whose currency, derived by the same rule
// (own currency when safe, else the row's cost_currency, else the booking's),
// is not the expense's. Those are left as they are.
const AUDIT = `
WITH type_map(service_type, supplier_type) AS (VALUES
  ('hotel','hotel'),('accommodation','hotel'),('guide','guide'),('tour_guide','guide'),
  ('transport','transport'),('transportation','transport'),('transfer','transport'),('vehicle','transport'),
  ('airport_transfer','transport'),('cruise_transport_package','transport'),('train','transport'),('sleeping_train','transport'),
  ('restaurant','restaurant'),('meal','restaurant'),('lunch','restaurant'),('dinner','restaurant'),('breakfast','restaurant'),
  ('activity','activity'),('excursion','activity'),('tour','activity'),
  ('entrance','entrance'),('entrance_fee','entrance'),('ticket','entrance'),
  ('cruise','cruise'),('nile_cruise','cruise'),('flight','flight'),('domestic_flight','flight'),
  ('airport_service','airport_service'),('meet_greet','airport_service'),('porter','airport_service'),
  ('hotel_service','hotel_service'),
  ('tips',NULL),('tip',NULL),('water',NULL),('supplies',NULL),('service_fee',NULL),('extra_expenses',NULL)
),
lines AS (
  SELECT b.id AS booking_id, upper(btrim(i.currency)) AS trip_currency, s.supplier_id,
         lower(btrim(coalesce(nullif(s.supplier_name,''), nullif(s.service_name,''), 'Unknown'))) AS name_key,
         CASE WHEN tm.service_type IS NULL THEN 'other' ELSE tm.supplier_type END AS supplier_type,
         d.date AS service_date,
         upper(btrim(coalesce(s.supplier_currency,''))) AS cur,
         s.supplier_cost_original AS original, s.exchange_rate_used AS rate, s.total_cost AS total
    FROM bookings b
    JOIN itineraries i ON i.id = b.itinerary_id
    JOIN itinerary_days d ON d.itinerary_id = i.id
    JOIN itinerary_services s ON s.itinerary_day_id = d.id
    LEFT JOIN type_map tm ON tm.service_type = lower(coalesce(s.service_type,''))
   WHERE nullif(btrim(i.currency),'') IS NOT NULL
),
own AS (
  SELECT r.id AS row_id, min(l.cur) AS own_currency, round(sum(l.original),2) AS own_amount
    FROM booking_supplier_status r
    JOIN lines l ON l.booking_id = r.booking_id AND l.supplier_type = r.supplier_type
     AND l.service_date IS NOT DISTINCT FROM r.service_date
     AND (CASE WHEN r.supplier_id IS NOT NULL THEN l.supplier_id = r.supplier_id
               ELSE l.supplier_id IS NULL AND l.name_key = lower(btrim(r.supplier_name)) END)
   GROUP BY r.id, l.trip_currency
  HAVING count(DISTINCT l.cur) = 1 AND min(l.cur) <> '' AND min(l.cur) <> l.trip_currency
     AND bool_and(l.original IS NOT NULL AND l.rate IS NOT NULL AND l.rate > 0 AND l.total IS NOT NULL
                  AND abs(l.original * l.rate - l.total) <= greatest(0.01, abs(l.total) * 0.005))
)
SELECT e.id AS expense_id, e.expense_number, e.status, e.amount, e.currency AS expense_currency,
       r.id AS supplier_row_id, r.supplier_name, r.status AS row_status, r.confirmed_cost, r.quoted_cost,
       coalesce(o.own_currency, upper(r.cost_currency), upper(b.currency)) AS derived_currency,
       o.own_amount, b.booking_code
  FROM expenses e
  JOIN booking_supplier_status r ON r.id = e.booking_supplier_status_id
  JOIN bookings b ON b.id = r.booking_id AND b.org_id = e.org_id
  LEFT JOIN own o ON o.row_id = r.id
 WHERE e.status IN ('approved', 'paid')
   AND upper(coalesce(e.currency,'')) <> coalesce(o.own_currency, upper(r.cost_currency), upper(b.currency))
 ORDER BY b.booking_code, r.service_date, r.supplier_name
`

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const read = (f: string) => readFileSync(path.join(MIGRATIONS, f), 'utf8')
const row = async (n: number) =>
  (await db.query(`SELECT cost_currency, quoted_cost::float AS quoted_cost, confirmed_cost::float AS confirmed_cost FROM booking_supplier_status WHERE id = '${R(n)}'`)).rows[0]

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(read(f))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name) VALUES ('${ORG}', 'Travel2Egypt');
    INSERT INTO suppliers (id, org_id, name, type, types) VALUES
      ('${G1}', '${ORG}', 'Ahmed', 'guide', ARRAY['guide']),
      ('${C1}', '${ORG}', 'MS Nile', 'cruise', ARRAY['cruise']),
      ('${H1}', '${ORG}', 'Nile Palace', 'hotel', ARRAY['hotel']),
      ('${G2}', '${ORG}', 'Mona', 'guide', ARRAY['guide']),
      ('${T1}', '${ORG}', 'Cairo Cars', 'transport', ARRAY['transport']),
      ('${G3}', '${ORG}', 'Omar', 'guide', ARRAY['guide']),
      ('${G4}', '${ORG}', 'Sara', 'guide', ARRAY['guide']);
    INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, currency)
      VALUES ('${TRIP}', '${ORG}', 'ITN-1', 'C', 'Trip', '2026-12-01', '2026-12-02', 2, 'JPY');
    INSERT INTO itinerary_days (id, itinerary_id, day_number, date) VALUES
      ('${DAY1}', '${TRIP}', 1, '2026-12-01'), ('${DAY2}', '${TRIP}', 2, '2026-12-02');
    INSERT INTO itinerary_services (itinerary_day_id, service_type, service_name, supplier_id, supplier_name, total_cost, supplier_currency, supplier_cost_original, exchange_rate_used) VALUES
      -- guide, two lines in EGP, both current
      ('${DAY1}', 'guide', 'Guide AM', '${G1}', 'Ahmed', 9000, 'EGP', 3000, 3),
      ('${DAY1}', 'guide', 'Guide PM', '${G1}', 'Ahmed', 1500, 'EGP', 500, 3),
      -- a tip for the guide: nobody confirms it, never part of the row
      ('${DAY1}', 'tips', 'Guide tip', '${G1}', 'Ahmed', 300, 'JPY', 300, 1),
      -- cruise in USD
      ('${DAY2}', 'cruise', 'Cruise', '${C1}', 'MS Nile', 150000, 'USD', 1000, 150),
      -- hotel edited from 2 rooms to 3 after pricing: original is stale
      ('${DAY1}', 'accommodation', 'Stay', '${H1}', 'Nile Palace', 67500, 'EGP', 15000, 3),
      -- confirmed guide
      ('${DAY2}', 'guide', 'Guide', '${G2}', 'Mona', 9000, 'EGP', 3000, 3),
      -- transport in two currencies
      ('${DAY1}', 'transportation', 'Car', '${T1}', 'Cairo Cars', 3000, 'EGP', 1000, 3),
      ('${DAY1}', 'transportation', 'Van', '${T1}', 'Cairo Cars', 7500, 'USD', 50, 150),
      -- guide whose row cost was edited by hand
      ('${DAY2}', 'guide', 'Guide', '${G3}', 'Omar', 6000, 'EGP', 2000, 3),
      -- guide with a confirmed cost typed while still pending
      ('${DAY2}', 'guide', 'Guide', '${G4}', 'Sara', 6000, 'EGP', 2000, 3),
      -- an unlinked supplier, by name
      ('${DAY2}', 'activity', 'Felucca', NULL, 'Felucca Man', 1200, 'EGP', 400, 3);
    INSERT INTO bookings (id, org_id, booking_code, itinerary_id, client_name, trip_name, start_date, end_date, currency)
      VALUES ('${BK}', '${ORG}', 'BK-1', '${TRIP}', 'C', 'Trip', '2026-12-01', '2026-12-02', 'JPY');
    INSERT INTO booking_supplier_status (id, booking_id, supplier_id, supplier_type, supplier_name, service_date, status, quoted_cost, confirmed_cost) VALUES
      ('${R(1)}', '${BK}', '${G1}', 'guide', 'Ahmed', '2026-12-01', 'pending', 10500, NULL),
      ('${R(2)}', '${BK}', '${C1}', 'cruise', 'MS Nile', '2026-12-02', 'requested', 150000, NULL),
      ('${R(3)}', '${BK}', '${H1}', 'hotel', 'Nile Palace', '2026-12-01', 'pending', 67500, NULL),
      ('${R(4)}', '${BK}', '${G2}', 'guide', 'Mona', '2026-12-02', 'confirmed', 9000, 9000),
      ('${R(5)}', '${BK}', '${T1}', 'transport', 'Cairo Cars', '2026-12-01', 'pending', 10500, NULL),
      ('${R(6)}', '${BK}', '${G3}', 'guide', 'Omar', '2026-12-02', 'pending', 5000, NULL),
      ('${R(7)}', '${BK}', '${G4}', 'guide', 'Sara', '2026-12-02', 'pending', 6000, 6000),
      ('${R(8)}', '${BK}', NULL, 'activity', 'Felucca Man', '2026-12-02', 'pending', 1200, NULL);
    INSERT INTO expenses (id, org_id, expense_number, category, amount, currency, expense_date, status, booking_supplier_status_id)
      VALUES ('${EXP}', '${ORG}', 'EXP-2026-001', 'guide', 9000, 'JPY', '2026-12-02', 'approved', '${R(4)}');
  `)
  await db.exec(read(FILE))
  // Applied twice: idempotent.
  await db.exec(read(FILE))
  await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
})

afterAll(async () => {
  await db?.close()
})

describe('20270101 booking supplier currency', () => {
  it('adds a nullable text cost_currency', async () => {
    const cols = (await db.query(`
      SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'booking_supplier_status' AND column_name = 'cost_currency'`)).rows
    expect(cols).toEqual([{ data_type: 'text', is_nullable: 'YES' }])
  })

  it("moves an unconfirmed row to its supplier's own currency and amount", async () => {
    expect(await row(1)).toEqual({ cost_currency: 'EGP', quoted_cost: 3500, confirmed_cost: null })
    expect(await row(2)).toEqual({ cost_currency: 'USD', quoted_cost: 1000, confirmed_cost: null })
    expect(await row(8)).toEqual({ cost_currency: 'EGP', quoted_cost: 400, confirmed_cost: null })
  })

  it('leaves stale originals, mixed currencies and hand-edited costs in the trip currency', async () => {
    expect(await row(3)).toEqual({ cost_currency: null, quoted_cost: 67500, confirmed_cost: null })
    expect(await row(5)).toEqual({ cost_currency: null, quoted_cost: 10500, confirmed_cost: null })
    expect(await row(6)).toEqual({ cost_currency: null, quoted_cost: 5000, confirmed_cost: null })
  })

  it('never changes a confirmed row, a row with a confirmed cost, or an expense', async () => {
    expect(await row(4)).toEqual({ cost_currency: null, quoted_cost: 9000, confirmed_cost: 9000 })
    expect(await row(7)).toEqual({ cost_currency: null, quoted_cost: 6000, confirmed_cost: 6000 })
    const e = (await db.query(`SELECT amount::float AS amount, currency, status FROM expenses WHERE id = '${EXP}'`)).rows[0]
    expect(e).toEqual({ amount: 9000, currency: 'JPY', status: 'approved' })
  })

  it('the audit query lists the approved expense whose row is really in EGP', async () => {
    const rows = (await db.query(AUDIT)).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ expense_id: EXP, expense_currency: 'JPY', derived_currency: 'EGP', supplier_name: 'Mona' })
    expect(Number(rows[0].own_amount)).toBe(3000)
  })
})
