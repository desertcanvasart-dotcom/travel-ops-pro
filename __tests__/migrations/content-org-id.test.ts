// Migration 20261208, executed against a real Postgres with RLS enforced.
//
// None of the content tables had an org_id: every content item, category,
// writing rule and prompt was both companies'. Rows of every backfill kind are
// seeded BEFORE the migration runs (every migration before it replayed first;
// 20261207's tour_templates.org_id simulated in the seed, since the tours
// batch runs in parallel), then it is applied twice. A content item lands in
// the company whose tours / itineraries use it (else its authors', else the
// catalogue default, listed); one both companies use becomes two rows with
// each company's tour days and usage log on its own; categories, writing
// rules and prompts are copied for each company; slugs and the default
// prompt are unique per company; and through PostgREST (auth.uid() from a
// setting) each company sees and changes only its own.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261208_content_org_id.sql'
const ORG_T = '90000000-0000-4000-8000-000000000001' // Travel2Egypt (older)
const ORG_A = '90000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '91000000-0000-4000-8000-000000000001'
const A_ONLY = '91000000-0000-4000-8000-000000000002'
const A_AGENT = '91000000-0000-4000-8000-000000000003'
const BOTH = '91000000-0000-4000-8000-000000000004'

const id = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CAT = id(1)
const I_T = id(11), I_A = id(12), TT_T = id(13), TT_A = id(14)
const C_TOUR_T = id(21), C_LOG_A = id(22), C_BOTH = id(23), C_AUTHOR_T = id(24), C_VAR_AUTHOR_A = id(25)
const C_BOTH_AUTHOR = id(26), C_NONE = id(27), C_DEST = id(28)
const V_BOTH_STD = id(31), V_BOTH_LUX = id(32), V_VAR_A = id(33), V_ORPHAN = id(34)
const ACT_T1 = id(41), ACT_T2 = id(42), ACT_A = id(43)
const L_A = id(51), L_BOTH_A = id(52), L_BOTH_T = id(53), L_GONE = id(54), L_NONE = id(55)
const WR_T = id(61), WR_NONE = id(62), WR_DEST = id(63)
const P_OLD = id(71), P_NEW = id(72)
const DEST = id(81), DEST_T = id(82)

type Db = { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
let db: Db
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const rows = async (q: string) => (await db.query(q)).rows
const one = async (q: string) => (await rows(q))[0]
const orgOf = async (table: string, rowId: string) => (await one(`SELECT org_id FROM ${table} WHERE id = '${rowId}'`))?.org_id
const reviewed = async (table: string, rowId: string) =>
  (await rows(`SELECT reason, assigned_org FROM org_backfill_review WHERE table_name = '${table}' AND row_id = '${rowId}' ORDER BY reason`))
const copyOf = async (table: string, original: string, org: string) =>
  (await one(`SELECT copy_id FROM org_backfill_content_copies WHERE table_name = '${table}' AND original_id = '${original}' AND org_id = '${org}'`))?.copy_id

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

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    // The schema as it stood just before this migration.
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at, slug) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01', 'travel2egypt'), ('${ORG_A}', 'ATS', '2026-06-01', 'ats');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'content@ats-hj.com'), ('${A_AGENT}', 'agent@ats-hj.com'),
      ('${BOTH}', 'both@example.com')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org', 'manager', true), ('${A_ONLY}', 'content@ats-hj.com', 'manager', true),
      ('${A_AGENT}', 'agent@ats-hj.com', 'agent', true), ('${BOTH}', 'both@example.com', 'manager', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${A_AGENT}', '${BOTH}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'manager'), ('${ORG_A}', '${A_ONLY}', 'manager'), ('${ORG_A}', '${A_AGENT}', 'agent'),
      ('${ORG_T}', '${BOTH}', 'manager'), ('${ORG_A}', '${BOTH}', 'manager');

    -- 20261207, simulated: tour templates carry a company.
    ALTER TABLE tour_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    INSERT INTO tour_templates (id, template_code, template_name, tour_type, duration_days, org_id) VALUES
      ('${TT_T}', 'T-CAI', 'Cairo (T)', 'classic', 3, '${ORG_T}'), ('${TT_A}', 'A-CAI', 'Cairo (A)', 'classic', 3, '${ORG_A}');

    -- 20261206 gave each company its own destination; the copy is recorded.
    INSERT INTO destinations (id, country_code, name, org_id) VALUES
      ('${DEST}', 'EG', 'Egypt', '${ORG_A}'), ('${DEST_T}', 'EG', 'Egypt', '${ORG_T}');
    INSERT INTO org_backfill_rate_copies (table_name, original_id, copy_id, org_id) VALUES ('destinations', '${DEST}', '${DEST_T}', '${ORG_T}');

    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id) VALUES
      ('${I_T}', 'C-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}'),
      ('${I_A}', 'C-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}');

    INSERT INTO content_categories (id, name, slug, sort_order) VALUES ('${CAT}', 'Sites', 'sites', 1);
    INSERT INTO content_library (id, category_id, name, slug, created_by, updated_by, destination_id) VALUES
      ('${C_TOUR_T}', '${CAT}', 'Citadel', 'citadel', null, null, null),
      ('${C_LOG_A}', '${CAT}', 'Khan el Khalili', 'khan', null, null, null),
      ('${C_BOTH}', '${CAT}', 'Giza Pyramids', 'giza', '${A_ONLY}', null, null),
      ('${C_AUTHOR_T}', '${CAT}', 'Coptic Cairo', 'coptic', '${T_ONLY}', null, null),
      ('${C_VAR_AUTHOR_A}', '${CAT}', 'Saqqara', 'saqqara', null, null, null),
      ('${C_BOTH_AUTHOR}', '${CAT}', 'Dahshur', 'dahshur', '${BOTH}', null, null),
      ('${C_NONE}', '${CAT}', 'Lonely site', 'lonely', null, null, null),
      ('${C_DEST}', '${CAT}', 'Egyptian Museum', 'museum', '${T_ONLY}', null, '${DEST}');
    INSERT INTO content_variations (id, content_id, tier, description, created_by) VALUES
      ('${V_BOTH_STD}', '${C_BOTH}', 'standard', 'Standard Giza', null),
      ('${V_BOTH_LUX}', '${C_BOTH}', 'luxury', 'Luxury Giza', null),
      ('${V_VAR_A}', '${C_VAR_AUTHOR_A}', 'standard', 'Saqqara', '${A_ONLY}'),
      ('${V_ORPHAN}', null, 'standard', 'Nobody''s', null);

    INSERT INTO tour_day_activities (id, template_id, day_number, content_id, activity_type, activity_name) VALUES
      ('${ACT_T1}', '${TT_T}', 1, '${C_TOUR_T}', 'attraction', 'Citadel'),
      ('${ACT_T2}', '${TT_T}', 2, '${C_BOTH}', 'attraction', 'Giza'),
      ('${ACT_A}', '${TT_A}', 1, '${C_BOTH}', 'attraction', 'Giza');
    INSERT INTO content_usage_log (id, content_id, variation_id, itinerary_id) VALUES
      ('${L_A}', '${C_LOG_A}', null, '${I_A}'),
      ('${L_BOTH_A}', '${C_BOTH}', '${V_BOTH_STD}', '${I_A}'),
      ('${L_BOTH_T}', '${C_BOTH}', '${V_BOTH_STD}', '${I_T}'),
      ('${L_GONE}', '${C_AUTHOR_T}', null, '${id(99)}'),
      ('${L_NONE}', null, null, null);

    INSERT INTO writing_rules (id, name, category, rule_type, description, created_by, destination_id) VALUES
      ('${WR_T}', 'Warm tone', 'tone', 'enforce', 'Write warmly', '${T_ONLY}', null),
      ('${WR_NONE}', 'No cliches', 'vocabulary', 'avoid', 'Avoid "breathtaking"', null, null),
      ('${WR_DEST}', 'Egypt names', 'vocabulary', 'enforce', 'Use Egyptian names', '${T_ONLY}', '${DEST}');
    INSERT INTO prompt_templates (id, name, purpose, user_prompt_template, is_default, created_by, updated_at) VALUES
      ('${P_OLD}', 'Old email', 'email', 'Hi {{name}}', true, '${A_ONLY}', '2026-01-01'),
      ('${P_NEW}', 'New email', 'email', 'Hello {{name}}', true, null, '2026-02-01');
  `)
  await db.exec(sql)
  await db.exec(sql) // idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON content_categories, content_library, content_variations, content_usage_log,
      writing_rules, prompt_templates TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('content items: tours, itineraries, authors, catalogue default', () => {
  it("the one company whose tours or itineraries use it", async () => {
    expect(await orgOf('content_library', C_TOUR_T)).toBe(ORG_T)
    expect(await orgOf('content_library', C_LOG_A)).toBe(ORG_A)
    expect(await reviewed('content_library', C_TOUR_T)).toEqual([])
  })
  it("unused: its authors' one company (the item's, else its variations')", async () => {
    expect(await orgOf('content_library', C_AUTHOR_T)).toBe(ORG_T)
    expect(await orgOf('content_library', C_VAR_AUTHOR_A)).toBe(ORG_A)
  })
  it('an author in both companies, or nothing at all: the catalogue default (ATS), listed', async () => {
    for (const c of [C_BOTH_AUTHOR, C_NONE]) {
      expect(await orgOf('content_library', c)).toBe(ORG_A)
      expect(await reviewed('content_library', c)).toEqual([
        { reason: 'no tour, itinerary or single-company author — catalogue default', assigned_org: ORG_A },
      ])
    }
  })
})

describe('an item both companies use becomes two rows', () => {
  it('the original stays with the catalogue default; the copy is the other company’s, same slug, with its variations', async () => {
    expect(await orgOf('content_library', C_BOTH)).toBe(ORG_A)
    const copy = await copyOf('content_library', C_BOTH, ORG_T)
    expect(copy).toBeTruthy()
    expect(await one(`SELECT org_id, slug, name FROM content_library WHERE id = '${copy}'`))
      .toEqual({ org_id: ORG_T, slug: 'giza', name: 'Giza Pyramids' })
    expect(await rows(`SELECT tier, description FROM content_variations WHERE content_id = '${copy}' ORDER BY tier`))
      .toEqual([{ tier: 'luxury', description: 'Luxury Giza' }, { tier: 'standard', description: 'Standard Giza' }])
    expect((await rows(`SELECT 1 FROM content_variations WHERE content_id = '${C_BOTH}'`)).length).toBe(2)
    expect((await reviewed('content_library', C_BOTH)).map(r => r.reason))
      .toEqual(['used by another company — copied', 'used by both companies — copied for the other'])
    expect((await reviewed('content_library', copy)).map(r => r.reason)).toEqual(['used by another company — copied'])
    // Applied twice, still one copy.
    expect((await rows(`SELECT 1 FROM content_library WHERE slug = 'giza'`)).length).toBe(2)
  })

  it("each company's tour day activities point at its own item", async () => {
    const copy = await copyOf('content_library', C_BOTH, ORG_T)
    expect((await one(`SELECT content_id FROM tour_day_activities WHERE id = '${ACT_T2}'`)).content_id).toBe(copy)
    expect((await one(`SELECT content_id FROM tour_day_activities WHERE id = '${ACT_A}'`)).content_id).toBe(C_BOTH)
    expect((await one(`SELECT content_id FROM tour_day_activities WHERE id = '${ACT_T1}'`)).content_id).toBe(C_TOUR_T)
  })

  it("each company's usage log points at its own item and tier variation", async () => {
    const copy = await copyOf('content_library', C_BOTH, ORG_T)
    const vCopy = await copyOf('content_variations', V_BOTH_STD, ORG_T)
    expect(await one(`SELECT content_id, variation_id, org_id FROM content_usage_log WHERE id = '${L_BOTH_T}'`))
      .toEqual({ content_id: copy, variation_id: vCopy, org_id: ORG_T })
    expect(await one(`SELECT content_id, variation_id, org_id FROM content_usage_log WHERE id = '${L_BOTH_A}'`))
      .toEqual({ content_id: C_BOTH, variation_id: V_BOTH_STD, org_id: ORG_A })
  })
})

describe('categories: each company the full set, content on its own', () => {
  it('cloned per company', async () => {
    expect(await orgOf('content_categories', CAT)).toBe(ORG_A)
    expect((await rows(`SELECT org_id FROM content_categories WHERE slug = 'sites' ORDER BY org_id`)).map(r => r.org_id))
      .toEqual([ORG_T, ORG_A].sort())
  })
  it("every item's category is its company's", async () => {
    const catT = await copyOf('content_categories', CAT, ORG_T)
    const bad = await rows(`SELECT c.id FROM content_library c JOIN content_categories k ON k.id = c.category_id WHERE k.org_id <> c.org_id`)
    expect(bad).toEqual([])
    expect((await one(`SELECT category_id FROM content_library WHERE id = '${C_TOUR_T}'`)).category_id).toBe(catT)
    expect((await one(`SELECT category_id FROM content_library WHERE id = '${C_LOG_A}'`)).category_id).toBe(CAT)
  })
  it("destination: the company's own copy", async () => {
    expect((await one(`SELECT destination_id FROM content_library WHERE id = '${C_DEST}'`)).destination_id).toBe(DEST_T)
    expect((await one(`SELECT destination_id FROM writing_rules WHERE id = '${WR_DEST}'`)).destination_id).toBe(DEST_T)
    const wrCopy = await copyOf('writing_rules', WR_DEST, ORG_A)
    expect((await one(`SELECT destination_id FROM writing_rules WHERE id = '${wrCopy}'`)).destination_id).toBe(DEST)
  })
})

describe('writing rules and prompt templates: copied for each company', () => {
  it("the author's company, else the catalogue default (listed); a copy for the other", async () => {
    expect(await orgOf('writing_rules', WR_T)).toBe(ORG_T)
    expect(await orgOf('writing_rules', WR_NONE)).toBe(ORG_A)
    expect((await reviewed('writing_rules', WR_NONE)).map(r => r.reason)).toEqual(['no single-company author — catalogue default'])
    const copy = await copyOf('writing_rules', WR_T, ORG_A)
    expect(await one(`SELECT org_id, name, description FROM writing_rules WHERE id = '${copy}'`))
      .toEqual({ org_id: ORG_A, name: 'Warm tone', description: 'Write warmly' })
    expect((await reviewed('writing_rules', copy)).map(r => r.reason)).toEqual(['copied for each company'])
    for (const org of [ORG_T, ORG_A]) {
      expect((await rows(`SELECT name FROM writing_rules WHERE org_id = '${org}' ORDER BY name`)).map(r => r.name))
        .toEqual(['Egypt names', 'No cliches', 'Warm tone'])
    }
  })

  it('prompts: each company the full set, one default per purpose (the newest), the other listed', async () => {
    for (const org of [ORG_T, ORG_A]) {
      expect(await rows(`SELECT name, is_default FROM prompt_templates WHERE org_id = '${org}' ORDER BY name`))
        .toEqual([{ name: 'New email', is_default: true }, { name: 'Old email', is_default: false }])
    }
    expect(await orgOf('prompt_templates', P_OLD)).toBe(ORG_A)
    expect((await reviewed('prompt_templates', P_OLD)).map(r => r.reason)).toContain('another default for this purpose — no longer default')
    await expect(db.exec(`INSERT INTO prompt_templates (name, purpose, user_prompt_template, is_default, org_id) VALUES ('x', 'email', 'x', true, '${ORG_A}')`)).rejects.toThrow()
    await db.exec(`BEGIN; INSERT INTO prompt_templates (name, purpose, user_prompt_template, is_default, org_id) VALUES ('x', 'summary', 'x', true, '${ORG_A}'); ROLLBACK;`)
  })
})

describe('usage log and variations', () => {
  it("usage rows: the itinerary's company, else the content's, else the default (listed)", async () => {
    expect(await orgOf('content_usage_log', L_A)).toBe(ORG_A)
    expect(await orgOf('content_usage_log', L_GONE)).toBe(ORG_T)
    expect(await orgOf('content_usage_log', L_NONE)).toBe(ORG_T)
    expect((await reviewed('content_usage_log', L_NONE)).map(r => r.reason)).toEqual(['no itinerary or content — default'])
  })
  it('a variation with no content item is deleted and listed; content_id is NOT NULL', async () => {
    expect(await rows(`SELECT 1 FROM content_variations WHERE id = '${V_ORPHAN}'`)).toEqual([])
    expect((await reviewed('content_variations', V_ORPHAN)).map(r => r.reason)).toEqual(['no content item — deleted'])
    expect((await one(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'content_variations' AND column_name = 'content_id'`)).is_nullable).toBe('NO')
  })
})

describe('schema', () => {
  it('org_id is NOT NULL everywhere', async () => {
    const r = await rows(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'
      AND is_nullable = 'YES' AND table_name IN ('content_categories','content_library','content_usage_log','writing_rules','prompt_templates')`)
    expect(r).toEqual([])
  })

  it('slugs are unique per company: both may use one, nobody twice', async () => {
    const catT = await copyOf('content_categories', CAT, ORG_T)
    await expect(db.exec(`INSERT INTO content_library (category_id, name, slug, org_id) VALUES ('${CAT}', 'x', 'lonely', '${ORG_A}')`)).rejects.toThrow()
    await db.exec(`BEGIN; INSERT INTO content_library (category_id, name, slug, org_id) VALUES ('${catT}', 'x', 'lonely', '${ORG_T}'); ROLLBACK;`)
    await expect(db.exec(`INSERT INTO content_categories (name, slug, org_id) VALUES ('x', 'sites', '${ORG_A}')`)).rejects.toThrow()
    expect(await rows(`SELECT conname FROM pg_constraint WHERE conname IN ('content_library_slug_key','content_library_category_id_slug_key','content_categories_slug_key')`)).toEqual([])
  })

  it('no policy on these tables is left without an org condition', async () => {
    const { rows: ps } = await db.query(`SELECT tablename, policyname, roles::text AS roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('content_categories','content_library','content_variations',
      'content_usage_log','writing_rules','prompt_templates')`)
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      if (p.roles === '{service_role}') continue
      expect(p.expr, `${p.tablename}.${p.policyname}`).toContain('user_is_in_org')
    }
  })

  it('the copy record is the service role’s only', async () => {
    expect((await one(`SELECT relrowsecurity FROM pg_class WHERE relname = 'org_backfill_content_copies'`)).relrowsecurity).toBe(true)
    await expect(as(T_ONLY, 'SELECT * FROM org_backfill_content_copies')).rejects.toThrow()
  })
})

describe('RLS: each company sees and changes only its own', () => {
  it('reads', async () => {
    for (const t of ['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates']) {
      expect(await orgsSeen(A_ONLY, t), t).toEqual([ORG_A])
      expect(await orgsSeen(A_AGENT, t), t).toEqual([ORG_A])
      expect(await orgsSeen(T_ONLY, t), t).toEqual([ORG_T])
    }
    const copy = await copyOf('content_library', C_BOTH, ORG_T)
    const seenT = (await as<{ content_id: string }>(T_ONLY, 'SELECT DISTINCT content_id FROM content_variations')).rows.map(r => r.content_id)
    expect(seenT).toEqual([copy])
    const seenA = (await as<{ content_id: string }>(A_ONLY, 'SELECT DISTINCT content_id FROM content_variations ORDER BY 1')).rows.map(r => r.content_id)
    expect(seenA).toEqual([C_BOTH, C_VAR_AUTHOR_A].sort())
  })

  it('writes: a manager only in their company, an agent not at all', async () => {
    expect((await as(A_ONLY, `UPDATE writing_rules SET priority = 9 WHERE id = '${WR_T}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `DELETE FROM content_library WHERE id = '${C_TOUR_T}'`)).affected).toBe(0)
    await expect(as(A_ONLY, `INSERT INTO writing_rules (name, category, rule_type, description, org_id) VALUES ('x', 'tone', 'enforce', 'x', '${ORG_T}')`)).rejects.toThrow()
    expect((await as(A_ONLY, `UPDATE writing_rules SET priority = 9 WHERE id = '${WR_NONE}'`)).affected).toBe(1)
    expect((await as(A_ONLY, `UPDATE content_variations SET title = 'x' WHERE id = '${V_BOTH_STD}'`)).affected).toBe(1)
    expect((await as(T_ONLY, `UPDATE content_variations SET title = 'x' WHERE id = '${V_BOTH_STD}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE writing_rules SET priority = 9 WHERE id = '${WR_NONE}'`)).affected).toBe(0)
    expect((await as(A_AGENT, `UPDATE content_library SET name = 'x' WHERE id = '${C_NONE}'`)).affected).toBe(0)
    await expect(as(A_AGENT, `INSERT INTO content_categories (name, slug, org_id) VALUES ('x', 'x', '${ORG_A}')`)).rejects.toThrow()
  })
})
