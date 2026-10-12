// Migration 20261205, executed against a real Postgres with RLS enforced.
//
// suppliers and supplier_properties had no org_id: every guide, hotel and
// driver was both companies'. Suppliers of every backfill kind are seeded
// BEFORE the migration runs (every other migration replayed first), then it
// is applied twice. Each must land in the company that uses it; one both
// companies use must end as one row per company with each company's trips,
// expenses and bills pointing at its own; the copy maps the rate migration
// reads must be filled; and through PostgREST (auth.uid() from a setting) a
// user of one company must see and change none of the other's.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261205_suppliers_org_id.sql'
const ORG_T = '80000000-0000-4000-8000-000000000001' // Travel2Egypt (older)
const ORG_A = '80000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '81000000-0000-4000-8000-000000000001'
const A_ONLY = '81000000-0000-4000-8000-000000000002'
const BOTH = '81000000-0000-4000-8000-000000000003'
const A_AGENT = '81000000-0000-4000-8000-000000000004'

const id = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`
// Suppliers
const S_T = id(1), S_A = id(2), S_BOTH = id(3), S_TIE = id(4), S_RATE_T = id(5), S_RATE_BOTHUSER = id(6), S_NONE = id(7), S_HSTAFF = id(8)
// Trips and their rows
const I_T = id(11), I_A = id(12), D_T = id(13), D_A = id(14), B_T = id(15), B_A = id(16)
const SV_T = id(21), SV_A = id(22), BSS_T = id(23), RES_A = id(24)
const E_T = id(31), E_A = id(32), E_TIE_T = id(33), E_TIE_A = id(34), INV_A = id(35)
const P_BOTH = id(41), P_NONE = id(42)
const R_BOTH = id(51), R_T = id(52), R_BU = id(53)

type Db = { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
let db: Db
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const rows = async (q: string) => (await db.query(q)).rows
const one = async (q: string) => (await rows(q))[0]
const orgOf = async (table: string, rowId: string) => (await one(`SELECT org_id FROM ${table} WHERE id = '${rowId}'`))?.org_id

async function as<T>(uid: string, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}
const orgsSeen = async (uid: string, table: string) =>
  [...new Set((await as<{ o: string }>(uid, `SELECT org_id AS o FROM ${table}`)).rows.map(r => r.o))].sort()
const reviewed = async (rowId: string) =>
  (await rows(`SELECT reason, assigned_org FROM org_backfill_review WHERE table_name = 'suppliers' AND row_id = '${rowId}'`))
const copyOf = async (original: string, orgId: string) =>
  (await one(`SELECT copy_id FROM org_backfill_supplier_copies WHERE original_id = '${original}' AND org_id = '${orgId}'`))?.copy_id

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    // The schema as it stood just before this migration: later ones (the next
    // batches) make columns NOT NULL that this test's fixtures predate.
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01'), ('${ORG_A}', 'ATS', '2026-06-01');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'staff@ats-hj.com'),
      ('${BOTH}', 'owner@travel2egypt.org'), ('${A_AGENT}', 'agent@ats-hj.com')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org', 'manager', true), ('${A_ONLY}', 'staff@ats-hj.com', 'manager', true),
      ('${BOTH}', 'owner@travel2egypt.org', 'manager', true), ('${A_AGENT}', 'agent@ats-hj.com', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${BOTH}', '${A_AGENT}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'manager'), ('${ORG_A}', '${A_ONLY}', 'manager'),
      ('${ORG_T}', '${BOTH}', 'owner'), ('${ORG_A}', '${BOTH}', 'admin'), ('${ORG_A}', '${A_AGENT}', 'agent');

    INSERT INTO suppliers (id, name, type, types, supplier_code) VALUES
      ('${S_T}', 'T hotel', 'hotel', '{hotel}', 'SUP-0001'),
      ('${S_A}', 'A guide', 'guide', '{guide}', 'SUP-0002'),
      ('${S_BOTH}', 'Shared guide', 'guide', '{guide}', 'SUP-0003'),
      ('${S_TIE}', 'Tie transport', 'transport', '{transport}', 'SUP-0004'),
      ('${S_RATE_T}', 'T rates guide', 'guide', '{guide}', 'SUP-0005'),
      ('${S_RATE_BOTHUSER}', 'Owner rates guide', 'guide', '{guide}', 'SUP-0006'),
      ('${S_NONE}', 'Nobody', 'hotel', '{hotel}', 'SUP-0007'),
      ('${S_HSTAFF}', 'Front desk', 'hotel_assistant', '{hotel_assistant}', 'SUP-0008');
    INSERT INTO supplier_properties (id, supplier_id, property_type, name) VALUES
      ('${P_BOTH}', '${S_BOTH}', 'hotel', 'Shared lodge'), ('${P_NONE}', '${S_NONE}', 'hotel', 'Lonely inn');

    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id, assigned_guide_id) VALUES
      ('${I_T}', 'I-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}', null),
      ('${I_A}', 'I-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}', '${S_BOTH}');
    INSERT INTO itinerary_days (id, itinerary_id, day_number, date) VALUES
      ('${D_T}', '${I_T}', 1, '2026-01-01'), ('${D_A}', '${I_A}', 1, '2026-01-01');
    INSERT INTO itinerary_services (id, itinerary_day_id, service_type, service_name, supplier_id) VALUES
      ('${SV_T}', '${D_T}', 'guide', 'Guide day', '${S_BOTH}'),
      ('${SV_A}', '${D_A}', 'guide', 'Guide day', '${S_A}');
    INSERT INTO bookings (id, booking_code, itinerary_id, client_name, trip_name, start_date, end_date, org_id) VALUES
      ('${B_T}', 'B-T', '${I_T}', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', '${ORG_T}'),
      ('${B_A}', 'B-A', '${I_A}', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', '${ORG_A}');
    INSERT INTO booking_supplier_status (id, booking_id, supplier_type, supplier_name, supplier_id) VALUES
      ('${BSS_T}', '${B_T}', 'guide', 'Shared guide', '${S_BOTH}');
    INSERT INTO itinerary_resources (id, itinerary_id, resource_type, resource_id, start_date) VALUES
      ('${RES_A}', '${I_A}', 'guide', '${S_BOTH}', '2026-01-01');
    INSERT INTO expenses (id, category, amount, expense_date, org_id, supplier_id) VALUES
      ('${E_T}', 'accommodation', 10, '2026-01-01', '${ORG_T}', '${S_T}'),
      ('${E_A}', 'guide', 10, '2026-01-01', '${ORG_A}', '${S_BOTH}'),
      ('${E_TIE_T}', 'transport', 10, '2026-01-01', '${ORG_T}', '${S_TIE}'),
      ('${E_TIE_A}', 'transport', 10, '2026-01-01', '${ORG_A}', '${S_TIE}');
    INSERT INTO supplier_invoices (id, supplier_invoice_number, supplier_name, invoice_date, amount, org_id, supplier_id) VALUES
      ('${INV_A}', 'INV-1', 'Shared guide', '2026-01-01', 10, '${ORG_A}', '${S_BOTH}');

    INSERT INTO guide_rates (id, service_code, guide_language, guide_type, base_rate_eur, base_rate_non_eur, supplier_id) VALUES
      ('${R_BOTH}', 'G-BOTH', 'english', 'standard', 1, 1, '${S_BOTH}'),
      ('${R_T}', 'G-T', 'english', 'standard', 1, 1, '${S_RATE_T}'),
      ('${R_BU}', 'G-BU', 'english', 'standard', 1, 1, '${S_RATE_BOTHUSER}');
    -- Who created the rates. The ATS UPDATE is the kind of row the EUR→USD
    -- cut-over wrote: not a creator, ignored.
    INSERT INTO rate_audit_log (table_name, record_id, action, changed_by) VALUES
      ('guide_rates', '${R_T}', 'INSERT', '${T_ONLY}'),
      ('guide_rates', '${R_T}', 'UPDATE', '${A_ONLY}'),
      ('guide_rates', '${R_BU}', 'INSERT', '${BOTH}');
  `)
  await db.exec(sql)
  await db.exec(sql) // idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers, supplier_properties, guides, airport_staff, hotel_staff TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE suppliers_code_seq TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('backfill', () => {
  it('a supplier one company uses is that company’s', async () => {
    expect(await orgOf('suppliers', S_T)).toBe(ORG_T)
    expect(await orgOf('suppliers', S_A)).toBe(ORG_A)
    expect(await reviewed(S_T)).toEqual([])
  })

  it('nobody uses it: whoever created its rates (INSERTs only)', async () => {
    expect(await orgOf('suppliers', S_RATE_T)).toBe(ORG_T)
    expect(await reviewed(S_RATE_T)).toEqual([])
  })

  it('untraceable (or traced only through a person in both companies): ATS, listed', async () => {
    for (const s of [S_NONE, S_RATE_BOTHUSER, S_HSTAFF]) {
      expect(await orgOf('suppliers', s)).toBe(ORG_A)
      expect(await reviewed(s)).toEqual([
        { reason: 'no trip, booking, expense, bill, document or rate creator traces it — catalogue default', assigned_org: ORG_A },
      ])
    }
    expect(await orgOf('supplier_properties', P_NONE)).toBe(ORG_A)
  })
})

describe('a supplier both companies use', () => {
  it('ends as two rows: the original with the company that uses it most, a copy for the other', async () => {
    // ATS: trip assignment, resource, expense, bill (4); Travel2Egypt: service, booking status (2).
    expect(await orgOf('suppliers', S_BOTH)).toBe(ORG_A)
    const copy = await copyOf(S_BOTH, ORG_T)
    expect(copy).toBeTruthy()
    expect(copy).not.toBe(S_BOTH)
    expect(await one(`SELECT org_id, name, type, types, supplier_code FROM suppliers WHERE id = '${copy}'`))
      .toEqual({ org_id: ORG_T, name: 'Shared guide', type: 'guide', types: ['guide'], supplier_code: 'SUP-0003' })
    for (const r of [S_BOTH, copy]) {
      expect((await reviewed(r)).map(x => x.reason)).toEqual(['used by both companies — copied'])
    }
    expect((await rows(`SELECT id FROM suppliers WHERE name = 'Shared guide'`)).length).toBe(2)
  })

  it("each company's trips, bookings, expenses and bills point at its own", async () => {
    const copy = await copyOf(S_BOTH, ORG_T)
    expect((await one(`SELECT supplier_id FROM itinerary_services WHERE id = '${SV_T}'`)).supplier_id).toBe(copy)
    expect((await one(`SELECT supplier_id FROM booking_supplier_status WHERE id = '${BSS_T}'`)).supplier_id).toBe(copy)
    expect((await one(`SELECT assigned_guide_id FROM itineraries WHERE id = '${I_A}'`)).assigned_guide_id).toBe(S_BOTH)
    expect((await one(`SELECT resource_id FROM itinerary_resources WHERE id = '${RES_A}'`)).resource_id).toBe(S_BOTH)
    expect((await one(`SELECT supplier_id FROM expenses WHERE id = '${E_A}'`)).supplier_id).toBe(S_BOTH)
    expect((await one(`SELECT supplier_id FROM supplier_invoices WHERE id = '${INV_A}'`)).supplier_id).toBe(S_BOTH)
  })

  it('a tie goes to ATS; Travel2Egypt’s expense points at its copy', async () => {
    expect(await orgOf('suppliers', S_TIE)).toBe(ORG_A)
    const copy = await copyOf(S_TIE, ORG_T)
    expect(copy).toBeTruthy()
    expect((await one(`SELECT supplier_id FROM expenses WHERE id = '${E_TIE_T}'`)).supplier_id).toBe(copy)
    expect((await one(`SELECT supplier_id FROM expenses WHERE id = '${E_TIE_A}'`)).supplier_id).toBe(S_TIE)
  })

  it('its properties are copied too, and the property map is filled', async () => {
    const copy = await copyOf(S_BOTH, ORG_T)
    expect(await orgOf('supplier_properties', P_BOTH)).toBe(ORG_A)
    const m = await one(`SELECT copy_id FROM org_backfill_property_copies WHERE original_id = '${P_BOTH}' AND org_id = '${ORG_T}'`)
    expect(m?.copy_id).toBeTruthy()
    expect(await one(`SELECT supplier_id, org_id, name FROM supplier_properties WHERE id = '${m.copy_id}'`))
      .toEqual({ supplier_id: copy, org_id: ORG_T, name: 'Shared lodge' })
  })

  it('rates are left on the original for the rate migration (20261206) to move', async () => {
    expect((await one(`SELECT supplier_id FROM guide_rates WHERE id = '${R_BOTH}'`)).supplier_id).toBe(S_BOTH)
    expect((await rows(`SELECT * FROM org_backfill_supplier_copies`)).length).toBe(2)
  })

  it('a second run makes no second copy', async () => {
    await db.exec(sql)
    expect((await rows(`SELECT id FROM suppliers WHERE name = 'Shared guide'`)).length).toBe(2)
    expect((await rows(`SELECT * FROM org_backfill_property_copies`)).length).toBe(1)
  })
})

describe('schema', () => {
  it('org_id is NOT NULL on suppliers and supplier_properties', async () => {
    const r = await rows(`SELECT table_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'org_id' AND table_name IN ('suppliers','supplier_properties') ORDER BY 1`)
    expect(r).toEqual([{ table_name: 'supplier_properties', is_nullable: 'NO' }, { table_name: 'suppliers', is_nullable: 'NO' }])
  })

  it('supplier codes are unique per company: both can hold SUP-0001, one company cannot hold it twice', async () => {
    await db.exec(`BEGIN; INSERT INTO suppliers (name, type, types, supplier_code, org_id) VALUES ('A own', 'hotel', '{hotel}', 'SUP-0001', '${ORG_A}'); ROLLBACK;`)
    await expect(db.exec(`INSERT INTO suppliers (name, type, types, supplier_code, org_id) VALUES ('T again', 'hotel', '{hotel}', 'SUP-0001', '${ORG_T}')`)).rejects.toThrow()
    await db.exec('ROLLBACK').catch(() => {})
  })

  it('a minted code is free in the new row’s company', async () => {
    await db.exec('BEGIN')
    try {
      await db.exec(`INSERT INTO suppliers (name, type, types, org_id) VALUES ('Minted', 'hotel', '{hotel}', '${ORG_T}')`)
      const { supplier_code } = await one(`SELECT supplier_code FROM suppliers WHERE name = 'Minted'`)
      expect(supplier_code).toMatch(/^SUP-\d{4,}$/)
      expect((await rows(`SELECT 1 FROM suppliers WHERE org_id = '${ORG_T}' AND supplier_code = '${supplier_code}'`)).length).toBe(1)
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('a property is always in its supplier’s company, whatever the caller sends', async () => {
    await db.exec('BEGIN')
    try {
      await db.exec(`INSERT INTO supplier_properties (supplier_id, property_type, name, org_id) VALUES ('${S_T}', 'hotel', 'Annex', '${ORG_A}')`)
      expect((await one(`SELECT org_id FROM supplier_properties WHERE name = 'Annex'`)).org_id).toBe(ORG_T)
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('the copy maps are service-role only', async () => {
    await expect(as(A_ONLY, 'SELECT * FROM org_backfill_supplier_copies')).rejects.toThrow()
    await expect(as(A_ONLY, 'SELECT * FROM org_backfill_property_copies')).rejects.toThrow()
  })

  it('no policy on suppliers or supplier_properties is left without an org condition', async () => {
    const { rows: ps } = await db.query(`SELECT tablename, policyname, roles::text AS roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('suppliers','supplier_properties')`)
    expect(ps.length).toBe(8)
    for (const p of ps) expect(p.expr, `${p.tablename}.${p.policyname}`).toContain('user_is_in_org')
  })
})

describe('views', () => {
  it('guides, airport_staff and hotel_staff expose org_id', async () => {
    for (const v of ['guides', 'airport_staff', 'hotel_staff']) {
      expect((await rows(`SELECT 1 FROM information_schema.columns WHERE table_name = '${v}' AND column_name = 'org_id'`)).length, v).toBe(1)
    }
    expect((await one(`SELECT org_id FROM guides WHERE id = '${S_A}'`)).org_id).toBe(ORG_A)
    expect((await one(`SELECT org_id FROM hotel_staff WHERE id = '${S_HSTAFF}'`)).org_id).toBe(ORG_A)
  })

  it('an insert through each view stamps the company given; an update never moves it', async () => {
    await db.exec('BEGIN')
    try {
      const g = await one(`INSERT INTO guides (name, phone, org_id) VALUES ('New guide', '+20', '${ORG_T}') RETURNING id`)
      const a = await one(`INSERT INTO airport_staff (name, airport_location, phone, org_id) VALUES ('Meet', 'CAI', '+20', '${ORG_T}') RETURNING id`)
      const h = await one(`INSERT INTO hotel_staff (name, phone, org_id) VALUES ('Desk', '+20', '${ORG_T}') RETURNING id`)
      for (const r of [g, a, h]) expect(await orgOf('suppliers', r.id)).toBe(ORG_T)
      expect(await one(`SELECT type, types FROM suppliers WHERE id = '${h.id}'`)).toEqual({ type: 'hotel_assistant', types: ['hotel_assistant'] })
      await db.exec(`UPDATE hotel_staff SET name = 'Desk 2', org_id = '${ORG_A}' WHERE id = '${h.id}'`)
      await db.exec(`UPDATE guides SET name = 'Guide 2', org_id = '${ORG_A}' WHERE id = '${g.id}'`)
      expect(await one(`SELECT name, org_id FROM suppliers WHERE id = '${h.id}'`)).toEqual({ name: 'Desk 2', org_id: ORG_T })
      expect(await one(`SELECT name, org_id FROM suppliers WHERE id = '${g.id}'`)).toEqual({ name: 'Guide 2', org_id: ORG_T })
      await db.exec(`DELETE FROM hotel_staff WHERE id = '${h.id}'`)
      expect(await one(`SELECT id FROM suppliers WHERE id = '${h.id}'`)).toBeUndefined()
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('an insert through a view without a company is refused', async () => {
    await expect(db.exec(`INSERT INTO guides (name, phone) VALUES ('Nobody', '+20')`)).rejects.toThrow()
    await db.exec('ROLLBACK').catch(() => {})
  })
})

describe('RLS: each company sees and changes only its own suppliers', () => {
  it('each reads only its own suppliers, properties and staff views', async () => {
    for (const t of ['suppliers', 'supplier_properties', 'guides']) {
      expect(await orgsSeen(A_ONLY, t), t).toEqual([ORG_A])
      expect(await orgsSeen(T_ONLY, t), t).toEqual([ORG_T])
    }
    expect(await orgsSeen(A_AGENT, 'suppliers')).toEqual([ORG_A])
  })

  it("ATS cannot edit, delete or create Travel2Egypt's suppliers", async () => {
    expect((await as(A_ONLY, `UPDATE suppliers SET name = 'x' WHERE id = '${S_T}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `DELETE FROM suppliers WHERE id = '${S_T}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `UPDATE guides SET name = 'x' WHERE id = '${S_RATE_T}'`)).affected).toBe(0)
    await expect(as(A_ONLY, `INSERT INTO suppliers (name, type, types, org_id) VALUES ('x', 'hotel', '{hotel}', '${ORG_T}')`)).rejects.toThrow()
    await expect(as(A_ONLY, `INSERT INTO supplier_properties (supplier_id, property_type, name) VALUES ('${S_T}', 'hotel', 'x')`)).rejects.toThrow()
    // Its own still work.
    expect((await as(A_ONLY, `UPDATE suppliers SET name = 'x' WHERE id = '${S_A}'`)).affected).toBe(1)
  })

  it('an agent reads but does not write', async () => {
    expect((await as(A_AGENT, `UPDATE suppliers SET name = 'x' WHERE id = '${S_A}'`)).affected).toBe(0)
    await expect(as(A_AGENT, `INSERT INTO suppliers (name, type, types, org_id) VALUES ('x', 'hotel', '{hotel}', '${ORG_A}')`)).rejects.toThrow()
  })
})
