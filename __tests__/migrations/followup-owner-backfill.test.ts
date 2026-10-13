// Migration 20261217, executed against a real Postgres.
//
// Follow-ups scheduled before POST /api/followups stamped an owner have
// assigned_to NULL, so the task-reminders job never reminds anyone of them.
// The backfill names an owner from the activity log, then the client's
// creator, then the assignee of the client's latest trip — only ever a member
// of the client's company — and lists the rest in org_backfill_review.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261217_followup_owner_backfill.sql'
const ORG_A = '10000000-0000-4000-8000-00000000000a'
const ORG_B = '10000000-0000-4000-8000-00000000000b'
const UA1 = '20000000-0000-4000-8000-0000000000a1'
const UA2 = '20000000-0000-4000-8000-0000000000a2'
const UA3 = '20000000-0000-4000-8000-0000000000a3'
const UB = '20000000-0000-4000-8000-0000000000b1'
const TM_UA1 = '30000000-0000-4000-8000-0000000000a1'
const TM_UA2 = '30000000-0000-4000-8000-0000000000a2'
const TM_UB = '30000000-0000-4000-8000-0000000000b1'
const TM_UA3_OFF = '30000000-0000-4000-8000-0000000000a3'
const client = (n: number) => `40000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const fu = (n: number) => `50000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const trip = (n: number) => `60000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`

let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const owner = async (id: string) => (await db.query(`SELECT assigned_to FROM client_followups WHERE id = $1`, [id])).rows[0].assigned_to as string | null
const review = async () =>
  (await db.query(`SELECT row_id, assigned_org FROM org_backfill_review WHERE table_name = 'client_followups' ORDER BY row_id`)).rows

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
    INSERT INTO organizations (id, name) VALUES ('${ORG_A}', 'Travel2Egypt'), ('${ORG_B}', 'ATS');
    INSERT INTO auth.users (id, email) VALUES ('${UA1}', 'a1@t2e.example'), ('${UA2}', 'a2@t2e.example'), ('${UA3}', 'a3@t2e.example'), ('${UB}', 'b@ats.example')
      ON CONFLICT DO NOTHING;
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_A}', '${UA1}', 'agent'), ('${ORG_A}', '${UA2}', 'manager'), ('${ORG_A}', '${UA3}', 'agent'), ('${ORG_B}', '${UB}', 'owner')
      ON CONFLICT DO NOTHING;
    INSERT INTO team_members (id, name, user_id, org_id, is_active) VALUES
      ('${TM_UA1}', 'A1', '${UA1}', '${ORG_A}', true), ('${TM_UA2}', 'A2', '${UA2}', '${ORG_A}', true),
      ('${TM_UB}', 'B', '${UB}', '${ORG_B}', true), ('${TM_UA3_OFF}', 'A3 (left)', '${UA3}', '${ORG_A}', false);

    -- 1 and 2: org A, created by A2. 3: created by someone of the other company.
    -- 4: created_by is free text. 5: org B, created by A1 (not a member of B).
    -- 6: org A, only trip assigned to a deactivated team member.
    INSERT INTO clients (id, client_code, first_name, last_name, org_id, created_by) VALUES
      ('${client(1)}', 'C1', 'Taro', 'Sato', '${ORG_A}', '${UA2}'),
      ('${client(3)}', 'C3', 'Hanako', 'Ito', '${ORG_A}', '${UB}'),
      ('${client(4)}', 'C4', 'Ken', 'Mori', '${ORG_A}', 'Office staff'),
      ('${client(5)}', 'C5', 'Aiko', 'Abe', '${ORG_B}', '${UA1}'),
      ('${client(6)}', 'C6', 'Jiro', 'Kato', '${ORG_A}', NULL);

    -- Client 3's trips: the oldest assigned to A2, a newer one to A1, the
    -- newest to the other company's person (never eligible).
    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id, client_id, assigned_to, created_at) VALUES
      ('${trip(1)}', 'I-1', 'Hanako', 'Old', '2026-01-01', '2026-01-03', 3, '${ORG_A}', '${client(3)}', '${TM_UA2}', '2026-01-01'),
      ('${trip(2)}', 'I-2', 'Hanako', 'Newer', '2026-03-01', '2026-03-03', 3, '${ORG_A}', '${client(3)}', '${TM_UA1}', '2026-03-01'),
      ('${trip(3)}', 'I-3', 'Hanako', 'Newest', '2026-05-01', '2026-05-03', 3, '${ORG_A}', '${client(3)}', '${TM_UB}', '2026-05-01'),
      ('${trip(4)}', 'I-4', 'Jiro', 'Only', '2026-05-01', '2026-05-03', 3, '${ORG_A}', '${client(6)}', '${TM_UA3_OFF}', '2026-05-01');

    INSERT INTO client_followups (id, client_id, followup_type, title, due_date, status, assigned_to, created_at) VALUES
      ('${fu(1)}', '${client(1)}', 'call', 'Log names A1', '2026-10-20', 'pending', NULL, '2026-09-01 10:00:00+00'),
      ('${fu(2)}', '${client(1)}', 'call', 'Log ambiguous', '2026-10-20', 'pending', NULL, '2026-09-02 10:00:00+00'),
      ('${fu(3)}', '${client(3)}', 'call', 'Latest trip', '2026-10-20', 'pending', NULL, '2026-09-03 10:00:00+00'),
      ('${fu(4)}', '${client(4)}', 'call', 'Nobody', '2026-10-20', 'pending', NULL, '2026-09-04 10:00:00+00'),
      ('${fu(5)}', '${client(5)}', 'call', 'Other company', '2026-10-20', 'pending', NULL, '2026-09-05 10:00:00+00'),
      ('${fu(6)}', '${client(6)}', 'call', 'Deactivated assignee', '2026-10-20', 'pending', NULL, '2026-09-06 10:00:00+00'),
      ('${fu(7)}', '${client(1)}', 'call', 'Completed', '2026-09-20', 'completed', NULL, '2026-09-01 10:00:00+00'),
      ('${fu(8)}', '${client(1)}', 'call', 'Owned', '2026-10-20', 'pending', '${UA1}', '2026-09-01 10:00:00+00');

    INSERT INTO activity_log (org_id, user_id, method, path, action, created_at) VALUES
      -- 1: A1 scheduled it (5 seconds later; also covers completed 7's minute).
      ('${ORG_A}', '${UA1}', 'POST', '/api/followups', 'create', '2026-09-01 10:00:05+00'),
      -- 2: two people in the same minute: names nobody, so the client's creator (A2).
      ('${ORG_A}', '${UA1}', 'POST', '/api/followups', 'create', '2026-09-02 10:00:10+00'),
      ('${ORG_A}', '${UB}', 'POST', '/api/followups', 'create', '2026-09-02 10:00:20+00'),
      ('${ORG_A}', '${UA2}', 'POST', '/api/followups', 'create', '2026-09-02 10:00:30+00'),
      -- 3: someone not in the company (UB is ORG_B's): never named.
      ('${ORG_A}', '${UB}', 'POST', '/api/followups', 'create', '2026-09-03 10:00:05+00'),
      -- 4: a log row far outside the minute, and one that is not a follow-up.
      ('${ORG_A}', '${UA1}', 'POST', '/api/followups', 'create', '2026-09-04 12:00:00+00'),
      ('${ORG_A}', '${UA1}', 'POST', '/api/clients', 'create', '2026-09-04 10:00:01+00'),
      -- 5: logged in the OTHER company's workspace.
      ('${ORG_A}', '${UA1}', 'POST', '/api/followups', 'create', '2026-09-05 10:00:02+00');
  `)
  await db.exec(sql)
  // Applied twice: idempotent.
  await db.exec(sql)
})

afterAll(async () => {
  await db?.close()
})

describe('the owner of a pending follow-up with none', () => {
  it('1. the one person the activity log shows scheduling it', async () => {
    expect(await owner(fu(1))).toBe(UA1)
  })

  it('2. two people in that minute name nobody; the client\'s creator does', async () => {
    expect(await owner(fu(2))).toBe(UA2)
  })

  it("3. the assignee of the client's latest trip with an eligible one — not another company's person", async () => {
    // The log names UB and the client's creator is UB: neither is in ORG_A.
    expect(await owner(fu(3))).toBe(UA1)
  })

  it("never someone outside the client's company, a deactivated assignee, or free text", async () => {
    expect(await owner(fu(4))).toBeNull()
    expect(await owner(fu(5))).toBeNull()
    expect(await owner(fu(6))).toBeNull()
  })

  it('completed follow-ups and ones with an owner are left alone', async () => {
    expect(await owner(fu(7))).toBeNull()
    expect(await owner(fu(8))).toBe(UA1)
  })
})

describe('what could not be placed', () => {
  it('is listed once each, under the client\'s company, even applied twice', async () => {
    expect(await review()).toEqual([
      { row_id: fu(4), assigned_org: ORG_A },
      { row_id: fu(5), assigned_org: ORG_B },
      { row_id: fu(6), assigned_org: ORG_A },
    ])
  })
})
