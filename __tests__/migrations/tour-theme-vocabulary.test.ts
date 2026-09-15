// Migration 20261011, executed against a real Postgres.
//
// Themes were the one picker 20261010 left out. The reasoning was that they
// lived in a table (tour_categories) rather than a constant, so they were
// "already customizable" — which was wrong: /api/tours/categories has a POST
// that nothing calls, and no screen in the app could add, rename, reorder or
// remove a theme. The table also has no org_id, so every organisation on an
// install shared one list, and the link was a UUID that could not travel
// between installs (lib/tours/template-csv.ts leaves the theme out of the tour
// sheet for exactly that reason).
//
// The risk in this migration is the UPGRADE path, not the fresh one. A live
// install already has themes and tours pointing at them, and those links must
// survive as portable keys without anyone retyping anything.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const ORG = '11111111-1111-4111-8111-111111111111'
const TARGET = '20261011_tour_theme_vocabulary.sql'

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows

beforeAll(async () => {
  // Replay everything EXCEPT the migration under test, so the database can be
  // put into the state a live install is in before it runs.
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f !== TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }

  // An install that looks like production: the operator's own themes, one tour
  // filed under one of them, one tour with no theme at all.
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}','ATS');`)
  await db.exec(`INSERT INTO tour_categories (category_code, category_name, sort_order) VALUES
    ('NILE_CRUISE','Nile Cruise',1), ('CULTURAL','Cultural & Historical',2), ('RETIRED','Retired Theme',9);`)
  await db.exec(`UPDATE tour_categories SET is_active = false WHERE category_code = 'RETIRED';`)
  const [{ id }] = await rows(`SELECT id FROM tour_categories WHERE category_code='NILE_CRUISE'`)
  await db.exec(`INSERT INTO tour_templates (template_code, template_name, tour_type, duration_days, category_id)
    VALUES ('T1','Linked','day_tour',1,'${id}'), ('T2','Unlinked','day_tour',1,NULL);`)

  await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
})

afterAll(async () => {
  await db?.close()
})

describe('upgrading an install that already had themes', () => {
  it('keeps the agency’s own themes rather than imposing the built-in list', async () => {
    const r = await rows(`SELECT key, label, rank FROM org_vocabularies WHERE kind='tour_theme' AND org_id='${ORG}' ORDER BY rank`)
    expect(r).toEqual([
      { key: 'nile_cruise', label: 'Nile Cruise', rank: 1 },
      { key: 'cultural', label: 'Cultural & Historical', rank: 2 },
    ])
  })

  it('leaves a retired theme behind rather than resurrecting it', async () => {
    // is_active = false meant "not offered". Seeding it would put it back on
    // the form, which is the opposite of what the operator asked for.
    const r = await rows(`SELECT 1 FROM org_vocabularies WHERE kind='tour_theme' AND key='retired'`)
    expect(r).toEqual([])
  })

  it('re-files every linked tour under the portable key', async () => {
    const r = await rows(`SELECT template_code, theme_key FROM tour_templates ORDER BY template_code`)
    expect(r).toEqual([
      { template_code: 'T1', theme_key: 'nile_cruise' },
      { template_code: 'T2', theme_key: null },   // had no theme; not guessed
    ])
  })

  it('leaves no tour pointing at a theme that does not exist', async () => {
    const orphans = await rows(`
      SELECT t.template_code FROM tour_templates t
      WHERE t.theme_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM org_vocabularies v WHERE v.kind='tour_theme' AND v.key = t.theme_key)`)
    expect(orphans).toEqual([])
  })

  it('does not touch the old column, so the change is reversible', async () => {
    const [{ c }] = await rows(`SELECT count(*)::int AS c FROM tour_templates WHERE category_id IS NOT NULL`)
    expect(c, 'category_id was cleared — reverting the app would lose the link').toBe(1)
  })
})

describe('the new column', () => {
  it('exists, is text, and is indexed', async () => {
    const [col] = await rows(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name='tour_templates' AND column_name='theme_key'`)
    expect(col?.data_type).toBe('text')
    const idx = await rows(`SELECT 1 FROM pg_indexes WHERE tablename='tour_templates' AND indexname='idx_tour_templates_theme_key'`)
    expect(idx.length, 'the tours list filters on this column').toBe(1)
  })
})

describe('the seeder', () => {
  it('is safe to re-run and never overwrites a relabel', async () => {
    await db.exec(`UPDATE org_vocabularies SET label='Nile Cruising' WHERE kind='tour_theme' AND key='nile_cruise' AND org_id='${ORG}'`)
    const [{ n }] = await rows(`SELECT public.seed_tour_themes('${ORG}') AS n`)
    expect(n).toBe(0)
    const [{ label }] = await rows(`SELECT label FROM org_vocabularies WHERE kind='tour_theme' AND key='nile_cruise' AND org_id='${ORG}'`)
    expect(label).toBe('Nile Cruising')
  })

  it('is still called from the trigger, alongside every earlier one', async () => {
    // The relabel migrations replace seed_org_vocabulary's whole body, so a
    // separately-seeded kind has to be called from the trigger or a future
    // reseed drops it silently. 20261009 hit exactly that.
    const [{ src }] = await rows(`SELECT prosrc AS src FROM pg_proc WHERE proname='seed_org_vocabulary_on_insert'`)
    for (const fn of ['seed_org_vocabulary', 'seed_cruise_supplements', 'seed_tour_template_vocabulary', 'seed_tour_themes']) {
      expect(String(src).includes(fn), `the trigger no longer calls ${fn}`).toBe(true)
    }
  })

  it('gives a brand-new organisation the themes too', async () => {
    const fresh = '22222222-2222-4222-8222-222222222222'
    await db.exec(`INSERT INTO organizations (id, name) VALUES ('${fresh}','Second Agency');`)
    const [{ c }] = await rows(`SELECT count(*)::int AS c FROM org_vocabularies WHERE kind='tour_theme' AND org_id='${fresh}'`)
    expect(c).toBeGreaterThan(0)
  })
})
