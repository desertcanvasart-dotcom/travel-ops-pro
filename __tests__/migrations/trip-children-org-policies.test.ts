// Migration 20261212, executed against a real Postgres with RLS enforced.
//
// The child tables of trips and bookings (days, service lines, translations,
// resources, booking payments, supplier confirmations) each carried one
// policy USING (true) — itinerary_resources with no TO clause, so anon too.
// Any signed-in user of either company read and wrote every company's rows
// through PostgREST. This signs in as an agent of each of two companies
// (auth.uid() from a setting, as org-scoped-parent-policies does) and asks
// Postgres what each may touch; then checks the auto-link trigger, the
// booking-code numbering, the stored-total trigger and the date shift.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261212_trip_children_org_policies.sql'
const ORG_T = '31000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '31000000-0000-4000-8000-000000000002' // ATS
const T_AGENT = '41000000-0000-4000-8000-000000000001'
const A_AGENT = '41000000-0000-4000-8000-000000000002'
const C_T = '51000000-0000-4000-8000-000000000001'
const C_T_JOHN = '51000000-0000-4000-8000-000000000003'
const I_T = '61000000-0000-4000-8000-000000000001'
const I_A = '61000000-0000-4000-8000-000000000002'
const I_LINKED = '61000000-0000-4000-8000-000000000003' // ATS trip wrongly on a T2E client
const D_T = '71000000-0000-4000-8000-000000000001'
const D_A = '71000000-0000-4000-8000-000000000002'
const S_T = '81000000-0000-4000-8000-000000000001'
const S_A = '81000000-0000-4000-8000-000000000002'
const B_T = '91000000-0000-4000-8000-000000000001'
const B_A = '91000000-0000-4000-8000-000000000002'

const YEAR = new Date().getFullYear()

const CHILDREN = [
  'itinerary_days', 'itinerary_services', 'itinerary_versions', 'itinerary_day_versions',
  'itinerary_service_versions', 'itinerary_resources', 'booking_payments', 'booking_supplier_status',
]

let db: { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]

async function as<T>(uid: string | null, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(uid
      ? `SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`
      : `SELECT set_config('test.uid', '', true); SET LOCAL row_security = on; SET LOCAL ROLE anon;`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}
const count = async (uid: string | null, q: string) => (await as(uid, q)).rows.length

async function replay(includeFile: boolean) {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    -- Table grants as Supabase gives them: RLS is the only thing in the way.
    GRANT SELECT, INSERT, UPDATE, DELETE ON itineraries, bookings, ${CHILDREN.join(', ')} TO authenticated, anon;
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    INSERT INTO auth.users (id, email) VALUES ('${T_AGENT}', 't@x'), ('${A_AGENT}', 'a@x') ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_AGENT}', 't@x', 'agent', true), ('${A_AGENT}', 'a@x', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_AGENT}', '${A_AGENT}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_AGENT}', 'agent'), ('${ORG_A}', '${A_AGENT}', 'agent');
    INSERT INTO clients (id, client_code, first_name, last_name, email, status, org_id) VALUES
      ('${C_T}', 'C-T', 'Taro', 'T', 'taro@x.com', 'lead', '${ORG_T}'),
      ('${C_T_JOHN}', 'C-J', 'John', 'Smith', 'john@x.com', 'lead', '${ORG_T}');
    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id, client_id) VALUES
      ('${I_T}', 'I-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}', '${C_T}'),
      ('${I_A}', 'I-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}', NULL),
      ('${I_LINKED}', 'I-L', 'Taro', 'Trip L', '2026-01-01', '2026-01-03', 3, '${ORG_A}', '${C_T}');
    INSERT INTO itinerary_days (id, itinerary_id, day_number, date) VALUES
      ('${D_T}', '${I_T}', 1, '2026-01-01'), ('${D_A}', '${I_A}', 1, '2026-01-01');
    INSERT INTO itinerary_services (id, itinerary_day_id, service_type, service_name, total_cost, client_price) VALUES
      ('${S_T}', '${D_T}', 'guide', 'Guide T', 100, 125), ('${S_A}', '${D_A}', 'guide', 'Guide A', 200, 250);
    INSERT INTO itinerary_versions (itinerary_id, language, trip_name) VALUES ('${I_T}', 'en', 'T'), ('${I_A}', 'en', 'A');
    INSERT INTO itinerary_day_versions (itinerary_day_id, language, title) VALUES ('${D_T}', 'ja', 'T'), ('${D_A}', 'ja', 'A');
    INSERT INTO itinerary_service_versions (itinerary_service_id, language, service_name) VALUES ('${S_T}', 'ja', 'T'), ('${S_A}', 'ja', 'A');
    INSERT INTO itinerary_resources (itinerary_id, resource_type, resource_id, start_date, end_date) VALUES
      ('${I_T}', 'guide', gen_random_uuid(), '2026-01-01', '2026-01-03'), ('${I_A}', 'guide', gen_random_uuid(), '2026-01-01', '2026-01-03');
    INSERT INTO bookings (id, booking_code, itinerary_id, client_name, trip_name, start_date, end_date, org_id) VALUES
      ('${B_T}', 'BKG-${YEAR}-0007', '${I_T}', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', '${ORG_T}'),
      ('${B_A}', 'BKG-${YEAR}-0002', '${I_A}', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', '${ORG_A}');
    INSERT INTO booking_payments (booking_id, payment_type, amount, payment_date) VALUES
      ('${B_T}', 'deposit', 100, '2026-01-01'), ('${B_A}', 'deposit', 200, '2026-01-01');
    INSERT INTO booking_supplier_status (booking_id, supplier_type, supplier_name) VALUES
      ('${B_T}', 'hotel', 'T'), ('${B_A}', 'hotel', 'A');
  `)
  if (includeFile) {
    await db.exec(sql)
    await db.exec(sql) // twice: idempotent
  }
}

describe('before the migration (the hole is real)', () => {
  beforeAll(async () => { await replay(false) })
  afterAll(async () => { await db?.close() })

  it("an agent of one company reads the other company's service lines and payments; anon reads resources", async () => {
    expect(await count(A_AGENT, `SELECT id FROM itinerary_services WHERE id = '${S_T}'`)).toBe(1)
    expect(await count(A_AGENT, `SELECT id FROM booking_payments WHERE booking_id = '${B_T}'`)).toBe(1)
    expect(await count(null, `SELECT id FROM itinerary_resources`)).toBe(2)
  })

  it("the auto-link trigger gives an ATS trip Travel2Egypt's client", async () => {
    await db.exec(`INSERT INTO itineraries (id, itinerary_code, client_name, client_email, trip_name, start_date, end_date, total_days, org_id)
      VALUES ('61000000-0000-4000-8000-0000000000f1', 'I-X', 'John Smith', 'john@x.com', 'X', '2026-01-01', '2026-01-02', 2, '${ORG_A}')`)
    expect((await one(`SELECT client_id FROM itineraries WHERE id = '61000000-0000-4000-8000-0000000000f1'`)).client_id).toBe(C_T_JOHN)
  })
})

describe('after the migration (applied twice)', () => {
  beforeAll(async () => { await replay(true) })
  afterAll(async () => { await db?.close() })

  it("each company's agent reads only its own child rows, on every table", async () => {
    const own = {
      itinerary_days: ['itinerary_id', I_T, I_A],
      itinerary_versions: ['itinerary_id', I_T, I_A],
      itinerary_resources: ['itinerary_id', I_T, I_A],
      itinerary_services: ['itinerary_day_id', D_T, D_A],
      itinerary_day_versions: ['itinerary_day_id', D_T, D_A],
      itinerary_service_versions: ['itinerary_service_id', S_T, S_A],
      booking_payments: ['booking_id', B_T, B_A],
      booking_supplier_status: ['booking_id', B_T, B_A],
    } as const
    for (const [table, [col, t, a]] of Object.entries(own)) {
      const seen = async (uid: string) => (await as<{ k: string }>(uid, `SELECT ${col} AS k FROM ${table}`)).rows.map(r => r.k)
      expect(await seen(T_AGENT), table).toEqual([t])
      expect(await seen(A_AGENT), table).toEqual([a])
    }
  })

  it('anon reads nothing — itinerary_resources included', async () => {
    for (const t of CHILDREN) expect(await count(null, `SELECT 1 FROM ${t}`), t).toBe(0)
  })

  it("nobody updates, deletes or inserts the other company's child rows", async () => {
    expect((await as(A_AGENT, `UPDATE itinerary_services SET client_price = 1 WHERE id = '${S_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE itinerary_days SET title = 'x' WHERE id = '${D_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `DELETE FROM booking_payments WHERE booking_id = '${B_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE booking_supplier_status SET status = 'confirmed' WHERE booking_id = '${B_T}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `DELETE FROM itinerary_resources WHERE itinerary_id = '${I_T}'`)).affected).toBe(0)
    await expect(as(A_AGENT, `INSERT INTO itinerary_services (itinerary_day_id, service_type, service_name) VALUES ('${D_T}', 'guide', 'x')`)).rejects.toThrow()
    await expect(as(A_AGENT, `INSERT INTO itinerary_days (itinerary_id, day_number, date) VALUES ('${I_T}', 9, '2026-01-09')`)).rejects.toThrow()
    await expect(as(A_AGENT, `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_date) VALUES ('${B_T}', 'deposit', 1, '2026-01-01')`)).rejects.toThrow()
  })

  it('the day and service editor still saves its own trip from the browser', async () => {
    expect((await as(T_AGENT, `UPDATE itinerary_days SET title = 'x' WHERE id = '${D_T}'`)).affected).toBe(1)
    expect((await as(T_AGENT, `INSERT INTO itinerary_days (itinerary_id, day_number, date) VALUES ('${I_T}', 2, '2026-01-02')`)).affected).toBe(1)
    // An insert fires recalculate_itinerary_totals, which updates the trip as the caller.
    expect((await as(T_AGENT, `INSERT INTO itinerary_services (itinerary_day_id, service_type, service_name, total_cost, client_price) VALUES ('${D_T}', 'guide', 'x', 10, 12)`)).affected).toBe(1)
    expect((await as(T_AGENT, `UPDATE itinerary_services SET quantity = 2 WHERE id = '${S_T}'`)).affected).toBe(1)
    expect((await as(T_AGENT, `DELETE FROM itinerary_services WHERE id = '${S_T}'`)).affected).toBe(1)
    expect((await as(T_AGENT, `INSERT INTO itinerary_service_versions (itinerary_service_id, language, service_name) VALUES ('${S_T}', 'en', 'x')`)).affected).toBe(1)
    expect((await as(T_AGENT, `UPDATE itinerary_service_versions SET service_name = 'y' WHERE itinerary_service_id = '${S_T}'`)).affected).toBe(1)
  })

  it('no policy on these tables is left without an org condition, or open to anon', async () => {
    const { rows } = await db.query(`SELECT tablename, policyname, roles::text AS roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${CHILDREN.map(t => `'${t}'`).join(', ')})`)
    expect(rows.length).toBe(CHILDREN.length * 4)
    for (const r of rows) {
      expect(r.expr, `${r.tablename}.${r.policyname}`).toContain('user_is_in_org')
      expect(r.roles, `${r.tablename}.${r.policyname}`).toBe('{authenticated}')
    }
  })

  it("a new trip links only to its own company's client", async () => {
    const id = '61000000-0000-4000-8000-0000000000f2'
    await db.exec(`INSERT INTO itineraries (id, itinerary_code, client_name, client_email, trip_name, start_date, end_date, total_days, org_id)
      VALUES ('${id}', 'I-Y', 'John Smith', 'john@x.com', 'Y', '2026-01-01', '2026-01-02', 2, '${ORG_A}')`)
    expect((await one(`SELECT client_id FROM itineraries WHERE id = '${id}'`)).client_id).toBeNull()
    // …and still links within its own company, by email or by unique name.
    const own = '61000000-0000-4000-8000-0000000000f3'
    await db.exec(`INSERT INTO itineraries (id, itinerary_code, client_name, client_email, trip_name, start_date, end_date, total_days, org_id)
      VALUES ('${own}', 'I-Z', 'John Smith', NULL, 'Z', '2026-01-01', '2026-01-02', 2, '${ORG_T}')`)
    expect((await one(`SELECT client_id FROM itineraries WHERE id = '${own}'`)).client_id).toBe(C_T_JOHN)
  })

  it("an existing link to the other company's client is cleared, and listed for review", async () => {
    expect((await one(`SELECT client_id FROM itineraries WHERE id = '${I_LINKED}'`)).client_id).toBeNull()
    const review = await one(`SELECT reason FROM org_backfill_review WHERE table_name = 'itineraries' AND row_id = '${I_LINKED}'`)
    expect(review.reason).toContain(C_T)
    // The trip's own company's link is kept.
    expect((await one(`SELECT client_id FROM itineraries WHERE id = '${I_T}'`)).client_id).toBe(C_T)
  })

  it("confirming a trip never moves the other company's client", async () => {
    // Forced past the API (which now refuses foreign ids): the trigger itself checks the company.
    await db.exec(`UPDATE itineraries SET client_id = '${C_T_JOHN}', status = 'confirmed' WHERE id = '${I_A}'`)
    expect((await one(`SELECT status FROM clients WHERE id = '${C_T_JOHN}'`)).status).toBe('lead')
    expect((await one(`SELECT total_bookings_count AS n FROM clients WHERE id = '${C_T_JOHN}'`)).n).toBe(0)
    await db.exec(`UPDATE itineraries SET client_id = NULL, status = 'draft' WHERE id = '${I_A}'`)
  })

  it('booking codes are numbered per company, from its own highest code, and never repeat', async () => {
    expect((await one(`SELECT generate_booking_code('${ORG_T}') AS c`)).c).toMatch(/^BKG-\d{4}-0008$/)
    expect((await one(`SELECT generate_booking_code('${ORG_T}') AS c`)).c).toMatch(/^BKG-\d{4}-0009$/)
    // ATS does not count Travel2Egypt's bookings.
    expect((await one(`SELECT generate_booking_code('${ORG_A}') AS c`)).c).toMatch(/^BKG-\d{4}-0003$/)
  })

  it('skips a code that is already taken, and both companies may hold the same code', async () => {
    const year = YEAR
    await db.exec(`INSERT INTO bookings (booking_code, itinerary_id, client_name, trip_name, start_date, end_date, org_id)
      VALUES ('BKG-${year}-0004', '${I_A}', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', '${ORG_A}'),
             ('BKG-${year}-0004', '${I_T}', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', '${ORG_T}')`)
    expect((await one(`SELECT generate_booking_code('${ORG_A}') AS c`)).c).toBe(`BKG-${year}-0005`)
    await expect(db.exec(`INSERT INTO bookings (booking_code, itinerary_id, client_name, trip_name, start_date, end_date, org_id)
      VALUES ('BKG-${year}-0004', '${I_A}', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', '${ORG_A}')`)).rejects.toThrow(/bookings_org_booking_code_key/)
  })

  it('existing codes are unchanged, and a signed-in user cannot call the numbering', async () => {
    expect((await one(`SELECT booking_code FROM bookings WHERE id = '${B_T}'`)).booking_code).toBe(`BKG-${YEAR}-0007`)
    await expect(as(T_AGENT, `SELECT generate_booking_code('${ORG_T}')`)).rejects.toThrow()
    await expect(as(T_AGENT, `SELECT shift_itinerary_dates('${I_T}', '${ORG_T}', 1)`)).rejects.toThrow()
  })

  it('the stored total is the client price of the lines plus the season supplement', async () => {
    await db.exec(`UPDATE itineraries SET season_uplift_amount = 50 WHERE id = '${I_A}'`)
    // A line with no client price counts at cost + 25%.
    await db.exec(`INSERT INTO itinerary_services (itinerary_day_id, service_type, service_name, total_cost) VALUES ('${D_A}', 'meal', 'Lunch', 40)`)
    expect(Number((await one(`SELECT total_cost FROM itineraries WHERE id = '${I_A}'`)).total_cost)).toBe(250 + 50 + 50)
  })

  it('shifting a trip moves its days and resources by the same number of days', async () => {
    await db.exec(`SELECT shift_itinerary_dates('${I_A}', '${ORG_A}', 7)`)
    const trip = await one(`SELECT start_date::text AS s, end_date::text AS e FROM itineraries WHERE id = '${I_A}'`)
    expect(trip).toEqual({ s: '2026-01-08', e: '2026-01-10' })
    expect((await one(`SELECT date::text AS d FROM itinerary_days WHERE id = '${D_A}'`)).d).toBe('2026-01-08')
    expect(await one(`SELECT start_date::text AS s, end_date::text AS e FROM itinerary_resources WHERE itinerary_id = '${I_A}'`)).toEqual({ s: '2026-01-08', e: '2026-01-10' })
    // Another company's trip is not found.
    await expect(db.exec(`SELECT shift_itinerary_dates('${I_T}', '${ORG_A}', 7)`)).rejects.toThrow(/not found/)
  })
})
