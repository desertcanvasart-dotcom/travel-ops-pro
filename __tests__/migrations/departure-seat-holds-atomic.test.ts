// Migration 20261213, executed against a real Postgres.
//
// A website order's seat hold was counted in the app (seatsFree) and inserted
// afterwards, so two orders for the last seats at the same moment were both
// held past max_pax. hold_departure_seats() now locks the departure row,
// counts with the same rule, and inserts the pending hold only if the party
// fits. These pin that rule on Postgres, that the last seat cannot be held
// twice, and that only the service role can call it.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261213_departure_seat_holds_atomic.sql'
const SIG = 'public.hold_departure_seats(uuid, uuid, integer, uuid, text, text)'
const ORG_T = '10000000-0000-4000-8000-000000000001'
const ORG_A = '10000000-0000-4000-8000-000000000002'
const DEP = '40000000-0000-4000-8000-000000000001'
const DEP_CANCELLED = '40000000-0000-4000-8000-000000000002'
const DEP_A = '40000000-0000-4000-8000-000000000003'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const hold = async (org: string, dep: string, pax: number, name = 'Guest') =>
  (await db.query(`SELECT public.hold_departure_seats($1, $2, $3, NULL, $4, 'web order') AS r`, [org, dep, pax, name])).rows[0].r as { held: boolean; free: number; id: string | null }
const heldPax = async (dep: string) =>
  (await db.query(`SELECT COALESCE(SUM(pax), 0)::int AS n FROM departure_bookings WHERE departure_id = $1 AND status = 'pending'`, [dep])).rows[0].n as number

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
    INSERT INTO tour_departures (id, org_id, tour_name, start_date, end_date, max_pax, booked_pax, status) VALUES
      ('${DEP}', '${ORG_T}', 'Nile 8 days', '2026-09-18', '2026-09-25', 10, 6, 'open'),
      ('${DEP_CANCELLED}', '${ORG_T}', 'Nile 8 days', '2026-09-25', '2026-10-02', 10, 0, 'cancelled'),
      ('${DEP_A}', '${ORG_A}', 'Cairo 3 days', '2026-09-18', '2026-09-20', 4, 0, 'open');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('hold_departure_seats', () => {
  it('holds a party that fits, pending, and says how many seats were free', async () => {
    const r = await hold(ORG_T, DEP, 2, 'Suzuki')
    expect(r).toMatchObject({ held: true, free: 4 })
    const row = (await db.query(`SELECT org_id, departure_id, pax, status, client_name, notes FROM departure_bookings WHERE id = $1`, [r.id])).rows[0]
    expect(row).toEqual({ org_id: ORG_T, departure_id: DEP, pax: 2, status: 'pending', client_name: 'Suzuki', notes: 'web order' })
  })

  it('the second hold for the last seats is refused; nothing is inserted', async () => {
    // 10 max, 6 booked, 2 pending: 2 left. The first order for them is held …
    expect(await hold(ORG_T, DEP, 2)).toMatchObject({ held: true, free: 2 })
    // … and the next one, which read "2 free" in the app a moment earlier, is not.
    expect(await hold(ORG_T, DEP, 2)).toEqual({ held: false, free: 0, id: null })
    expect(await hold(ORG_T, DEP, 1)).toEqual({ held: false, free: 0, id: null })
    expect(await heldPax(DEP)).toBe(4)
  })

  it('counts seats exactly as seatsFree() does: the larger of booked_pax and confirmed holds, plus pending holds', async () => {
    await db.exec(`
      INSERT INTO tour_departures (id, org_id, tour_name, start_date, end_date, max_pax, booked_pax, status) VALUES
        ('40000000-0000-4000-8000-000000000010', '${ORG_T}', 'T', '2026-11-01', '2026-11-02', 10, 2, 'open');
      INSERT INTO departure_bookings (org_id, departure_id, pax, status) VALUES
        ('${ORG_T}', '40000000-0000-4000-8000-000000000010', 5, 'confirmed'),
        ('${ORG_T}', '40000000-0000-4000-8000-000000000010', 1, 'pending'),
        ('${ORG_T}', '40000000-0000-4000-8000-000000000010', 3, 'cancelled');
    `)
    // The same departure __tests__/api/intake-order-finish.test.ts gives
    // seatsFree(): max 10, booked 2, confirmed 5, pending 1 → 10 − max(2, 5) − 1.
    const expected = 4
    expect(await hold(ORG_T, '40000000-0000-4000-8000-000000000010', 5)).toEqual({ held: false, free: expected, id: null })
    expect(await hold(ORG_T, '40000000-0000-4000-8000-000000000010', 4)).toMatchObject({ held: true, free: expected })
  })

  it('a cancelled departure, or another company\'s, holds nothing', async () => {
    expect(await hold(ORG_T, DEP_CANCELLED, 1)).toEqual({ held: false, free: 0, id: null })
    expect(await hold(ORG_T, DEP_A, 1)).toEqual({ held: false, free: 0, id: null })
    expect(await heldPax(DEP_A)).toBe(0)
  })

  it('refuses a party of no one', async () => {
    await expect(hold(ORG_T, DEP, 0)).rejects.toThrow(/pax must be at least 1/)
  })

  it('locks the departure row before it counts (SELECT … FOR UPDATE)', () => {
    expect(sql).toMatch(/FROM tour_departures\s+WHERE id = p_departure_id AND org_id = p_org_id AND status <> 'cancelled'\s+FOR UPDATE;/)
  })

  it('is SECURITY DEFINER with a fixed search_path', async () => {
    const r = (await db.query(`SELECT prosecdef, proconfig FROM pg_proc WHERE oid = '${SIG}'::regprocedure`)).rows[0]
    expect(r.prosecdef).toBe(true)
    expect(r.proconfig).toEqual(['search_path=public, pg_temp'])
  })

  it('only the service role can call it', async () => {
    const can = async (role: string) =>
      (await db.query(`SELECT has_function_privilege('${role}', '${SIG}', 'EXECUTE') AS ok`)).rows[0].ok
    expect(await can('authenticated')).toBe(false)
    expect(await can('anon')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })
})
