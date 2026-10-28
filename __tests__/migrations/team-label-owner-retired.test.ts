// Migration 20270113, executed against a real Postgres: every Team page card
// labelled 'owner' becomes 'manager'; other labels are untouched. Applied twice.
// The label list itself (lib/team-members TEAM_ROLES) no longer offers 'owner'.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MIGRATIONS } from '@/scripts/replay-core.mjs'
import { isTeamRole, TEAM_ROLES } from '@/lib/team-members'

const sql = readFileSync(path.join(MIGRATIONS, '20270113_team_label_owner_retired.sql'), 'utf8')
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

beforeAll(async () => {
  db = new PGlite() as any
  await db.exec(`
    CREATE TABLE team_members (id int PRIMARY KEY, role text);
    INSERT INTO team_members VALUES (1, 'owner'), (2, 'manager'), (3, 'guide'), (4, NULL), (5, 'admin');
  `)
})
afterAll(async () => { await db?.close() })

describe('20270113_team_label_owner_retired', () => {
  it('owner → manager, everything else as it was, twice', async () => {
    await db.exec(sql)
    await db.exec(sql)
    const rows = (await db.query('SELECT id, role FROM team_members ORDER BY id')).rows
    expect(rows).toEqual([
      { id: 1, role: 'manager' },
      { id: 2, role: 'manager' },
      { id: 3, role: 'guide' },
      { id: 4, role: null },
      { id: 5, role: 'admin' },
    ])
  })
  it('a database without the table is left alone', async () => {
    const empty = new PGlite()
    await expect(empty.exec(sql)).resolves.toBeDefined()
    await empty.close()
  })
})

describe('the Team page label list', () => {
  it('no longer offers owner — ownership is a login role', () => {
    expect(isTeamRole('owner')).toBe(false)
    expect(TEAM_ROLES).not.toContain('owner')
    expect(isTeamRole('manager')).toBe(true)
  })
})
