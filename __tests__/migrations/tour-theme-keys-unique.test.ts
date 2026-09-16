// Migration 20261013, executed against a real Postgres.
//
// 20261011 derived each theme's vocabulary key by lowercasing its
// category_code. Replayed against a database holding two shapes it did not
// consider, it loses data:
//
//   * 'DESERT-SAFARI' and 'DESERT_SAFARI' normalise to the same key, so
//     ON CONFLICT DO NOTHING dropped one theme and the backfill — which joins
//     on category_id — filed both categories' tours under the survivor.
//   * The seeder skips inactive categories; the backfill does not. A tour
//     still filed under a retired theme got a theme_key with no vocabulary
//     entry behind it.
//
// This replays 20261011 over exactly that database to show the damage is real,
// then 20261013 over the result to show it is repaired — and, just as
// important, that the repair adds without editing: an agency that relabelled a
// theme keeps its words.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const ORG = '11111111-1111-4111-8111-111111111111'
const BACKFILL = '20261011_tour_theme_vocabulary.sql'
const TARGET = '20261013_tour_theme_keys_unique.sql'

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows
const sql = (f: string) => readFileSync(path.join(MIGRATIONS, f), 'utf8')

/** Themes of one org, by key. */
const themes = async (org = ORG) =>
  Object.fromEntries(
    (await rows(`SELECT key, label, is_active FROM org_vocabularies
                  WHERE kind='tour_theme' AND org_id='${org}' ORDER BY key`))
      .map(r => [r.key, { label: r.label, is_active: r.is_active }]),
  ) as Record<string, { label: string; is_active: boolean }>

/** Templates filed under a key no vocabulary entry backs. */
const orphans = async () =>
  (await rows(`SELECT t.template_code FROM tour_templates t
                WHERE t.theme_key IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM org_vocabularies v
                                   WHERE v.kind='tour_theme' AND v.key = t.theme_key)
                ORDER BY 1`)).map(r => r.template_code)

/** What 20261011 left behind, captured before the repair ran. */
let afterBackfill: { themes: Record<string, { label: string; is_active: boolean }>; orphans: string[]; shared: string[] }

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  // Everything up to, but not including, the backfill and its repair.
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f !== BACKFILL && f !== TARGET).sort()) {
    await db.exec(sql(f))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }

  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}','ATS');`)
  await db.exec(`INSERT INTO tour_categories (category_code, category_name, sort_order) VALUES
    ('CULTURAL',      'Cultural & Historical',     1),
    ('DESERT-SAFARI', 'Desert Safari (hyphen)',    2),
    ('DESERT_SAFARI', 'Desert Safari (underscore)',3),
    ('RETIRED_THEME', 'Retired Theme',             4),
    ('!!!',           'Punctuation Only',          5);`)
  await db.exec(`UPDATE tour_categories SET is_active = false WHERE category_code = 'RETIRED_THEME';`)
  const id = async (code: string) => (await rows(`SELECT id FROM tour_categories WHERE category_code='${code}'`))[0].id
  await db.exec(`INSERT INTO tour_templates (template_code, template_name, tour_type, duration_days, category_id) VALUES
    ('T_OK',      'Normal',     'day_tour', 1, '${await id('CULTURAL')}'),
    ('T_HYPHEN',  'Hyphen',     'day_tour', 1, '${await id('DESERT-SAFARI')}'),
    ('T_UNDER',   'Underscore', 'day_tour', 1, '${await id('DESERT_SAFARI')}'),
    ('T_RETIRED', 'Retired',    'day_tour', 1, '${await id('RETIRED_THEME')}');`)

  await db.exec(sql(BACKFILL))
  const t = await themes()
  afterBackfill = {
    themes: t,
    orphans: await orphans(),
    shared: (await rows(`SELECT template_code FROM tour_templates WHERE theme_key='desert_safari' ORDER BY 1`)).map(r => r.template_code),
  }

  // The agency renames a theme in Settings, as it is entitled to.
  await db.exec(`UPDATE org_vocabularies SET label = 'Ancient Egypt'
                  WHERE kind='tour_theme' AND key='cultural' AND org_id='${ORG}';`)

  await db.exec(sql(TARGET))
})

afterAll(async () => {
  await db?.close()
})

describe('what 20261011 does on its own (the reason this migration exists)', () => {
  it('drops one of two themes whose codes normalise alike', () => {
    expect(Object.keys(afterBackfill.themes)).not.toContain('desert_safari_2')
    expect(afterBackfill.themes.desert_safari?.label).toBe('Desert Safari (hyphen)')
  })

  it('files both categories\' tours under the survivor', () => {
    expect(afterBackfill.shared).toEqual(['T_HYPHEN', 'T_UNDER'])
  })

  it('leaves a tour filed under a retired theme pointing at nothing', () => {
    expect(afterBackfill.orphans).toEqual(['T_RETIRED'])
  })
})

describe('after 20261013', () => {
  it('no tour is filed under a key nothing backs', async () => {
    expect(await orphans()).toEqual([])
  })

  it('the retired theme exists, and exists as retired', async () => {
    const t = await themes()
    expect(t.retired_theme).toBeDefined()
    expect(t.retired_theme.label).toBe('Retired Theme')
    // Inactive: the label resolves for the tour that still uses it, and no
    // picker offers it for a new one.
    expect(t.retired_theme.is_active).toBe(false)
  })

  it('both colliding themes exist, each under its own key', async () => {
    const t = await themes()
    expect(t.desert_safari.label).toBe('Desert Safari (hyphen)')
    expect(t.desert_safari_2.label).toBe('Desert Safari (underscore)')
  })

  it('the category that already owned the key keeps it — a repair must not swap two themes round', async () => {
    const t = await themes()
    expect(t.desert_safari.label).toBe(afterBackfill.themes.desert_safari.label)
  })

  it('a code with nothing key-shaped in it still gets a legal key', async () => {
    const t = await themes()
    const punctuation = Object.entries(t).find(([, v]) => v.label === 'Punctuation Only')
    expect(punctuation).toBeDefined()
    expect(punctuation![0]).toMatch(/^[a-z0-9][a-z0-9_]{0,59}$/)
  })

  it('adds without editing: a relabelled theme keeps the agency\'s word', async () => {
    const t = await themes()
    expect(t.cultural.label).toBe('Ancient Egypt')
  })

  it('does not re-point tours — category_id has not been read since 20261011, so a disagreement may be a deliberate re-filing', async () => {
    const shared = (await rows(`SELECT template_code FROM tour_templates WHERE theme_key='desert_safari' ORDER BY 1`)).map(r => r.template_code)
    expect(shared).toEqual(['T_HYPHEN', 'T_UNDER'])
  })

  it('is idempotent — running it again changes nothing', async () => {
    const before = await themes()
    await db.exec(sql(TARGET))
    expect(await themes()).toEqual(before)
  })
})

describe('a new organisation, seeded by the trigger', () => {
  const FRESH = '33333333-3333-4333-8333-333333333333'

  it('gets every theme, collisions separated and retired ones inactive', async () => {
    await db.exec(`INSERT INTO organizations (id, name) VALUES ('${FRESH}','Second Agency');`)
    const t = await themes(FRESH)
    expect(t.desert_safari.label).toBe('Desert Safari (hyphen)')
    expect(t.desert_safari_2.label).toBe('Desert Safari (underscore)')
    expect(t.retired_theme.is_active).toBe(false)
    expect(t.cultural.label).toBe('Cultural & Historical')
  })

  it('every key it was given is legal', async () => {
    for (const key of Object.keys(await themes(FRESH))) {
      expect(key).toMatch(/^[a-z0-9][a-z0-9_]{0,59}$/)
    }
  })
})
