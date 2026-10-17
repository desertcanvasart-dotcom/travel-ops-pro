// Migration 20261224, executed against a real Postgres: existing team members
// are linked to the login of THEIR company whose email matches, only when
// exactly one does and the member has no login yet; the rest are listed in
// org_backfill_review. Applied twice.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261224_team_member_login_link.sql'
const ORG_T = '34000000-0000-4000-8000-000000000001'
const ORG_A = '34000000-0000-4000-8000-000000000002'
const u = (n: number) => `44000000-0000-4000-8000-00000000000${n}`
const m = (n: number) => `54000000-0000-4000-8000-00000000000${n}`
const M_ATS = '54000000-0000-4000-8000-0000000000a1'

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const link = async (id: string) =>
  (await db.query(`SELECT user_id FROM team_members WHERE id = '${id}'`)).rows[0].user_id as string | null
const review = async () =>
  (await db.query(`SELECT row_id, assigned_org, reason FROM org_backfill_review WHERE table_name = 'team_members' ORDER BY row_id`)).rows

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
    INSERT INTO auth.users (id, email) VALUES
      ('${u(1)}', 'carla@x'), ('${u(2)}', 'dup1@x'), ('${u(3)}', 'dup2@x'), ('${u(4)}', 'ats@x'),
      ('${u(5)}', 'taken@x'), ('${u(6)}', 'shared@x') ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${u(1)}', 'Carla@X', 'agent', true),   -- T
      ('${u(2)}', 'twin@x', 'agent', true),    -- T, same address as u3
      ('${u(3)}', 'TWIN@x', 'agent', true),    -- T
      ('${u(4)}', 'ats@x', 'agent', true),     -- A only
      ('${u(5)}', 'taken@x', 'agent', true),   -- T, already a member's login
      ('${u(6)}', 'shared@x', 'agent', true)   -- T, two members share the address
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    DELETE FROM organization_members WHERE user_id IN ('${u(1)}','${u(2)}','${u(3)}','${u(4)}','${u(5)}','${u(6)}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${u(1)}', 'agent'), ('${ORG_T}', '${u(2)}', 'agent'), ('${ORG_T}', '${u(3)}', 'agent'),
      ('${ORG_A}', '${u(4)}', 'agent'), ('${ORG_T}', '${u(5)}', 'agent'), ('${ORG_T}', '${u(6)}', 'agent');
    INSERT INTO team_members (id, org_id, name, email, user_id) VALUES
      ('${m(1)}', '${ORG_T}', 'Carla', ' carla@x ', NULL),      -- one match -> linked
      ('${m(2)}', '${ORG_T}', 'Twin', 'twin@x', NULL),          -- two logins -> ambiguous
      ('${m(3)}', '${ORG_T}', 'Cross', 'ats@x', NULL),          -- only the OTHER company's login -> unmatched
      ('${m(4)}', '${ORG_T}', 'Guide', 'guide@x', NULL),        -- no login -> unmatched
      ('${m(5)}', '${ORG_T}', 'Nobody', NULL, NULL),            -- no email -> not listed
      ('${m(6)}', '${ORG_T}', 'Holder', 'holder@x', '${u(5)}'), -- already linked -> untouched
      ('${m(7)}', '${ORG_T}', 'Takes', 'taken@x', NULL),        -- login is another member's -> not linked
      ('${m(8)}', '${ORG_T}', 'Share1', 'shared@x', NULL),      -- two members, one login
      ('${m(9)}', '${ORG_T}', 'Share2', 'SHARED@x', NULL),
      ('${M_ATS}', '${ORG_A}', 'Ats Person', 'ats@x', NULL);    -- linked in ITS company
  `)
  await db.exec(sql)
  await db.exec(sql) // twice: idempotent
})
afterAll(async () => { await db?.close() })

describe('20261224 team_members.user_id backfill', () => {
  it('links a member to the single same-company login whose email matches (any case, trimmed)', async () => {
    expect(await link(m(1))).toBe(u(1))
    expect(await link(M_ATS)).toBe(u(4))
  })

  it("never links another company's login, an ambiguous match, a taken login or a shared address", async () => {
    for (const n of [2, 3, 4, 7, 8, 9]) expect(await link(m(n)), `member ${n}`).toBeNull()
  })

  it('leaves an existing link and a member with no email alone', async () => {
    expect(await link(m(6))).toBe(u(5))
    expect(await link(m(5))).toBeNull()
  })

  it('lists the ambiguous, taken and unmatched in org_backfill_review (once each, after two runs)', async () => {
    const r = await review()
    const byId = Object.fromEntries(r.map((x: any) => [x.row_id, x]))
    expect(Object.keys(byId).sort()).toEqual([m(2), m(3), m(4), m(7), m(8), m(9)].sort())
    expect(r.length).toBe(6)
    expect(byId[m(2)].reason).toMatch(/several logins/)
    expect(byId[m(7)].reason).toMatch(/already belongs to another team member/)
    expect(byId[m(3)].reason).toMatch(/matches no login of the company/)
    expect(byId[m(4)].assigned_org).toBe(ORG_T)
  })
})
