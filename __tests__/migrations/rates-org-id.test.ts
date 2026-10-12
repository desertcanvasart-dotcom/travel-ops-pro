// Migration 20261206, executed against a real Postgres with RLS enforced.
//
// No rate table had an org_id: every hotel, guide, fee … was both companies'.
// Rows of every backfill kind are seeded BEFORE the migration runs (every
// other migration replayed first; 20261205's suppliers.org_id and its copy
// tables simulated in the seed, since this branch runs without it), then it
// is applied twice. Each rate must land in its company by the standard order
// (supplier → creator → trips → catalogue default, listed), a rate both
// companies' trips use must become two rows with each company's pins on its
// own, codes must be unique per company, and through PostgREST (auth.uid()
// from a setting) each company must see and change only its own.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261206_rates_org_id.sql'
const ORG_T = '80000000-0000-4000-8000-000000000001' // Travel2Egypt (older)
const ORG_A = '80000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '81000000-0000-4000-8000-000000000001'
const A_ONLY = '81000000-0000-4000-8000-000000000002'
const A_AGENT = '81000000-0000-4000-8000-000000000003'

const id = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const S_T = id(1), S_A = id(2), S_SHARED = id(3), S_SHARED_T = id(4)
const I_T = id(11), I_A = id(12), DAY_T = id(13), DAY_A = id(14)
const H_SUP = id(21), H_CREATOR = id(22), H_TRIP = id(23), H_BOTH = id(24), H_NONE = id(25), H_BOTH_SUP = id(26)
const G_CODE = id(31), TR_RES = id(32), E_BOTH = id(33), F_COST = id(34), DEST = id(35), CITY = id(36), ALIAS = id(37)
const V_T = id(41), V_NONE = id(42)
const L_GONE_T = id(51), L_GONE_NONE = id(52)
const PR_T = id(61)

type Db = { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
let db: Db
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const rows = async (q: string) => (await db.query(q)).rows
const one = async (q: string) => (await rows(q))[0]
const orgOf = async (table: string, rowId: string) => (await one(`SELECT org_id FROM ${table} WHERE id = '${rowId}'`))?.org_id
const reviewed = async (table: string, rowId: string) =>
  (await rows(`SELECT reason, assigned_org FROM org_backfill_review WHERE table_name = '${table}' AND row_id = '${rowId}' ORDER BY reason`))
const copyOf = async (table: string, original: string, org: string) =>
  (await one(`SELECT copy_id FROM org_backfill_rate_copies WHERE table_name = '${table}' AND original_id = '${original}' AND org_id = '${org}'`))?.copy_id

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

const pin = (slot: string, rateId: string) => `__grid:slot:${slot}|rate_id:${rateId}`

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
    INSERT INTO organizations (id, name, created_at, slug) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01', 'travel2egypt'), ('${ORG_A}', 'ATS', '2026-06-01', 'ats');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'rates@ats-hj.com'), ('${A_AGENT}', 'agent@ats-hj.com')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org', 'manager', true), ('${A_ONLY}', 'rates@ats-hj.com', 'manager', true),
      ('${A_AGENT}', 'agent@ats-hj.com', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${A_AGENT}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'manager'), ('${ORG_A}', '${A_ONLY}', 'manager'), ('${ORG_A}', '${A_AGENT}', 'agent');

    -- 20261205, simulated: suppliers carry a company; a supplier both used is
    -- copied, and the copy recorded.
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    ALTER TABLE supplier_properties ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    CREATE TABLE IF NOT EXISTS org_backfill_supplier_copies (original_id uuid, copy_id uuid, org_id uuid);
    CREATE TABLE IF NOT EXISTS org_backfill_property_copies (original_id uuid, copy_id uuid, org_id uuid);
    INSERT INTO suppliers (id, name, type, types, org_id) VALUES
      ('${S_T}', 'Cairo Hotel Co', 'hotel', '{hotel}', '${ORG_T}'), ('${S_A}', 'ATS Hotel Co', 'hotel', '{hotel}', '${ORG_A}'),
      ('${S_SHARED}', 'Nile Palace', 'hotel', '{hotel}', '${ORG_A}'), ('${S_SHARED_T}', 'Nile Palace', 'hotel', '{hotel}', '${ORG_T}');
    INSERT INTO org_backfill_supplier_copies VALUES ('${S_SHARED}', '${S_SHARED_T}', '${ORG_T}');

    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id) VALUES
      ('${I_T}', 'I-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}'),
      ('${I_A}', 'I-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}');
    INSERT INTO itinerary_days (id, itinerary_id, day_number, date) VALUES
      ('${DAY_T}', '${I_T}', 1, '2026-01-01'), ('${DAY_A}', '${I_A}', 1, '2026-01-01');

    -- Rate audit rows written while the trigger is on would carry the
    -- seeding role; the creator signal is seeded explicitly below.
    ALTER TABLE accommodation_rates DISABLE TRIGGER trg_audit_accommodation_rates;
    ALTER TABLE guide_rates DISABLE TRIGGER trg_audit_guide_rates;
    ALTER TABLE transportation_rates DISABLE TRIGGER trg_audit_transportation_rates;
    ALTER TABLE entrance_fees DISABLE TRIGGER trg_audit_entrance_fees;
    INSERT INTO accommodation_rates (id, service_code, property_name, property_type, supplier_id) VALUES
      ('${H_SUP}', 'HTL-SUP', 'Supplier hotel', 'hotel', '${S_T}'),
      ('${H_CREATOR}', 'HTL-CRE', 'Creator hotel', 'hotel', null),
      ('${H_TRIP}', 'HTL-TRIP', 'Trip hotel', 'hotel', null),
      ('${H_BOTH}', 'HTL-BOTH', 'Both hotel', 'hotel', null),
      ('${H_NONE}', 'HTL-NONE', 'Lonely hotel', 'hotel', null),
      ('${H_BOTH_SUP}', 'HTL-SHARED', 'Nile Palace', 'hotel', '${S_SHARED}');
    INSERT INTO guide_rates (id, service_code, guide_language, guide_type, base_rate_eur, base_rate_non_eur, tour_duration) VALUES
      ('${G_CODE}', 'GDE-EN', 'english', 'egyptologist', 50, 50, 'full_day');
    INSERT INTO transportation_rates (id, service_code, service_type, rate_valid_from, rate_valid_to) VALUES
      ('${TR_RES}', 'TRN-CAI', 'day_tour', '2026-01-01', '2026-12-31');
    INSERT INTO entrance_fees (id, service_code, attraction_name, city, eur_rate, non_eur_rate, rate_valid_from, rate_valid_to) VALUES
      ('${E_BOTH}', 'ENT-GIZA', 'Giza Plateau', 'Giza', 20, 20, '2026-01-01', '2026-12-31');
    INSERT INTO entrance_fee_versions (entrance_fee_id, language, attraction_name) VALUES ('${E_BOTH}', 'ja', 'ギザ');
    INSERT INTO fixed_daily_costs (id, cost_type, cost_per_person_per_day) VALUES ('${F_COST}', 'water', 1);
    INSERT INTO destinations (id, country_code, name, is_default) VALUES ('${DEST}', 'EG', 'Egypt', true);
    INSERT INTO destination_cities (id, destination_id, name) VALUES ('${CITY}', '${DEST}', 'Cairo');
    INSERT INTO attraction_aliases (id, canonical_name, alias, destination_id) VALUES ('${ALIAS}', 'Giza Plateau', 'pyramids', '${DEST}');
    INSERT INTO vehicles (id, name, vehicle_type, passenger_capacity, license_plate) VALUES
      ('${V_T}', 'Van 1', 'van', 12, 'ABC-1'), ('${V_NONE}', 'Van 2', 'van', 12, 'ABC-2');
    UPDATE itineraries SET assigned_vehicle_id = '${V_T}', destination_id = '${DEST}' WHERE id = '${I_T}';
    UPDATE itineraries SET destination_id = '${DEST}' WHERE id = '${I_A}';

    INSERT INTO itinerary_services (itinerary_day_id, service_type, service_name, notes, service_code) VALUES
      ('${DAY_T}', 'accommodation', 'Trip hotel', '${pin('accommodation', H_TRIP)}', null),
      ('${DAY_T}', 'accommodation', 'Both hotel', '${pin('accommodation', H_BOTH)}_supp', null),
      ('${DAY_A}', 'accommodation', 'Both hotel', '${pin('accommodation', H_BOTH)}', null),
      ('${DAY_T}', 'accommodation', 'Nile Palace', '${pin('accommodation', H_BOTH_SUP)}', null),
      ('${DAY_T}', 'guide', 'Guide', null, 'GDE-EN'),
      ('${DAY_T}', 'entrance', 'Giza', '${pin('entrance_fees', E_BOTH)}', null),
      ('${DAY_A}', 'entrance', 'Giza', '${pin('entrance_fees', E_BOTH)}', null);
    INSERT INTO itinerary_resources (itinerary_id, resource_type, resource_id, start_date) VALUES
      ('${I_T}', 'vehicle', '${TR_RES}', '2026-01-01'), ('${I_A}', 'vehicle', '${TR_RES}', '2026-01-01');
    INSERT INTO b2b_pricing_rules (id, org_id, rate_table, rate_id) VALUES ('${PR_T}', '${ORG_T}', 'accommodation_rates', '${H_BOTH}');

    INSERT INTO rate_audit_log (table_name, record_id, action, changed_by, changed_at) VALUES
      ('accommodation_rates', '${H_CREATOR}', 'INSERT', '${A_ONLY}', '2026-02-01'),
      ('accommodation_rates', '${H_SUP}', 'INSERT', '${A_ONLY}', '2026-02-01'),
      ('accommodation_rates', '${H_TRIP}', 'UPDATE', '${A_ONLY}', '2026-02-02');
    INSERT INTO rate_audit_log (id, table_name, record_id, action, changed_by) VALUES
      ('${L_GONE_T}', 'meal_rates', '${id(99)}', 'DELETE', '${T_ONLY}'),
      ('${L_GONE_NONE}', 'meal_rates', '${id(98)}', 'DELETE', null);
    ALTER TABLE accommodation_rates ENABLE TRIGGER trg_audit_accommodation_rates;
    ALTER TABLE guide_rates ENABLE TRIGGER trg_audit_guide_rates;
    ALTER TABLE transportation_rates ENABLE TRIGGER trg_audit_transportation_rates;
    ALTER TABLE entrance_fees ENABLE TRIGGER trg_audit_entrance_fees;
  `)
  await db.exec(sql)
  await db.exec(sql) // idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON accommodation_rates, guide_rates, entrance_fees, entrance_fee_versions,
      destinations, destination_cities, rate_audit_log, vehicles, fixed_daily_costs TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('the standard order: supplier, creator, trips, catalogue default', () => {
  it("the supplier's company wins over the creator's", async () => {
    expect(await orgOf('accommodation_rates', H_SUP)).toBe(ORG_T)
    expect(await reviewed('accommodation_rates', H_SUP)).toEqual([])
  })
  it("no supplier: the creator's company (the audit INSERT row)", async () => {
    expect(await orgOf('accommodation_rates', H_CREATOR)).toBe(ORG_A)
  })
  it("no supplier or creator: the one company whose trips use it (an UPDATE row is not a creation)", async () => {
    expect(await orgOf('accommodation_rates', H_TRIP)).toBe(ORG_T)
    expect(await orgOf('guide_rates', G_CODE)).toBe(ORG_T) // by service_code
    expect(await orgOf('vehicles', V_T)).toBe(ORG_T) // itineraries.assigned_vehicle_id
  })
  it('nothing traces it: the catalogue default (ATS), listed', async () => {
    expect(await orgOf('accommodation_rates', H_NONE)).toBe(ORG_A)
    expect(await reviewed('accommodation_rates', H_NONE)).toEqual([
      { reason: 'no supplier, creator or trip — catalogue default', assigned_org: ORG_A },
    ])
    expect(await orgOf('vehicles', V_NONE)).toBe(ORG_A)
  })
})

describe('a rate both companies use becomes two rows', () => {
  it('the original stays in the catalogue default, the copy is the other company’s — same code, new id', async () => {
    expect(await orgOf('accommodation_rates', H_BOTH)).toBe(ORG_A)
    const copy = await copyOf('accommodation_rates', H_BOTH, ORG_T)
    expect(copy).toBeTruthy()
    expect(await one(`SELECT org_id, service_code, property_name FROM accommodation_rates WHERE id = '${copy}'`))
      .toEqual({ org_id: ORG_T, service_code: 'HTL-BOTH', property_name: 'Both hotel' })
    expect((await reviewed('accommodation_rates', H_BOTH)).map(r => r.reason))
      .toEqual(['used by another company — copied', 'used by both companies — copied for the other'])
    expect((await reviewed('accommodation_rates', copy)).map(r => r.reason)).toEqual(['used by another company — copied'])
    // Applied twice, still one copy.
    expect((await rows(`SELECT 1 FROM accommodation_rates WHERE service_code = 'HTL-BOTH'`)).length).toBe(2)
  })

  it("each company's pins, assignments and pricing rules point at its own row", async () => {
    const copy = await copyOf('accommodation_rates', H_BOTH, ORG_T)
    const notes = async (day: string, like: string) =>
      (await rows(`SELECT notes FROM itinerary_services WHERE itinerary_day_id = '${day}' AND service_name = '${like}'`)).map(r => r.notes)
    expect(await notes(DAY_T, 'Both hotel')).toEqual([`${pin('accommodation', copy)}_supp`])
    expect(await notes(DAY_A, 'Both hotel')).toEqual([pin('accommodation', H_BOTH)])
    expect((await one(`SELECT rate_id FROM b2b_pricing_rules WHERE id = '${PR_T}'`)).rate_id).toBe(copy)

    const trCopy = await copyOf('transportation_rates', TR_RES, ORG_T)
    expect(await orgOf('transportation_rates', TR_RES)).toBe(ORG_A)
    expect((await one(`SELECT resource_id FROM itinerary_resources WHERE itinerary_id = '${I_T}'`)).resource_id).toBe(trCopy)
    expect((await one(`SELECT resource_id FROM itinerary_resources WHERE itinerary_id = '${I_A}'`)).resource_id).toBe(TR_RES)
  })

  it("a copied rate points at its company's copy of the supplier", async () => {
    expect(await orgOf('accommodation_rates', H_BOTH_SUP)).toBe(ORG_A)
    const copy = await copyOf('accommodation_rates', H_BOTH_SUP, ORG_T)
    expect((await one(`SELECT supplier_id FROM accommodation_rates WHERE id = '${copy}'`)).supplier_id).toBe(S_SHARED_T)
    expect((await one(`SELECT supplier_id FROM accommodation_rates WHERE id = '${H_BOTH_SUP}'`)).supplier_id).toBe(S_SHARED)
    expect((await one(`SELECT notes FROM itinerary_services WHERE service_name = 'Nile Palace'`)).notes).toBe(pin('accommodation', copy))
  })

  it("an entrance fee is copied with its language versions", async () => {
    const copy = await copyOf('entrance_fees', E_BOTH, ORG_T)
    expect(await rows(`SELECT language, attraction_name FROM entrance_fee_versions WHERE entrance_fee_id = '${copy}'`))
      .toEqual([{ language: 'ja', attraction_name: 'ギザ' }])
    expect((await rows(`SELECT 1 FROM entrance_fee_versions WHERE entrance_fee_id = '${E_BOTH}'`)).length).toBe(1)
  })
})

describe('copied for each company', () => {
  it('fixed daily costs', async () => {
    expect(await orgOf('fixed_daily_costs', F_COST)).toBe(ORG_A)
    expect((await rows(`SELECT org_id FROM fixed_daily_costs WHERE cost_type = 'water' ORDER BY org_id`)).map(r => r.org_id))
      .toEqual([ORG_T, ORG_A].sort())
  })
  it("destinations (with their cities), each company's trips on its own, aliases on their company's destination", async () => {
    const copy = await copyOf('destinations', DEST, ORG_T)
    expect(await orgOf('destinations', DEST)).toBe(ORG_A)
    expect(await one(`SELECT org_id, country_code, is_default FROM destinations WHERE id = '${copy}'`))
      .toEqual({ org_id: ORG_T, country_code: 'EG', is_default: true })
    expect((await rows(`SELECT name FROM destination_cities WHERE destination_id = '${copy}'`)).map(r => r.name)).toEqual(['Cairo'])
    expect((await one(`SELECT destination_id FROM itineraries WHERE id = '${I_T}'`)).destination_id).toBe(copy)
    expect((await one(`SELECT destination_id FROM itineraries WHERE id = '${I_A}'`)).destination_id).toBe(DEST)
    expect(await orgOf('attraction_aliases', ALIAS)).toBe(ORG_A)
    expect(await rows(`SELECT org_id, destination_id FROM attraction_aliases WHERE alias = 'pyramids' AND org_id = '${ORG_T}'`))
      .toEqual([{ org_id: ORG_T, destination_id: copy }])
  })
})

describe('rate_audit_log', () => {
  it("rows carry their rate's company; a deleted rate's, its changer's, else the default (listed)", async () => {
    expect((await one(`SELECT org_id FROM rate_audit_log WHERE record_id = '${H_CREATOR}'`)).org_id).toBe(ORG_A)
    expect((await one(`SELECT org_id FROM rate_audit_log WHERE record_id = '${H_SUP}'`)).org_id).toBe(ORG_T)
    expect(await orgOf('rate_audit_log', L_GONE_T)).toBe(ORG_T)
    expect(await orgOf('rate_audit_log', L_GONE_NONE)).toBe(ORG_A)
    expect((await reviewed('rate_audit_log', L_GONE_NONE)).map(r => r.reason)).toEqual(['rate no longer exists — catalogue default'])
  })

  it('the trigger stamps the new row with its rate’s company; the backfill wrote no audit rows', async () => {
    expect((await rows(`SELECT 1 FROM rate_audit_log WHERE record_id = '${H_NONE}'`)).length).toBe(0)
    await db.exec(`BEGIN; UPDATE accommodation_rates SET property_name = 'Renamed' WHERE id = '${H_TRIP}';`)
    expect(await rows(`SELECT action, org_id FROM rate_audit_log WHERE record_id = '${H_TRIP}' AND action = 'UPDATE' AND changed_at > now() - interval '1 minute'`))
      .toEqual([{ action: 'UPDATE', org_id: ORG_T }])
    await db.exec('ROLLBACK')
  })
})

describe('schema', () => {
  it('org_id is NOT NULL everywhere', async () => {
    const r = await rows(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'
      AND is_nullable = 'YES' AND table_name IN ('accommodation_rates','activity_rates','airport_staff_rates','hotel_staff_rates','guide_rates',
      'meal_rates','nile_cruises','flight_rates','train_rates','sleeping_train_rates','transportation_rates','tipping_rates','entrance_fees',
      'service_fees','assistant_rates','seasonal_rates','vehicle_rates','fixed_daily_costs','attraction_aliases','destinations','vehicles',
      'hotel_contacts','cruise_contacts','restaurant_contacts','rate_audit_log')`)
    expect(r).toEqual([])
  })

  it('codes are unique per company: both may use one, nobody twice', async () => {
    await expect(db.exec(`INSERT INTO accommodation_rates (service_code, property_name, property_type, org_id) VALUES ('HTL-NONE', 'x', 'hotel', '${ORG_A}')`)).rejects.toThrow()
    await db.exec(`BEGIN; INSERT INTO accommodation_rates (service_code, property_name, property_type, org_id) VALUES ('HTL-NONE', 'x', 'hotel', '${ORG_T}'); ROLLBACK;`)
    await expect(db.exec(`INSERT INTO vehicles (name, vehicle_type, passenger_capacity, license_plate, org_id) VALUES ('x', 'van', 4, 'ABC-1', '${ORG_T}')`)).rejects.toThrow()
    await db.exec(`BEGIN; INSERT INTO vehicles (name, vehicle_type, passenger_capacity, license_plate, org_id) VALUES ('x', 'van', 4, 'ABC-1', '${ORG_A}'); ROLLBACK;`)
    const keys = await rows(`SELECT conname FROM pg_constraint WHERE conname LIKE '%service_code_key' ORDER BY 1`)
    expect(keys.every(k => k.conname.includes('_org_id_'))).toBe(true)
    expect(await rows(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_flight_rates_service_code'`)).toEqual([])
  })

  it('the dead tables are gone; the exchange rates stay global', async () => {
    const r = await rows(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN
      ('meal_costs','outside_cairo_fees','seasonal_adjustments','transportation_contacts','profit_margins','discount_rules',
       'booking_rules','package_type_definitions','destinations_legacy_2025','tour_overview','exchange_rates')`)
    expect(r.map(x => x.relname)).toEqual(['exchange_rates'])
    expect(await rows(`SELECT 1 FROM information_schema.columns WHERE table_name = 'exchange_rates' AND column_name = 'org_id'`)).toEqual([])
  })

  it('no policy on these tables is left without an org condition', async () => {
    const { rows: ps } = await db.query(`SELECT tablename, policyname, roles::text AS roles, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('accommodation_rates','activity_rates','airport_staff_rates','hotel_staff_rates',
      'guide_rates','meal_rates','nile_cruises','flight_rates','train_rates','sleeping_train_rates','transportation_rates','tipping_rates',
      'entrance_fees','entrance_fee_versions','service_fees','assistant_rates','seasonal_rates','vehicle_rates','fixed_daily_costs',
      'attraction_aliases','destinations','destination_cities','vehicles','hotel_contacts','cruise_contacts','restaurant_contacts',
      'rate_audit_log','extras_catalogue','b2b_transport_packages','b2b_partner_pricing')`)
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      if (p.roles === '{service_role}') continue
      if (p.tablename === 'rate_audit_log' && p.cmd === 'INSERT') continue // WITH CHECK (false)
      expect(p.expr, `${p.tablename}.${p.policyname}`).toContain('user_is_in_org')
    }
  })
})

describe('RLS: each company sees and changes only its own', () => {
  it('reads', async () => {
    for (const t of ['accommodation_rates', 'entrance_fees', 'destinations', 'vehicles', 'fixed_daily_costs', 'rate_audit_log']) {
      expect(await orgsSeen(A_ONLY, t), t).toEqual([ORG_A])
      expect(await orgsSeen(T_ONLY, t), t).toEqual([ORG_T])
    }
    const copy = await copyOf('entrance_fees', E_BOTH, ORG_T)
    expect((await as<{ entrance_fee_id: string }>(T_ONLY, 'SELECT entrance_fee_id FROM entrance_fee_versions')).rows.map(r => r.entrance_fee_id)).toEqual([copy])
    const destCopy = await copyOf('destinations', DEST, ORG_T)
    expect((await as<{ destination_id: string }>(T_ONLY, 'SELECT destination_id FROM destination_cities')).rows.map(r => r.destination_id)).toEqual([destCopy])
  })

  it("writes: a manager only in their company, an agent not at all", async () => {
    expect((await as(A_ONLY, `UPDATE accommodation_rates SET notes = 'x' WHERE id = '${H_SUP}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `DELETE FROM accommodation_rates WHERE id = '${H_TRIP}'`)).affected).toBe(0)
    await expect(as(A_ONLY, `INSERT INTO accommodation_rates (service_code, property_name, property_type, org_id) VALUES ('X', 'x', 'hotel', '${ORG_T}')`)).rejects.toThrow()
    expect((await as(A_ONLY, `UPDATE accommodation_rates SET notes = 'x' WHERE id = '${H_NONE}'`)).affected).toBe(1)
    expect((await as(A_AGENT, `UPDATE accommodation_rates SET notes = 'x' WHERE id = '${H_NONE}'`)).affected).toBe(0)
    await expect(as(A_AGENT, `INSERT INTO accommodation_rates (service_code, property_name, property_type, org_id) VALUES ('X', 'x', 'hotel', '${ORG_A}')`)).rejects.toThrow()
  })
})
