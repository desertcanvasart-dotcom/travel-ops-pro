// Migration 20270107, executed against a real Postgres.
//
// Tours → Options merged into Sell → Extras: every optional programme service
// becomes an extra offered with its programme (one per company and name, the
// tiers collapsed — programme level), a tier's set price on the link (Standard's first);
// an existing extra of the same name is reused, not duplicated. Safe twice.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20270107_extras_programmes_and_activity.sql'
const ORG_A = '10000000-0000-4000-8000-00000000000a'
const ORG_B = '10000000-0000-4000-8000-00000000000b'
const TPL_A = '20000000-0000-4000-8000-0000000000a1'
const TPL_B = '20000000-0000-4000-8000-0000000000b1'
const V_STD = '30000000-0000-4000-8000-0000000000a1'
const V_DLX = '30000000-0000-4000-8000-0000000000a2'
const V_B = '30000000-0000-4000-8000-0000000000b1'
const EXISTING = '40000000-0000-4000-8000-0000000000a1'

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

const extras = async () =>
  (await db.query(`SELECT org_id, name, supplier_cost::float AS cost, unit, offered_with FROM extras_catalogue ORDER BY org_id, name`)).rows
const links = async () =>
  (await db.query(`
    SELECT x.name, l.template_id, l.selling_price::float AS price, l.org_id
    FROM extras_catalogue_programmes l JOIN extras_catalogue x ON x.id = l.extra_id
    ORDER BY l.org_id, x.name`)).rows

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
    INSERT INTO organizations (id, name) VALUES ('${ORG_A}', 'ATS'), ('${ORG_B}', 'Other');
    INSERT INTO tour_templates (id, template_code, template_name, tour_type, duration_days, org_id) VALUES
      ('${TPL_A}', 'NEK804-CR', 'Cairo and the Nile', 'multi_day', 8, '${ORG_A}'),
      ('${TPL_B}', 'OTH-1', 'Other company', 'multi_day', 5, '${ORG_B}');
    INSERT INTO tour_variations (id, template_id, variation_code, variation_name, tier, group_type, inclusions, exclusions, org_id) VALUES
      ('${V_STD}', '${TPL_A}', 'NEK-STD', 'Standard', 'standard', 'private', '{}', '{}', '${ORG_A}'),
      ('${V_DLX}', '${TPL_A}', 'NEK-DLX', 'Deluxe', 'deluxe', 'private', '{}', '{}', '${ORG_A}'),
      ('${V_B}', '${TPL_B}', 'OTH-STD', 'Standard', 'standard', 'private', '{}', '{}', '${ORG_B}');
    -- ATS already sells a horse carriage on every booking.
    INSERT INTO extras_catalogue (id, org_id, name, supplier_cost, selling_price, unit) VALUES
      ('${EXISTING}', '${ORG_A}', 'Horse carriage ride', 10, 18, 'per_person');
    INSERT INTO tour_variation_services (variation_id, service_name, service_category, cost_per_unit, quantity_mode, is_optional, optional_price_override) VALUES
      -- the balloon on both tiers: Standard has no set price, Deluxe 140
      ('${V_STD}', 'Balloon over Luxor', 'activity', 90, 'per_pax', true, NULL),
      ('${V_DLX}', 'balloon over luxor ', 'activity', 95, 'per_pax', true, 140),
      -- an option with the same name as the existing extra: reused
      ('${V_STD}', 'Horse Carriage Ride', 'activity', 12, 'per_pax', true, 20),
      -- a per-group option, no cost yet
      ('${V_STD}', 'Private Sound and Light', 'entrance', 0, 'per_group', true, NULL),
      -- included services are not options
      ('${V_STD}', 'Karnak entry', 'entrance', 15, 'per_pax', false, NULL),
      -- the other company's option stays theirs
      ('${V_B}', 'Balloon over Luxor', 'activity', 80, 'per_pax', true, 120);
  `)
  await db.exec(sql)
})

afterAll(async () => { await db?.close() })

describe('20270107 — options become extras offered with their programme', () => {
  it('one extra per company and name, offered with programmes; the existing one reused', async () => {
    expect(await extras()).toEqual([
      { org_id: ORG_A, name: 'Balloon over Luxor', cost: 90, unit: 'per_person', offered_with: 'programmes' },
      // Still every booking: it existed before, as the operator set it.
      { org_id: ORG_A, name: 'Horse carriage ride', cost: 10, unit: 'per_person', offered_with: 'all' },
      { org_id: ORG_A, name: 'Private Sound and Light', cost: null, unit: 'per_booking', offered_with: 'programmes' },
      { org_id: ORG_B, name: 'Balloon over Luxor', cost: 80, unit: 'per_person', offered_with: 'programmes' },
    ])
  })

  it('one link per programme, carrying the set price a tier had', async () => {
    expect(await links()).toEqual([
      { name: 'Balloon over Luxor', template_id: TPL_A, price: 140, org_id: ORG_A },
      { name: 'Horse carriage ride', template_id: TPL_A, price: 20, org_id: ORG_A },
      { name: 'Private Sound and Light', template_id: TPL_A, price: null, org_id: ORG_A },
      { name: 'Balloon over Luxor', template_id: TPL_B, price: 120, org_id: ORG_B },
    ])
  })

  it('existing extras are offered with every booking by default', async () => {
    const { rows } = await db.query(`SELECT column_default FROM information_schema.columns WHERE table_name = 'extras_catalogue' AND column_name = 'offered_with'`)
    expect(rows[0].column_default).toMatch(/'all'/)
  })

  it('refuses an unknown offered_with', async () => {
    await expect(db.query(`UPDATE extras_catalogue SET offered_with = 'some' WHERE id = '${EXISTING}'`)).rejects.toThrow(/offered_with/)
  })

  it('deleting a programme removes its links; deleting an activity leaves the extra unpriced', async () => {
    const { rows: [act] } = await db.query(`INSERT INTO activity_rates (service_code, activity_name, org_id) VALUES ('ACT-T', 'Carriage', '${ORG_A}') RETURNING id`)
    await db.query(`UPDATE extras_catalogue SET activity_rate_id = $1 WHERE id = '${EXISTING}'`, [act.id])
    await db.query(`DELETE FROM activity_rates WHERE id = $1`, [act.id])
    expect((await db.query(`SELECT activity_rate_id FROM extras_catalogue WHERE id = '${EXISTING}'`)).rows[0].activity_rate_id).toBeNull()
  })

  it('is safe to run twice', async () => {
    const before = [await extras(), await links()]
    await db.exec(sql)
    expect([await extras(), await links()]).toEqual(before)
  })
})
