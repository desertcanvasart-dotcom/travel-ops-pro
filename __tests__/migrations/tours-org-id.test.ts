// Migration 20261207, executed against a real Postgres with RLS enforced.
//
// No tour table had an org_id: every programme, variation and legacy tour was
// both companies'. Rows of every backfill kind are seeded BEFORE the
// migration runs (every migration before it replayed first — the rate tables
// already carry org_id from 20261206), then it is applied twice. Each
// template must land in its company (trips, departures, quotes, partner
// prices, web orders → ATS signals → catalogue default, listed); a template
// both companies use must become two, each company's itineraries, departures,
// quotes and partner prices on its own; codes must be unique per company; a
// tour's rate references must be its own company's; children with no parent
// are saved and deleted; and through PostgREST (auth.uid() from a setting)
// each company must see and change only its own, with nothing for anon.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261207_tours_org_id.sql'
const ORG_T = '90000000-0000-4000-8000-000000000001' // Travel2Egypt (older)
const ORG_A = '90000000-0000-4000-8000-000000000002' // ATS
const T_MGR = '91000000-0000-4000-8000-000000000001'
const A_MGR = '91000000-0000-4000-8000-000000000002'
const A_AGENT = '91000000-0000-4000-8000-000000000003'

const id = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TT_BOTH = id(1), TT_T = id(2), TT_WEB = id(3), TT_URL = id(4), TT_CODE = id(5), TT_HOTELS = id(6), TT_NONE = id(7)
const V_BOTH = id(11), V_T = id(12), V_LONE = id(13), V_NONE = id(14)
const I_T = id(21), I_A = id(22)
const DEP_T = id(31), Q_T = id(32), Q_A = id(33), PARTNER_T = id(34), PP_T = id(35), REV_T = id(36)
const H_A = id(41), H_T = id(42), G_T = id(43), M_A = id(44)
const SVC_RATE = id(51), SVC_OTHER = id(52)
const TOUR = id(61), DAY = id(62), DAY_ORPHAN = id(63), PRICE_ORPHAN = id(64), VP_ORPHAN = id(65), VDI = id(66)

type Db = { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
let db: Db
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const rows = async (q: string) => (await db.query(q)).rows
const one = async (q: string) => (await rows(q))[0]
const orgOf = async (table: string, rowId: string) => (await one(`SELECT org_id FROM ${table} WHERE id = '${rowId}'`))?.org_id
const reviewed = async (table: string, rowId: string) =>
  (await rows(`SELECT reason, assigned_org FROM org_backfill_review WHERE table_name = '${table}' AND row_id = '${rowId}' ORDER BY reason`))
const copyOf = async (table: string, original: string, org: string) =>
  (await one(`SELECT copy_id FROM org_backfill_tour_copies WHERE table_name = '${table}' AND original_id = '${original}' AND org_id = '${org}'`))?.copy_id

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
const orgsSeen = async (uid: string, table: string) =>
  [...new Set((await as<{ o: string }>(uid, `SELECT org_id AS o FROM ${table}`)).rows.map(r => r.o))].sort()

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    // The schema as it stood just before this migration: later ones (the next
    // batches) change what this test's fixtures assume.
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at, slug) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01', 'travel2egypt'), ('${ORG_A}', 'ATS', '2026-06-01', 'ats');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_MGR}', 'ops@travel2egypt.org'), ('${A_MGR}', 'tours@ats-hj.com'), ('${A_AGENT}', 'agent@ats-hj.com')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_MGR}', 'ops@travel2egypt.org', 'manager', true), ('${A_MGR}', 'tours@ats-hj.com', 'manager', true),
      ('${A_AGENT}', 'agent@ats-hj.com', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_MGR}', '${A_MGR}', '${A_AGENT}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_MGR}', 'manager'), ('${ORG_A}', '${A_MGR}', 'manager'), ('${ORG_A}', '${A_AGENT}', 'agent');

    -- Rates (20261206 has run): a hotel of ATS's with a copy made for T2E, a
    -- meal of ATS's with none, a guide of T2E's with none.
    INSERT INTO accommodation_rates (id, org_id, service_code, property_name, property_type) VALUES
      ('${H_A}', '${ORG_A}', 'HTL-NILE', 'Nile Hotel', 'hotel'), ('${H_T}', '${ORG_T}', 'HTL-NILE', 'Nile Hotel', 'hotel');
    INSERT INTO org_backfill_rate_copies (table_name, original_id, copy_id, org_id) VALUES ('accommodation_rates', '${H_A}', '${H_T}', '${ORG_T}');
    INSERT INTO meal_rates (id, org_id, service_code, restaurant_name, meal_type, base_rate_eur, base_rate_non_eur)
      VALUES ('${M_A}', '${ORG_A}', 'MEAL-1', 'Lunch place', 'lunch', 10, 10);
    INSERT INTO guide_rates (id, org_id, service_code, guide_language, guide_type, base_rate_eur, base_rate_non_eur, tour_duration)
      VALUES ('${G_T}', '${ORG_T}', 'GDE-EN', 'english', 'egyptologist', 50, 50, 'full_day');

    INSERT INTO tour_templates (id, template_code, template_name, tour_type, duration_days, website_url, hotels) VALUES
      ('${TT_BOTH}', 'CAI-3D', 'Cairo 3 days', 'multi_day', 3, null, '[]'),
      ('${TT_T}', 'T2E-ONLY', 'Alexandria day', 'day_tour', 1, null, '[]'),
      ('${TT_WEB}', 'WEB-1', 'Web programme', 'multi_day', 5, null, '[]'),
      ('${TT_URL}', 'X-URL', 'ATS site programme', 'multi_day', 8, 'https://tour.ats-hj.com/opt_detail.php?id=67', '[]'),
      ('${TT_CODE}', 'NEK805-CR', 'Narita cruise', 'multi_day', 8, null, '[]'),
      ('${TT_HOTELS}', 'X-HOTELS', 'Hotel list', 'multi_day', 8, null, '[{"city":"Cairo","name":"Nile Hotel"}]'),
      ('${TT_NONE}', 'LONELY', 'Nobody', 'day_tour', 1, null, '[]');
    INSERT INTO tour_template_versions (template_id, language, template_name) VALUES ('${TT_BOTH}', 'ja', 'カイロ3日間');
    INSERT INTO tour_day_activities (template_id, day_number, activity_type, activity_name) VALUES ('${TT_BOTH}', 1, 'attraction', 'Pyramids');
    INSERT INTO tour_variations (id, template_id, variation_code, variation_name, tier, group_type, inclusions, exclusions) VALUES
      ('${V_BOTH}', '${TT_BOTH}', 'CAI-3D-STANDARD', 'Standard', 'standard', 'private', '{}', '{}'),
      ('${V_T}', '${TT_T}', 'T2E-ONLY-STANDARD', 'Standard', 'standard', 'private', '{}', '{}'),
      ('${V_LONE}', null, 'LONE-STANDARD', 'Standalone', 'standard', 'private', '{}', '{}'),
      ('${V_NONE}', null, 'NONE-STANDARD', 'Forgotten', 'standard', 'private', '{}', '{}');
    INSERT INTO tour_variation_versions (variation_id, language, variation_name) VALUES ('${V_BOTH}', 'ja', 'スタンダード');
    INSERT INTO tour_variation_services (id, variation_id, service_name, service_category, rate_type, rate_id) VALUES
      ('${SVC_RATE}', '${V_BOTH}', 'Nile Hotel', 'accommodation', 'accommodation', '${H_A}'),
      ('${SVC_OTHER}', '${V_BOTH}', 'Lunch', 'meal', 'meal', '${M_A}');
    INSERT INTO variation_daily_itinerary (id, variation_id, day_number, day_title) VALUES ('${VDI}', '${V_BOTH}', 1, 'Arrival');
    INSERT INTO variation_pricing (variation_id, min_pax, max_pax, price_per_person) VALUES ('${V_BOTH}', 2, 2, 500);
    INSERT INTO variation_services (variation_id, service_category, service_name, quantity_type, cost_per_unit)
      VALUES ('${V_BOTH}', 'guide', 'Guide', 'per_day', 50);

    -- Orphans.
    INSERT INTO variation_pricing (id, variation_id, min_pax, max_pax, price_per_person) VALUES ('${VP_ORPHAN}', null, 1, 1, 1);

    -- Who uses what. TT_BOTH: an ATS trip, and T2E's departure, quote and
    -- partner price (through its variation).
    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id, template_id) VALUES
      ('${I_T}', 'I-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}', '${TT_T}'),
      ('${I_A}', 'I-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}', '${TT_BOTH}');
    INSERT INTO tour_departures (id, org_id, template_id, variation_id, tour_name, tour_code, start_date, end_date) VALUES
      ('${DEP_T}', '${ORG_T}', '${TT_BOTH}', '${V_BOTH}', 'Cairo 3 days', 'CAI-3D', '2026-03-01', '2026-03-03'),
      (gen_random_uuid(), '${ORG_T}', null, '${V_LONE}', 'Standalone', null, '2026-04-01', '2026-04-01');
    INSERT INTO tour_quotes (id, quote_number, org_id, variation_id) VALUES
      ('${Q_T}', 'Q-T-1', '${ORG_T}', '${V_BOTH}'), ('${Q_A}', 'Q-A-1', '${ORG_A}', '${V_BOTH}');
    INSERT INTO quote_revisions (id, quote_type, quote_id, version_number, quote_data)
      VALUES ('${REV_T}', 'b2b', '${Q_T}', 1, '{"variation_id":"${V_BOTH}","client_name":"Taro"}');
    INSERT INTO b2b_partners (id, partner_code, company_name, org_id) VALUES ('${PARTNER_T}', 'P-T', 'Agent T', '${ORG_T}');
    INSERT INTO b2b_partner_pricing (id, partner_id, variation_id) VALUES ('${PP_T}', '${PARTNER_T}', '${V_BOTH}');
    INSERT INTO web_order_intakes (org_id, outcome, order_text, tour_code) VALUES ('${ORG_T}', 'needs_attention', 'order', 'web-1');

    -- The legacy builder: a tour (ATS by default) whose day names T2E's copy
    -- of the hotel and T2E's guide (no copy); an orphan day and price.
    INSERT INTO tours (id, tour_code, tour_name, duration_days, cities) VALUES ('${TOUR}', 'LEG-1', 'Legacy', 1, '{Cairo}');
    INSERT INTO tour_days (id, tour_id, day_number, city, accommodation_id, guide_id) VALUES
      ('${DAY}', '${TOUR}', 1, 'Cairo', '${H_T}', '${G_T}'),
      ('${DAY_ORPHAN}', null, 1, 'Luxor', null, null);
    INSERT INTO tour_pricing (id, tour_id, pax, is_euro_passport) VALUES ('${PRICE_ORPHAN}', null, 2, true);
  `)
  await db.exec(sql)
  await db.exec(sql) // idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tour_templates, tour_variations, tour_template_versions,
      tour_variation_services, tours, tour_days TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('templates: the standard order', () => {
  it('used by one company → that company (a trip; a web order by code, case-blind)', async () => {
    expect(await orgOf('tour_templates', TT_T)).toBe(ORG_T)
    expect(await orgOf('tour_templates', TT_WEB)).toBe(ORG_T)
    expect(await reviewed('tour_templates', TT_T)).toEqual([])
  })
  it('nothing uses it but it is plainly ATS’s: its website page, its programme code, its hotel list', async () => {
    for (const t of [TT_URL, TT_CODE, TT_HOTELS]) {
      expect(await orgOf('tour_templates', t)).toBe(ORG_A)
      expect(await reviewed('tour_templates', t)).toEqual([])
    }
  })
  it('nothing traces it: the catalogue default (ATS), listed', async () => {
    expect(await orgOf('tour_templates', TT_NONE)).toBe(ORG_A)
    expect(await reviewed('tour_templates', TT_NONE)).toEqual([
      { reason: 'no trip, departure, quote or web order — catalogue default', assigned_org: ORG_A },
    ])
  })
  it('variations follow their template; a template-less one its users, else the default (listed)', async () => {
    expect(await orgOf('tour_variations', V_T)).toBe(ORG_T)
    expect(await orgOf('tour_variations', V_LONE)).toBe(ORG_T)
    expect(await orgOf('tour_variations', V_NONE)).toBe(ORG_A)
    expect((await reviewed('tour_variations', V_NONE)).map(r => r.reason))
      .toEqual(['no template, quote, departure or partner price — catalogue default'])
  })
  it('legacy tours: the catalogue default, every one listed', async () => {
    expect(await orgOf('tours', TOUR)).toBe(ORG_A)
    expect((await reviewed('tours', TOUR)).map(r => r.reason)).toEqual(['legacy tour — catalogue default'])
  })
})

describe('a template both companies use becomes two', () => {
  it('the original stays with ATS; T2E gets a copy — same code, its versions, activities and variations', async () => {
    expect(await orgOf('tour_templates', TT_BOTH)).toBe(ORG_A)
    const copy = await copyOf('tour_templates', TT_BOTH, ORG_T)
    expect(copy).toBeTruthy()
    expect(await one(`SELECT org_id, template_code, template_name FROM tour_templates WHERE id = '${copy}'`))
      .toEqual({ org_id: ORG_T, template_code: 'CAI-3D', template_name: 'Cairo 3 days' })
    expect(await rows(`SELECT language, template_name FROM tour_template_versions WHERE template_id = '${copy}'`))
      .toEqual([{ language: 'ja', template_name: 'カイロ3日間' }])
    expect((await rows(`SELECT activity_name FROM tour_day_activities WHERE template_id = '${copy}'`)).map(r => r.activity_name))
      .toEqual(['Pyramids'])
    expect((await reviewed('tour_templates', TT_BOTH)).map(r => r.reason))
      .toEqual(['used by another company — copied', 'used by both companies — copied for the other'])
    expect((await reviewed('tour_templates', copy)).map(r => r.reason)).toEqual(['used by another company — copied'])
    // Applied twice, still one copy.
    expect((await rows(`SELECT 1 FROM tour_templates WHERE template_code = 'CAI-3D'`)).length).toBe(2)
  })

  it('its variation is copied with versions, services, daily itinerary, pricing and costed services', async () => {
    const tCopy = await copyOf('tour_templates', TT_BOTH, ORG_T)
    const vCopy = await copyOf('tour_variations', V_BOTH, ORG_T)
    expect(await one(`SELECT org_id, template_id, variation_code FROM tour_variations WHERE id = '${vCopy}'`))
      .toEqual({ org_id: ORG_T, template_id: tCopy, variation_code: 'CAI-3D-STANDARD' })
    expect(await orgOf('tour_variations', V_BOTH)).toBe(ORG_A)
    for (const child of ['tour_variation_versions', 'variation_daily_itinerary', 'variation_pricing', 'variation_services']) {
      expect((await rows(`SELECT 1 FROM ${child} WHERE variation_id = '${vCopy}'`)).length, child).toBe(1)
      expect((await rows(`SELECT 1 FROM ${child} WHERE variation_id = '${V_BOTH}'`)).length, child).toBe(1)
    }
    expect((await rows(`SELECT 1 FROM tour_variation_services WHERE variation_id = '${vCopy}'`)).length).toBe(2)
  })

  it("each company's trips, departures, quotes (and their revisions) and partner prices point at its own", async () => {
    const tCopy = await copyOf('tour_templates', TT_BOTH, ORG_T)
    const vCopy = await copyOf('tour_variations', V_BOTH, ORG_T)
    expect((await one(`SELECT template_id FROM itineraries WHERE id = '${I_A}'`)).template_id).toBe(TT_BOTH)
    expect(await one(`SELECT template_id, variation_id FROM tour_departures WHERE id = '${DEP_T}'`))
      .toEqual({ template_id: tCopy, variation_id: vCopy })
    expect((await one(`SELECT variation_id FROM tour_quotes WHERE id = '${Q_T}'`)).variation_id).toBe(vCopy)
    expect((await one(`SELECT variation_id FROM tour_quotes WHERE id = '${Q_A}'`)).variation_id).toBe(V_BOTH)
    expect((await one(`SELECT quote_data->>'variation_id' AS v FROM quote_revisions WHERE id = '${REV_T}'`)).v).toBe(vCopy)
    expect((await one(`SELECT variation_id FROM b2b_partner_pricing WHERE id = '${PP_T}'`)).variation_id).toBe(vCopy)
  })
})

describe("a tour's rates are its own company's", () => {
  it("a variation service names its company's copy of the rate; one with no copy is left and listed", async () => {
    const vCopy = await copyOf('tour_variations', V_BOTH, ORG_T)
    expect((await one(`SELECT rate_id FROM tour_variation_services WHERE id = '${SVC_RATE}'`)).rate_id).toBe(H_A)
    expect((await one(`SELECT rate_id FROM tour_variation_services WHERE variation_id = '${vCopy}' AND service_name = 'Nile Hotel'`)).rate_id).toBe(H_T)
    const lunch = await one(`SELECT id, rate_id FROM tour_variation_services WHERE variation_id = '${vCopy}' AND service_name = 'Lunch'`)
    expect(lunch.rate_id).toBe(M_A)
    expect((await reviewed('tour_variation_services', lunch.id)).map(r => r.reason)).toEqual(['rate belongs to another company'])
    expect(await reviewed('tour_variation_services', SVC_RATE)).toEqual([])
  })
  it("a legacy tour day: the other company's copy → the tour company's original; no copy → listed", async () => {
    const day = await one(`SELECT accommodation_id, guide_id FROM tour_days WHERE id = '${DAY}'`)
    expect(day).toEqual({ accommodation_id: H_A, guide_id: G_T })
    expect((await reviewed('tour_days', DAY)).map(r => r.reason)).toEqual(['rate belongs to another company'])
  })
})

describe('orphans and NOT NULL', () => {
  it('children with no parent are saved, listed and deleted; their parent column is NOT NULL', async () => {
    for (const [table, rowId] of [['tour_days', DAY_ORPHAN], ['tour_pricing', PRICE_ORPHAN], ['variation_pricing', VP_ORPHAN]]) {
      expect((await rows(`SELECT 1 FROM ${table} WHERE id = '${rowId}'`)).length).toBe(0)
      expect((await one(`SELECT row_data->>'id' AS id FROM org_backfill_tour_orphans WHERE table_name = '${table}' AND row_id = '${rowId}'`)).id).toBe(rowId)
      expect((await reviewed(table, rowId)).map(r => r.reason)).toEqual(['no parent — deleted'])
    }
    expect((await rows(`SELECT 1 FROM variation_daily_itinerary WHERE id = '${VDI}'`)).length).toBe(1)
    const notNull = await rows(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
      AND is_nullable = 'NO' AND ((column_name = 'org_id' AND table_name IN ('tour_templates', 'tour_variations', 'tours'))
        OR (column_name = 'tour_id' AND table_name IN ('tour_days', 'tour_pricing'))
        OR (column_name = 'variation_id' AND table_name IN ('variation_daily_itinerary', 'variation_pricing', 'variation_services')))`)
    expect(notNull.length).toBe(8)
  })
})

describe('codes are unique per company', () => {
  it('both companies can hold the same template, variation and tour code; one company cannot hold it twice', async () => {
    await db.exec(`INSERT INTO tour_templates (org_id, template_code, template_name, tour_type, duration_days)
      VALUES ('${ORG_T}', 'LONELY', 'T2E lonely', 'day_tour', 1)`)
    await expect(db.exec(`INSERT INTO tour_templates (org_id, template_code, template_name, tour_type, duration_days)
      VALUES ('${ORG_A}', 'LONELY', 'dup', 'day_tour', 1)`)).rejects.toThrow(/tour_templates_org_id_template_code_key/)
    await db.exec(`INSERT INTO tour_variations (org_id, variation_code, variation_name, tier, group_type, inclusions, exclusions)
      VALUES ('${ORG_T}', 'NONE-STANDARD', 'x', 'standard', 'private', '{}', '{}')`)
    await expect(db.exec(`INSERT INTO tour_variations (org_id, variation_code, variation_name, tier, group_type, inclusions, exclusions)
      VALUES ('${ORG_A}', 'NONE-STANDARD', 'x', 'standard', 'private', '{}', '{}')`)).rejects.toThrow(/tour_variations_org_id_variation_code_key/)
    await db.exec(`INSERT INTO tours (org_id, tour_code, tour_name, duration_days, cities) VALUES ('${ORG_T}', 'LEG-1', 'x', 1, '{}')`)
    await expect(db.exec(`INSERT INTO tours (org_id, tour_code, tour_name, duration_days, cities) VALUES ('${ORG_A}', 'LEG-1', 'x', 1, '{}')`))
      .rejects.toThrow(/tours_org_id_tour_code_key/)
    await db.exec(`DELETE FROM tour_templates WHERE org_id = '${ORG_T}' AND template_code = 'LONELY';
      DELETE FROM tour_variations WHERE org_id = '${ORG_T}' AND variation_code = 'NONE-STANDARD';
      DELETE FROM tours WHERE org_id = '${ORG_T}' AND tour_code = 'LEG-1';`)
  })
})

describe('RLS: each company sees and changes only its own', () => {
  it('templates, variations and tours: only your company’s', async () => {
    for (const table of ['tour_templates', 'tour_variations']) {
      expect(await orgsSeen(T_MGR, table)).toEqual([ORG_T])
      expect(await orgsSeen(A_MGR, table)).toEqual([ORG_A])
      expect(await orgsSeen(A_AGENT, table)).toEqual([ORG_A])
    }
    expect(await orgsSeen(T_MGR, 'tours')).toEqual([])
    expect(await orgsSeen(A_AGENT, 'tours')).toEqual([ORG_A])
  })

  it("children through their parent: T2E sees its copy's versions and services, not ATS's", async () => {
    const tCopy = await copyOf('tour_templates', TT_BOTH, ORG_T)
    const seen = (await as<{ template_id: string }>(T_MGR, 'SELECT template_id FROM tour_template_versions')).rows.map(r => r.template_id)
    expect(seen).toEqual([tCopy])
    const svc = (await as<{ id: string }>(T_MGR, `SELECT id FROM tour_variation_services WHERE id = '${SVC_RATE}'`)).rows
    expect(svc).toEqual([])
    expect((await as(T_MGR, `SELECT 1 FROM tour_days WHERE id = '${DAY}'`)).rows).toEqual([])
    expect((await as(A_AGENT, `SELECT 1 FROM tour_days WHERE id = '${DAY}'`)).rows.length).toBe(1)
  })

  it("no one changes the other company's template; an agent cannot change their own; a manager can", async () => {
    expect((await as(T_MGR, `UPDATE tour_templates SET template_name = 'x' WHERE id = '${TT_NONE}'`)).affected).toBe(0)
    expect((await as(T_MGR, `DELETE FROM tour_templates WHERE id = '${TT_NONE}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE tour_templates SET template_name = 'x' WHERE id = '${TT_NONE}'`)).affected).toBe(0)
    expect((await as(A_MGR, `UPDATE tour_templates SET template_name = 'x' WHERE id = '${TT_NONE}'`)).affected).toBe(1)
    await expect(as(T_MGR, `INSERT INTO tour_templates (org_id, template_code, template_name, tour_type, duration_days)
      VALUES ('${ORG_A}', 'SNEAK', 'x', 'day_tour', 1)`)).rejects.toThrow(/row-level security/)
    await expect(as(A_AGENT, `INSERT INTO tour_variation_services (variation_id, service_name, service_category)
      VALUES ('${V_BOTH}', 'x', 'meal')`)).rejects.toThrow(/row-level security/)
  })

  it('anon reads no variation (the old "read access for all users" is gone)', async () => {
    const r = await as(null, 'SELECT 1 FROM tour_variations').catch((e: Error) => e)
    if (r instanceof Error) expect(r.message).toMatch(/permission denied/)
    else expect(r.rows).toEqual([])
    expect((await rows(`SELECT 1 FROM pg_policies WHERE tablename = 'tour_variations' AND 'anon' = ANY(roles)`)).length).toBe(0)
  })
})

describe('themes and dead tables', () => {
  it('seed_tour_themes no longer reads tour_categories, which is gone', async () => {
    expect((await one(`SELECT to_regclass('public.tour_categories') AS t`)).t).toBeNull()
    expect((await one(`SELECT prosrc FROM pg_proc WHERE proname = 'seed_tour_themes'`)).prosrc).not.toMatch(/tour_categories/)
    const org = '90000000-0000-4000-8000-000000000009'
    await db.exec(`INSERT INTO organizations (id, name) VALUES ('${org}', 'Third')`)
    expect((await rows(`SELECT key FROM org_vocabularies WHERE org_id = '${org}' AND kind = 'tour_theme' ORDER BY rank`)).map(r => r.key))
      .toEqual(['cultural', 'adventure', 'beach', 'family', 'luxury', 'culinary'])
    await db.exec(`DELETE FROM organizations WHERE id = '${org}'`)
  })
  it('tour_templates.category_id, the dead tables and the view are dropped', async () => {
    expect((await rows(`SELECT 1 FROM information_schema.columns WHERE table_name = 'tour_templates' AND column_name = 'category_id'`)).length).toBe(0)
    for (const t of ['tour_template_defaults', 'tour_availability', 'tour_reviews', 'tour_templates_with_languages']) {
      expect((await one(`SELECT to_regclass('public.${t}') AS t`)).t, t).toBeNull()
    }
  })
  it('the copy and orphan tables are service-role only', async () => {
    for (const t of ['org_backfill_tour_copies', 'org_backfill_tour_orphans']) {
      await expect(as(A_MGR, `SELECT 1 FROM ${t}`)).rejects.toThrow(/permission denied/)
    }
  })
})
