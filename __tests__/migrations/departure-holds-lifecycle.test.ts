// Migration 20261215, executed against a real Postgres.
//
// Operate audit (Departures #2–#4): the seat rule becomes booked_pax +
// confirmed + pending everywhere; a hold is placed only on an Open, Limited or
// Guaranteed date; seats change under the departure's lock and never below
// what is taken; and a cancelled departure releases its pending holds.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'
import { seatsFree } from '@/lib/departures/seats'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261215_departure_holds_lifecycle.sql'
const HOLD = 'public.hold_departure_seats(uuid, uuid, integer, uuid, text, text)'
const SEATS = 'public.set_departure_seats(uuid, uuid, integer, integer)'
const ORG = '10000000-0000-4000-8000-000000000001'
const OTHER = '10000000-0000-4000-8000-000000000002'
const dep = (n: number) => `40000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`

const TRIP = '70000000-0000-4000-8000-000000000001'
const Q1 = '50000000-0000-4000-8000-000000000001'
const Q2 = '50000000-0000-4000-8000-000000000002'
const H1 = '60000000-0000-4000-8000-000000000001'
const H2 = '60000000-0000-4000-8000-000000000002'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const hold = async (d: string, pax: number, org = ORG) =>
  (await db.query(`SELECT public.hold_departure_seats($1, $2, $3, NULL, 'Guest', 'web order') AS r`, [org, d, pax])).rows[0].r as { held: boolean; free: number; id: string | null }
const setSeats = async (d: string, max: number | null, booked: number | null, org = ORG) =>
  (await db.query(`SELECT public.set_departure_seats($1, $2, $3, $4) AS r`, [org, d, max, booked])).rows[0].r as Record<string, unknown>
const holdStatuses = async (d: string) =>
  (await db.query(`SELECT status, pax FROM departure_bookings WHERE departure_id = $1 ORDER BY pax`, [d])).rows as Array<{ status: string; pax: number }>
const departure = async (d: string) =>
  (await db.query(`SELECT max_pax, booked_pax, status FROM tour_departures WHERE id = $1`, [d])).rows[0]

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  const row = (n: number, status: string, max: number, booked: number, org = ORG) =>
    `('${dep(n)}', '${org}', 'Nile 8 days', '2026-11-${String(n).padStart(2, '0')}', '2026-11-${String(n).padStart(2, '0')}', ${max}, ${booked}, '${status}')`
  await db.exec(`
    INSERT INTO organizations (id, name) VALUES ('${ORG}', 'Travel2Egypt'), ('${OTHER}', 'ATS');
    INSERT INTO tour_departures (id, org_id, tour_name, start_date, end_date, max_pax, booked_pax, status) VALUES
      ${row(1, 'open', 10, 2)}, ${row(2, 'full', 10, 0)}, ${row(3, 'draft', 10, 0)}, ${row(4, 'limited', 10, 0)},
      ${row(5, 'guaranteed', 10, 0)}, ${row(6, 'open', 10, 0)}, ${row(7, 'open', 10, 0)}, ${row(8, 'cancelled', 10, 0)},
      ${row(9, 'open', 10, 0)}, ${row(10, 'open', 4, 0, OTHER)}, ${row(11, 'open', 10, 0)};
    -- Departure 1: 2 booked outside the app, 5 confirmed, 1 pending, 3 cancelled.
    INSERT INTO departure_bookings (org_id, departure_id, pax, status) VALUES
      ('${ORG}', '${dep(1)}', 5, 'confirmed'), ('${ORG}', '${dep(1)}', 1, 'pending'), ('${ORG}', '${dep(1)}', 3, 'cancelled'),
      -- Departure 8 was cancelled before this migration with a hold still pending.
      ('${ORG}', '${dep(8)}', 2, 'pending'), ('${ORG}', '${dep(8)}', 1, 'confirmed');
    -- A website order's hold from before this migration, tied to its quote
    -- only by the number in its note; and the other company's hold whose
    -- note names the same number (never linked across companies).
    INSERT INTO itineraries (id, org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days) VALUES
      ('${TRIP}', '${ORG}', 'ITN-2026-0001', 'Suzuki', 'Nile', '2026-11-09', '2026-11-16', 8);
    INSERT INTO tour_quotes (id, org_id, quote_number, status, itinerary_id) VALUES
      ('${Q1}', '${ORG}', 'QT-2026-00012', 'sent', '${TRIP}');
    INSERT INTO departure_bookings (id, org_id, departure_id, pax, status, notes) VALUES
      ('${H1}', '${ORG}', '${dep(11)}', 2, 'pending', 'ウェブ注文 QT-2026-00012（幼児 1名 別）'),
      ('${H2}', '${OTHER}', '${dep(10)}', 1, 'pending', 'ウェブ注文 QT-2026-00012');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('the seat rule: booked_pax + confirmed + pending', () => {
  it('the hold counts as lib/departures/seats does', async () => {
    // max 10 − (2 booked + 5 confirmed + 1 pending) = 2. The old rule said 4.
    const expected = seatsFree({ max_pax: 10, booked_pax: 2 }, [{ pax: 5, status: 'confirmed' }, { pax: 1, status: 'pending' }, { pax: 3, status: 'cancelled' }])
    expect(expected).toBe(2)
    expect(await hold(dep(1), 3)).toEqual({ held: false, free: expected, id: null })
    expect(await hold(dep(1), 2)).toMatchObject({ held: true, free: expected })
    expect(await hold(dep(1), 1)).toEqual({ held: false, free: 0, id: null })
  })
})

describe('only open dates take holds', () => {
  it('Full and Draft dates refuse, as Cancelled always did', async () => {
    expect(await hold(dep(2), 1)).toEqual({ held: false, free: 0, id: null })
    expect(await hold(dep(3), 1)).toEqual({ held: false, free: 0, id: null })
    expect(await hold(dep(8), 1)).toEqual({ held: false, free: 0, id: null })
    expect(await holdStatuses(dep(2))).toEqual([])
    expect(await holdStatuses(dep(3))).toEqual([])
  })

  it('Open, Limited and Guaranteed dates hold', async () => {
    expect(await hold(dep(4), 1)).toMatchObject({ held: true, free: 10 })
    expect(await hold(dep(5), 1)).toMatchObject({ held: true, free: 10 })
  })

  it("another company's departure holds nothing", async () => {
    expect(await hold(dep(10), 1)).toEqual({ held: false, free: 0, id: null })
  })
})

describe('set_departure_seats', () => {
  it('refuses max_pax below what is taken, counting the holds; nothing changes', async () => {
    await hold(dep(6), 3)
    await hold(dep(6), 3)
    const r = await setSeats(dep(6), 4, null)
    expect(r).toMatchObject({ ok: false, reason: 'below_taken', held: 6, taken: 6, max_pax: 4 })
    expect(await departure(dep(6))).toMatchObject({ max_pax: 10, booked_pax: 0 })
  })

  it('lowers max_pax down to exactly what is taken', async () => {
    expect(await setSeats(dep(6), 6, null)).toMatchObject({ ok: true, taken: 6, max_pax: 6 })
    expect(await departure(dep(6))).toMatchObject({ max_pax: 6 })
    // And the next hold sees no seats.
    expect(await hold(dep(6), 1)).toEqual({ held: false, free: 0, id: null })
  })

  it('booked_pax counts on top of the holds', async () => {
    expect(await setSeats(dep(6), null, 1)).toMatchObject({ ok: false, reason: 'below_taken', taken: 7 })
    expect(await setSeats(dep(6), 8, 2)).toMatchObject({ ok: true, booked_pax: 2, taken: 8 })
    expect(await departure(dep(6))).toMatchObject({ max_pax: 8, booked_pax: 2 })
  })

  it("another company's departure is not found", async () => {
    expect(await setSeats(dep(10), 20, null)).toEqual({ ok: false, reason: 'not_found' })
    expect(await departure(dep(10))).toMatchObject({ max_pax: 4 })
  })

  it('refuses nonsense', async () => {
    await expect(setSeats(dep(6), 0, null)).rejects.toThrow(/max_pax must be at least 1/)
    await expect(setSeats(dep(6), null, -1)).rejects.toThrow(/booked_pax must not be negative/)
  })
})

describe('cancelling a departure releases its pending holds', () => {
  it('pending → cancelled; confirmed stays for the office to rehome', async () => {
    await hold(dep(7), 2)
    await db.exec(`INSERT INTO departure_bookings (org_id, departure_id, pax, status) VALUES ('${ORG}', '${dep(7)}', 4, 'confirmed')`)
    await db.exec(`UPDATE tour_departures SET status = 'cancelled' WHERE id = '${dep(7)}'`)
    expect(await holdStatuses(dep(7))).toEqual([{ status: 'cancelled', pax: 2 }, { status: 'confirmed', pax: 4 }])
  })

  it('another status change leaves holds alone', async () => {
    await hold(dep(9), 2)
    await db.exec(`UPDATE tour_departures SET status = 'full' WHERE id = '${dep(9)}'`)
    expect(await holdStatuses(dep(9))).toEqual([{ status: 'pending', pax: 2 }])
  })

  it('the migration released the pending hold of a departure cancelled before it ran', async () => {
    expect(await holdStatuses(dep(8))).toEqual([{ status: 'confirmed', pax: 1 }, { status: 'cancelled', pax: 2 }])
  })
})

describe('grants', () => {
  it('both functions are SECURITY DEFINER with a fixed search_path', async () => {
    for (const sig of [HOLD, SEATS]) {
      const r = (await db.query(`SELECT prosecdef, proconfig FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).rows[0]
      expect(r.prosecdef).toBe(true)
      expect(r.proconfig).toEqual(['search_path=public, pg_temp'])
    }
  })

  it('only the service role can call them', async () => {
    const can = async (role: string, sig: string) =>
      (await db.query(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS ok`)).rows[0].ok
    for (const sig of [HOLD, SEATS]) {
      expect(await can('authenticated', sig)).toBe(false)
      expect(await can('anon', sig)).toBe(false)
      expect(await can('service_role', sig)).toBe(true)
    }
  })
})

describe('a hold follows its quote', () => {
  const holdRow = async (id: string) =>
    (await db.query(`SELECT quote_id, status FROM departure_bookings WHERE id = $1`, [id])).rows[0]

  it('existing holds are linked by the quote number in their note, within the company only', async () => {
    expect(await holdRow(H1)).toEqual({ quote_id: Q1, status: 'pending' })
    expect(await holdRow(H2)).toEqual({ quote_id: null, status: 'pending' })
  })

  it('a rejected quote releases its pending holds', async () => {
    await db.exec(`UPDATE tour_quotes SET status = 'rejected' WHERE id = '${Q1}'`)
    expect((await holdRow(H1)).status).toBe('cancelled')
    expect((await holdRow(H2)).status).toBe('pending')
  })

  it('a deleted quote releases its pending holds; confirmed ones stay', async () => {
    await db.exec(`
      INSERT INTO tour_quotes (id, org_id, quote_number, status, itinerary_id) VALUES ('${Q2}', '${ORG}', 'QT-2026-00013', 'sent', '${TRIP}');
      INSERT INTO departure_bookings (org_id, departure_id, pax, status, quote_id) VALUES
        ('${ORG}', '${dep(11)}', 1, 'pending', '${Q2}'), ('${ORG}', '${dep(11)}', 1, 'confirmed', '${Q2}');
    `)
    await db.exec(`DELETE FROM tour_quotes WHERE id = '${Q2}'`)
    const rows = (await db.query(
      `SELECT status FROM departure_bookings WHERE departure_id = $1 AND quote_id IS NULL AND id <> $2 ORDER BY status`,
      [dep(11), H1])).rows.map((r: any) => r.status)
    expect(rows).toEqual(['cancelled', 'confirmed'])
  })
})
